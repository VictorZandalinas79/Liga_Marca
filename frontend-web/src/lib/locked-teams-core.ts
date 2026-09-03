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

/** Martes, miércoles o jueves (en zona horaria de España Europe/Madrid). */
function isMidweekDay(d: Date): boolean {
  const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', weekday: 'short' }).format(d)
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const day = days[dayStr] ?? d.getDay()
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
    if (status === 'finished') continue

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
      // Bloqueado desde X horas antes del partido adelantado hasta que termina (fEnd).
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

/** ¿Tiene esta jornada todos sus partidos ya `finished`? */
export function isMatchdayFullyPlayed(fixtures: FixtureLite[], matchday: number): boolean {
  const own = fixtures.filter(f => f.matchday === matchday)
  if (own.length === 0) return false
  return own.every(f => (f.status || '').toLowerCase() === 'finished')
}

/**
 * Jornadas que tienen al menos un fixture cuya posición cronológica real no
 * coincide con su hueco de calendario (adelantado o aplazado), sin importar
 * si ese fixture concreto ya terminó o no. A diferencia de
 * `computeOutOfOrderLocks` (que ignora los partidos ya finished porque solo
 * le importa calcular ventanas de bloqueo activas), esto es una propiedad
 * ESTRUCTURAL de la jornada: una vez descolocada, sigue estándolo aunque el
 * partido descolocado ya se haya jugado, hasta que el resto de sus partidos
 * también terminen.
 */
function matchdaysWithOutOfOrderFixtures(fixtures: FixtureLite[], fantasyStart: number = 1): Set<number> {
  const numeric = fixtures.filter(
    f => f.matchday && f.matchday >= fantasyStart && f.start_time && f.home_team_id && f.away_team_id
  )
  const byMatchday = new Map<number, FixtureLite[]>()
  for (const f of numeric) {
    const md = f.matchday as number
    if (!byMatchday.has(md)) byMatchday.set(md, [])
    byMatchday.get(md)!.push(f)
  }

  const repTime = new Map<number, number>()
  for (const [md, fs] of byMatchday) {
    const times = fs.map(f => new Date(f.start_time).getTime()).sort((a, b) => a - b)
    repTime.set(md, times[Math.floor(times.length / 2)])
  }

  const OUT_OF_ORDER_THRESHOLD = 5 * 24 * 60 * 60 * 1000 // 5 dias

  const slotFor = (t: number, ownMatchday: number): number => {
    const ownRep = repTime.get(ownMatchday)
    if (ownRep && Math.abs(t - ownRep) <= OUT_OF_ORDER_THRESHOLD) return ownMatchday
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

  const result = new Set<number>()
  for (const f of numeric) {
    const ownMatchday = f.matchday as number
    const t = new Date(f.start_time).getTime()
    if (slotFor(t, ownMatchday) !== ownMatchday) result.add(ownMatchday)
  }
  return result
}

/**
 * ¿Tiene esta jornada un partido descolocado (adelantado o aplazado) que
 * todavía no se ha resuelto? Distinto de "esta completa": una jornada normal
 * (sin ningun fixture fuera de orden) nunca cuenta como "sin resolver" aqui,
 * aunque le queden partidos por jugar - solo aplica cuando el propio
 * calendario de esta jornada se ha roto por un partido jugado fuera de su
 * hueco cronologico.
 */
export function hasUnresolvedOutOfOrderMatch(
  fixtures: FixtureLite[],
  matchday: number,
  fantasyStart: number = 1
): boolean {
  if (!matchdaysWithOutOfOrderFixtures(fixtures, fantasyStart).has(matchday)) return false
  return !isMatchdayFullyPlayed(fixtures, matchday)
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

/**
 * Jornada de la que viene cada jornada, en orden de CALENDARIO.
 *
 * Normalmente es `m - 1`, pero un partido fuera de orden rompe esa
 * correspondencia: si la J6 juega un partido adelantado antes de que se juegue
 * la J4, el once de la J4 se hereda del que disputó ese partido, y es contra
 * ese contra el que hay que contar los cambios y la exclusividad.
 *
 * El tramo de referencia de una jornada es el ÚLTIMO suyo: cuando se puntúa, su
 * alineación es la que quedó comprometida en ese tramo. Por eso la J6 del
 * ejemplo viene de la J5 (su tramo regular), aunque su partido adelantado
 * viniera de la J3.
 *
 * Las jornadas sin predecesor (la primera del juego) no aparecen en el mapa.
 */
export function chronologicalPredecessors(
  fixtures: FixtureLite[],
  offsets: LockOffsets = DEFAULT_LOCK_OFFSETS,
  fantasyStart: number = 1
): Map<number, number> {
  const byMatchday = new Set<number>()
  for (const f of fixtures) {
    if (f.matchday && f.matchday >= fantasyStart) byMatchday.add(f.matchday)
  }
  
  const prev = new Map<number, number>()
  const sorted = Array.from(byMatchday).sort((a, b) => a - b)
  
  for (const md of sorted) {
    if (md > fantasyStart) prev.set(md, md - 1)
  }
  
  return prev
}
