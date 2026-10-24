import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'

// team_players y player_scores por jornadas, con caché por huella (migración 044).
//
// La clasificación y las sanciones en vivo necesitan las dos tablas enteras, y
// antes las descargaban completas en cada recálculo: cualquier guardado de
// alineación sube data_versions.v y obligaba a bajar otra vez ~7.000 filas de
// team_players y ~3.500 de player_scores, aunque solo hubiera cambiado una
// jornada. Ahora se pide la huella de cada jornada (decenas de filas) y solo se
// descargan las jornadas cuya huella no está ya en la Data Cache de Vercel.
//
// Las columnas son la unión de las que usan standings.ts e infractions.ts, para
// que las dos compartan la misma copia de cada jornada.
//
// Sin la migración aplicada (o si falla la huella) se devuelve null y el
// llamador descarga la tabla completa como antes.

export type ChunkTable = 'team_players' | 'player_scores'

const COLUMNS: Record<ChunkTable, string> = {
  team_players: 'id, team_id, player_id, is_starter, is_captain, matchday, created_at, position',
  player_scores: 'id, player_id, total_points, fixture_id, matchday, minutes_played',
}

const CHUNK_RPC: Record<ChunkTable, string> = {
  team_players: 'team_players_chunk',
  player_scores: 'player_scores_chunk',
}

const PAGE_SIZE = 1000
// La huella está en la clave: una copia nunca queda desfasada, la caducidad
// solo limpia jornadas que ya nadie pide.
const CHUNK_REVALIDATE_S = 7 * 24 * 3600

interface Digest {
  tbl: ChunkTable
  chunk: number
  n: number
  h: string
}

async function fetchChunk<T>(supabase: SupabaseClient, table: ChunkTable, chunk: number): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .rpc(CHUNK_RPC[table], { p_chunk: chunk })
      .select(COLUMNS[table])
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    // Se lanza para que unstable_cache no guarde una jornada a medias.
    if (error || !data) throw new Error(`${table} chunk ${chunk}: ${error?.message ?? 'sin datos'}`)
    rows.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

/**
 * Filas de las tablas pedidas, cargadas por jornadas desde la caché.
 * `maxChunk` limita las jornadas (la 0 agrupa las filas sin jornada).
 * Devuelve null si no se puede usar la carga por jornadas.
 */
export async function loadTablesByMatchday(
  supabase: SupabaseClient,
  tables: ChunkTable[],
  { maxChunk }: { maxChunk?: number } = {}
): Promise<{ rows: Record<ChunkTable, any[]>; incomplete: boolean } | null> {
  const { data: digest, error } = await supabase.rpc('lineup_score_chunk_digest')
  if (error || !Array.isArray(digest)) return null

  const wanted = (digest as Digest[]).filter(
    d => tables.includes(d.tbl) && (maxChunk === undefined || d.chunk <= maxChunk)
  )

  try {
    const loaded = await Promise.all(
      wanted.map(async d => {
        const chunkRows = await unstable_cache(
          async () => {
            const r = await fetchChunk(supabase, d.tbl, d.chunk)
            if (r.length !== Number(d.n)) throw new Error(`${d.tbl} chunk ${d.chunk}: ${r.length}/${d.n} filas`)
            return r
          },
          ['md-chunk', d.tbl, String(d.chunk), String(d.n), d.h],
          { revalidate: CHUNK_REVALIDATE_S, tags: ['md-chunks'] }
        )()
        return { tbl: d.tbl, chunkRows }
      })
    )
    const rows = { team_players: [], player_scores: [] } as Record<ChunkTable, any[]>
    for (const { tbl, chunkRows } of loaded) rows[tbl].push(...chunkRows)
    return { rows, incomplete: false }
  } catch (err) {
    console.error('[MD-CHUNKS] Error cargando jornadas:', err)
    return { rows: { team_players: [], player_scores: [] }, incomplete: true }
  }
}

/** Aperturas de la app por usuario desde `since`, o null sin la migración 044. */
export async function loadSessionCounts(supabase: SupabaseClient, since: string): Promise<Map<string, number> | null> {
  const { data, error } = await supabase.rpc('session_counts_since', { p_since: since })
  if (error || !Array.isArray(data)) return null
  return new Map(data.map((r: { user_id: string; n: number }) => [r.user_id, Number(r.n)]))
}
