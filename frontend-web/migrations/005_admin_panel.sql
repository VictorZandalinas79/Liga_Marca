-- Migración 005: Panel de administración (gestión de usuarios y pagos)
-- Ejecutar en Supabase SQL Editor

-- Columnas de administración y control de pago en profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS has_paid BOOLEAN DEFAULT FALSE;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Índice para filtrar rápido por estado de pago
CREATE INDEX IF NOT EXISTS idx_profiles_has_paid ON profiles(has_paid);

-- RLS: permitir que cada usuario lea su propia fila (necesario para que el
-- nav detecte si es admin). El panel de admin usa la service role key en el
-- servidor, así que no necesita políticas adicionales de lectura global.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY profiles_select_own ON profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

-- ┌────────────────────────────────────────────────────────────────────┐
-- │ IMPORTANTE: marca TU cuenta como administrador ejecutando esto una   │
-- │ vez, sustituyendo el email por el tuyo:                              │
-- └────────────────────────────────────────────────────────────────────┘
-- UPDATE profiles SET is_admin = TRUE
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'victorzanpra@gmail.com');
