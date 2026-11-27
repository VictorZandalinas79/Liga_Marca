import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { invalidateStandingsCache } from '@/lib/standings'
import { parseIgnoredMatchdays } from '@/lib/ignored-matchdays'

export const dynamic = 'force-dynamic'

// Jornadas ignoradas en el juego (league_config.ignored_matchdays, migración
// 047). Guardar sube data_versions (trigger de league_config), así que la
// clasificación y los avisos se recalculan solos.

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminSupabase()
  const { data, error } = await admin.from('league_config').select('ignored_matchdays').eq('id', 1).maybeSingle()
  if (error) {
    const missing = error.code === '42703'
    return NextResponse.json(
      { error: missing ? 'Falta aplicar la migración 047_ignored_matchdays.sql en el SQL Editor de Supabase' : error.message },
      { status: 500 }
    )
  }
  return NextResponse.json({ ignoredMatchdays: parseIgnoredMatchdays(data?.ignored_matchdays) })
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  if (!Array.isArray(body.ignoredMatchdays)) {
    return NextResponse.json({ error: 'ignoredMatchdays debe ser una lista' }, { status: 400 })
  }
  for (const item of body.ignoredMatchdays) {
    const md = Number(item?.matchday)
    if (!Number.isInteger(md) || md < 1 || md > 38) {
      return NextResponse.json({ error: `Jornada inválida: ${item?.matchday}` }, { status: 400 })
    }
    if (item?.message != null && typeof item.message !== 'string') {
      return NextResponse.json({ error: `Aviso inválido en la jornada ${md}` }, { status: 400 })
    }
    if (typeof item?.message === 'string' && item.message.length > 500) {
      return NextResponse.json({ error: `El aviso de la jornada ${md} supera los 500 caracteres` }, { status: 400 })
    }
  }
  const mds = (body.ignoredMatchdays as { matchday: unknown }[]).map(i => Number(i.matchday))
  if (new Set(mds).size !== mds.length) {
    return NextResponse.json({ error: 'Hay jornadas repetidas' }, { status: 400 })
  }

  const list = parseIgnoredMatchdays(body.ignoredMatchdays)
  const admin = createAdminSupabase()
  const { error } = await admin
    .from('league_config')
    .update({ ignored_matchdays: list, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  invalidateStandingsCache()
  return NextResponse.json({ ignoredMatchdays: list })
}
