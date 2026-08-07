import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Dominio público de la app, para construir el enlace de recuperación.
function baseUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')
  if (configured) return configured
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (host) return `${request.headers.get('x-forwarded-proto') ?? 'https'}://${host}`
  return new URL(request.url).origin
}

// Genera un enlace de restablecimiento de contraseña para un usuario.
//
// Dos modos, porque el SMTP por defecto de Supabase está muy limitado y a veces
// el email no llega:
//   - 'email': Supabase manda el correo de recuperación al usuario.
//   - 'link' : devuelve el enlace para que el admin se lo pase a mano
//              (WhatsApp, etc.). No se envía ningún correo.
//
// Cada llamada invalida el enlace anterior de ese usuario: el token de
// recuperación se sobreescribe en auth.users, así que solo vale el último.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  const mode = body.mode === 'email' ? 'email' : 'link'

  const admin = createAdminSupabase()
  const { data: target, error: userErr } = await admin.auth.admin.getUserById(id)
  if (userErr || !target?.user?.email) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }
  const email = target.user.email
  const redirectTo = `${baseUrl(request)}/actualizar-password`

  if (mode === 'email') {
    // Con la clave anon (no la de servicio) para que Supabase envíe el correo.
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) {
      const limited = error.status === 429
      return NextResponse.json(
        {
          error: limited
            ? 'Supabase ha limitado el envío de correos (demasiados en poco tiempo). Prueba con el enlace manual.'
            : error.message,
        },
        { status: limited ? 429 : 500 }
      )
    }
    return NextResponse.json({ sent: true, email })
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })
  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json(
      { error: error?.message || 'No se pudo generar el enlace' },
      { status: 500 }
    )
  }

  // Enlace propio (no el action_link de Supabase): apunta a nuestra página, que
  // canjea el token con verifyOtp. Así funciona en cualquier navegador, aunque
  // el usuario lo abra desde WhatsApp en otro móvil.
  const link = `${redirectTo}?token_hash=${encodeURIComponent(
    data.properties.hashed_token
  )}&type=recovery`

  return NextResponse.json({ link, email })
}
