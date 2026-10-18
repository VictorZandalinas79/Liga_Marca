import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { createSharedReadSupabase, getRequestAuth } from '@/lib/supabase/shared-read'
import { canShowInfractionsFrom, currentMatchdayFrom } from '@/lib/infractions'
import { getDataVersion, getServerCalendar } from '@/lib/data-version'
import { getCachedLiveInfractions, liveInfractionsForDivision } from '@/lib/live-infractions-cache'

// Sanciones en vivo por (jornada, división).
//
// El cálculo (team_players, players, player_scores y fixtures enteros, ~1,5 MB
// de egress de Supabase) se hace una vez por jornada para todas las divisiones
// y se reutiliza hasta que cambian los datos (ver live-infractions-cache.ts).
// No depende del usuario: se calcula con el token de quien pida primero.
export async function GET(request: NextRequest) {
  const auth = await getRequestAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createSharedReadSupabase(auth.accessToken)

  const version = await getDataVersion(supabase)
  const calendar = await getServerCalendar(supabase, version)

  const matchdayParam = request.nextUrl.searchParams.get('matchday')
  const currentMatchday = matchdayParam
    ? parseInt(matchdayParam, 10)
    : currentMatchdayFrom(calendar.fixtures, calendar.config)

  const divisionParam = request.nextUrl.searchParams.get('division')
  const division = divisionParam ? parseInt(divisionParam, 10) : null

  if (!currentMatchday) {
    return NextResponse.json({ infractions: [] })
  }

  // Mientras el proceso de cambios (mercado/alineaciones) está abierto para esta jornada,
  // no deben mostrarse sanciones en vivo: las alineaciones aún pueden cambiar.
  // Tampoco se muestran si la jornada tiene un partido descolocado (adelantado
  // o aplazado) sin resolver: hasta que se complete del todo, sin que otra
  // jornada distinta se juegue por medio, sus sanciones no son fiables.
  // Depende de la hora, así que se evalúa en cada petición (sobre el calendario
  // cacheado) y no dentro de la caché del cálculo.
  if (!canShowInfractionsFrom(calendar.fixtures, calendar.config, currentMatchday)) {
    return NextResponse.json(
      { infractions: [] },
      { headers: { 'Cache-Control': 'private, max-age=30' } }
    )
  }

  const all = await getCachedLiveInfractions(supabase, currentMatchday, version)
  const infractions = liveInfractionsForDivision(all, division)

  return NextResponse.json(
    { infractions },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  )
}
