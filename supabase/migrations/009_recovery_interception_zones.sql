-- 009_recovery_interception_zones: desglose por zona de recuperaciones e interceptaciones.
--
-- El motor ya clasifica las recuperaciones por sector (X) y suma 0.3/0.2/0.1 al
-- total, pero solo guardaba el agregado `ball_recoveries`, así que el frontend no
-- podía mostrar el desglose por zona. Añadimos las columnas por zona para
-- recuperaciones e interceptaciones (estas últimas, además, ahora puntúan).
--
-- Tras aplicar: re-sincronizar los partidos ya disputados para poblar las columnas.

ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS recoveries_high INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS recoveries_med  INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS recoveries_low  INTEGER DEFAULT 0;

ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS interceptions_high INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS interceptions_med  INTEGER DEFAULT 0;
ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS interceptions_low  INTEGER DEFAULT 0;
