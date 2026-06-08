-- Migración 004: Añadir columna box_entries (llegadas al área) a player_scores
-- El motor v3.0 RELEVO puntúa box_entries (+1 cada 2 llegadas) pero no se
-- persistía. Esta columna permite subir el dato y mostrarlo en el frontend.
-- Ejecutar en Supabase SQL Editor ANTES de re-sincronizar los partidos.

ALTER TABLE player_scores
ADD COLUMN IF NOT EXISTS box_entries INTEGER DEFAULT 0;

-- Índice opcional para consultas por esta métrica
CREATE INDEX IF NOT EXISTS idx_player_scores_box_entries ON player_scores(box_entries);
