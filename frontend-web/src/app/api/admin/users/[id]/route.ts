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

  // Actualización parcial: solo se tocan los campos enviados.
  const update: Record<string, unknown> = { id }

  if ('has_paid' in body) {
    const hasPaid = Boolean(body.has_paid)
    update.has_paid = hasPaid
    if (hasPaid && !('paid_at' in body)) {
      // Marcar pagado sin fecha explícita → fecha de hoy
      update.paid_at = new Date().toISOString()
    }
    if (!hasPaid) update.paid_at = null
  }

  if ('paid_at' in body) {
    update.paid_at = body.paid_at ? body.paid_at : null
  }

  if ('amount_paid' in body) {
    const n = Number(body.amount_paid)
    update.amount_paid = Number.isFinite(n) && n >= 0 ? n : 0
  }

  const admin = createAdminSupabase()
  const { error } = await admin
    .from('profiles')
    .upsert(update, { onConflict: 'id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
