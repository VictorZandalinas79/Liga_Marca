import type { StandingsResult } from '@/lib/standings'

/**
 * Clasificación para el navegador: la calcula /api/standings en el servidor
 * (con caché compartida entre todos los usuarios) en vez de descargar
 * team_players y player_scores enteros en cada pestaña.
 *
 * Mantiene una caché corta por (división, jornada activa) y deduplica las
 * peticiones simultáneas: el dashboard la pide desde dos sitios al cargar.
 */
const TTL_MS = 30 * 1000

type Entry = { at: number; value: StandingsResult }

const cache = new Map<string, Entry>()
const inFlight = new Map<string, Promise<StandingsResult>>()
// Tras guardar una alineación, la siguiente petición pide un cálculo al momento.
let forceFresh = false

const EMPTY: StandingsResult = { standings: [], lastPlayedMatchday: 1, incomplete: true }

export function invalidateStandingsCache() {
  cache.clear()
  forceFresh = true
}

export async function fetchStandings(
  division?: number | null,
  activeMatchday?: number | null
): Promise<StandingsResult> {
  const key = `${division ?? 'null'}:${activeMatchday ?? 'null'}`

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  const pending = inFlight.get(key)
  if (pending) return pending

  const fresh = forceFresh
  forceFresh = false

  const promise = (async () => {
    try {
      const qs = new URLSearchParams({
        division: String(division ?? 'null'),
        activeMatchday: String(activeMatchday ?? 'null'),
      })
      if (fresh) qs.set('fresh', '1')
      const res = await fetch(`/api/standings?${qs}`)
      if (!res.ok) return EMPTY
      const value = (await res.json()) as StandingsResult
      if (!value.incomplete) cache.set(key, { at: Date.now(), value })
      return value
    } catch {
      return EMPTY
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, promise)
  return promise
}
