-- 044: lectura por jornadas de team_players y player_scores (menos egress).
--
-- Cada recálculo de la clasificación y de las sanciones en vivo descargaba
-- team_players (6.907 filas, 7 páginas) y player_scores (3.509 filas) ENTEROS.
-- Del 20 al 24/10/2026 eso fueron ~1.200 consultas al día solo de
-- team_players: cualquier guardado de alineación sube data_versions.v y el
-- siguiente que abre la clasificación lo vuelve a bajar todo.
--
-- Ahora el servidor pide primero una huella por jornada (unas decenas de
-- filas) y solo descarga las jornadas cuya huella no tiene ya en la caché de
-- Vercel. Un guardado de alineación cambia la huella de UNA jornada; una
-- pasada del sync en vivo, la de la jornada en juego.
--
-- Todo es de solo lectura y SECURITY INVOKER: se aplica la misma RLS que en
-- las consultas directas de antes. No modifica datos.
--
-- La "jornada" de cada fila es la misma que calcula la web:
--   team_players:  matchday (NULL o <= 0 → 0)
--   player_scores: matchday si es > 0; si no, la del partido (fixtures);
--                  si tampoco, 0.
--
-- Se aplica a mano en el SQL Editor. Es reejecutable. Sin ella la web sigue
-- funcionando con la descarga completa de antes.

create or replace function public.lineup_score_chunk_digest()
returns table(tbl text, chunk integer, n bigint, h text)
language sql
stable
set search_path = public
as $$
    select 'team_players', c, count(*),
           md5(string_agg(row(id, team_id, player_id, is_starter, is_captain, matchday, created_at, position)::text, ',' order by id))
      from (select tp.*, greatest(coalesce(tp.matchday, 0), 0) as c from public.team_players tp) t
     group by c
    union all
    select 'player_scores', c, count(*),
           md5(string_agg(row(id, player_id, total_points, fixture_id, matchday, minutes_played)::text, ',' order by id))
      from (
            select ps.id, ps.player_id, ps.total_points, ps.fixture_id, ps.matchday, ps.minutes_played,
                   case when ps.matchday > 0 then ps.matchday
                        when f.matchday > 0 then f.matchday
                        else 0 end as c
              from public.player_scores ps
              left join public.fixtures f on f.id = ps.fixture_id
           ) t
     group by c
$$;

create or replace function public.team_players_chunk(p_chunk integer)
returns setof public.team_players
language sql
stable
set search_path = public
as $$
    select * from public.team_players where greatest(coalesce(matchday, 0), 0) = p_chunk
$$;

create or replace function public.player_scores_chunk(p_chunk integer)
returns setof public.player_scores
language sql
stable
set search_path = public
as $$
    select ps.*
      from public.player_scores ps
      left join public.fixtures f on f.id = ps.fixture_id
     where (case when ps.matchday > 0 then ps.matchday
                 when f.matchday > 0 then f.matchday
                 else 0 end) = p_chunk
$$;

-- Aperturas de la app por usuario desde una fecha: ~60 filas en vez de las
-- miles de user_sessions que se bajaban para contarlas en el servidor.
create or replace function public.session_counts_since(p_since timestamptz)
returns table(user_id uuid, n bigint)
language sql
stable
set search_path = public
as $$
    select s.user_id, count(*) from public.user_sessions s where s.started_at >= p_since group by s.user_id
$$;

grant execute on function public.lineup_score_chunk_digest() to authenticated, service_role;
grant execute on function public.team_players_chunk(integer) to authenticated, service_role;
grant execute on function public.player_scores_chunk(integer) to authenticated, service_role;
grant execute on function public.session_counts_since(timestamptz) to authenticated, service_role;

-- PostgREST tiene que ver las funciones nuevas.
notify pgrst, 'reload schema';

-- ============================================================================
-- COMPROBACIÓN (en el SQL Editor, tras aplicar)
--
--   select * from public.lineup_score_chunk_digest() order by tbl, chunk;
--   -- La suma de n por tabla debe coincidir con el total de filas:
--   select tbl, sum(n) from public.lineup_score_chunk_digest() group by tbl;
--   select count(*) from public.team_players;
--   select count(*) from public.player_scores;
-- ============================================================================
