import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Bloqueo de jugadores por partidos jugados FUERA DE ORDEN de jornada.
 *
 * El mercado normal (useMatchdayLock) bloquea a TODOS durante el tramo en vivo
 * de la jornada activa. Pero hay un caso aparte: un partido cuya jornada lógica
 * (matchday) no coincide con su posición CRONOLÓGICA real (start_time). Cuando
 * eso pasa, los jugadores de los dos equipos de ese partido quedan congelados
 * para que nadie pueda cambiarlos aprovechando el desfase.
 *
 * Dos casos (los números son ejemplos):
 *  - APLAZADO (delayed): un partido de la J12 se juega DESPUÉS de la J13 y J14.
 *    Sus dos equipos quedan bloqueados desde que cierra el resto de la J12 hasta
 *    que ese partido termina (luego se abre la veda de la J15 con normalidad).
 *  - ADELANTADO (advanced): un partido de la J15 se juega ANTES que la J13 y J14.
 *    Sus dos equipos quedan bloqueados durante la J13, J14 y J15 (desde que se
 *    juega el partido adelantado hasta que cierra la ventana de la J15).
 *
 * Todo se deriva en cliente de la tabla `fixtures`, igual que useMatchdayLock,
 * así el bloqueo aparece y desaparece solo según las fechas, sin tabla extra.
 */

const ONE_HOUR = 60 * 60 * 1000
const TWO_HOURS = 2 * ONE_HOUR
const TERMINAL_STATUSES = new Set(['finished', 'cancelled', 'postponed'])

export interface FixtureLite {
  id: string
  matchday: number | null
  start_time: string
  status: string | null
  home_team_id: string | null
  away_team_id: string | null
}

export interface LockedTeam {
  teamId: string
  type: 'delayed' | 'advanced'
  /** Jornada a la que pertenece el partido (su matchday lógico). */
  ownMatchday: number
  /** Jornada en cuyo hueco cronológico cae realmente el partido. */
  playedSlot: number
  /** Hasta cuándo dura el bloqueo. */
  until: Date
  fixtureId: string
}

/**
 * Calcula qué equipos están bloqueados AHORA por tener un partido fuera de orden.
 * Función pura: recibe los fixtures y la hora actual.
 */
export function computeLockedTeams(fixtures: FixtureLite[], now: Date = new Date()): LockedTeam[] {
  const numeric = fixtures.filter(
    f => f.matchday && f.matchday > 0 && f.start_time && f.home_team_id && f.away_team_id
  )
  if (numeric.length === 0) return []

  // Agrupar fixtures por jornada numérica
  const byMatchday = new Map<number, FixtureLite[]>()
  for (const f of numeric) {
    const md = f.matchday as number
    if (!byMatchday.has(md)) byMatchday.set(md, [])
    byMatchday.get(md)!.push(f)
  }

  // Tiempo representativo de cada jornada = mediana de sus start_time.
  // La mediana es robusta: un único partido aplazado/adelantado (outlier) no
  // mueve el "centro de masa" de la jornada.
  const repTime = new Map<number, number>()
  for (const [md, fs] of byMatchday) {
    const times = fs.map(f => new Date(f.start_time).getTime()).sort((a, b) => a - b)
    repTime.set(md, times[Math.floor(times.length / 2)])
  }

  // Orden cronológico de las jornadas según su tiempo representativo.
  const chronoOrder = [...byMatchday.keys()].sort((a, b) => repTime.get(a)! - repTime.get(b)!)

  // Dado un instante t, ¿en el hueco cronológico de qué jornada cae?
  // Las fronteras entre jornadas son los puntos medios entre tiempos representativos.
  const slotFor = (t: number): number => {
    for (let i = 0; i < chronoOrder.length; i++) {
      const cur = chronoOrder[i]
      const next = chronoOrder[i + 1]
      if (next === undefined) return cur
      const boundary = (repTime.get(cur)! + repTime.get(next)!) / 2
      if (t <= boundary) return cur
    }
    return chronoOrder[chronoOrder.length - 1]
  }

  const locked: LockedTeam[] = []
  const nowMs = now.getTime()

  for (const f of numeric) {
    const ownMatchday = f.matchday as number
    const t = new Date(f.start_time).getTime()
    const playedSlot = slotFor(t)
    if (playedSlot === ownMatchday) continue // en orden, nada que bloquear

    // Cierre de la jornada propia: último partido EN ORDEN de esa jornada + 2h.
    // (Excluimos este fixture, que es justo el outlier.)
    const siblings = byMatchday.get(ownMatchday)!.filter(x => x.id !== f.id)
    const ownCloseBase = siblings.length > 0
      ? Math.max(...siblings.map(x => new Date(x.start_time).getTime()))
      : repTime.get(ownMatchday)!
    const ownClose = ownCloseBase + TWO_HOURS

    const fEnd = t + TWO_HOURS
    const finished = TERMINAL_STATUSES.has((f.status || '').toLowerCase()) || nowMs > fEnd

    let active = false
    let until = 0
    let type: 'delayed' | 'advanced'

    if (ownMatchday < playedSlot) {
      // APLAZADO: pertenece a una jornada anterior pero se juega más tarde.
      // Bloqueado desde que cierra su jornada hasta que el partido termina.
      type = 'delayed'
      active = nowMs >= ownClose && !finished
      until = fEnd
    } else {
      // ADELANTADO: pertenece a una jornada posterior pero se juega antes.
      // Bloqueado desde 1h antes de jugarse hasta que cierra su jornada lógica.
      type = 'advanced'
      active = nowMs >= t - ONE_HOUR && nowMs <= ownClose
      until = ownClose
    }

    if (!active) continue
    for (const teamId of [f.home_team_id, f.away_team_id]) {
      if (teamId) {
        locked.push({ teamId, type, ownMatchday, playedSlot, until: new Date(until), fixtureId: f.id })
      }
    }
  }

  return locked
}

/** Hook: equipos bloqueados ahora mismo, refrescado cada minuto. */
export function useLockedTeams(): LockedTeam[] {
  const [locked, setLocked] = useState<LockedTeam[]>([])

  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('fixtures')
        .select('id,matchday,start_time,status,home_team_id,away_team_id')
      setLocked(computeLockedTeams((data || []) as FixtureLite[]))
    }
    run()
    const interval = setInterval(run, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return locked
}
