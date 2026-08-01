import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { createServerSupabase } from '@/lib/supabase/server'
import { getLiveInfractions, getCurrentMatchday, isMatchdayLockStarted } from '@/lib/infractions'
import { getOutOfOrderMatchNotifications } from '@/lib/matchday-notifications'

// Notificaciones calculadas al vuelo, sin fila en sync_notifications.
// (No se exporta: en un route.ts solo valen los exports que Next reconoce.)
const DERIVED_ID_PREFIXES = ['penalty-', 'live-inf-', 'locked-fx-']

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 1. División del usuario actual: solo se le notifican las sanciones de su
  // propia división (las sanciones son independientes por división).
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('division, is_admin')
    .eq('id', user.id)
    .maybeSingle()
  const myDivision = (myProfile?.division as number | null) ?? null
  const isAdmin = myProfile?.is_admin === true

  // 2. Notificaciones estándar. Los errores de sincronización ('unmatched') son
  // ruido para el jugador de a pie y tienen su propio panel en Admin: se
  // descartan en la propia consulta.
  //
  // El límite era 50 y se quedaba corto: la tabla solo guarda las novedades de
  // la última sincronización (los scripts la vacían al empezar), pero una
  // pasada normal emite entre 60 y 150 avisos y el corte los truncaba a ciegas.
  // Como todas las filas de un lote comparten created_at, el recorte era
  // arbitrario: fichajes y resumen desaparecían bajo la tanda de altas.
  let standardQuery = supabase
    .from('sync_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (!isAdmin) standardQuery = standardQuery.neq('type', 'unmatched')

  const { data: standardNotifications, error: notifError } = await standardQuery
  console.log(`[API NOTIFICATIONS] Query error:`, notifError)
  if (notifError) return NextResponse.json({ error: notifError.message }, { status: 500 })

  let visibleStandard = standardNotifications || []

  // Fetch player photos for notifications that reference a player
  const playerIds = visibleStandard.map(n => n.player_id).filter(Boolean)
  if (playerIds.length > 0) {
    const { data: playersInfo } = await supabase
      .from('players')
      .select('id, photo')
      .in('id', playerIds)
    
    if (playersInfo) {
      const photosMap = Object.fromEntries(playersInfo.map(p => [p.id, p.photo]))
      visibleStandard = visibleStandard.map(n => ({
        ...n,
        player_photo: n.player_id ? photosMap[n.player_id] : null
      }))
    }
  }

  // 3. Obtener la jornada en marcha para mostrar sus multas
  const currentMatchday = await getCurrentMatchday(supabase)

  // 4. Avisos de partidos intercalados entre jornadas (aplazados/adelantados):
  // se derivan de fixtures, no están en la tabla de notificaciones.
  let outOfOrderNotifications: any[] = []
  try {
    outOfOrderNotifications = await getOutOfOrderMatchNotifications(supabase)
  } catch (e) {
    console.error('Error calculando avisos de partidos intercalados:', e)
  }

  // Conjunto de usuarios de mi división (para filtrar las sanciones ya
  // consolidadas en BD, que no llevan columna de división).
  let divisionUserIds: Set<string> | null = null
  if (myDivision != null) {
    const { data: divProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('division', myDivision)
    divisionUserIds = new Set((divProfiles ?? []).map(p => p.id as string))
  }

  let penaltyNotifications: any[] = []
  if (currentMatchday) {
    // A. Sanciones consolidadas en base de datos
    const { data: penaltiesRaw } = await supabase
      .from('penalties')
      .select('id, matchday, description, points, user_id, created_at, profiles(full_name)')
      .eq('matchday', currentMatchday)
    const penalties = divisionUserIds
      ? (penaltiesRaw ?? []).filter(p => divisionUserIds!.has(p.user_id as string))
      : penaltiesRaw

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
        const liveInfractions = await getLiveInfractions(supabase, currentMatchday, myDivision)
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

  // Combinar todas las listas
  const combined = [...penaltyNotifications, ...outOfOrderNotifications, ...visibleStandard]

  console.log(`[API NOTIFICATIONS] Returning ${combined.length} total notifications (standard: ${visibleStandard.length}, penalties: ${penaltyNotifications.length}, outOfOrder: ${outOfOrderNotifications.length})`)

  return NextResponse.json({ notifications: combined })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { id } = body
  const now = new Date().toISOString()

  // Las notificaciones derivadas (sanciones en vivo, bloqueos por partido
  // intercalado) no existen como fila: el cliente las marca en localStorage.
  if (id && DERIVED_ID_PREFIXES.some(p => String(id).startsWith(p))) {
    return NextResponse.json({ success: true })
  }

  const query = supabase.from('sync_notifications').update({ read_at: now }).is('read_at', null)
  const { error } = id ? await query.eq('id', id) : await query

  if (error) {
    // Hay despliegues donde sync_notifications no tiene columna read_at: el
    // estado de leído vive solo en el cliente, así que no es un fallo real.
    if (error.code === '42703') return NextResponse.json({ success: true, persisted: false })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
