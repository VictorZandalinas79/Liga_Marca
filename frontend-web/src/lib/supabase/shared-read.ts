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
 * Usuario de la petición y su token de acceso. Devuelve null si no hay sesión.
 *
 * getClaims verifica la firma del JWT en local con las claves públicas del
 * proyecto (ES256, JWKS cacheado): antes getUser iba al servidor de Auth en
 * cada petición a /api/*, cinco consultas internas en Supabase cada vez (lo que
 * más llamadas sumaba en el informe de consultas).
 */
export async function getRequestAuth(): Promise<{ userId: string; accessToken: string } | null> {
  const supabase = await createServerSupabase()
  // getSession refresca el token si ha caducado; getClaims verifica ese token.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null
  const { data: auth } = await supabase.auth.getClaims(session.access_token)
  const userId = auth?.claims.sub
  if (!userId) return null
  return { userId, accessToken: session.access_token }
}
