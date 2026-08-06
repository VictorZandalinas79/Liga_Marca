/**
 * Quién sigue estando en el mercado.
 *
 * La lista de jugadores de la app se ciñe a la última descarga de Biwenger:
 * quien no salga en ella deja de existir para el juego. `merge_players_data.py`
 * borra a esos jugadores, pero no puede borrar a los que alguien tiene fichados
 * (romperían la plantilla y la FK), así que los deja en la tabla marcados con
 * `is_in_biwenger = false`. Esos siguen en el equipo de quien los tiene, pero
 * no se pueden fichar ni aparecen en ningún listado.
 *
 * El precio es la otra cara de lo mismo: lo pone Biwenger, así que un jugador
 * sin precio es un jugador que solo está en la API de Opta y nunca estuvo en el
 * mercado. Tampoco entra.
 *
 * Todo lo que ofrezca jugadores para elegir debe pasar por aquí: cada filtro
 * escrito a mano en una pantalla es un sitio donde estos jugadores reaparecen.
 */

export type MarketPlayer = {
  is_in_biwenger?: boolean | null
  precio?: number | null
}

export function isInMarket(player: MarketPlayer | null | undefined): boolean {
  if (!player) return false
  if (player.is_in_biwenger === false) return false
  // `precio` se guarda en millones; 0 y null significan lo mismo aquí (no hay
  // precio de Biwenger), y ningún jugador del mercado vale 0.
  return typeof player.precio === 'number' && player.precio > 0
}

/**
 * Filtro equivalente para las consultas a Supabase, para no traerse a los que
 * luego habría que descartar en memoria.
 *
 *   applyMarketFilter(supabase.from('players').select('*'))
 */
export function applyMarketFilter<T extends { eq: Function; gt: Function }>(query: T): T {
  return query.eq('is_in_biwenger', true).gt('precio', 0) as T
}
