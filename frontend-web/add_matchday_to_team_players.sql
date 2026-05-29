-- Añadir columna matchday a team_players y actualizar restricción UNIQUE
-- Ejecutar en Supabase SQL Editor

-- 1. Añadir columna matchday si no existe
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

-- 2. Eliminar restricción UNIQUE antigua (team_id, player_id)
DROP INDEX IF EXISTS team_players_team_id_player_id_key;

-- 3. Crear nueva restricción UNIQUE que incluya matchday
-- Esto permite tener el mismo jugador en diferentes matchdays
ALTER TABLE team_players
ADD CONSTRAINT team_players_team_player_matchday_unique
UNIQUE (team_id, player_id, matchday);
