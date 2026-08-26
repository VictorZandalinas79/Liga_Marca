export interface LeagueConfig {
  budget_limit: number
  max_players_per_team: number
  formations: string[]
  pay_winner: number
  pay_loser: number
  pay_rest: number
  matchday_start_hours_before: number
  matchday_start_hours_before_midweek: number
  matchday_start_hours_before_weekend: number
  matchday_end_hours_after: number
  fantasy_starting_matchday: number
  max_changes_per_matchday: number
  div1_win_percent: number
  div1_lose_percent: number
  div2_win_percent: number
  div2_lose_percent: number
  div3_win_percent: number
  div3_lose_percent: number
  div1_descensos: number
  div2_descensos: number
  div3_descensos: number
  entry_fee: number
  prize_div1_1st: number
  prize_div1_2nd: number
  prize_div1_3rd: number
  prize_div2_1st: number
  prize_div2_2nd: number
  prize_div2_3rd: number
  prize_div3_1st: number
  prize_div3_2nd: number
  prize_div3_3rd: number
  starting_balance: number
  infraction_penalty_cost: number
  _isLoaded?: boolean
}

export const DEFAULT_LEAGUE_CONFIG: LeagueConfig = {
  budget_limit: 275,
  max_players_per_team: 4,
  formations: ['3-5-2', '3-4-3', '4-4-2', '4-3-3', '4-5-1', '5-4-1', '5-3-2'],
  pay_winner: 0,
  pay_loser: 2,
  pay_rest: 1,
  matchday_start_hours_before: 1,
  matchday_start_hours_before_midweek: 1,
  matchday_start_hours_before_weekend: 1,
  matchday_end_hours_after: 2,
  fantasy_starting_matchday: 1,
  max_changes_per_matchday: 3,
  div1_win_percent: 3,
  div1_lose_percent: 3,
  div2_win_percent: 3,
  div2_lose_percent: 3,
  div3_win_percent: 3,
  div3_lose_percent: 3,
  div1_descensos: 3,
  div2_descensos: 3,
  div3_descensos: 3,
  entry_fee: 50,
  prize_div1_1st: 25,
  prize_div1_2nd: 16,
  prize_div1_3rd: 11,
  prize_div2_1st: 14,
  prize_div2_2nd: 10,
  prize_div2_3rd: 8,
  prize_div3_1st: 8,
  prize_div3_2nd: 5,
  prize_div3_3rd: 3,
  starting_balance: 40,
  infraction_penalty_cost: 3,
}

export interface ParsedFormation {
  defenders: number
  midfielders: number
  forwards: number
}

export function parseFormation(str: string): ParsedFormation | null {
  const m = str.trim().match(/^(\d)-(\d)-(\d)$/)
  if (!m) return null
  const def = parseInt(m[1], 10)
  const mid = parseInt(m[2], 10)
  const fwd = parseInt(m[3], 10)
  if (def + mid + fwd !== 10) return null
  return { defenders: def, midfielders: mid, forwards: fwd }
}
