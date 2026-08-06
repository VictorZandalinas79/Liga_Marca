-- Migration: Add win and draw bonuses to player_scores

ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS win_bonus numeric DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS draw_bonus numeric DEFAULT 0;
