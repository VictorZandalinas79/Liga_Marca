import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getLiveInfractions, getCurrentMatchday } from '@/lib/infractions'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentMatchday = await getCurrentMatchday(supabase)

  if (!currentMatchday) {
    return NextResponse.json({ infractions: [] })
  }

  const infractions = await getLiveInfractions(supabase, currentMatchday)

  // Verificar si ya hay sanciones oficiales consolidadas en base de datos para esta jornada.
  // Si las hay, no mostramos las infracciones en vivo (que son temporales/duplicadas).
  const { data: penalties, error: penError } = await supabase
    .from('penalties')
    .select('id')
    .eq('matchday', currentMatchday)
    .limit(1)

  console.log('[LIVE_API] currentMatchday:', currentMatchday)
  console.log('[LIVE_API] infractions computed:', infractions.length)
  console.log('[LIVE_API] penalties data:', penalties, 'error:', penError)

  if (penalties && penalties.length > 0) {
    console.log('[LIVE_API] Penalties exist, returning empty live infractions')
    return NextResponse.json({ infractions: [] })
  }

  return NextResponse.json({ infractions })
}
