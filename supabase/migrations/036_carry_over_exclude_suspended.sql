-- 036_carry_over_exclude_suspended.sql
-- Alinea get_chronological_predecessor con el resto del sistema: los fixtures
-- 'suspended' se excluyen igual que 'cancelled'/'postponed' (ver commits
-- "partido suspendido" / "cambios partido suspendido" del 16-17 sept 2026,
-- que ya tratan 'suspended' como estado no bloqueante en frontend).

CREATE OR REPLACE FUNCTION public.get_chronological_predecessor(p_matchday INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_prev_matchday INTEGER;
BEGIN
    WITH md_median AS (
      SELECT
        matchday,
        percentile_disc(0.5) WITHIN GROUP (ORDER BY start_time) as median_start
      FROM public.fixtures
      WHERE matchday > 0 AND status NOT IN ('cancelled', 'postponed', 'suspended') AND start_time IS NOT NULL
      GROUP BY matchday
    ),
    fixtures_with_order AS (
      SELECT
        f.id,
        f.matchday,
        f.start_time,
        m.median_start,
        ABS(EXTRACT(EPOCH FROM (f.start_time - m.median_start))) > 5 * 24 * 60 * 60 as is_out_of_order
      FROM public.fixtures f
      JOIN md_median m ON f.matchday = m.matchday
      WHERE f.status NOT IN ('cancelled', 'postponed', 'suspended') AND f.start_time IS NOT NULL
    ),
    regular_tramos AS (
      SELECT
        matchday,
        MIN(start_time) as start_time
      FROM fixtures_with_order
      WHERE NOT is_out_of_order
      GROUP BY matchday
    ),
    ooo_tramos AS (
      SELECT
        matchday,
        start_time
      FROM fixtures_with_order
      WHERE is_out_of_order
    ),
    all_tramos AS (
      SELECT matchday, start_time FROM regular_tramos
      UNION ALL
      SELECT matchday, start_time FROM ooo_tramos
    ),
    tramos_ordered AS (
      SELECT
        matchday,
        ROW_NUMBER() OVER (ORDER BY start_time ASC) as idx
      FROM all_tramos
    ),
    last_tramo AS (
      SELECT
        matchday,
        MAX(idx) as last_idx
      FROM tramos_ordered
      GROUP BY matchday
    )
    SELECT t.matchday INTO v_prev_matchday
    FROM tramos_ordered t
    JOIN last_tramo l ON l.matchday = p_matchday
    WHERE t.idx < l.last_idx AND t.matchday <> p_matchday
    ORDER BY t.idx DESC
    LIMIT 1;

    RETURN v_prev_matchday;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
