-- Campos para finanzas individuales y sanciones extra
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS entry_fee_paid NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infraction_penalties NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE league_config
  ADD COLUMN IF NOT EXISTS starting_balance NUMERIC NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS infraction_penalty_cost NUMERIC NOT NULL DEFAULT 3;
