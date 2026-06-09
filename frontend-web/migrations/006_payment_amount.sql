-- Migración 006: importe pagado por cada usuario
-- Ejecutar en Supabase SQL Editor

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10, 2) DEFAULT 0;
