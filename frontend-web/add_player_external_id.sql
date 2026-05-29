-- Añadir columna external_id para mapear IDs de la API de Perform/Scoresway
ALTER TABLE players ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS api_id TEXT;

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_players_external_id ON players(external_id);
CREATE INDEX IF NOT EXISTS idx_players_api_id ON players(api_id);

-- También necesitamos actualizar player_scores para que use el ID correcto
-- Añadir columna player_external_id temporalmente si es necesario
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS player_external_id TEXT;
