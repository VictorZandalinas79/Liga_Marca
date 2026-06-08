-- Migración 003: Añadir nuevas columnas v3.0 RELEVO a player_scores
-- Ejecutar en Supabase SQL Editor

-- Añadir nuevas columnas para las métricas v3.0 RELEVO
ALTER TABLE player_scores
ADD COLUMN IF NOT EXISTS forward_passes INTEGER DEFAULT 0;

ALTER TABLE player_scores
ADD COLUMN IF NOT EXISTS set_pieces_taken INTEGER DEFAULT 0;

ALTER TABLE player_scores
ADD COLUMN IF NOT EXISTS successful_crosses INTEGER DEFAULT 0;

-- Añadir índice para consultas de nuevas métricas (opcional)
CREATE INDEX IF NOT EXISTS idx_player_scores_forward_passes ON player_scores(forward_passes);
CREATE INDEX IF NOT EXISTS idx_player_scores_set_pieces ON player_scores(set_pieces_taken);
CREATE INDEX IF NOT EXISTS idx_player_scores_successful_crosses ON player_scores(successful_crosses);
