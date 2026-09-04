-- 033_deduplicate_and_harden_save_team_lineup.sql
-- Asegura el bloqueo transaccional contra condiciones de carrera al guardar alineaciones.

CREATE OR REPLACE FUNCTION save_team_lineup(
    p_team_id UUID,
    p_matchday INT,
    p_players JSONB
) RETURNS void AS $$
BEGIN
    -- Evitar condición de carrera en operaciones concurrentes (evita duplicar la alineación por peticiones simultáneas)
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
