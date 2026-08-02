-- Añadir columna para saber quién ha cobrado la cuota
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS collected_by text;
