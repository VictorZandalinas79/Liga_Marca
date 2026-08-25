import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  computeLockedTeams,
  computeOutOfOrderLocks,
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
      const [offsets, { data: leagueData }, { data }] = await Promise.all([
        fetchLockOffsets(supabase),
        supabase.from('league_config').select('fantasy_starting_matchday').eq('id', 1).maybeSingle(),
        supabase
          .from('fixtures')
          .select('id,matchday,start_time,status,home_team_id,away_team_id'),
      ])
      const fantasyStart = leagueData?.fantasy_starting_matchday ?? 1
      setLocked(computeLockedTeams((data || []) as FixtureLite[], new Date(), offsets, fantasyStart))
    }
    run()
    const interval = setInterval(run, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return locked
}

export interface OpenMatchdaysState {
  /** Jornadas "abiertas": tienen partidos ya jugados y partidos aún por jugar. */
  openMatchdays: number[]
  /** De las abiertas, la que tiene un partido más cercano a ahora (o en juego). */
  recommendedMatchday: number | null
  /** false hasta que llega la primera respuesta de Supabase. */
  loaded: boolean
}

/**
 * Hook: jornadas numéricas que están "a medias" (con partidos ya jugados y
 * partidos por jugar). Los partidos fuera de orden (adelantados/aplazados) no
 * cuentan para esto: un partido adelantado de la J9 jugado en fechas de la J2
 * no debe hacer que las J2..J9 aparezcan todas como "abiertas".
 */
export function useOpenMatchdays(): OpenMatchdaysState {
  const [state, setState] = useState<OpenMatchdaysState>({ openMatchdays: [], recommendedMatchday: null, loaded: false })

  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const [offsets, { data: leagueData }, { data }] = await Promise.all([
        fetchLockOffsets(supabase),
        supabase.from('league_config').select('fantasy_starting_matchday').eq('id', 1).maybeSingle(),
        supabase
          .from('fixtures')
          .select('id,matchday,start_time,status,home_team_id,away_team_id'),
      ])
      const fantasyStart = leagueData?.fantasy_starting_matchday ?? 1
      const fixtures = (data || []) as FixtureLite[]
      const outOfOrderIds = new Set(computeOutOfOrderLocks(fixtures, offsets, fantasyStart).map(l => l.fixtureId))
      const now = Date.now()

      const byMatchday = new Map<number, FixtureLite[]>()
      for (const f of fixtures) {
        if (!f.matchday || f.matchday < fantasyStart || !f.start_time) continue
        // Eliminada la exclusión de outOfOrderIds para que las jornadas
        // con partidos adelantados puedan aparecer como "abiertas".
        if (!byMatchday.has(f.matchday)) byMatchday.set(f.matchday, [])
        byMatchday.get(f.matchday)!.push(f)
      }

      const openMatchdays: number[] = []
      let recommendedMatchday: number | null = null
      let bestDistance = Infinity

      const startOffsetMs = offsets.startHoursBefore * 60 * 60 * 1000
      const endOffsetMs = offsets.endHoursAfter * 60 * 60 * 1000

      for (const [md, fs] of byMatchday) {
        const times = fs.map(f => new Date(f.start_time).getTime())
        const minStart = Math.min(...times)
        const maxStart = Math.max(...times)
        const unlockTime = minStart - startOffsetMs
        const lockTime = maxStart + endOffsetMs

        // Está "abierta" si hemos entrado en su ventana de mercado y aún no la hemos superado
        if (now >= unlockTime && now <= lockTime) {
          openMatchdays.push(md)

          for (const f of fs) {
            const distance = f.status === 'live' ? 0 : Math.abs(new Date(f.start_time).getTime() - now)
            if (distance < bestDistance) {
              bestDistance = distance
              recommendedMatchday = md
            }
          }
        }
      }

      openMatchdays.sort((a, b) => a - b)
      setState({ openMatchdays, recommendedMatchday, loaded: true })
    }
    run()
    const interval = setInterval(run, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return state
}
