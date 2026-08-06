-- Add is_in_biwenger flag to track active players in the market
ALTER TABLE players ADD COLUMN is_in_biwenger BOOLEAN DEFAULT TRUE;
UPDATE players SET is_in_biwenger = TRUE;
