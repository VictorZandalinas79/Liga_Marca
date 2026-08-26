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
  /**
   * Horas antes del primer partido en las que se cierra el mercado, cuando
   * ese primer partido cae en martes, miércoles o jueves.
   */
  startHoursBeforeMidweek: number
  /**
   * Horas antes del primer partido en las que se cierra el mercado, para el
   * resto de días (viernes a lunes).
   */
  startHoursBeforeWeekend: number
  /** Horas después del último partido en las que se considera cerrada la jornada. */
  endHoursAfter: number
}

export const DEFAULT_LOCK_OFFSETS: LockOffsets = {
  startHoursBeforeMidweek: 1,
  startHoursBeforeWeekend: 1,
  endHoursAfter: 2,
}

/** Martes, miércoles o jueves (Date.getDay(): 0=domingo … 6=sábado). */
function isMidweekDay(d: Date): boolean {
  const day = d.getDay()
  return day === 2 || day === 3 || day === 4
}

/**
 * Horas de antelación aplicables según el día en que cae el partido que marca
 * el inicio del bloqueo (el primer partido de la jornada, o el primer partido
 * adelantado, según el caso).
 */
export function resolveStartHoursBefore(matchTime: Date, offsets: LockOffsets): number {
  return isMidweekDay(matchTime) ? offsets.startHoursBeforeMidweek : offsets.startHoursBeforeWeekend
}

export interface FixtureLite {
  id: string
  matchday: number | null
  start_time: string
  status: string | null
  home_team_id: string | null
  away_team_id: string | null
  home_team?: { name: string }
  away_team?: { name: string }
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
  teams?: { home: string, away: string }
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
  offsets: LockOffsets = DEFAULT_LOCK_OFFSETS,
  fantasyStart: number = 1
): OutOfOrderLock[] {
  const endOffsetMs = offsets.endHoursAfter * ONE_HOUR

  const numeric = fixtures.filter(
    f => f.matchday && f.matchday >= fantasyStart && f.start_time && f.home_team_id && f.away_team_id
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

  const OUT_OF_ORDER_THRESHOLD = 5 * 24 * 60 * 60 * 1000 // 5 días

  // Dado un instante t y su jornada original, ¿en el hueco de qué jornada cae?
  const slotFor = (t: number, ownMatchday: number): number => {
    const ownRep = repTime.get(ownMatchday)
    if (ownRep && Math.abs(t - ownRep) <= OUT_OF_ORDER_THRESHOLD) {
      return ownMatchday
    }

    let closestMd = ownMatchday
    let minDiff = Infinity
    for (const [md, rep] of repTime.entries()) {
      if (md === ownMatchday) continue
      const diff = Math.abs(t - rep)
      if (diff < minDiff) {
        minDiff = diff
        closestMd = md
      }
    }
    return closestMd
  }

  const locks: OutOfOrderLock[] = []

  for (const f of numeric) {
    const ownMatchday = f.matchday as number
    const t = new Date(f.start_time).getTime()
    const playedSlot = slotFor(t, ownMatchday)
    if (playedSlot === ownMatchday) continue // en orden, nada que bloquear

    // Un partido cancelado o sin fecha ya no descoloca nada: no bloquea a nadie.
    const status = (f.status || '').toLowerCase()
    if (VOID_STATUSES.has(status)) continue

    // Cierre de la jornada propia: último partido EN ORDEN de esa jornada + endOffset.
    const siblings = byMatchday.get(ownMatchday)!.filter(x => {
      if (x.id === f.id) return false;
      const xTime = new Date(x.start_time).getTime();
      return slotFor(xTime, ownMatchday) === ownMatchday;
    })
    const ownCloseBase = siblings.length > 0
      ? Math.max(...siblings.map(x => new Date(x.start_time).getTime()))
      : repTime.get(ownMatchday)!
    const ownClose = ownCloseBase + endOffsetMs

    const fEnd = t + endOffsetMs
    const teamIds = [f.home_team_id, f.away_team_id].filter(Boolean) as string[]
    const teams = {
      home: f.home_team?.name || 'Local',
      away: f.away_team?.name || 'Visitante'
    }

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
        teams,
      })
    } else {
      // ADELANTADO: pertenece a una jornada posterior pero se juega antes.
      // Bloqueado desde X horas antes del primer partido adelantado de esta jornada
      // hasta que cierra su jornada lógica (ownMatchday).
      const advancedSiblings = byMatchday.get(ownMatchday)!.filter(x => {
        const xTime = new Date(x.start_time).getTime();
        return slotFor(xTime, ownMatchday) < ownMatchday;
      });
      const earliestAdvancedBase = advancedSiblings.length > 0
        ? Math.min(...advancedSiblings.map(x => new Date(x.start_time).getTime()))
        : t;
      const startHoursBefore = resolveStartHoursBefore(new Date(earliestAdvancedBase), offsets)
      const lockStart = earliestAdvancedBase - startHoursBefore * ONE_HOUR;

      locks.push({
        fixtureId: f.id,
        type: 'advanced',
        ownMatchday,
        playedSlot,
        from: new Date(lockStart),
        until: new Date(ownClose),
        kickoff: new Date(t),
        teamIds,
        teams,
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
  offsets: LockOffsets = DEFAULT_LOCK_OFFSETS,
  fantasyStart: number = 1
): LockedTeam[] {
  const locked: LockedTeam[] = []
  for (const lock of computeOutOfOrderLocks(fixtures, offsets, fantasyStart)) {
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
