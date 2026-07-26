import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  computeLockedTeams,
  DEFAULT_LOCK_OFFSETS,
  type FixtureLite,
  type LockedTeam,
  type LockOffsets,
} from '@/lib/locked-teams-core'

// La lógica pura vive en locked-teams-core (sin React) para poder reutilizarla
// desde el servidor. Se reexporta para no romper los imports existentes.
export * from '@/lib/locked-teams-core'

/** Lee los offsets de Admin → Reglas del Juego, con los valores por defecto. */
export async function fetchLockOffsets(
  supabase: ReturnType<typeof createClient>
): Promise<LockOffsets> {
  const { data: cfg } = await supabase
    .from('league_config')
    .select('matchday_start_hours_before, matchday_end_hours_after')
    .eq('id', 1)
    .maybeSingle()
  return {
    startHoursBefore: cfg?.matchday_start_hours_before != null
      ? Number(cfg.matchday_start_hours_before)
      : DEFAULT_LOCK_OFFSETS.startHoursBefore,
    endHoursAfter: cfg?.matchday_end_hours_after != null
      ? Number(cfg.matchday_end_hours_after)
      : DEFAULT_LOCK_OFFSETS.endHoursAfter,
  }
}

/** Hook: equipos bloqueados ahora mismo, refrescado cada minuto. */
export function useLockedTeams(): LockedTeam[] {
  const [locked, setLocked] = useState<LockedTeam[]>([])

  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const [offsets, { data }] = await Promise.all([
        fetchLockOffsets(supabase),
        supabase
          .from('fixtures')
          .select('id,matchday,start_time,status,home_team_id,away_team_id'),
      ])
      setLocked(computeLockedTeams((data || []) as FixtureLite[], new Date(), offsets))
    }
    run()
    const interval = setInterval(run, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return locked
}
