-- Migración 009: Añadir columna cubrir_balon_blocar (typeId 54) a player_scores
-- Necesaria para el Bloque 4 RELEVO del portero: (salidas fuera área typeId 59
-- + cubrir balón y blocar typeId 54) / minutos jugados > 0.03
-- Ejecutar en Supabase SQL Editor ANTES de re-sincronizar los partidos.

ALTER TABLE player_scores
ADD COLUMN IF NOT EXISTS cubrir_balon_blocar INTEGER DEFAULT 0;
