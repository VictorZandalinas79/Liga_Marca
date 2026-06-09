import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Actualiza el estado de pago de un usuario.
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  const hasPaid = Boolean(body.has_paid)

  const admin = createAdminSupabase()
  const { error } = await admin
    .from('profiles')
    .upsert(
      {
        id,
        has_paid: hasPaid,
        paid_at: hasPaid ? new Date().toISOString() : null,
      },
      { onConflict: 'id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, has_paid: hasPaid })
}
