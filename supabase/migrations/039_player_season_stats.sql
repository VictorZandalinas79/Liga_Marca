-- ============================================================================
-- 039_player_season_stats.sql
--
-- Vista agregada y función RPC para estadísticas acumuladas de jugadores.
--
-- POR QUÉ:
-- La página /jugadores y modales de estadísticas paginaban y descargaban la
-- tabla player_scores ENTERA (15.000+ filas, 35 columnas numéricas) para
-- calcular en JavaScript en el navegador del usuario las sumas de goles, puntos,
-- asistencias, etc.
-- Esto gastaba entre 3 y 5 MB de egress por cada usuario que abría la página.
--
-- Con esta vista y RPC, PostgreSQL calcula las sumas agrupadas por jugador
-- directamente en la base de datos y devuelve únicamente 1 fila por jugador
-- (~500 filas de unos 150 bytes, ~75 KB en total).
-- Reducción de ancho de banda: > 98%.
-- ============================================================================

-- 1. Vista para consultas tipo .from('player_season_stats').select('*')
DROP VIEW IF EXISTS public.player_season_stats CASCADE;
CREATE VIEW public.player_season_stats AS
SELECT
    ps.player_id,
    COUNT(*)::integer AS matches_played,
    COALESCE(SUM(ps.total_points), 0)::numeric AS total_points,
    COALESCE(SUM(ps.goals), 0)::integer AS goals,
    COALESCE(SUM(ps.assists), 0)::integer AS assists,
    COALESCE(SUM(ps.yellow_cards), 0)::integer AS yellow_cards,
    COALESCE(SUM(ps.red_cards), 0)::integer AS red_cards,
    COALESCE(SUM(ps.minutes_played), 0)::integer AS minutes_played,
    COALESCE(SUM(ps.shots_on_target), 0)::integer AS shots_on_target,
    COALESCE(SUM(ps.passes_completed), 0)::integer AS passes_completed,
    COALESCE(SUM(ps.passes_attempted), 0)::integer AS passes_attempted,
    COALESCE(SUM(ps.tackles_won), 0)::integer AS tackles_won,
    COALESCE(SUM(ps.interceptions), 0)::integer AS interceptions,
    COALESCE(SUM(ps.saves), 0)::integer AS saves,
    COALESCE(SUM(ps.clearances), 0)::integer AS clearances,
    COALESCE(SUM(ps.takeons_won), 0)::integer AS takeons_won,
    COALESCE(SUM(ps.ball_recoveries), 0)::integer AS ball_recoveries,
    COALESCE(SUM(ps.key_passes), 0)::integer AS key_passes,
    COALESCE(SUM(ps.big_chances_created), 0)::integer AS big_chances_created,
    COALESCE(SUM(ps.aerials_won), 0)::integer AS aerials_won,
    COALESCE(SUM(ps.penalties_won), 0)::integer AS penalties_won,
    COALESCE(SUM(ps.dispossessed), 0)::integer AS dispossessed,
    COALESCE(SUM(ps.bad_touches), 0)::integer AS bad_touches,
    COALESCE(SUM(ps.takeons_lost), 0)::integer AS takeons_lost,
    COALESCE(SUM(ps.own_goals), 0)::integer AS own_goals,
    COALESCE(SUM(ps.forward_passes), 0)::integer AS forward_passes,
    COALESCE(SUM(ps.box_entries), 0)::integer AS box_entries,
    COALESCE(SUM(ps.recoveries_high), 0)::integer AS recoveries_high,
    COALESCE(SUM(ps.recoveries_med), 0)::integer AS recoveries_med,
    COALESCE(SUM(ps.recoveries_low), 0)::integer AS recoveries_low,
    COALESCE(SUM(ps.interceptions_high), 0)::integer AS interceptions_high,
    COALESCE(SUM(ps.interceptions_med), 0)::integer AS interceptions_med,
    COALESCE(SUM(ps.interceptions_low), 0)::integer AS interceptions_low,
    COALESCE(SUM(ps.set_pieces_taken), 0)::integer AS set_pieces_taken,
    COALESCE(SUM(ps.successful_crosses), 0)::integer AS successful_crosses,
    COALESCE(SUM(ps.long_balls_completed), 0)::integer AS long_balls_completed
FROM public.player_scores ps
GROUP BY ps.player_id;

-- 2. Función RPC para consultas directas .rpc('get_player_season_stats')
DROP FUNCTION IF EXISTS public.get_player_season_stats();
CREATE OR REPLACE FUNCTION public.get_player_season_stats()
RETURNS TABLE (
    player_id text,
    matches_played integer,
    total_points numeric,
    goals integer,
    assists integer,
    yellow_cards integer,
    red_cards integer,
    minutes_played integer,
    shots_on_target integer,
    passes_completed integer,
    passes_attempted integer,
    tackles_won integer,
    interceptions integer,
    saves integer,
    clearances integer,
    takeons_won integer,
    ball_recoveries integer,
    key_passes integer,
    big_chances_created integer,
    aerials_won integer,
    penalties_won integer,
    dispossessed integer,
    bad_touches integer,
    takeons_lost integer,
    own_goals integer,
    forward_passes integer,
    box_entries integer,
    recoveries_high integer,
    recoveries_med integer,
    recoveries_low integer,
    interceptions_high integer,
    interceptions_med integer,
    interceptions_low integer,
    set_pieces_taken integer,
    successful_crosses integer,
    long_balls_completed integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        ps.player_id,
        COUNT(*)::integer AS matches_played,
        COALESCE(SUM(ps.total_points), 0)::numeric AS total_points,
        COALESCE(SUM(ps.goals), 0)::integer AS goals,
        COALESCE(SUM(ps.assists), 0)::integer AS assists,
        COALESCE(SUM(ps.yellow_cards), 0)::integer AS yellow_cards,
        COALESCE(SUM(ps.red_cards), 0)::integer AS red_cards,
        COALESCE(SUM(ps.minutes_played), 0)::integer AS minutes_played,
        COALESCE(SUM(ps.shots_on_target), 0)::integer AS shots_on_target,
        COALESCE(SUM(ps.passes_completed), 0)::integer AS passes_completed,
        COALESCE(SUM(ps.passes_attempted), 0)::integer AS passes_attempted,
        COALESCE(SUM(ps.tackles_won), 0)::integer AS tackles_won,
        COALESCE(SUM(ps.interceptions), 0)::integer AS interceptions,
        COALESCE(SUM(ps.saves), 0)::integer AS saves,
        COALESCE(SUM(ps.clearances), 0)::integer AS clearances,
        COALESCE(SUM(ps.takeons_won), 0)::integer AS takeons_won,
        COALESCE(SUM(ps.ball_recoveries), 0)::integer AS ball_recoveries,
        COALESCE(SUM(ps.key_passes), 0)::integer AS key_passes,
        COALESCE(SUM(ps.big_chances_created), 0)::integer AS big_chances_created,
        COALESCE(SUM(ps.aerials_won), 0)::integer AS aerials_won,
        COALESCE(SUM(ps.penalties_won), 0)::integer AS penalties_won,
        COALESCE(SUM(ps.dispossessed), 0)::integer AS dispossessed,
        COALESCE(SUM(ps.bad_touches), 0)::integer AS bad_touches,
        COALESCE(SUM(ps.takeons_lost), 0)::integer AS takeons_lost,
        COALESCE(SUM(ps.own_goals), 0)::integer AS own_goals,
        COALESCE(SUM(ps.forward_passes), 0)::integer AS forward_passes,
        COALESCE(SUM(ps.box_entries), 0)::integer AS box_entries,
        COALESCE(SUM(ps.recoveries_high), 0)::integer AS recoveries_high,
        COALESCE(SUM(ps.recoveries_med), 0)::integer AS recoveries_med,
        COALESCE(SUM(ps.recoveries_low), 0)::integer AS recoveries_low,
        COALESCE(SUM(ps.interceptions_high), 0)::integer AS interceptions_high,
        COALESCE(SUM(ps.interceptions_med), 0)::integer AS interceptions_med,
        COALESCE(SUM(ps.interceptions_low), 0)::integer AS interceptions_low,
        COALESCE(SUM(ps.set_pieces_taken), 0)::integer AS set_pieces_taken,
        COALESCE(SUM(ps.successful_crosses), 0)::integer AS successful_crosses,
        COALESCE(SUM(ps.long_balls_completed), 0)::integer AS long_balls_completed
    FROM public.player_scores ps
    GROUP BY ps.player_id;
$$;

-- Permisos de lectura
GRANT SELECT ON public.player_season_stats TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_player_season_stats() TO anon, authenticated, service_role;
