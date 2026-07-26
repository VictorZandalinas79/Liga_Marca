-- Registra en migraciones dos columnas de league_config que ya existen en la
-- base de datos (las escribe el panel de admin) pero que nunca se declararon en
-- la 006, así una reconstrucción desde cero no se queda corta.
--
-- fantasy_starting_matchday: jornada de LaLiga en la que arranca el juego. Los
-- jugadores reales puntúan desde la J1, pero los equipos de los usuarios no
-- contabilizan puntos hasta esta jornada; hasta entonces el mercado sigue
-- abierto y la cuenta atrás apunta al inicio de esa jornada.

ALTER TABLE league_config
    ADD COLUMN IF NOT EXISTS fantasy_starting_matchday INT NOT NULL DEFAULT 1;

ALTER TABLE league_config
    ADD COLUMN IF NOT EXISTS max_changes_per_matchday INT NOT NULL DEFAULT 3;
