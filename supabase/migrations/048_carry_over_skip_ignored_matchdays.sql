-- 048: la herencia de alineaciones se salta las jornadas ignoradas.
--
-- Una jornada marcada en Admin → Jornadas ignoradas (league_config.ignored_matchdays,
-- migración 047) no existe para el juego: sus partidos no cierran el mercado ni
-- cuentan como jornada. Sin esto, carry_over_lineups() (cada 15 min, migración
-- 035) tomaba como jornada objetivo la del próximo partido aunque fuera de una
-- jornada ignorada (p. ej. la J23 el 2/12/2026), copiaba alineaciones a ella, y
-- después la J24 heredaba ese once viejo en vez del de la J22.
--
-- Ahora:
--   * is_ignored_matchday(md) lee la lista de league_config.
--   * get_chronological_predecessor() no tiene en cuenta los partidos de
--     jornadas ignoradas: el predecesor de la J24 es la J22.
--   * carry_over_lineups() nunca elige una jornada ignorada como objetivo ni
--     copia desde ella.
--
-- Mismo cuerpo que 031 (carry_over_lineups) y 036 (get_chronological_predecessor)
-- con esos filtros añadidos. Se aplica a mano en el SQL Editor. Es reejecutable.

CREATE OR REPLACE FUNCTION public.is_ignored_matchday(p_matchday INTEGER)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.league_config c,
             jsonb_array_elements(COALESCE(c.ignored_matchdays, '[]'::jsonb)) AS item
        WHERE c.id::text = '1'   -- id es text en la BD real (no integer)
          AND (item->>'matchday') ~ '^[0-9]+$'
          AND (item->>'matchday')::INTEGER = p_matchday
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

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
        AND NOT public.is_ignored_matchday(matchday)
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

CREATE OR REPLACE FUNCTION public.carry_over_lineups()
RETURNS void AS $$
DECLARE
    target_matchday INTEGER;
    prev_matchday INTEGER;
    prev_matchday_to_copy INTEGER;
    t RECORD;
    target_created_at TIMESTAMPTZ;
    prev_created_at TIMESTAMPTZ;
    temp_prev_md INTEGER;
BEGIN
    SELECT matchday INTO target_matchday
    FROM public.fixtures
    WHERE start_time >= NOW() AND matchday > 0 AND NOT public.is_ignored_matchday(matchday)
    ORDER BY start_time ASC LIMIT 1;
    IF target_matchday IS NULL THEN
        SELECT MAX(matchday) INTO target_matchday
        FROM public.fixtures
        WHERE matchday > 0 AND NOT public.is_ignored_matchday(matchday);
    END IF;
    IF target_matchday IS NULL THEN RETURN; END IF;

    prev_matchday := public.get_chronological_predecessor(target_matchday);
    IF prev_matchday IS NULL THEN
        SELECT MAX(matchday) INTO prev_matchday
        FROM public.fixtures
        WHERE matchday > 0 AND matchday < target_matchday AND NOT public.is_ignored_matchday(matchday);
    END IF;

    FOR t IN SELECT id FROM public.user_teams LOOP
        SELECT MAX(created_at) INTO target_created_at
        FROM public.team_players
        WHERE team_id = t.id AND matchday = target_matchday;

        SELECT MAX(created_at) INTO prev_created_at
        FROM public.team_players
        WHERE team_id = t.id AND matchday = prev_matchday;

        IF prev_created_at IS NULL THEN
            SELECT MAX(matchday) INTO temp_prev_md
            FROM public.team_players
            WHERE team_id = t.id AND matchday < target_matchday
              AND NOT public.is_ignored_matchday(matchday);

            IF temp_prev_md IS NOT NULL THEN
                prev_matchday_to_copy := temp_prev_md;
                SELECT MAX(created_at) INTO prev_created_at
                FROM public.team_players
                WHERE team_id = t.id AND matchday = prev_matchday_to_copy;
            ELSE
                prev_matchday_to_copy := NULL;
            END IF;
        ELSE
            prev_matchday_to_copy := prev_matchday;
        END IF;

        IF prev_matchday_to_copy IS NULL THEN
            CONTINUE;
        END IF;

        IF target_created_at IS NULL OR target_created_at < prev_created_at THEN
            IF target_created_at IS NOT NULL THEN
                DELETE FROM public.team_players
                WHERE team_id = t.id AND matchday = target_matchday;
            END IF;

            INSERT INTO public.team_players (team_id, player_id, is_starter, is_captain, "order", matchday, position)
            SELECT team_id, player_id, is_starter, is_captain, "order", target_matchday, position
            FROM public.team_players
            WHERE team_id = t.id AND matchday = prev_matchday_to_copy
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMPROBACIÓN (SQL Editor, tras aplicar)
--
--   select public.is_ignored_matchday(23);              -- true
--   select public.get_chronological_predecessor(24);    -- 22
--   -- No debe quedar ninguna alineación en la J23:
--   select count(*) from public.team_players where matchday = 23;
-- ============================================================================
