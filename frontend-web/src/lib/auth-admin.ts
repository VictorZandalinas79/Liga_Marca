import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

// Verifica que quien hace la petición es un usuario autenticado Y administrador.
// Devuelve { ok: true, userId } o { ok: false, status, error } para responder.
export async function requireAdmin(): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { ok: false, status: 401, error: 'No autenticado' }
  }

  if (user.email?.toLowerCase() !== 'vilafranca.fantasy2026@gmail.com') {
    return { ok: false, status: 403, error: 'No autorizado' }
  }

  return { ok: true, userId: user.id, email: user.email ?? '' }
}
