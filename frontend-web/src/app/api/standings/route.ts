import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
export const dynamic = 'force-dynamic'
import { createSharedReadSupabase, getRequestAuth } from '@/lib/supabase/shared-read'
import { getStandings, invalidateStandingsCache, type StandingsResult } from '@/lib/standings'
import { isDivisionId } from '@/lib/divisions'
import { getDataVersion, timeBucket } from '@/lib/data-version'

// Clasificación calculada en el servidor y compartida por todos los usuarios.
//
// Cada cálculo descarga team_players y player_scores enteros (~1,8 MB de egress
// de Supabase). Se hace UNA vez para todas las divisiones y se guarda en la Data
// Cache de Vercel (compartida entre instancias) con la versión de datos en la
// clave (src/lib/data-version.ts): se recalcula cuando cambia una alineación,
// una puntuación, una sanción..., no cada minuto como antes.
//
// Además lleva un tramo de 15 min, porque una parte depende de la hora y no de
// los datos versionados: el conteo de sesiones (user_sessions no sube la
// versión) y el premio kamikaze, que mira si el mercado de cada jornada ya ha
// cerrado.
const TIME_BUCKET_MS = 15 * 60 * 1000

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
  // Tras guardar una alineación el cliente pide un cálculo al momento.
  const fresh = params.get('fresh') === '1'

  const supabase = createSharedReadSupabase(auth.accessToken)

  let result: StandingsResult
  if (fresh) {
    // Sin la copia en memoria de lib/standings (45 s), que aún no tendría la
    // alineación recién guardada.
    invalidateStandingsCache()
    result = await getStandings(supabase, division, activeMatchday)
  } else {
    const version = await getDataVersion(supabase)
    const computeAll = () => {
      // Si la versión ha cambiado, la copia en memoria de lib/standings es de
      // antes del cambio: no debe acabar guardada con la versión nueva.
      invalidateStandingsCache()
      return getStandings(supabase, null, activeMatchday)
    }
    const all = await unstable_cache(
      async () => {
        const r = await computeAll()
        // Un cálculo incompleto (fallo de paginación) no debe quedarse en la
        // caché: se lanza para que unstable_cache no lo guarde.
        if (r.incomplete) throw new Error('standings incomplete')
        return r
      },
      ['standings-all', String(activeMatchday), version, timeBucket(TIME_BUCKET_MS)],
      { revalidate: 3600, tags: ['standings'] }
    )().catch(() => computeAll())
    result = forDivision(all, division)
  }

  const { standings, lastPlayedMatchday, incomplete } = result
  return NextResponse.json(
    { standings, lastPlayedMatchday, incomplete },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
