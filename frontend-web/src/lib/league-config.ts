import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface LeagueConfig {
  budget_limit: number
  max_players_per_team: number
  formations: string[]
  pay_winner: number
  pay_loser: number
  pay_rest: number
  matchday_start_hours_before: number
  matchday_end_hours_after: number
  fantasy_starting_matchday: number
  max_changes_per_matchday: number
  winners_percentage: number
}

export const DEFAULT_LEAGUE_CONFIG: LeagueConfig = {
  budget_limit: 275,
  max_players_per_team: 4,
  formations: ['3-5-2', '3-4-3', '4-4-2', '4-3-3', '4-5-1', '5-4-1', '5-3-2'],
  pay_winner: 0,
  pay_loser: 2,
  pay_rest: 1,
  matchday_start_hours_before: 1,
  matchday_end_hours_after: 2,
  fantasy_starting_matchday: 1,
  max_changes_per_matchday: 3,
  winners_percentage: 25,
}

export interface ParsedFormation {
  defenders: number
  midfielders: number
  forwards: number
}

/** Convierte "4-3-3" en { defenders: 4, midfielders: 3, forwards: 3 }. */
export function parseFormation(f: string): ParsedFormation | null {
  const parts = f.split('-').map(n => parseInt(n.trim(), 10))
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n) || n <= 0)) return null
  const [defenders, midfielders, forwards] = parts
  // El portero es siempre 1; las tres cifras son DEF-MED-DEL y deben sumar 10.
  if (defenders + midfielders + forwards !== 10) return null
  return { defenders, midfielders, forwards }
}

/** Hook que lee la configuración de la liga (con fallback a los valores por defecto). */
export function useLeagueConfig(): LeagueConfig {
  const [config, setConfig] = useState<LeagueConfig>(DEFAULT_LEAGUE_CONFIG)

  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('league_config').select('*').eq('id', 1).maybeSingle()
      if (data) setConfig({ ...DEFAULT_LEAGUE_CONFIG, ...data })
    }
    run()
  }, [])

  return config
}
