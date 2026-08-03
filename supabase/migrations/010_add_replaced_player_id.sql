-- 010_add_replaced_player_id.sql
-- Añadir columna para recordar qué jugador sustituyó a quién en esa jornada

ALTER TABLE team_players 
ADD COLUMN IF NOT EXISTS replaced_player_id TEXT DEFAULT NULL;

-- Actualizar la función para permitir guardar el replaced_player_id
CREATE OR REPLACE FUNCTION save_team_lineup(
    p_team_id UUID,
    p_matchday INT,
    p_players JSONB
) RETURNS void AS $$
BEGIN
    -- 1. Eliminar la alineación actual para esa jornada
    DELETE FROM team_players 
    WHERE team_id = p_team_id AND matchday = p_matchday;
    
    -- 2. Insertar la nueva alineación en un solo paso
    INSERT INTO team_players (team_id, player_id, matchday, is_starter, is_captain, "order", replaced_player_id)
    SELECT 
        p_team_id,
        (player->>'player_id')::TEXT,
        p_matchday,
        COALESCE((player->>'is_starter')::BOOLEAN, true),
        COALESCE((player->>'is_captain')::BOOLEAN, false),
        (player->>'order')::INT,
        (player->>'replaced_player_id')::TEXT
    FROM jsonb_array_elements(p_players) AS player;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
