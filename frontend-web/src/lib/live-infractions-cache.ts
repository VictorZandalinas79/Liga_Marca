import { unnestedCache } from '@/lib/unnested-cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getLiveInfractions, type Infraction } from '@/lib/infractions'
import { isDivisionId } from '@/lib/divisions'
import { loadTablesByMatchday } from '@/lib/matchday-chunks'

// Sanciones en vivo de una jornada, calculadas UNA vez para todas las divisiones.
//
// Antes /api/penalties/live cacheaba por (jornada, división) y
// /api/notifications calculaba aparte: hasta cinco descargas de team_players
// (~1 MB) y player_scores por minuto para el mismo resultado. Cada división se
// calcula aislada dentro de getLiveInfractions, así que filtrar el cálculo
// conjunto por división da exactamente lo mismo que pedirla sola.
//
// La clave lleva la versión de datos (src/lib/data-version.ts): se recalcula
// cuando cambia una alineación, una puntuación o una sanción, no cada minuto.
// Lo que depende de la hora (si ya se pueden mostrar) se decide fuera, en cada
// petición, sobre el calendario cacheado.

interface LiveInfractionsAll {
  infractions: Infraction[]
  /** Divisiones con sanciones oficiales ya consolidadas en `penalties`. */
  consolidatedDivisions: (number | null)[]
}

export async function getCachedLiveInfractions(
  supabase: SupabaseClient,
  matchday: number,
  version: string
): Promise<LiveInfractionsAll> {
  // Sin anidar: dentro de un unstable_cache la caché por jornadas no se
  // consultaría (lib/unnested-cache.ts).
  return unnestedCache(
    async (): Promise<LiveInfractionsAll> => {
      const [infractions, { data: penalties }] = await Promise.all([
        getLiveInfractions(supabase, matchday, null, async (table, maxChunk) => {
          const r = await loadTablesByMatchday(supabase, [table], { maxChunk })
          if (!r) return null
          // Una jornada que no se ha podido cargar no debe acabar en la caché.
          if (r.incomplete) throw new Error('live infractions: jornadas incompletas')
          // Como el .lte('matchday') de la descarga directa: sin filas sin jornada.
          return maxChunk === undefined ? r.rows[table] : r.rows[table].filter(row => row.matchday != null)
        }),
        supabase.from('penalties').select('division').eq('matchday', matchday),
      ])
      const consolidatedDivisions = [...new Set((penalties || []).map(p => (p.division ?? null) as number | null))]
      return { infractions, consolidatedDivisions }
    },
    ['live-infractions-all', String(matchday), version],
    { revalidate: 3600, tags: ['penalties-live'] }
  )
}

/**
 * Las sanciones en vivo que ve una división (o todas con `null`). Si ya hay
 * sanciones oficiales consolidadas para esa división (o para cualquiera, en la
 * vista conjunta), no se muestran las en vivo: serían duplicados temporales.
 */
export function liveInfractionsForDivision(all: LiveInfractionsAll, division: number | null): Infraction[] {
  if (isDivisionId(division)) {
    if (all.consolidatedDivisions.includes(division)) return []
    return all.infractions.filter(inf => inf.division === division)
  }
  return all.consolidatedDivisions.length > 0 ? [] : all.infractions
}
