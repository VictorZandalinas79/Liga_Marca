/**
 * Jornadas ignoradas en el juego (Admin → Jornadas ignoradas).
 *
 * Se guardan en `league_config.ignored_matchdays` (migración 047) como lista
 * `[{ matchday, message }]`. Una jornada ignorada no cuenta para nada del
 * juego: ni puntos, ni pagos, ni podios/colistas, ni sanciones. Los partidos
 * reales se siguen jugando y puntuando en la ficha de cada jugador.
 *
 * Módulo PURO (sin React ni Supabase): lo usan el servidor y el cliente.
 */

export interface IgnoredMatchday {
  matchday: number
  message: string
}

/** Días antes del primer partido de la jornada en los que empieza el aviso. */
export const NOTICE_DAYS_BEFORE = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** Lee la columna tolerando null, formato raro o la migración sin aplicar. */
export function parseIgnoredMatchdays(raw: unknown): IgnoredMatchday[] {
  if (!Array.isArray(raw)) return []
  const byMd = new Map<number, IgnoredMatchday>()
  for (const item of raw as { matchday?: unknown; message?: unknown }[]) {
    const md = Number(item?.matchday)
    if (!Number.isInteger(md) || md <= 0) continue
    const message = typeof item?.message === 'string' ? item.message.trim() : ''
    byMd.set(md, { matchday: md, message })
  }
  return Array.from(byMd.values()).sort((a, b) => a.matchday - b.matchday)
}

export function ignoredMatchdaySet(raw: unknown): Set<number> {
  return new Set(parseIgnoredMatchdays(raw).map(i => i.matchday))
}

export function defaultNoticeMessage(matchday: number): string {
  return `Los puntos de la Jornada ${matchday} no cuentan para el juego.`
}

type FixtureForNotice = { matchday: number | null; start_time: string | null; status: string | null }

/** Partido que ya no se va a jugar (o ya se jugó) dentro de esta jornada. */
const DONE_STATUSES = new Set(['finished', 'cancelled'])

export interface IgnoredMatchdayNotice extends IgnoredMatchday {
  /** Inicio del aviso: 7 días antes del primer partido de la jornada. */
  from: string
  firstKickoff: string
}

/**
 * Avisos visibles ahora: desde NOTICE_DAYS_BEFORE días antes del primer
 * partido de la jornada hasta que TODOS sus partidos han terminado (un partido
 * aplazado mantiene el aviso hasta que se juegue).
 */
export function activeIgnoredNotices(
  ignored: IgnoredMatchday[],
  fixtures: FixtureForNotice[],
  now: number = Date.now()
): IgnoredMatchdayNotice[] {
  if (ignored.length === 0) return []
  const result: IgnoredMatchdayNotice[] = []
  for (const item of ignored) {
    const own = fixtures.filter(f => f.matchday === item.matchday)
    if (own.length === 0) continue
    let first = Infinity
    for (const f of own) {
      const t = f.start_time ? new Date(f.start_time).getTime() : NaN
      if (!isNaN(t) && t < first) first = t
    }
    if (first === Infinity) continue
    const from = first - NOTICE_DAYS_BEFORE * DAY_MS
    if (now < from) continue
    const allDone = own.every(f => DONE_STATUSES.has((f.status || '').toLowerCase()))
    if (allDone) continue
    result.push({ ...item, from: new Date(from).toISOString(), firstKickoff: new Date(first).toISOString() })
  }
  return result
}
