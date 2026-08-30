-- 028_add_replaced_player_id.sql
-- Add replaced_player_id to player_scores to link substitutions in real matches

ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS replaced_player_id TEXT;
