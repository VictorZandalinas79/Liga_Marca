import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const NUMERIC_FIELDS = [
  'budget_limit',
  'max_players_per_team',
  'pay_winner',
  'pay_loser',
  'pay_rest',
  'matchday_start_hours_before',
  'matchday_end_hours_after',
  'fantasy_starting_matchday',
  'max_changes_per_matchday',
  'starting_balance',
  'infraction_penalty_cost',
  'div1_win_percent',
  'div1_lose_percent',
  'div2_win_percent',
  'div2_lose_percent',
  'div3_win_percent',
  'div3_lose_percent',
  'div1_descensos',
  'div2_descensos',
  'div3_descensos',
] as const

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminSupabase()
  const { data, error } = await admin.from('league_config').select('*').eq('id', 1).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}

  for (const field of NUMERIC_FIELDS) {
    if (body[field] !== undefined) {
      const n = Number(body[field])
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `Valor inválido para ${field}` }, { status: 400 })
      }
      patch[field] = n
    }
  }

  if (body.formations !== undefined) {
    if (!Array.isArray(body.formations) || body.formations.some((f: unknown) => typeof f !== 'string')) {
      return NextResponse.json({ error: 'formations debe ser una lista de strings' }, { status: 400 })
    }
    // Normaliza y descarta vacíos/duplicados.
    patch.formations = Array.from(
      new Set((body.formations as string[]).map(f => f.trim()).filter(Boolean))
    )
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from('league_config')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
