import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { createServerSupabase } from '@/lib/supabase/server'
import { getLiveInfractions, getCurrentMatchday, canShowInfractionsForMatchday } from '@/lib/infractions'
import { isDivisionId } from '@/lib/divisions'

interface PenaltyCacheEntry {
  timestamp: number
  infractions: any[]
}

const livePenaltiesCache = new Map<string, PenaltyCacheEntry>()
const CACHE_TTL_MS = 60_000 // 60 segundos

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()

  const matchdayParam = request.nextUrl.searchParams.get('matchday')
  const currentMatchday = matchdayParam ? parseInt(matchdayParam, 10) : await getCurrentMatchday(supabase)

  const divisionParam = request.nextUrl.searchParams.get('division')
  const division = divisionParam ? parseInt(divisionParam, 10) : null

  if (!currentMatchday) {
    return NextResponse.json({ infractions: [] })
  }

  const cacheKey = `${currentMatchday}-${division ?? 'all'}`
  const now = Date.now()
  const cached = livePenaltiesCache.get(cacheKey)
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return NextResponse.json(
      { infractions: cached.infractions },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    )
  }

  // Mientras el proceso de cambios (mercado/alineaciones) está abierto para esta jornada,
  // no deben mostrarse sanciones en vivo: las alineaciones aún pueden cambiar.
  // Tampoco se muestran si la jornada tiene un partido descolocado (adelantado
  // o aplazado) sin resolver: hasta que se complete del todo, sin que otra
  // jornada distinta se juegue por medio, sus sanciones no son fiables.
  const canShow = await canShowInfractionsForMatchday(supabase, currentMatchday)
  if (!canShow) {
    return NextResponse.json({ infractions: [] })
  }

  const infractions = await getLiveInfractions(supabase, currentMatchday, division)

  // Verificar si ya hay sanciones oficiales consolidadas en base de datos para esta jornada.
  // Si las hay, no mostramos las infracciones en vivo (que son temporales/duplicadas).
  // La comprobación es por división: cada una se consolida por su cuenta, y que
  // otra ya tenga sus multas no significa que esta las tenga.
  let penaltiesQuery = supabase
    .from('penalties')
    .select('id')
    .eq('matchday', currentMatchday)
    .limit(1)
  if (isDivisionId(division)) penaltiesQuery = penaltiesQuery.eq('division', division)

  const { data: penalties, error: penError } = await penaltiesQuery

  let resultInfractions = infractions
  if (penalties && penalties.length > 0) {
    resultInfractions = []
  }

  livePenaltiesCache.set(cacheKey, {
    timestamp: now,
    infractions: resultInfractions,
  })

  return NextResponse.json(
    { infractions: resultInfractions },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    }
  )
}
