-- 030_freeze_position_per_matchday.sql
-- Congela la demarcacion de cada jugador por jornada en team_players, para que
-- un cambio de posicion (scraping) no altere retroactivamente la formacion ya
-- alineada en jornadas pasadas (sanciones/puntos calculados con la posicion
-- vigente en cada momento, no con la actual).

ALTER TABLE team_players
ADD COLUMN IF NOT EXISTS position TEXT DEFAULT NULL;

COMMENT ON COLUMN team_players.position IS
'Snapshot de players.position en el momento en que se guardo/hereda esta alineacion. NULL en filas antiguas (previas a esta migracion): para esas se sigue leyendo players.position en vivo.';

-- save_team_lineup: al guardar, snapshotea la posicion actual del jugador.
CREATE OR REPLACE FUNCTION save_team_lineup(
    p_team_id UUID,
    p_matchday INT,
    p_players JSONB
) RETURNS void AS $$
BEGIN
    DELETE FROM team_players
    WHERE team_id = p_team_id AND matchday = p_matchday;

    INSERT INTO team_players (team_id, player_id, matchday, is_starter, is_captain, "order", replaced_player_id, position)
    SELECT
        p_team_id,
        (player->>'player_id')::TEXT,
        p_matchday,
        COALESCE((player->>'is_starter')::BOOLEAN, true),
        COALESCE((player->>'is_captain')::BOOLEAN, false),
        (player->>'order')::INT,
        (player->>'replaced_player_id')::TEXT,
        pl.position
    FROM jsonb_array_elements(p_players) AS player
    LEFT JOIN players pl ON pl.id = (player->>'player_id')::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- carry_over_lineups: al heredar una alineacion de una jornada anterior, hereda
-- tambien su snapshot de posicion (no la posicion actual del jugador).
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
    FROM public.fixtures WHERE start_time >= NOW() AND matchday > 0
    ORDER BY start_time ASC LIMIT 1;
    IF target_matchday IS NULL THEN
        SELECT MAX(matchday) INTO target_matchday FROM public.fixtures WHERE matchday > 0;
    END IF;
    IF target_matchday IS NULL THEN RETURN; END IF;

    prev_matchday := public.get_chronological_predecessor(target_matchday);
    IF prev_matchday IS NULL THEN
        prev_matchday := target_matchday - 1;
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

-- team_with_players: prioriza el snapshot congelado sobre la posicion en vivo.
CREATE OR REPLACE VIEW team_with_players AS
SELECT
    ut.id,
    ut.name,
    ut.user_id,
    tp.player_id,
    tp.is_starter,
    tp.is_captain,
    tp."order",
    pl.first_name,
    pl.last_name,
    pl.short_name,
    COALESCE(tp.position, pl.position) as position,
    pl.photo,
    pl.shirt_number,
    pl.team_id as real_team_id
FROM user_teams ut
LEFT JOIN team_players tp ON ut.id = tp.team_id
LEFT JOIN players pl ON tp.player_id = pl.id
ORDER BY tp."order";
