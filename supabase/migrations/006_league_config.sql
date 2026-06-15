-- Configuración de las reglas del juego, editable por el administrador.
-- Fila única (id = 1). Todo el frontend lee de aquí (presupuesto, tácticas,
-- máximo de jugadores por equipo, pagos por jornada y cuándo empieza la jornada).

CREATE TABLE IF NOT EXISTS league_config (
    id INT PRIMARY KEY DEFAULT 1,
    -- Presupuesto máximo por equipo, en las mismas unidades que players.precio (millones).
    budget_limit NUMERIC NOT NULL DEFAULT 275,
    -- Máximo de jugadores del MISMO equipo real permitidos en una alineación.
    max_players_per_team INT NOT NULL DEFAULT 4,
    -- Tácticas válidas, como "DEF-MID-FWD".
    formations TEXT[] NOT NULL DEFAULT ARRAY[
        '3-5-2', '3-4-3', '4-4-2', '4-3-3', '4-5-1', '5-4-1', '5-3-2'
    ],
    -- Pagos por jornada (€) que se suman/restan a la columna Importe del usuario.
    pay_winner NUMERIC NOT NULL DEFAULT 0,
    pay_loser  NUMERIC NOT NULL DEFAULT 2,
    pay_rest   NUMERIC NOT NULL DEFAULT 1,
    -- Cuándo "empieza" la jornada (se cierra el mercado y se aplican sanciones):
    -- estas horas ANTES del primer partido de la jornada.
    matchday_start_hours_before NUMERIC NOT NULL DEFAULT 1,
    -- Cuándo se considera cerrada la jornada: estas horas DESPUÉS del último partido.
    matchday_end_hours_after NUMERIC NOT NULL DEFAULT 2,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT league_config_singleton CHECK (id = 1)
);

-- Garantiza que exista la fila por defecto.
INSERT INTO league_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE league_config ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer la configuración (la usa el dashboard).
DROP POLICY IF EXISTS "Authenticated can read league_config" ON league_config;
CREATE POLICY "Authenticated can read league_config"
    ON league_config FOR SELECT
    TO authenticated
    USING (true);

-- Solo el service role (vía API admin) puede modificarla.
DROP POLICY IF EXISTS "Service role can update league_config" ON league_config;
CREATE POLICY "Service role can update league_config"
    ON league_config FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);
