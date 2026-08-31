-- 029_fix_carry_over_chronological.sql
-- Crea la función get_chronological_predecessor y actualiza carry_over_lineups

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
      WHERE matchday > 0 AND status NOT IN ('cancelled', 'postponed') AND start_time IS NOT NULL
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
      WHERE f.status NOT IN ('cancelled', 'postponed') AND f.start_time IS NOT NULL
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
    -- 1. Obtener la jornada objetivo (próxima jornada futura; si no, la máxima)
    SELECT matchday INTO target_matchday
    FROM public.fixtures WHERE start_time >= NOW() AND matchday > 0
    ORDER BY start_time ASC LIMIT 1;
    IF target_matchday IS NULL THEN
        SELECT MAX(matchday) INTO target_matchday FROM public.fixtures WHERE matchday > 0;
    END IF;
    IF target_matchday IS NULL THEN RETURN; END IF;

    -- 2. Resolver la predecesora cronológica
    prev_matchday := public.get_chronological_predecessor(target_matchday);
    IF prev_matchday IS NULL THEN
        prev_matchday := target_matchday - 1;
    END IF;

    -- 3. Para cada equipo, copiar/actualizar la alineación
    FOR t IN SELECT id FROM public.user_teams LOOP
        -- Obtener fecha del último guardado de la alineación de destino
        SELECT MAX(created_at) INTO target_created_at
        FROM public.team_players
        WHERE team_id = t.id AND matchday = target_matchday;

        -- Obtener fecha del último guardado de la alineación predecesora
        SELECT MAX(created_at) INTO prev_created_at
        FROM public.team_players
        WHERE team_id = t.id AND matchday = prev_matchday;

        -- Fallback si la predecesora cronológica está vacía
        IF prev_created_at IS NULL THEN
            SELECT MAX(matchday) INTO temp_prev_md
            FROM public.team_players
            WHERE team_id = t.id AND matchday < target_matchday;
            
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

        -- Si no hay ninguna alineación que copiar, saltamos
        IF prev_matchday_to_copy IS NULL THEN
            CONTINUE;
        END IF;

        -- Copiamos si no existe alineación en destino, o si la existente es obsoleta
        -- (creada antes que la alineación de origen, caso de un partido adelantado)
        IF target_created_at IS NULL OR target_created_at < prev_created_at THEN
            IF target_created_at IS NOT NULL THEN
                DELETE FROM public.team_players
                WHERE team_id = t.id AND matchday = target_matchday;
            END IF;

            INSERT INTO public.team_players (team_id, player_id, is_starter, is_captain, "order", matchday)
            SELECT team_id, player_id, is_starter, is_captain, "order", target_matchday
            FROM public.team_players
            WHERE team_id = t.id AND matchday = prev_matchday_to_copy
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
