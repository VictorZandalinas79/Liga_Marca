-- Registro idempotente de los pagos por jornada (€) aplicados a cada usuario.
-- El motor de sanciones (3. calcular_sanciones_y_pagos.py) escribe aquí el
-- importe que corresponde a cada equipo en cada jornada (ganador/perdedor/resto)
-- y ajusta profiles.amount_paid con la DIFERENCIA respecto a lo ya aplicado, de
-- modo que reejecutar la misma jornada no cobra dos veces.

CREATE TABLE IF NOT EXISTS matchday_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id UUID REFERENCES user_teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    matchday INTEGER NOT NULL,
    net_points NUMERIC NOT NULL DEFAULT 0,
    rank INTEGER,
    amount NUMERIC NOT NULL DEFAULT 0,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (team_id, matchday)
);

CREATE INDEX IF NOT EXISTS idx_matchday_payments_matchday ON matchday_payments(matchday);
CREATE INDEX IF NOT EXISTS idx_matchday_payments_user_id ON matchday_payments(user_id);

ALTER TABLE matchday_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read matchday_payments" ON matchday_payments;
CREATE POLICY "Authenticated can read matchday_payments"
    ON matchday_payments FOR SELECT
    TO authenticated
    USING (true);
