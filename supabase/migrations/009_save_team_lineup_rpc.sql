-- 009_save_team_lineup_rpc.sql
-- Crea una función RPC para guardar la alineación de un equipo de forma atómica.

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
    INSERT INTO team_players (team_id, player_id, matchday, is_starter, is_captain, "order")
    SELECT 
        p_team_id,
        (player->>'player_id')::TEXT,
        p_matchday,
        COALESCE((player->>'is_starter')::BOOLEAN, true),
        COALESCE((player->>'is_captain')::BOOLEAN, false),
        (player->>'order')::INT
    FROM jsonb_array_elements(p_players) AS player;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
