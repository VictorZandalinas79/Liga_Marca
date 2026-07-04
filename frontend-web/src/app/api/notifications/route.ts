import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { createServerSupabase } from '@/lib/supabase/server'
import { getLiveInfractions, getCurrentMatchday, isMatchdayLockStarted } from '@/lib/infractions'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 1. Obtener notificaciones estándar
  const { data: standardNotifications, error: notifError } = await supabase
    .from('sync_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (notifError) return NextResponse.json({ error: notifError.message }, { status: 500 })

  // 2. Obtener la jornada en marcha para mostrar sus multas
  const currentMatchday = await getCurrentMatchday(supabase)

  let penaltyNotifications: any[] = []
  if (currentMatchday) {
    // A. Sanciones consolidadas en base de datos
    const { data: penalties } = await supabase
      .from('penalties')
      .select('id, matchday, description, points, user_id, created_at, profiles(full_name)')
      .eq('matchday', currentMatchday)

    if (penalties) {
      penaltyNotifications = penalties.map(p => {
        const profileObj = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
        const name = profileObj?.full_name || 'Usuario'
        return {
          id: `penalty-${p.id}`,
          type: 'players_locked',
          title: `Sanción Aplicada J${p.matchday}: ${name}`,
          body: `${p.description} (Se restaron ${p.points} pts)`,
          created_at: p.created_at || new Date().toISOString(),
          read_at: null
        }
      })
    }

    // B. Sanciones/Infracciones en vivo (dinámicas y pendientes de la jornada activa)
    // Si ya hay sanciones oficiales en la BD para esta jornada (mercado cerrado),
    // no mostramos las advertencias dinámicas duplicadas.
    let liveNotifications: any[] = []
    if (!penalties || penalties.length === 0) {
      // SOLO mostrar sanciones en vivo si ya estamos a <= 1 hora del primer partido
      const isLocked = await isMatchdayLockStarted(supabase, currentMatchday)
      if (isLocked) {
        const liveInfractions = await getLiveInfractions(supabase, currentMatchday)
        liveNotifications = liveInfractions.map(inf => ({
          id: `live-inf-${inf.id}`,
          type: 'players_locked',
          title: `Sanción en Juego J${inf.matchday}: ${inf.full_name}`,
          body: `${inf.description} (Puntuarán 0 pts esta jornada)`,
          created_at: new Date().toISOString(),
          read_at: null
        }))
      }
    }

    penaltyNotifications.push(...liveNotifications)
  }

  // Combinar ambas listas
  const combined = [...penaltyNotifications, ...(standardNotifications || [])]

  return NextResponse.json({ notifications: combined })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { id } = body
  const now = new Date().toISOString()

  if (id) {
    const { error } = await supabase
      .from('sync_notifications')
      .update({ read_at: now })
      .eq('id', id)
      .is('read_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('sync_notifications')
      .update({ read_at: now })
      .is('read_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
