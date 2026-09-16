/**
 * Cliente con caché y dedupe para /api/penalties/live.
 *
 * Esa ruta recalcula sanciones al vuelo y es de las que más CPU de función
 * consume. La llaman el panel principal y la página de jornada, y cambiar de
 * jornada con las flechas disparaba una petición por clic. Aquí se comparte el
 * resultado por (jornada, división) durante TTL_MS y se deduplican las
 * peticiones simultáneas.
 */
const TTL_MS = 60 * 1000

type Entry = { at: number; infractions: unknown[] }

const cache = new Map<string, Entry>()
const inFlight = new Map<string, Promise<unknown[]>>()

export async function fetchLivePenalties(
  matchday: number,
  division: number
): Promise<unknown[]> {
  const key = `${matchday}:${division}`

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.infractions

  const pending = inFlight.get(key)
  if (pending) return pending

  const promise = (async () => {
    try {
      const res = await fetch(`/api/penalties/live?matchday=${matchday}&division=${division}`)
      if (!res.ok) return []
      const data = await res.json()
      const infractions = data.infractions || []
      cache.set(key, { at: Date.now(), infractions })
      return infractions
    } catch {
      return []
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, promise)
  return promise
}
