-- ============================================================================
-- Vigilante de consumo del plan Free de Supabase.
--
-- POR QUÉ
-- El plan Free tiene topes duros (500 MB de base de datos, 1 GB de Storage,
-- 50.000 usuarios activos/mes) y al pasarlos el proyecto se queda en solo
-- lectura o se pausa. Queremos ver QUÉ consume (tablas, logs, consultas)
-- antes de llegar, sin pagar nada: todo sale de catálogos internos de
-- Postgres, no de servicios externos.
--
-- QUÉ HACE ESTO
-- Crea public.admin_usage_report(), que devuelve un JSON con:
--   - tamaño total de la base de datos frente al límite
--   - las tablas más pesadas (de cualquier esquema: public, cron, net, auth…)
--   - lo que ocupa Storage y los usuarios activos de los últimos 30 días
--   - las consultas que más tiempo de base de datos consumen (pg_stat_statements)
--   - el estado de las tablas de logs que crecen solas (pg_cron, pg_net, sync_runs)
--   - una lista de avisos ya calculados (70 % = aviso, 90 % = crítico)
--
-- Solo lee, nunca borra: los avisos sobre logs incluyen el SQL de limpieza
-- para ejecutarlo a mano si se decide hacerlo.
--
-- El egress (datos servidos, 5 GB/mes) NO se puede medir desde Postgres; solo
-- aparece en el dashboard de Supabase (Organization -> Usage).
--
-- Solo puede ejecutarla service_role: la llaman /api/admin/usage (tras
-- requireAdmin) y vigilar_consumo_supabase.py desde GitHub Actions.
-- ============================================================================

create or replace function public.admin_usage_report()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
    -- Límites del plan Free.
    c_db_limit      constant bigint := 500 * 1024 * 1024;
    c_storage_limit constant bigint := 1024 * 1024 * 1024;
    c_mau_limit     constant int    := 50000;
    -- A partir de aquí una tabla de logs se considera que merece limpieza.
    c_log_rows_warn  constant bigint := 50000;
    c_log_bytes_warn constant bigint := 25 * 1024 * 1024;

    v_db_bytes      bigint;
    v_storage_bytes bigint := 0;
    v_storage_files bigint := 0;
    v_mau           int := 0;
    v_users         int := 0;
    v_tables        jsonb;
    v_queries       jsonb := '[]'::jsonb;
    v_stats_since   timestamptz;
    v_logs          jsonb := '[]'::jsonb;
    v_alerts        jsonb := '[]'::jsonb;
    v_pct           numeric;
    r               record;
begin
    v_db_bytes := pg_database_size(current_database());

    -- ── Tablas más pesadas ──────────────────────────────────────────────────
    select coalesce(jsonb_agg(t order by t.total_bytes desc), '[]'::jsonb)
      into v_tables
      from (
        select n.nspname                         as schema,
               c.relname                         as name,
               pg_total_relation_size(c.oid)     as total_bytes,
               pg_indexes_size(c.oid)            as index_bytes,
               coalesce(s.n_live_tup, 0)         as rows,
               coalesce(s.n_dead_tup, 0)         as dead_rows
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          left join pg_stat_all_tables s on s.relid = c.oid
         where c.relkind in ('r', 'm', 'p')
           and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
         order by pg_total_relation_size(c.oid) desc
         limit 15
      ) t;

    -- ── Storage ─────────────────────────────────────────────────────────────
    begin
        select coalesce(sum((metadata->>'size')::bigint), 0), count(*)
          into v_storage_bytes, v_storage_files
          from storage.objects;
    exception when others then
        null;
    end;

    -- ── Usuarios ────────────────────────────────────────────────────────────
    begin
        select count(*),
               count(*) filter (where last_sign_in_at > now() - interval '30 days')
          into v_users, v_mau
          from auth.users;
    exception when others then
        null;
    end;

    -- ── Consultas más caras ─────────────────────────────────────────────────
    -- pg_stat_statements acumula desde el último reset de estadísticas; si la
    -- extensión no está, el informe sigue sin esta sección.
    begin
        execute $q$
            select coalesce(jsonb_agg(q), '[]'::jsonb)
              from (
                select left(regexp_replace(query, '\s+', ' ', 'g'), 240) as query,
                       calls,
                       round(total_exec_time::numeric, 0)                as total_ms,
                       round(mean_exec_time::numeric, 2)                 as mean_ms,
                       rows
                  from extensions.pg_stat_statements
                 where dbid = (select oid from pg_database where datname = current_database())
                   and query not ilike '%pg_stat_statements%'
                 order by total_exec_time desc
                 limit 10
              ) q
        $q$ into v_queries;

        begin
            execute 'select stats_reset from extensions.pg_stat_statements_info'
               into v_stats_since;
        exception when others then
            null;
        end;
    exception when others then
        v_queries := '[]'::jsonb;
    end;

    -- ── Tablas de logs que crecen solas ─────────────────────────────────────
    for r in
        select *
          from (values
            ('cron', 'job_run_details', 'start_time',
             'delete from cron.job_run_details where start_time < now() - interval ''7 days'';'),
            ('net', '_http_response', 'created',
             'delete from net._http_response where created < now() - interval ''1 day'';'),
            ('public', 'sync_runs', 'ran_at',
             'delete from public.sync_runs where ran_at < now() - interval ''14 days'';')
          ) as l(schema, name, ts_col, cleanup_sql)
    loop
        if to_regclass(format('%I.%I', r.schema, r.name)) is null then
            continue;
        end if;

        declare
            v_rows   bigint;
            v_bytes  bigint;
            v_oldest timestamptz;
        begin
            execute format('select count(*), min(%I) from %I.%I', r.ts_col, r.schema, r.name)
               into v_rows, v_oldest;
            v_bytes := pg_total_relation_size(format('%I.%I', r.schema, r.name)::regclass);

            v_logs := v_logs || jsonb_build_object(
                'table',       r.schema || '.' || r.name,
                'rows',        v_rows,
                'total_bytes', v_bytes,
                'oldest',      v_oldest,
                'cleanup_sql', r.cleanup_sql
            );

            if v_rows >= c_log_rows_warn or v_bytes >= c_log_bytes_warn then
                v_alerts := v_alerts || jsonb_build_object(
                    'level',   'warning',
                    'area',    'logs',
                    'message', format(
                        '%s.%s acumula %s filas (%s) desde %s. Se puede limpiar con: %s',
                        r.schema, r.name, v_rows, pg_size_pretty(v_bytes),
                        coalesce(to_char(v_oldest, 'DD/MM/YYYY'), '—'), r.cleanup_sql)
                );
            end if;
        exception when others then
            null;
        end;
    end loop;

    -- ── Avisos por porcentaje de límite ─────────────────────────────────────
    v_pct := round(100.0 * v_db_bytes / c_db_limit, 1);
    if v_pct >= 70 then
        v_alerts := v_alerts || jsonb_build_object(
            'level',   case when v_pct >= 90 then 'critical' else 'warning' end,
            'area',    'database',
            'message', format('La base de datos ocupa %s (%s%% de 500 MB).',
                              pg_size_pretty(v_db_bytes), v_pct)
        );
    end if;

    v_pct := round(100.0 * v_storage_bytes / c_storage_limit, 1);
    if v_pct >= 70 then
        v_alerts := v_alerts || jsonb_build_object(
            'level',   case when v_pct >= 90 then 'critical' else 'warning' end,
            'area',    'storage',
            'message', format('Storage ocupa %s (%s%% de 1 GB).',
                              pg_size_pretty(v_storage_bytes), v_pct)
        );
    end if;

    v_pct := round(100.0 * v_mau / c_mau_limit, 1);
    if v_pct >= 70 then
        v_alerts := v_alerts || jsonb_build_object(
            'level',   case when v_pct >= 90 then 'critical' else 'warning' end,
            'area',    'mau',
            'message', format('%s usuarios activos en 30 días (%s%% de 50.000).', v_mau, v_pct)
        );
    end if;

    return jsonb_build_object(
        'generated_at', now(),
        'database', jsonb_build_object('bytes', v_db_bytes, 'limit_bytes', c_db_limit),
        'storage',  jsonb_build_object('bytes', v_storage_bytes, 'files', v_storage_files,
                                       'limit_bytes', c_storage_limit),
        'users',    jsonb_build_object('total', v_users, 'mau', v_mau, 'limit', c_mau_limit),
        'tables',   v_tables,
        'queries',  jsonb_build_object('since', v_stats_since, 'top', v_queries),
        'logs',     v_logs,
        'alerts',   v_alerts
    );
end;
$$;

revoke all on function public.admin_usage_report() from public, anon, authenticated;
grant execute on function public.admin_usage_report() to service_role;

-- ============================================================================
-- COMPROBACIÓN (SQL Editor):
--   select jsonb_pretty(public.admin_usage_report());
-- ============================================================================

-- Que la API REST (PostgREST) vea la función nueva sin esperar.
notify pgrst, 'reload schema';
