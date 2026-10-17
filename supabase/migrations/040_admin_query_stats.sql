-- ============================================================================
-- 040: contador de consultas para el panel Admin → Consumo Supabase
-- ============================================================================
--
-- El egress (datos servidos) no se puede medir desde Postgres, pero sí cuántas
-- veces se ejecuta cada consulta: pg_stat_statements las agrupa por forma, y
-- cada petición REST de la app es una ejecución. Multiplicado por lo que pesa
-- cada respuesta, eso dice qué página se come la cuota.
--
-- admin_usage_report (037) ordena por tiempo de base de datos; esta función
-- ordena por número de llamadas, que es lo que se parece al egress, y traduce
-- la consulta de PostgREST a "tabla + columnas" para reconocerla.
--
-- admin_reset_query_stats pone el contador a cero para medir solo a partir de
-- un cambio (p. ej. después de desplegar una optimización y antes de una
-- jornada). Borra el histórico de pg_stat_statements de todo el proyecto.
--
-- Solo service_role: las llama /api/admin/usage tras requireAdmin.
-- ============================================================================

create or replace function public.admin_query_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
    v_since timestamptz;
    v_top   jsonb;
    v_total bigint;
begin
    begin
        execute 'select stats_reset from extensions.pg_stat_statements_info'
           into v_since;
    exception when others then
        v_since := null;
    end;

    begin
        execute $q$
            with s as (
                select query, calls
                  from extensions.pg_stat_statements
                 where dbid = (select oid from pg_database where datname = current_database())
                   -- Envoltorio que PostgREST ejecuta en cada petición: sirve
                   -- para contar el total, no para saber qué se pidió.
                   and query not ilike 'select set_config(%'
                   and query not ilike '%pg_stat_statements%'
            ),
            parsed as (
                select calls,
                       (regexp_match(query, 'from "?(?:public|auth|storage|cron|net)"?\."?([a-z_]+)"?', 'i'))[1] as tabla,
                       (regexp_match(query, 'pgrst_source AS \( SELECT (.*?) FROM ', 'i'))[1] as columnas,
                       left(regexp_replace(query, '\s+', ' ', 'g'), 300) as query,
                       (query ilike '%pgrst_source%') as es_api,
                       (query ~* '^\s*(insert|update|delete)') as escritura
                  from s
            )
            select coalesce(jsonb_agg(p order by p.calls desc), '[]'::jsonb)
              from (
                select tabla,
                       -- "public"."tabla"."columna" → columna
                       nullif(replace(regexp_replace(coalesce(columnas, ''), '"[a-z_]+"\."[a-z_0-9]+"\.', '', 'g'), '"', ''), '') as columnas,
                       query, calls, es_api, escritura
                  from parsed
                 order by calls desc
                 limit 30
              ) p
        $q$ into v_top;

        execute $q$
            select coalesce(sum(calls), 0)
              from extensions.pg_stat_statements
             where dbid = (select oid from pg_database where datname = current_database())
               and query ilike 'select set_config(%'
        $q$ into v_total;
    exception when others then
        v_top := '[]'::jsonb;
        v_total := 0;
    end;

    return jsonb_build_object(
        'since',          v_since,
        'generated_at',   now(),
        'api_requests',   v_total,
        'top',            v_top
    );
end;
$$;

create or replace function public.admin_reset_query_stats()
returns timestamptz
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
    perform extensions.pg_stat_statements_reset();
    return now();
end;
$$;

revoke all on function public.admin_query_stats() from public, anon, authenticated;
grant execute on function public.admin_query_stats() to service_role;
revoke all on function public.admin_reset_query_stats() from public, anon, authenticated;
grant execute on function public.admin_reset_query_stats() to service_role;

-- ============================================================================
-- COMPROBACIÓN (SQL Editor):
--   select jsonb_pretty(public.admin_query_stats());
-- ============================================================================

notify pgrst, 'reload schema';
