import { createClient } from '@/lib/supabase/client'
import type { FixtureLite } from '@/lib/locked-teams-core'

// Calendario (fixtures + league_config) compartido por todos los hooks del
// cliente que calculan bloqueos y jornadas.
//
// Antes cada hook lo pedía por su cuenta cada minuto: en el dashboard se
// montan useMatchdayLock (layout + 2 en la página), useOpenMatchdays y
// useLockedTeams, o sea 5 descargas por minuto de la tabla fixtures entera
// (~490 KB/min por pestaña, medido el 13/09/2026), que agotaban el egress del
// plan gratuito de Supabase. Ahora sale una vez por TTL_MS para toda la
// pestaña, sin el join a real_teams: los nombres de equipo no cambian y se
// piden una sola vez.

export type CalendarFixture = FixtureLite & { momento: string | null }

export type LeagueConfigRow = {
  matchday_start_hours_before: number | null
  matchday_start_hours_before_midweek: number | null
  matchday_start_hours_before_weekend: number | null
  matchday_end_hours_after: number | null
  fantasy_starting_matchday: number | null
}

export type Calendar = {
  fixtures: CalendarFixture[] | null
  config: LeagueConfigRow | null
}

// Algo menos que el minuto de refresco de los hooks, para que el tick de cada
// minuto vea la caché caducada y la renueve una sola vez.
const TTL_MS = 55 * 1000

let cached: { at: number; value: Calendar } | null = null
let inFlight: Promise<Calendar> | null = null
let teamNames: Map<string, string> | null = null

export function loadCalendar(): Promise<Calendar> {
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.value)
  if (inFlight) return inFlight

  inFlight = (async () => {
    const supabase = createClient()
    const [fixturesRes, configRes, teamsRes] = await Promise.all([
      supabase
        .from('fixtures')
        .select('id, matchday, momento, start_time, status, home_team_id, away_team_id')
        .order('start_time', { ascending: true }),
      supabase
        .from('league_config')
        .select('matchday_start_hours_before, matchday_start_hours_before_midweek, matchday_start_hours_before_weekend, matchday_end_hours_after, fantasy_starting_matchday')
        .eq('id', 1)
        .maybeSingle(),
      teamNames ? null : supabase.from('real_teams').select('id, name'),
    ])

    if (teamsRes?.data) {
      teamNames = new Map(teamsRes.data.map(t => [t.id, t.name]))
    }

    const nameOf = (id: string | null) => {
      const name = id ? teamNames?.get(id) : undefined
      return name ? { name } : undefined
    }

    const fixtures = fixturesRes.data
      ? fixturesRes.data.map(f => ({
          ...f,
          home_team: nameOf(f.home_team_id),
          away_team: nameOf(f.away_team_id),
        })) as CalendarFixture[]
      : null

    const value: Calendar = { fixtures, config: (configRes.data as LeagueConfigRow | null) ?? null }
    // Un fallo no se cachea: el siguiente tick lo reintenta
    if (!fixturesRes.error && !configRes.error) {
      cached = { at: Date.now(), value }
    }
    return value
  })().finally(() => {
    inFlight = null
  })

  return inFlight
}
