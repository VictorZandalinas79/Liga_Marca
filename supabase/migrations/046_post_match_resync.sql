-- 046: re-sincronización única ~2 h después de cada partido.
--
-- Al pasar a 'finished' un partido no se volvía a sincronizar nunca, así que
-- las correcciones que Opta mete después del pitido final no llegaban a la app.
-- Caso real: Barcelona-Villarreal (J13, 22/11/2026). La roja a Fermín López
-- (min 74, ya sustituido) se corrigió en Opta a las 22:43 UTC, pero el último
-- sync fue a las 15:04 UTC: en la app seguía sin roja y con 3 puntos de más.
--
-- Ahora un fixture 'finished' cuyo start_time tenga entre 4 h y 24 h de
-- antigüedad (4 h desde el inicio ≈ 2 h desde el final) y que aún no tenga
-- post_match_resynced_at entra en el dispatch. ci/run_live_sync.py rellena la
-- columna cuando el sync termina bien, así que se hace UNA sola vez. Si falla,
-- se reintenta en la siguiente pasada. El tope de 24 h evita que, al aplicar
-- esta migración, se re-sincronice la temporada entera.
--
-- Mismo criterio en ci/run_live_sync.py y /api/cron/sync-live.
--
-- Se aplica a mano en el SQL Editor ANTES de subir el código. Es reejecutable.

alter table public.fixtures
    add column if not exists post_match_resynced_at timestamptz;

-- Rellenar la marca no cambia ningún dato cacheado: se ignora en el trigger
-- de data_versions (ver 043) para no invalidar cachés por ello.
drop trigger if exists bump_data_version_upd on public.fixtures;
create trigger bump_data_version_upd after update on public.fixtures
    referencing old table as old_rows new table as new_rows
    for each statement execute function public.bump_data_version_if_changed(
        'current_minute', 'home_score', 'away_score', 'updated_at', 'post_match_resynced_at'
    );

create or replace function public.trigger_live_sync(
    p_source text default 'pg_cron',
    p_owner  text default 'VictorZandalinas79',
    p_repo   text default 'Liga_Marca',
    p_ref    text default 'main'
)
returns bigint
language plpgsql
security definer
set search_path = public, net, extensions, vault
as $$
declare
    v_ids        text[];
    v_count      integer;
    v_token      text;
    v_request_id bigint;
begin
    select array_agg(f.id order by f.start_time)
      into v_ids
      from public.fixtures f
     where (
             lower(coalesce(f.status, '')) not in ('finished', 'cancelled')
         and (
               f.start_time between now() - interval '180 minutes'
                                and now() + interval '30 minutes'
            or lower(coalesce(f.status, '')) = 'live'
         )
       )
        -- Re-sync post-partido (una vez, ver cabecera)
        or (
             lower(coalesce(f.status, '')) = 'finished'
         and f.post_match_resynced_at is null
         and f.start_time between now() - interval '24 hours'
                              and now() - interval '4 hours'
       );

    v_count := coalesce(array_length(v_ids, 1), 0);

    -- Caso normal la mayor parte del día: no hay partido en ventana y no se
    -- gasta ninguna ejecución de GitHub Actions.
    if v_count = 0 then
        insert into public.sync_runs (source, fixture_count, dispatched, detail)
        values (p_source, 0, false, 'nada en ventana');
        return null;
    end if;

    select decrypted_secret
      into v_token
      from vault.decrypted_secrets
     where name = 'github_dispatch_token';

    if v_token is null or length(v_token) = 0 then
        insert into public.sync_runs (source, fixture_ids, fixture_count, dispatched, detail)
        values (p_source, v_ids, v_count, false,
                'FALTA el secreto github_dispatch_token en Vault');
        return null;
    end if;

    select net.http_post(
        url := format(
            'https://api.github.com/repos/%s/%s/actions/workflows/sync-live.yml/dispatches',
            p_owner, p_repo
        ),
        body := jsonb_build_object(
            'ref',    p_ref,
            'inputs', jsonb_build_object('fixture_ids', array_to_string(v_ids, ','))
        ),
        headers := jsonb_build_object(
            'Authorization',        'Bearer ' || v_token,
            'Accept',               'application/vnd.github+json',
            'X-GitHub-Api-Version', '2022-11-28',
            'Content-Type',         'application/json',
            'User-Agent',           'liga-marca-pg-cron'
        ),
        timeout_milliseconds := 10000
    ) into v_request_id;

    insert into public.sync_runs (source, fixture_ids, fixture_count, dispatched, request_id, detail)
    values (p_source, v_ids, v_count, true, v_request_id,
            format('dispatch lanzado para %s fixture(s)', v_count));

    return v_request_id;
end;
$$;

-- ============================================================================
-- COMPROBACIÓN (en el SQL Editor, tras aplicar)
--
--   -- Partidos pendientes de su re-sync post-partido:
--   select id, start_time, status, post_match_resynced_at from public.fixtures
--    where status = 'finished' and post_match_resynced_at is null
--      and start_time between now() - interval '24 hours' and now() - interval '4 hours';
