import { unstable_cache } from 'next/cache'

// unstable_cache que no anida a las de dentro.
//
// Next NO consulta la caché de un unstable_cache llamado dentro de otro: lo
// ejecuta siempre (node_modules/next/dist/server/web/spec-extension/
// unstable-cache.js, isNestedUnstableCache). La clasificación y las sanciones
// en vivo envolvían en su caché la carga por jornadas (lib/matchday-chunks.ts),
// así que cada recálculo volvía a bajar de Supabase TODAS las jornadas de
// team_players y player_scores: ~4.600 llamadas al día de cada una.
//
// Aquí se mira primero si hay copia (con una función que nunca guarda nada) y,
// si no la hay, se calcula fuera de cualquier unstable_cache y se guarda el
// resultado con la misma clave. Las cachés de dentro funcionan normalmente.

class CacheMiss extends Error {}

export async function unnestedCache<T>(
  compute: () => Promise<T>,
  keyParts: string[],
  options: { revalidate?: number | false; tags?: string[] }
): Promise<T> {
  try {
    return await unstable_cache(async (): Promise<T> => {
      throw new CacheMiss()
    }, keyParts, options)()
  } catch (err) {
    if (!(err instanceof CacheMiss)) throw err
  }
  // Un fallo de compute se propaga y no se guarda, como en unstable_cache.
  const value = await compute()
  return unstable_cache(async () => value, keyParts, options)()
}
