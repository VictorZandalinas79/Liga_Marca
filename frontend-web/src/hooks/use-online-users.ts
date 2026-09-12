import { useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'

export type OnlineUser = { id: string; full_name: string }

// Usuarios en línea, compartido por todas las instancias del hook.
//
// El layout monta OnlineUsersMenu dos veces (móvil y escritorio, una oculta por
// CSS pero montada), y cada una bajaba user_sessions ENTERA cada 15 s para
// filtrar en el navegador: 1.000 filas (tope de PostgREST, la tabla tiene más
// de 8.000), 102 KB por consulta, ~70 MB/hora por pestaña abierta (medido el
// 13/09/2026). Era lo que más egress de Supabase gastaba. Ahora el filtro va en
// la consulta (unos cientos de bytes) y hay un único sondeo por pestaña.

const POLL_MS = 60 * 1000
// El layout actualiza last_activity_at cada 30 s
const ACTIVE_WINDOW_MS = 5 * 60 * 1000

const EMPTY: OnlineUser[] = []
let current: OnlineUser[] = EMPTY
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

async function poll() {
  try {
    const supabase = createClient()
    const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString()
    const { data: sessions, error: sessionsError } = await supabase
      .from('user_sessions')
      .select('user_id')
      .gte('last_activity_at', since)

    if (sessionsError) return

    const userIds = [...new Set((sessions || []).map(s => s.user_id))]
    let users: OnlineUser[] = EMPTY
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)
      if (profilesError) return
      users = profiles || EMPTY
    }
    current = users
  } catch (err) {
    console.error('[USUARIOS EN LÍNEA] Error:', err)
    current = EMPTY
  }
  listeners.forEach(listener => listener())
}

// El sondeo arranca con el primer suscriptor y se para con el último
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    poll()
    timer = setInterval(poll, POLL_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

const getSnapshot = () => current
const getServerSnapshot = () => EMPTY

export function useOnlineUsers(): OnlineUser[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
