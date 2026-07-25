-- Migración 008: divisiones de la liga (1ª, 2ª, 3ª)
-- Ejecutar en Supabase SQL Editor
--
-- Cada usuario juega en una división. El administrador la asigna desde el panel.
-- NULL = sin asignar (el usuario está registrado pero no cuenta en ninguna
-- clasificación hasta que el admin le asigne división).

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS division SMALLINT;

-- Solo se admiten las tres divisiones (o NULL = sin asignar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_division_valid'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_division_valid
      CHECK (division IS NULL OR division IN (1, 2, 3));
  END IF;
END $$;

-- Índice para filtrar rápido por división al construir clasificaciones
CREATE INDEX IF NOT EXISTS idx_profiles_division ON profiles(division);
