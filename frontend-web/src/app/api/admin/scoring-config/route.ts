import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Claves numéricas editables dentro de cada evento (resto = metadatos, intactos).
const EVENT_VALUE_KEYS = ['POR', 'DEF', 'MED', 'DEL', 'all'] as const

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

type Rules = Record<string, unknown>

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminSupabase()
  const { data, error } = await admin.from('scoring_config').select('rules').eq('id', 1).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules: data?.rules ?? null })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Rules
  const admin = createAdminSupabase()

  // Partimos de las reglas almacenadas para no perder metadatos ni secciones
  // no editables (participation, relevo_rules, mappings, version…).
  const { data: current, error: readErr } = await admin
    .from('scoring_config')
    .select('rules')
    .eq('id', 1)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!current?.rules) {
    return NextResponse.json({ error: 'No existe configuración de puntuación (aplica la migración 008)' }, { status: 404 })
  }

  // Clon profundo para mutar con seguridad.
  const rules = JSON.parse(JSON.stringify(current.rules)) as Rules
  let changed = false

  // --- events ---
  if (body.events && typeof body.events === 'object') {
    const events = (rules.events ??= {}) as Record<string, Record<string, unknown>>
    for (const [key, patch] of Object.entries(body.events as Record<string, unknown>)) {
      if (!patch || typeof patch !== 'object') continue
      const target = (events[key] ??= {})
      for (const vk of EVENT_VALUE_KEYS) {
        const val = (patch as Record<string, unknown>)[vk]
        if (val === undefined) continue
        if (!isNum(val)) {
          return NextResponse.json({ error: `Valor inválido en events.${key}.${vk}` }, { status: 400 })
        }
        target[vk] = val
        changed = true
      }
    }
  }

  // --- bonuses_per_X[key].points ---
  if (body.bonuses_per_X && typeof body.bonuses_per_X === 'object') {
    const bonuses = (rules.bonuses_per_X ??= {}) as Record<string, Record<string, unknown>>
    for (const [key, patch] of Object.entries(body.bonuses_per_X as Record<string, unknown>)) {
      const val = (patch as Record<string, unknown>)?.points
      if (val === undefined) continue
      if (!isNum(val)) {
        return NextResponse.json({ error: `Valor inválido en bonuses_per_X.${key}.points` }, { status: 400 })
      }
      const target = (bonuses[key] ??= { required: 1 })
      target.points = val
      changed = true
    }
  }

  // --- penalties_per_X[group][POS].points ---
  if (body.penalties_per_X && typeof body.penalties_per_X === 'object') {
    const penalties = (rules.penalties_per_X ??= {}) as Record<string, Record<string, Record<string, unknown>>>
    for (const [group, byPos] of Object.entries(body.penalties_per_X as Record<string, unknown>)) {
      if (!byPos || typeof byPos !== 'object') continue
      const targetGroup = (penalties[group] ??= {})
      for (const [pos, patch] of Object.entries(byPos as Record<string, unknown>)) {
        const val = (patch as Record<string, unknown>)?.points
        if (val === undefined) continue
        if (!isNum(val)) {
          return NextResponse.json({ error: `Valor inválido en penalties_per_X.${group}.${pos}.points` }, { status: 400 })
        }
        const target = (targetGroup[pos] ??= { required: 1 })
        target.points = val
        changed = true
      }
    }
  }

  if (!changed) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('scoring_config')
    .update({ rules, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('rules')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules: data?.rules ?? rules })
}
