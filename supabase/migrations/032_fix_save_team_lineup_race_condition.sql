-- 032_fix_save_team_lineup_race_condition.sql
-- Añade un bloqueo transaccional (pg_advisory_xact_lock) para evitar la 
-- condición de carrera al confirmar/cancelar cambios que duplicaba a los 
-- jugadores si se recibían dos llamadas simultáneas (al haber borrado la UNIQUE).

CREATE OR REPLACE FUNCTION save_team_lineup(
    p_team_id UUID,
    p_matchday INT,
    p_players JSONB
) RETURNS void AS $$
BEGIN
    -- Evitar condición de carrera en operaciones concurrentes
    PERFORM pg_advisory_xact_lock(hashtext(p_team_id::text));

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
        pl.position::TEXT
    FROM jsonb_array_elements(p_players) AS player
    LEFT JOIN players pl ON pl.id = (player->>'player_id')::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
