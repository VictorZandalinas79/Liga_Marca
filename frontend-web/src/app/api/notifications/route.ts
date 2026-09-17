import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
import { createServerSupabase } from '@/lib/supabase/server'
import { getLiveInfractions, getCurrentMatchday, canShowInfractionsForMatchday } from '@/lib/infractions'
import { getOutOfOrderMatchNotifications } from '@/lib/matchday-notifications'

// Notificaciones calculadas al vuelo, sin fila en sync_notifications.
// (No se exporta: en un route.ts solo valen los exports que Next reconoce.)
const DERIVED_ID_PREFIXES = ['penalty-', 'live-inf-', 'locked-fx-', 'postponed-fx-']

// Caché en memoria para evitar llamadas masivas a la base de datos y
// recálculos pesados de sanciones en vivo con cada usuario conectado.
interface CachedNotificationsPayload {
  timestamp: number
  allStandard: any[]
  outOfOrderNotifications: any[]
  penaltyNotifications: any[]
}

let cachedPayload: CachedNotificationsPayload | null = null
const CACHE_TTL_MS = 0 // Sin caché en servidor para reflejar cambios al instante

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 1. División y rol de admin del usuario actual
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('division, is_admin')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = myProfile?.is_admin === true

  const now = Date.now()
  if (!cachedPayload || (now - cachedPayload.timestamp) >= CACHE_TTL_MS) {
    // 2. Notificaciones estándar (hasta 500)
    const { data: standardNotifications, error: notifError } = await supabase
      .from('sync_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (notifError) return NextResponse.json({ error: notifError.message }, { status: 500 })

    let visibleStandard = (standardNotifications || [])
      .filter(n => {
        const body = (n.body || '').toLowerCase()
        // Omitir notificaciones antiguas de bloqueos por aplazamiento
        if (body.includes('aplazado a una jornada posterior') || body.includes('quedan bloqueados hasta que se resuelva')) {
          return false
        }
        return true
      })
      .map(n => {
        const body = n.body || ''
        const title = n.title || ''
        if (body.includes('Levante vs Athletic') || body.includes('Levante UD') || (title === 'Cambio de horario' && body.includes('Levante'))) {
          return {
            ...n,
            type: 'match_postponed',
            title: 'Partido suspendido (J6)',
            body: 'Levante UD vs Athletic Club: el partido cambia de día por la suspensión (se jugará el 21 oct, 20:00) y la jornada quedará finalizada cuando se acabe de jugar este partido.'
          }
        }
        return n
      })

    // Fotos de jugadores referenciados
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

    // 3. Jornada en marcha
    const currentMatchday = await getCurrentMatchday(supabase)

    // 4. Avisos de partidos intercalados entre jornadas
    let outOfOrderNotifications: any[] = []
    try {
      outOfOrderNotifications = await getOutOfOrderMatchNotifications(supabase)
    } catch (e) {
      console.error('Error calculando avisos de partidos intercalados:', e)
    }

    // 5. Sanciones consolidadas y en vivo
    let penaltyNotifications: any[] = []
    if (currentMatchday) {
      const { data: actualPenalties } = await supabase
        .from('penalties')
        .select('id, matchday, description, points, user_id, created_at, profiles(full_name, division)')
        .eq('matchday', currentMatchday)

      if (actualPenalties && actualPenalties.length > 0) {
        penaltyNotifications = actualPenalties.map(p => {
          const profileObj = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
          const name = profileObj?.full_name || 'Usuario'
          const div = profileObj?.division ?? null
          return {
            id: `penalty-${p.id}`,
            type: 'players_locked',
            title: `Sanción Aplicada J${p.matchday}: ${name}`,
            body: `${p.description} (Se restaron ${p.points} pts)`,
            created_at: p.created_at || new Date().toISOString(),
            read_at: null,
            division: div
          }
        })
      }

      const consolidatedUserIds = new Set((actualPenalties || []).map(p => p.user_id))
      const canShowLive = await canShowInfractionsForMatchday(supabase, currentMatchday)
      if (canShowLive) {
        const liveInfractions = await getLiveInfractions(supabase, currentMatchday, null)
        const liveNotifications = liveInfractions
          .filter(inf => !consolidatedUserIds.has(inf.user_id))
          .map(inf => ({
            id: `live-inf-${inf.id}`,
            type: 'players_locked',
            title: `Sanción en Juego J${inf.matchday}: ${inf.full_name}`,
            body: `${inf.description} (Puntuarán 0 pts esta jornada)`,
            created_at: new Date().toISOString(),
            read_at: null,
            division: inf.division
          }))
        penaltyNotifications.push(...liveNotifications)
      }
    }

    cachedPayload = {
      timestamp: now,
      allStandard: visibleStandard,
      outOfOrderNotifications,
      penaltyNotifications,
    }
  }

  // Filtrado según permisos del usuario (los 'unmatched' solo para administradores)
  let userStandard = cachedPayload.allStandard
  if (!isAdmin) {
    userStandard = userStandard.filter(n => n.type !== 'unmatched')
  }

  const combined = [...cachedPayload.penaltyNotifications, ...cachedPayload.outOfOrderNotifications, ...userStandard]

  return NextResponse.json(
    { notifications: combined },
    {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    }
  )
}

export async function PATCH(request: NextRequest) {
  // Invalidar caché en memoria al marcar notificaciones como leídas
  cachedPayload = null
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { id, ids } = body
  const now = new Date().toISOString()

  // Las notificaciones derivadas (sanciones en vivo, bloqueos por partido
  // intercalado) no existen como fila: el cliente las marca en localStorage.
  if (id && DERIVED_ID_PREFIXES.some(p => String(id).startsWith(p))) {
    return NextResponse.json({ success: true })
  }

  const query = supabase.from('sync_notifications').update({ read_at: now }).is('read_at', null)
  
  let error;
  if (id) {
    ({ error } = await query.eq('id', id));
  } else if (ids && Array.isArray(ids) && ids.length > 0) {
    ({ error } = await query.in('id', ids));
  } else {
    ({ error } = await query);
  }

  if (error) {
    // Hay despliegues donde sync_notifications no tiene columna read_at: el
    // estado de leído vive solo en el cliente, así que no es un fallo real.
    if (error.code === '42703') return NextResponse.json({ success: true, persisted: false })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
