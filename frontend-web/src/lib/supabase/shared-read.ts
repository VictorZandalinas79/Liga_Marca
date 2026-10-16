import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase/server'

// Cliente de solo lectura para los cálculos compartidos que se cachean en el
// servidor (clasificación, sanciones en vivo).
//
// Su resultado es el mismo para todos los usuarios, así que se guarda una sola
// vez en la Data Cache. Dentro de unstable_cache no se pueden leer cookies, por
// eso se saca aquí el token del usuario que hace la petición y se crea un
// cliente sin sesión que lo lleva en la cabecera. Hace falta el rol
// `authenticated` y no basta la anon key: league_config solo es legible para
// usuarios autenticados, y sin ella el cálculo usaría la config por defecto.
export function createSharedReadSupabase(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  )
}

/**
 * Usuario de la petición (validado con getUser) y su token de acceso.
 * Devuelve null si no hay sesión.
 */
export async function getRequestAuth(): Promise<{ userId: string; accessToken: string } | null> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null
  return { userId: user.id, accessToken: session.access_token }
}
