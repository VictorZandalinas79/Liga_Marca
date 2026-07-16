-- Migración 005: Desglose de Puntos RELEVO
-- Cambiamos relevo_points a NUMERIC y añadimos columnas de desglose

ALTER TABLE player_scores ALTER COLUMN relevo_points TYPE NUMERIC(5,2);

ALTER TABLE player_scores
  ADD COLUMN IF NOT EXISTS relevo_participation_pts NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relevo_passes_pts NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relevo_opp_half_pts NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relevo_shots_pts NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relevo_duels_pts NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relevo_aerials_pts NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relevo_takeons_pts NUMERIC(5,2) DEFAULT 0;
