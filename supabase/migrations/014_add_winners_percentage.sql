-- Agrega la columna winners_percentage para definir qué porcentaje de la división se considera ganador/perdedor
ALTER TABLE league_config ADD COLUMN IF NOT EXISTS winners_percentage NUMERIC NOT NULL DEFAULT 25;
