import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Cuentas de administración pura que NO participan en pagos y se ocultan de la
// lista. Configurable con ADMIN_EXCLUDED_EMAILS (separadas por comas).
const EXCLUDED_EMAILS = (
  process.env.ADMIN_EXCLUDED_EMAILS || 'vilafranca.fantasy2026@gmail.com'
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export type AdminUser = {
  id: string
  email: string
  full_name: string
  phone: string
  has_paid: boolean
  paid_at: string | null
  amount_paid: number
  division: number | null
  entry_fee_paid: number
  infraction_penalties: number
  created_at: string
}

// Lista todos los usuarios registrados con su estado de pago.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const admin = createAdminSupabase()

  // 1. Perfiles (estado de pago + teléfono) indexados por id.
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, phone, has_paid, paid_at, amount_paid, division, entry_fee_paid, infraction_penalties')
  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p])
  )

  // 2. Usuarios de auth (email + metadata), paginando hasta agotar.
  const users: AdminUser[] = []
  const perPage = 1000
  let page = 1
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    for (const u of data.users) {
      const profile = profileById.get(u.id)
      // Solo se oculta la cuenta de administración pura (no todo admin).
      if (u.email && EXCLUDED_EMAILS.includes(u.email.toLowerCase())) continue
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>
      users.push({
        id: u.id,
        email: u.email ?? '',
        full_name: (meta.full_name as string) ?? '',
        phone: (profile?.phone as string) || ((meta.phone as string) ?? ''),
        has_paid: Boolean(profile?.has_paid),
        paid_at: (profile?.paid_at as string) ?? null,
        amount_paid: Number(profile?.amount_paid ?? 0),
        division: (profile?.division as number | null) ?? null,
        entry_fee_paid: Number(profile?.entry_fee_paid ?? 0),
        infraction_penalties: Number(profile?.infraction_penalties ?? 0),
        created_at: u.created_at,
      })
    }
    if (data.users.length < perPage) break
    page += 1
  }

  // Más recientes primero.
  users.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return NextResponse.json({ users })
}
