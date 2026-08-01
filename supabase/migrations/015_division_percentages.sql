-- Permitir porcentajes independientes por división para los ganadores y perdedores
ALTER TABLE league_config 
  DROP COLUMN IF EXISTS winners_percentage,
  ADD COLUMN IF NOT EXISTS div1_win_percent NUMERIC NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS div1_lose_percent NUMERIC NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS div2_win_percent NUMERIC NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS div2_lose_percent NUMERIC NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS div3_win_percent NUMERIC NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS div3_lose_percent NUMERIC NOT NULL DEFAULT 25;
