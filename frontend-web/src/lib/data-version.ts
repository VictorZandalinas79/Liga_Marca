import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FixtureLite } from '@/lib/locked-teams-core'

// Versión de los datos para las claves de caché del servidor.
//
// data_versions.v (migración 042) sube con cada sentencia que escribe en
// team_players, player_scores, fixtures, league_config, penalties, etc. Metida
// en la clave de unstable_cache, la caché se recalcula en cuanto cambia algo y
// se reutiliza mientras no cambie nada, en vez de recalcular cada minuto
// descargando team_players y player_scores enteros.
//
// Sin la migración aplicada se devuelve el minuto actual: mismo comportamiento
// que antes (un cálculo por minuto).

const MEMO_MS = 10 * 1000

let memo: { at: number; value: string } | null = null

export async function getDataVersion(
  supabase: SupabaseClient,
  { skipMemo = false }: { skipMemo?: boolean } = {}
): Promise<string> {
  const now = Date.now()
  if (!skipMemo && memo && now - memo.at < MEMO_MS) return memo.value

  let value = `m${Math.floor(now / 60_000)}`
  try {
    const { data, error } = await supabase.from('data_versions').select('v').eq('id', 1).maybeSingle()
    if (!error && data && data.v != null) value = `v${data.v}`
  } catch {
    // Se queda el minuto actual.
  }
  // Solo se memoriza una versión real: el respaldo por minuto ya cambia solo.
  if (value.startsWith('v')) memo = { at: now, value }
  return value
}

/** Tramo de tiempo para los cálculos que además dependen de la hora. */
export function timeBucket(ms: number): string {
  return `t${Math.floor(Date.now() / ms)}`
}

export interface CalendarConfig {
  matchday_start_hours_before: number | null
  matchday_start_hours_before_midweek: number | null
  matchday_start_hours_before_weekend: number | null
  matchday_end_hours_after: number | null
  fantasy_starting_matchday: number | null
}

export interface ServerCalendar {
  fixtures: FixtureLite[]
  config: CalendarConfig | null
}

/**
 * Calendario (fixtures + offsets de league_config), cacheado por versión de
 * datos. Lo usan los cálculos que dependen de la hora (jornada en curso, si se
 * pueden mostrar sanciones): se evalúan en cada petición sobre esta copia, sin
 * volver a descargar los 380 fixtures.
 */
export async function getServerCalendar(supabase: SupabaseClient, version: string): Promise<ServerCalendar> {
  const load = async (): Promise<ServerCalendar> => {
    const [{ data: config }, { data: fixtures, error }] = await Promise.all([
      supabase
        .from('league_config')
        .select('matchday_start_hours_before, matchday_start_hours_before_midweek, matchday_start_hours_before_weekend, matchday_end_hours_after, fantasy_starting_matchday')
        .eq('id', 1)
        .maybeSingle(),
      supabase
        .from('fixtures')
        .select('id, matchday, start_time, status, home_team_id, away_team_id')
        .order('start_time', { ascending: true }),
    ])
    // Un fallo no debe quedarse cacheado hasta el siguiente cambio de datos.
    if (error || !fixtures) throw new Error('calendar unavailable')
    return { fixtures: fixtures as FixtureLite[], config: (config as CalendarConfig) ?? null }
  }

  return unstable_cache(load, ['server-calendar', version], { revalidate: 3600, tags: ['calendar'] })()
    // Sin calendario, los llamadores se comportan como cuando la consulta de
    // fixtures fallaba antes: jornada 1 y sanciones en vivo ocultas.
    .catch(() => ({ fixtures: [], config: null }))
}
