-- Fix RLS policies para la tabla fixtures
-- Necesario para permitir sincronización desde el script Python

-- 1. Habilitar RLS en la tabla fixtures (si no está ya habilitado)
ALTER TABLE fixtures ENABLE ROW LEVEL SECURITY;

-- 2. Política para permitir INSERT/UPDATE a usuarios autenticados
-- El rol 'anon' (clave pública) necesita esta política para poder hacer upsert
CREATE POLICY "Allow insert for fixtures sync" ON fixtures
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow update for fixtures sync" ON fixtures
    FOR UPDATE
    USING (true);

CREATE POLICY "Allow select for fixtures" ON fixtures
    FOR SELECT
    USING (true);

-- 3. Si usas la service_role key, esta bypassa RLS automáticamente
-- Pero estas políticas aseguran que también funcione con la anon key
