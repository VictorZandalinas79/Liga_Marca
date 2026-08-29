-- ============================================================================
-- Disparador de la sincronización en vivo desde la propia base de datos.
--
-- POR QUÉ
-- El disparador anterior era el `schedule` de GitHub Actions (*/5 en
-- sync-live.yml). Medido sobre el historial real de ejecuciones, GitHub
-- descartaba entre el 80% y el 100% de los huecos: de las 288 pasadas diarias
-- que pedía el cron, unos días se ejecutaban 56, otros 2 y varios (19, 20 y 21
-- de agosto de 2026) ninguna. Los crons de alta frecuencia en el pool gratuito
-- de GitHub no son fiables y no hay nada que tocar en el repo para arreglarlo.
--
-- El resultado era que los puntos solo se procesaban cuando alguien tenía la
-- página de Partidos abierta (el useEffect de partidos/page.tsx dispara
-- /api/sync-all-matches cada 5 min), no de forma automática.
--
-- QUÉ HACE ESTO
-- pg_cron es un cron real dentro de Postgres: no se salta huecos. Cada 5 min
-- mira `fixtures` y, SOLO si hay algún partido en ventana, llama por pg_net al
-- workflow_dispatch de sync-live.yml con la lista de fixture_ids.
--
-- El motor de puntuación NO se toca: el workflow sigue ejecutando
-- ci/run_live_sync.py -> trigger_descarga_eventos.py exactamente igual que
-- cuando lo dispara el botón "Sincronizar". Esto solo cambia quién aprieta el
-- botón, y lo hace desde donde viven los datos.
--
-- Ventaja secundaria: antes se gastaba una ejecución de Actions cada 5 min
-- las 24 h para descubrir que no había nada que hacer. Ahora solo se gasta
-- cuando de verdad hay partido en ventana.
--
-- REQUISITOS ANTES DE APLICARLA
--   1. Extensiones pg_cron y pg_net activadas (las crea este script, pero en
--      Supabase también puedes activarlas en Database -> Extensions).
--   2. El PAT de GitHub guardado en Vault con el nombre
--      'github_dispatch_token'. Es el MISMO token que GITHUB_DISPATCH_TOKEN en
--      Vercel (fine-grained, permiso Actions = Read and write sobre el repo):
--
--        select vault.create_secret(
--          'ghp_elTokenDeVerdad',
--          'github_dispatch_token',
--          'PAT para lanzar sync-live.yml desde pg_cron'
--        );
--
--      Para rotarlo más adelante:
--        select vault.update_secret(
--          (select id from vault.secrets where name = 'github_dispatch_token'),
--          'ghp_elTokenNuevo'
--        );
-- ============================================================================

create extension if not exists pg_cron;
-- OJO con el esquema de pg_net: la extensión se REGISTRA en `extensions`
-- (pg_extension.extnamespace dice 'extensions') pero CREA SUS OBJETOS en un
-- esquema `net` propio. Comprobado en este proyecto sobre pg_net 0.20.0:
-- net.http_post(...) y net._http_response. Mirar solo pg_extension lleva a
-- escribir extensions.http_post(...), que no existe.
create extension if not exists pg_net with schema extensions;

-- ── Traza de cada pasada ────────────────────────────────────────────────────
-- Sin esto el sync automático es una caja negra: era imposible distinguir
-- "no se disparó" de "se disparó y falló", que es justo lo que hacía tan
-- difícil diagnosticar el problema original.
create table if not exists public.sync_runs (
    id             bigserial primary key,
    ran_at         timestamptz not null default now(),
    source         text        not null,          -- 'pg_cron', 'manual', ...
    fixture_ids    text[],
    fixture_count  integer     not null default 0,
    dispatched     boolean     not null default false,
    request_id     bigint,                        -- id de la petición de pg_net
    detail         text
);

create index if not exists idx_sync_runs_ran_at on public.sync_runs (ran_at desc);

-- La tabla es de diagnóstico interno: nadie la lee desde el navegador.
alter table public.sync_runs enable row level security;

-- ── La función que decide y dispara ─────────────────────────────────────────
-- Misma ventana que ci/run_live_sync.py y que /api/cron/sync-live:
--   desde 30 min antes del pitido inicial hasta 3 h después,
--   más cualquier fixture que siga marcado 'live' (prórrogas, retrasos o un
--   partido colgado en vivo porque nunca llegó el evento de fin).
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
     where lower(coalesce(f.status, '')) not in ('finished', 'cancelled', 'postponed')
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

-- ── Vista para comprobar que de verdad funciona ─────────────────────────────
-- GitHub responde 204 sin cuerpo cuando el disparo es correcto.
-- 401 = token caducado, 403 = token sin permiso Actions: Read and write.
create or replace view public.sync_runs_recent as
select r.ran_at,
       r.source,
       r.fixture_count,
       r.dispatched,
       resp.status_code,
       case
           when not r.dispatched      then r.detail
           when resp.status_code is null then 'esperando respuesta de GitHub'
           when resp.status_code = 204 then 'OK'
           when resp.status_code = 401 then 'TOKEN CADUCADO (401)'
           when resp.status_code = 403 then 'TOKEN SIN PERMISO Actions (403)'
           else coalesce(resp.content, r.detail)
       end as resultado,
       r.fixture_ids
  from public.sync_runs r
  left join net._http_response resp on resp.id = r.request_id
 order by r.ran_at desc;

-- ── El cron ─────────────────────────────────────────────────────────────────
-- Se desprograma primero para que la migración sea reejecutable sin duplicar
-- el job.
select cron.unschedule('sync-live-5min')
 where exists (select 1 from cron.job where jobname = 'sync-live-5min');

select cron.schedule(
    'sync-live-5min',
    '*/5 * * * *',
    $cron$ select public.trigger_live_sync('pg_cron'); $cron$
);

-- Limpieza: la traza solo sirve para depurar, no para historial.
select cron.unschedule('sync-runs-cleanup')
 where exists (select 1 from cron.job where jobname = 'sync-runs-cleanup');

select cron.schedule(
    'sync-runs-cleanup',
    '17 4 * * *',
    $cron$ delete from public.sync_runs where ran_at < now() - interval '14 days'; $cron$
);

-- ============================================================================
-- COMPROBACIONES (ejecutar a mano en el SQL Editor tras aplicar)
--
--   -- ¿está programado?
--   select jobname, schedule, active from cron.job;
--
--   -- forzar una pasada ahora mismo, sin esperar al cron
--   select public.trigger_live_sync('manual');
--
--   -- ¿qué ha pasado en las últimas pasadas?
--   select * from public.sync_runs_recent limit 20;
--
--   -- ¿se está ejecutando el cron de verdad?
--   -- (cron.job_run_details no tiene jobname: el nombre está en cron.job)
--   select j.jobname, d.start_time, d.status, d.return_message
--     from cron.job_run_details d
--     join cron.job j on j.jobid = d.jobid
--    order by d.start_time desc limit 20;
--
-- DESINSTALAR
--   select cron.unschedule('sync-live-5min');
--   select cron.unschedule('sync-runs-cleanup');
-- ============================================================================
