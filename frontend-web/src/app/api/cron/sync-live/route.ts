import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { dispatchLiveSync } from '@/lib/github-dispatch'

// Usa la anon key (no la service role): la SERVICE_ROLE_KEY nunca debe
// configurarse en Vercel (ver DESPLIEGUE.md), solo en GitHub Actions. La
// tabla fixtures ya se lee con la anon key desde el cliente (partidos/page.tsx),
// así que RLS la permite en lectura.
function createReadOnlySupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Disparador de respaldo para la sincronización en vivo.
//
// El cron de GitHub Actions (.github/workflows/sync-live.yml, */5 * * * *) se
// retrasa o se salta huecos bajo carga -especialmente en repos privados con
// poco tráfico-, así que este endpoint hace de red de seguridad: decide qué
// partidos hay que sincronizar (misma ventana que ci/run_live_sync.py) y
// dispara el workflow vía workflow_dispatch, que es mucho más inmediato que
// el trigger `schedule`.
//
// Pensado para ser llamado cada 5 min por un cron externo gratuito
// (cron-job.org) apuntando a esta URL con el header
// `Authorization: Bearer CRON_SECRET` (o ?token=CRON_SECRET).

const UPCOMING_WINDOW_MIN = 30
const LIVE_WINDOW_MIN = 180
const TERMINAL_STATUSES = new Set(['finished', 'cancelled', 'postponed'])

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // sin secreto configurado, no se restringe (dev)
  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  const queryToken = request.nextUrl.searchParams.get('token')
  return queryToken === secret
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const sb = createReadOnlySupabase()
    const now = Date.now()
    const upcomingTo = new Date(now + UPCOMING_WINDOW_MIN * 60_000).toISOString()
    const liveFrom = new Date(now - LIVE_WINDOW_MIN * 60_000).toISOString()

    const [{ data: windowRows, error: windowErr }, { data: liveRows, error: liveErr }] =
      await Promise.all([
        sb.from('fixtures').select('id, status, start_time').gte('start_time', liveFrom).lte('start_time', upcomingTo),
        sb.from('fixtures').select('id, status, start_time').eq('status', 'live'),
      ])

    if (windowErr || liveErr) {
      throw windowErr || liveErr
    }

    const byId = new Map<string, { id: string; status: string | null }>()
    for (const f of [...(windowRows || []), ...(liveRows || [])]) {
      const status = (f.status || '').toLowerCase()
      if (TERMINAL_STATUSES.has(status)) continue
      byId.set(f.id, f)
    }

    const fixtureIds = [...byId.keys()]

    if (fixtureIds.length === 0) {
      return NextResponse.json({ success: true, synced: 0, message: 'Nada que sincronizar ahora mismo' })
    }

    await dispatchLiveSync({ fixture_ids: fixtureIds.join(',') })

    return NextResponse.json({
      success: true,
      synced: fixtureIds.length,
      fixture_ids: fixtureIds,
    })
  } catch (error: any) {
    console.error('[cron/sync-live] Error:', error)
    return NextResponse.json(
      { error: 'Fallo en la sincronización de respaldo', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
