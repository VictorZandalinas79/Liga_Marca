import { NextRequest, NextResponse } from 'next/server'
import { unnestedCache } from '@/lib/unnested-cache'
export const dynamic = 'force-dynamic'
import { createSharedReadSupabase, getRequestAuth } from '@/lib/supabase/shared-read'
import { getStandings, invalidateStandingsCache, type StandingsResult } from '@/lib/standings'
import { isDivisionId } from '@/lib/divisions'
import { getDataVersion, getServerCalendar, timeBucket, type ServerCalendar } from '@/lib/data-version'

// Clasificación calculada en el servidor y compartida por todos los usuarios.
//
// Cada cálculo descarga team_players y player_scores enteros (~1,8 MB de egress
// de Supabase). Se hace UNA vez para todas las divisiones y se guarda en la Data
// Cache de Vercel (compartida entre instancias) con la versión de datos en la
// clave (src/lib/data-version.ts): se recalcula cuando cambia una alineación,
// una puntuación, una sanción..., no cada minuto como antes.
//
// Además depende de la hora en dos cosas que no suben la versión:
// - el premio kamikaze mira si el mercado de cada jornada ya ha cerrado: la
//   clave lleva cuántos partidos han pasado ya su hora de cierre, que cambia
//   justo cuando cierra un mercado (calendario cacheado, sin consultas extra);
// - el conteo de sesiones (user_sessions no sube la versión): tramo de 1 h.
//   Antes era de 15 min y por sí solo forzaba ~100 recálculos al día.
const TIME_BUCKET_MS = 60 * 60 * 1000

/** Partidos cuya hora de cierre de mercado ya ha pasado. */
function closedMarketsKey(calendar: ServerCalendar): string {
  const hoursBefore = Number(calendar.config?.matchday_start_hours_before ?? 1)
  const cutoff = Date.now() + hoursBefore * 60 * 60 * 1000
  let closed = 0
  for (const f of calendar.fixtures) {
    if ((f.matchday ?? 0) > 0 && f.start_time && new Date(f.start_time).getTime() <= cutoff) closed++
  }
  return `c${closed}`
}

function parseNullableInt(value: string | null): number | null {
  if (value == null || value === '' || value === 'null') return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * La clasificación de una división sacada del cálculo conjunto. getStandings
 * calcula cada división por separado y después las mezcla con una ordenación
 * estable por puntos, así que filtrar y renumerar da lo mismo que pedirla sola.
 */
function forDivision(all: StandingsResult, division: number | null): StandingsResult {
  if (!isDivisionId(division)) return all
  const standings = all.standings
    .filter(s => s.division === division)
    .map((s, index) => ({ ...s, current_position: index + 1 }))
  return { ...all, standings }
}

export async function GET(request: NextRequest) {
  const auth = await getRequestAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = request.nextUrl.searchParams
  const division = parseNullableInt(params.get('division'))
  const activeMatchday = parseNullableInt(params.get('activeMatchday'))
  // Tras guardar una alineación el cliente pide un cálculo al momento: basta con
  // leer la versión sin la copia de 10 s, que ya habrá subido con el guardado.
  // Así ese cálculo queda en la caché y lo aprovechan los demás usuarios (antes
  // se calculaba fuera de la caché y la siguiente petición lo repetía).
  const fresh = params.get('fresh') === '1'

  const supabase = createSharedReadSupabase(auth.accessToken)

  const version = await getDataVersion(supabase, { skipMemo: fresh })
  const calendar = await getServerCalendar(supabase, version)
  const computeAll = () => {
    // Si la versión ha cambiado, la copia en memoria de lib/standings es de
    // antes del cambio: no debe acabar guardada con la versión nueva.
    invalidateStandingsCache()
    return getStandings(supabase, null, activeMatchday)
  }
  // Sin anidar: dentro de un unstable_cache la caché por jornadas de
  // getStandings no se consultaría (lib/unnested-cache.ts).
  const all = await unnestedCache(
    async () => {
      const r = await computeAll()
      // Un cálculo incompleto (fallo de paginación) no debe quedarse en la
      // caché: se lanza para que no se guarde.
      if (r.incomplete) throw new Error('standings incomplete')
      return r
    },
    ['standings-all', String(activeMatchday), version, closedMarketsKey(calendar), timeBucket(TIME_BUCKET_MS)],
    { revalidate: 3600, tags: ['standings'] }
  ).catch(() => computeAll())
  const result = forDivision(all, division)

  const { standings, lastPlayedMatchday, incomplete } = result
  return NextResponse.json(
    { standings, lastPlayedMatchday, incomplete },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
