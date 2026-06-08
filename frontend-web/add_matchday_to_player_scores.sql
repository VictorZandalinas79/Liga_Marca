-- Añadir columna matchday a player_scores para poder hacer merge con team_players
-- por (matchday, player_id) y sacar los puntos de cada jugador por jornada.
-- Ejecutar en Supabase SQL Editor.

-- 1. Añadir columna matchday si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'player_scores' AND column_name = 'matchday'
    ) THEN
        ALTER TABLE player_scores ADD COLUMN matchday INTEGER DEFAULT 0;
    END IF;
END
$$;

-- 2. Backfill: rellenar matchday de las filas existentes desde fixtures.
--    player_scores.fixture_id -> fixtures.id -> fixtures.matchday
UPDATE player_scores ps
SET matchday = f.matchday
FROM fixtures f
WHERE ps.fixture_id = f.id
  AND f.matchday IS NOT NULL;

-- 3. Índice para acelerar el merge por (matchday, player_id)
CREATE INDEX IF NOT EXISTS idx_player_scores_matchday_player
    ON player_scores (matchday, player_id);
