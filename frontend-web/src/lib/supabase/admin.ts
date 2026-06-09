import { createClient } from '@supabase/supabase-js'

// Cliente con service role key. SOLO debe usarse en el servidor (route handlers).
// Salta RLS, por eso nunca debe exponerse al cliente.
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
