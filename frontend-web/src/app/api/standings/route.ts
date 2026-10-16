import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
export const dynamic = 'force-dynamic'
import { createSharedReadSupabase, getRequestAuth } from '@/lib/supabase/shared-read'
import { getStandings } from '@/lib/standings'

// Clasificación calculada en el servidor y compartida por todos los usuarios.
//
// Antes cada pestaña ejecutaba getStandings en el navegador: ~280 KB de egress
// de Supabase por carga (team_players y player_scores enteros), repetido cada
// minuto en /clasificacion durante la jornada y en cada visita al dashboard.
// Como el resultado es el mismo para todos, se calcula aquí y se guarda en la
// Data Cache de Vercel (compartida entre instancias): Supabase sirve como mucho
// un cálculo por minuto y combinación (división, jornada activa).
const REVALIDATE_S = 60

function parseNullableInt(value: string | null): number | null {
  if (value == null || value === '' || value === 'null') return null
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
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
  const compute = () => getStandings(supabase, division, activeMatchday)

  const result = fresh
    ? await compute()
    : await unstable_cache(
        async () => {
          const r = await compute()
          // Un cálculo incompleto (fallo de paginación) no debe quedarse en la
          // caché: se lanza para que unstable_cache no lo guarde.
          if (r.incomplete) throw new Error('standings incomplete')
          return r
        },
        ['standings', String(division), String(activeMatchday)],
        { revalidate: REVALIDATE_S, tags: ['standings'] }
      )().catch(() => compute())

  const { standings, lastPlayedMatchday, incomplete } = result
  return NextResponse.json(
    { standings, lastPlayedMatchday, incomplete },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
