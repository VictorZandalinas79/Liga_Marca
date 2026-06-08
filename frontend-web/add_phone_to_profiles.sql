-- ============================================
-- CONFIGURAR profiles: columna phone + creación automática del perfil
-- Ejecutar ENTERO en el SQL Editor de Supabase
-- ============================================

-- 1. Añadir la columna phone si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'phone'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN phone TEXT;
    END IF;
END
$$;

-- 2. Función que crea (o completa) el perfil a partir de los metadatos de auth.
--    SECURITY DEFINER => se salta la RLS, así que siempre puede escribir.
--    ON CONFLICT => es idempotente y no pisa datos existentes.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, phone)
    VALUES (
        NEW.id,
        NEW.raw_user_meta_data->>'full_name',
        NEW.email,
        NEW.raw_user_meta_data->>'phone'
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        email     = COALESCE(EXCLUDED.email,     public.profiles.email),
        phone     = COALESCE(EXCLUDED.phone,     public.profiles.phone);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger: al crear un usuario en auth.users, crear su perfil.
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_profile();

-- 4. Rellenar los perfiles de los usuarios que YA existen
--    (crea la fila si falta y copia el teléfono desde los metadatos).
INSERT INTO public.profiles (id, full_name, email, phone)
SELECT
    u.id,
    u.raw_user_meta_data->>'full_name',
    u.email,
    u.raw_user_meta_data->>'phone'
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone);
