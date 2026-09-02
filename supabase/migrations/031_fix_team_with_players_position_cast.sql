-- 031_fix_team_with_players_position_cast.sql
-- players.position es del tipo enum player_position, no TEXT: el COALESCE con
-- team_players.position (TEXT) de la migracion 030 fallaba por tipos
-- incompatibles. Se castea explicitamente a TEXT aqui y tambien al snapshotear
-- la posicion en save_team_lineup, por si acaso (por si el INSERT tambien
-- tropieza con el mismo enum sin cast explicito).

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
        pl.position::TEXT
    FROM jsonb_array_elements(p_players) AS player
    LEFT JOIN players pl ON pl.id = (player->>'player_id')::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
    COALESCE(tp.position, pl.position::TEXT) as position,
    pl.photo,
    pl.shirt_number,
    pl.team_id as real_team_id
FROM user_teams ut
LEFT JOIN team_players tp ON ut.id = tp.team_id
LEFT JOIN players pl ON tp.player_id = pl.id
ORDER BY tp."order";
