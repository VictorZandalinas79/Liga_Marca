import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export type AdminUser = {
  id: string
  email: string
  full_name: string
  phone: string
  has_paid: boolean
  paid_at: string | null
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
    .select('id, phone, has_paid, paid_at')
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
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>
      users.push({
        id: u.id,
        email: u.email ?? '',
        full_name: (meta.full_name as string) ?? '',
        phone: (profile?.phone as string) || ((meta.phone as string) ?? ''),
        has_paid: Boolean(profile?.has_paid),
        paid_at: (profile?.paid_at as string) ?? null,
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
