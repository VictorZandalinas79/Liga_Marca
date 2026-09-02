import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { createServerSupabase } from '@/lib/supabase/server'
import { getLiveInfractions, getCurrentMatchday, isMatchdayLockStarted } from '@/lib/infractions'
import { isDivisionId } from '@/lib/divisions'

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  // if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const matchdayParam = request.nextUrl.searchParams.get('matchday')
  const currentMatchday = matchdayParam ? parseInt(matchdayParam, 10) : await getCurrentMatchday(supabase)

  const divisionParam = request.nextUrl.searchParams.get('division')
  const division = divisionParam ? parseInt(divisionParam, 10) : null

  if (!currentMatchday) {
    return NextResponse.json({ infractions: [] })
  }

  // Mientras el proceso de cambios (mercado/alineaciones) está abierto para esta jornada,
  // no deben mostrarse sanciones en vivo: las alineaciones aún pueden cambiar.
  const isLocked = await isMatchdayLockStarted(supabase, currentMatchday)
  if (!isLocked) {
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

  console.log('[LIVE_API] currentMatchday:', currentMatchday, 'division:', division)
  console.log('[LIVE_API] infractions computed:', infractions.length)
  console.log('[LIVE_API] penalties data:', penalties, 'error:', penError)

  if (penalties && penalties.length > 0) {
    console.log('[LIVE_API] Penalties exist, returning empty live infractions')
    return NextResponse.json({ infractions: [] })
  }

  return NextResponse.json({ infractions })
}
