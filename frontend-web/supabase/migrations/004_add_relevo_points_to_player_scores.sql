-- ============================================
-- Añade la columna relevo_points a player_scores
--
-- El motor de puntuación (trigger_descarga_eventos.py) empezó a escribir
-- 'relevo_points' tras el commit "Cambios en el motor de puntuación", pero la
-- columna nunca se creó en la base de datos. Eso hacía que CADA upsert de
-- player_scores fallara con PGRST204 ("Could not find the 'relevo_points'
-- column"), por lo que los puntos de los jugadores dejaban de subirse.
-- ============================================

ALTER TABLE player_scores
    ADD COLUMN IF NOT EXISTS relevo_points integer NOT NULL DEFAULT 0;
