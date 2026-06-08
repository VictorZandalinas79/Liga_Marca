-- ============================================
-- AÑADIR COLUMNA matchday A team_players (si no existe)
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'team_players' AND column_name = 'matchday'
    ) THEN
        ALTER TABLE team_players ADD COLUMN matchday INTEGER DEFAULT 0;
    END IF;
END
$$;

-- Eliminar restricción UNIQUE antigua si existe
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'team_players_team_id_player_id_key'
    ) THEN
        ALTER TABLE team_players DROP CONSTRAINT team_players_team_id_player_id_key;
    END IF;
END
$$;

-- Crear nueva restricción UNIQUE que incluya matchday
ALTER TABLE team_players
ADD CONSTRAINT team_players_team_player_matchday_unique
UNIQUE (team_id, player_id, matchday);

-- ============================================
-- NOTA: El estado "registrado" se determina por la existencia
-- del usuario en la tabla user_teams, no se necesita columna extra.
-- ============================================
