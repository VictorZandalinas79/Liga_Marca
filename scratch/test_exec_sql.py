import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("frontend-web/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
sb = create_client(url, key)

sql = """
CREATE OR REPLACE FUNCTION save_team_lineup(
    p_team_id UUID,
    p_matchday INT,
    p_players JSONB
) RETURNS void AS $$
DECLARE
    v_distinct_count INT;
    v_total_count INT;
BEGIN
    -- Evitar condición de carrera en operaciones concurrentes
    PERFORM pg_advisory_xact_lock(hashtext(p_team_id::text));

    -- Verificar que no vengan jugadores duplicados en la lista p_players
    SELECT COUNT(*), COUNT(DISTINCT (elem->>'player_id'))
    INTO v_total_count, v_distinct_count
    FROM jsonb_array_elements(p_players) AS elem;

    IF v_total_count <> v_distinct_count THEN
        RAISE EXCEPTION 'No se permiten jugadores duplicados en la alineación (recibidos % únicos de % total)', v_distinct_count, v_total_count;
    END IF;

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
"""

try:
    res = sb.rpc("exec_sql", {"sql": sql}).execute()
    print("Successfully updated save_team_lineup via exec_sql RPC!", res)
except Exception as e:
    print("exec_sql failed:", e)
