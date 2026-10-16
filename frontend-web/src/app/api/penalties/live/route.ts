import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSharedReadSupabase, getRequestAuth } from '@/lib/supabase/shared-read'
import { getLiveInfractions, getCurrentMatchday, canShowInfractionsForMatchday } from '@/lib/infractions'
import { isDivisionId } from '@/lib/divisions'

// Sanciones en vivo por (jornada, división).
//
// Cada cálculo descarga team_players, players y fixtures (~200 KB de egress de
// Supabase). La caché en memoria anterior vivía en cada instancia de Vercel y se
// perdía con cada arranque en frío; la Data Cache se comparte entre instancias.
// El resultado no depende del usuario: se calcula con el token de quien pida
// primero y lo reutilizan todos.
const REVALIDATE_S = 60

async function computeLiveInfractions(supabase: SupabaseClient, matchday: number, division: number | null): Promise<any[]> {
  // Mientras el proceso de cambios (mercado/alineaciones) está abierto para esta jornada,
  // no deben mostrarse sanciones en vivo: las alineaciones aún pueden cambiar.
  // Tampoco se muestran si la jornada tiene un partido descolocado (adelantado
  // o aplazado) sin resolver: hasta que se complete del todo, sin que otra
  // jornada distinta se juegue por medio, sus sanciones no son fiables.
  const canShow = await canShowInfractionsForMatchday(supabase, matchday)
  if (!canShow) return []

  const infractions = await getLiveInfractions(supabase, matchday, division)

  // Verificar si ya hay sanciones oficiales consolidadas en base de datos para esta jornada.
  // Si las hay, no mostramos las infracciones en vivo (que son temporales/duplicadas).
  // La comprobación es por división: cada una se consolida por su cuenta, y que
  // otra ya tenga sus multas no significa que esta las tenga.
  let penaltiesQuery = supabase
    .from('penalties')
    .select('id')
    .eq('matchday', matchday)
    .limit(1)
  if (isDivisionId(division)) penaltiesQuery = penaltiesQuery.eq('division', division)

  const { data: penalties } = await penaltiesQuery
  return penalties && penalties.length > 0 ? [] : infractions
}

export async function GET(request: NextRequest) {
  const auth = await getRequestAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createSharedReadSupabase(auth.accessToken)

  const matchdayParam = request.nextUrl.searchParams.get('matchday')
  const currentMatchday = matchdayParam
    ? parseInt(matchdayParam, 10)
    : await getCurrentMatchday(supabase)

  const divisionParam = request.nextUrl.searchParams.get('division')
  const division = divisionParam ? parseInt(divisionParam, 10) : null

  if (!currentMatchday) {
    return NextResponse.json({ infractions: [] })
  }

  const infractions = await unstable_cache(
    () => computeLiveInfractions(supabase, currentMatchday, division),
    ['penalties-live', String(currentMatchday), String(division)],
    { revalidate: REVALIDATE_S, tags: ['penalties-live'] }
  )()

  return NextResponse.json(
    { infractions },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  )
}
