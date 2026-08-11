import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from('extra_payments')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    // If table doesn't exist yet (Postgres code 42P01), return empty list gracefully
    if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
      return NextResponse.json({ extraPayments: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ extraPayments: data || [] })
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const body = await req.json().catch(() => ({}))
  const { username, amount, collected_by } = body
  if (!username || amount === undefined) {
    return NextResponse.json({ error: 'El nombre de usuario y el pago son requeridos' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from('extra_payments')
    .insert([{ username, amount: Number(amount), collected_by: collected_by || null }])
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ extraPayment: data?.[0] })
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const body = await req.json().catch(() => ({}))
  const { id, username, amount, collected_by } = body
  if (!id) {
    return NextResponse.json({ error: 'El ID es requerido' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const patch: any = {}
  if (username !== undefined) patch.username = username
  if (amount !== undefined) patch.amount = Number(amount)
  if (collected_by !== undefined) patch.collected_by = collected_by || null

  const { data, error } = await admin
    .from('extra_payments')
    .update(patch)
    .eq('id', id)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ extraPayment: data?.[0] })
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'El ID es requerido' }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const { error } = await admin
    .from('extra_payments')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
