-- 041: los partidos aplazados o suspendidos vuelven a sincronizarse solos.
--
-- trigger_live_sync (027) descartaba los fixtures 'postponed' igual que los
-- 'finished', así que un partido suspendido no se volvía a mirar nunca, ni
-- siquiera cuando Opta publicaba la nueva fecha y el sync de calendario movía
-- su start_time: el aplazado de la J6 (21/10/2026) y el Rayo-Athletic de la J8
-- (suspendido en el 24' el 10/10/2026) se habrían quedado sin puntuar.
--
-- Ahora solo 'finished' y 'cancelled' son terminales. Un 'postponed' entra en
-- el dispatch cuando su start_time cae en la ventana (30 min antes .. 3 h
-- después); mientras no haya fecha nueva su start_time es el antiguo, ya
-- pasado, y queda fuera. El motor (trigger_descarga_eventos.py) lo pasa a
-- 'live' cuando Opta da matchStatus = Playing.
--
-- Mismo criterio en ci/run_live_sync.py y /api/cron/sync-live.
--
-- Se aplica a mano en el SQL Editor. Es reejecutable.

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
     where lower(coalesce(f.status, '')) not in ('finished', 'cancelled')
       and (
             f.start_time between now() - interval '180 minutes'
                              and now() + interval '30 minutes'
          or lower(coalesce(f.status, '')) = 'live'
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

    -- Un token ausente o caducado dejaba el sync muerto en silencio. Queda
    -- escrito en sync_runs para que se vea al mirar la tabla.
    if v_token is null or length(v_token) = 0 then
        insert into public.sync_runs (source, fixture_ids, fixture_count, dispatched, detail)
        values (p_source, v_ids, v_count, false,
                'FALTA el secreto github_dispatch_token en Vault');
        return null;
    end if;

    -- pg_net es asíncrono: devuelve un id de petición y la respuesta aparece
    -- después en net._http_response (ver la vista sync_runs_recent).
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
            -- GitHub rechaza las peticiones sin User-Agent.
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
