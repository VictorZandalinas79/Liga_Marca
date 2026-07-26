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
 * Todo se deriva de la tabla `fixtures`, igual que useMatchdayLock, así el
 * bloqueo aparece y desaparece solo según las fechas, sin tabla extra.
 *
 * Este módulo es PURO (sin React ni cliente de Supabase) para poder usarlo
 * también desde el servidor (p.ej. la API de notificaciones).
 */

const ONE_HOUR = 60 * 60 * 1000
/** El partido ya no se va a jugar tal cual: deja de bloquear en cualquier caso. */
const VOID_STATUSES = new Set(['cancelled', 'postponed'])

/** Offsets configurables desde Admin → Reglas del Juego (league_config). */
export interface LockOffsets {
  /** Horas antes del primer partido en las que se cierra el mercado. */
  startHoursBefore: number
  /** Horas después del último partido en las que se considera cerrada la jornada. */
  endHoursAfter: number
}

export const DEFAULT_LOCK_OFFSETS: LockOffsets = { startHoursBefore: 1, endHoursAfter: 2 }

export interface FixtureLite {
  id: string
  matchday: number | null
  start_time: string
  status: string | null
  home_team_id: string | null
  away_team_id: string | null
}

/** Ventana de bloqueo de un partido fuera de orden, independiente de "ahora". */
export interface OutOfOrderLock {
  fixtureId: string
  type: 'delayed' | 'advanced'
  /** Jornada a la que pertenece el partido (su matchday lógico). */
  ownMatchday: number
  /** Jornada en cuyo hueco cronológico cae realmente el partido. */
  playedSlot: number
  /** Cuándo empieza el bloqueo. */
  from: Date
  /** Hasta cuándo dura el bloqueo. */
  until: Date
  /** Hora de inicio del partido descolocado. */
  kickoff: Date
  teamIds: string[]
}

export interface LockedTeam {
  teamId: string
  type: 'delayed' | 'advanced'
  ownMatchday: number
  playedSlot: number
  until: Date
  fixtureId: string
}

/**
 * Calcula las ventanas de bloqueo de todos los partidos que caen fuera del
 * hueco cronológico de su jornada. No depende de la hora actual: devuelve el
 * intervalo [from, until] de cada bloqueo para que quien llame decida si está
 * activo ahora o si es un aviso anticipado.
 */
export function computeOutOfOrderLocks(
  fixtures: FixtureLite[],
  offsets: LockOffsets = DEFAULT_LOCK_OFFSETS
): OutOfOrderLock[] {
  const startOffsetMs = offsets.startHoursBefore * ONE_HOUR
  const endOffsetMs = offsets.endHoursAfter * ONE_HOUR

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

  const locks: OutOfOrderLock[] = []

  for (const f of numeric) {
    const ownMatchday = f.matchday as number
    const t = new Date(f.start_time).getTime()
    const playedSlot = slotFor(t)
    if (playedSlot === ownMatchday) continue // en orden, nada que bloquear

    // Un partido cancelado o sin fecha ya no descoloca nada: no bloquea a nadie.
    const status = (f.status || '').toLowerCase()
    if (VOID_STATUSES.has(status)) continue

    // Cierre de la jornada propia: último partido EN ORDEN de esa jornada + endOffset.
    // (Excluimos este fixture, que es justo el outlier.)
    const siblings = byMatchday.get(ownMatchday)!.filter(x => x.id !== f.id)
    const ownCloseBase = siblings.length > 0
      ? Math.max(...siblings.map(x => new Date(x.start_time).getTime()))
      : repTime.get(ownMatchday)!
    const ownClose = ownCloseBase + endOffsetMs

    const fEnd = t + endOffsetMs
    const teamIds = [f.home_team_id, f.away_team_id].filter(Boolean) as string[]

    if (ownMatchday < playedSlot) {
      // APLAZADO: pertenece a una jornada anterior pero se juega más tarde.
      // Bloqueado desde que cierra su jornada hasta que el partido termina.
      // Si ya consta como jugado, se levanta el bloqueo sin esperar a fEnd.
      if (status === 'finished') continue
      locks.push({
        fixtureId: f.id,
        type: 'delayed',
        ownMatchday,
        playedSlot,
        from: new Date(ownClose),
        until: new Date(fEnd),
        kickoff: new Date(t),
        teamIds,
      })
    } else {
      // ADELANTADO: pertenece a una jornada posterior pero se juega antes.
      // Bloqueado desde que cierra el mercado de su partido hasta que cierra
      // su jornada lógica.
      locks.push({
        fixtureId: f.id,
        type: 'advanced',
        ownMatchday,
        playedSlot,
        from: new Date(t - startOffsetMs),
        until: new Date(ownClose),
        kickoff: new Date(t),
        teamIds,
      })
    }
  }

  return locks
}

/** ¿Está activo este bloqueo en el instante dado? */
export function isLockActive(lock: OutOfOrderLock, now: Date = new Date()): boolean {
  const t = now.getTime()
  return t >= lock.from.getTime() && t <= lock.until.getTime()
}

/**
 * Calcula qué equipos están bloqueados AHORA por tener un partido fuera de orden.
 * Función pura: recibe los fixtures y la hora actual.
 */
export function computeLockedTeams(
  fixtures: FixtureLite[],
  now: Date = new Date(),
  offsets: LockOffsets = DEFAULT_LOCK_OFFSETS
): LockedTeam[] {
  const locked: LockedTeam[] = []
  for (const lock of computeOutOfOrderLocks(fixtures, offsets)) {
    if (!isLockActive(lock, now)) continue
    for (const teamId of lock.teamIds) {
      locked.push({
        teamId,
        type: lock.type,
        ownMatchday: lock.ownMatchday,
        playedSlot: lock.playedSlot,
        until: lock.until,
        fixtureId: lock.fixtureId,
      })
    }
  }
  return locked
}
