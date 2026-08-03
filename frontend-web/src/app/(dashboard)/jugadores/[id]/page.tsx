'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, TrendingUp, Goal, Ticket, X, Calendar, MapPin, Clock } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import { evaluateRelevoBlocks, resolveRates } from '@/lib/scoring-config'
import { useScoringRules } from '@/hooks/use-scoring-rules'

interface Player {
  id: string
  first_name: string
  last_name: string
  short_name: string
  position: string
  status?: string
  team_id: string
  photo?: string
  shirt_number?: number
  date_of_birth?: string
  nationality?: string
  height?: number
  weight?: number
  foot?: string
  precio?: number
  team?: { name: string; logo_url?: string }
}

interface PlayerScore {
  id: string
  fixture_id: string
  match_id: string
  total_points: number
  minutes_played: number
  is_starter: boolean
  position: string
  relevo_points: number
  relevo_participation_pts?: number
  relevo_passes_pts?: number
  relevo_opp_half_pts?: number
  relevo_shots_pts?: number
  relevo_duels_pts?: number
  relevo_aerials_pts?: number
  relevo_takeons_pts?: number

  // Goles
  goals: number
  goal_header_bonus: number
  goal_freekick_bonus: number
  own_goals: number
  goals_conceded: number
  clean_sheet: boolean

  // Asistencias
  assists: number
  key_passes: number
  second_assists: number
  intent_assists: number

  // Tiros
  shots_on_target: number
  shots_off_target: number
  shots_hit_woodwork: number
  big_chances_created: number
  big_chances_missed: number
  penalties_scored: number
  penalties_missed: number
  penalties_won: number
  penalties_conceded: number

  // Portero
  saves: number
  penalty_saves: number
  claims_ok: number
  claims_fail: number
  fumbles: number
  crosses_not_claimed: number
  punches_ok: number
  punches_fail: number
  smothers: number
  sweepers_ok: number
  sweepers_fail: number
  parries_safe: number
  parries_danger: number

  // Defensa
  clearances: number
  clearances_last_line: number
  blocked_crosses: number
  interceptions: number
  interceptions_high: number
  interceptions_med: number
  interceptions_low: number
  tackles_won: number
  tackles_lost: number
  blocked_shots: number
  blocked_passes: number
  ball_recoveries: number
  offsides_provoked: number
  challenges_lost: number

  // Errores
  errors_leading_to_shot: number
  errors_leading_to_goal: number

  // Pases
  passes_completed: number
  passes_attempted: number
  progressive_passes: number
  passes_into_final_third: number
  passes_into_box: number
  through_balls: number
  crosses_completed: number
  crosses_attempted: number
  switch_plays: number
  pull_backs: number
  long_balls_completed: number
  lay_offs: number
  forward_passes: number
  set_pieces_taken: number
  successful_crosses: number
  box_entries: number

  // Regates
  takeons_won: number
  takeons_lost: number
  takeons_overrun: number
  good_skills: number
  dispossessed: number
  bad_touches: number

  // Aéreos
  aerials_won: number
  aerials_lost: number

  // Faltas
  fouls_committed: number
  fouls_won: number

  // Tarjetas
  yellow_cards: number
  second_yellow_cards: number
  red_cards: number

  // Fixture info
  fixture?: {
    start_time: string
    matchday?: number
    home_team?: { name: string }
    away_team?: { name: string }
    home_score?: number
    away_score?: number
    home_team_id?: string
    away_team_id?: string
  }
}

// Desglose por bloques (orden oficial RELEVO)
interface ScoreRow {
  label: string
  count: number   // nº de eventos (no se muestra si flat)
  unit: number    // puntos por unidad
  points: number  // puntos aportados
  flat?: boolean  // puntos fijos sin contador (participación, portería a cero, RELEVO)
}
interface ScoreBlock {
  id: string
  emoji: string
  title: string
  accent: string
  chip: string
  rows: ScoreRow[]
}

export default function JugadorDetallePage() {
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [scores, setScores] = useState<PlayerScore[]>([])
  const [selectedMatch, setSelectedMatch] = useState<PlayerScore | null>(null)
  const [hideZeros, setHideZeros] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState('puntos')
  const [activeBar, setActiveBar] = useState<number | null>(null)
  const [activeRadarAxis, setActiveRadarAxis] = useState<number | null>(null)
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [compareTarget, setCompareTarget] = useState<string>('media-pos')
  const [compareScores, setCompareScores] = useState<PlayerScore[]>([])
  const [comparePlayer, setComparePlayer] = useState<Player | null>(null)
  // Tarifas de puntuación desde scoring_config (editables en Admin)
  const scoringRules = useScoringRules()
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()

  useEffect(() => {
    const fetchJugador = async () => {
      const playerId = params.id as string

      // 1. Obtener jugador
      const { data: playerData } = await supabase
        .from('players')
        .select(`
          *,
          real_teams!inner (
            id,
            name,
            logo_url
          )
        `)
        .eq('id', playerId)
        .single()

      if (!playerData) {
        setLoading(false)
        return
      }

      // Extraer datos del equipo
      const teamData = playerData.real_teams as any
      const team = teamData ? {
        name: teamData.name,
        logo_url: teamData.logo_url
      } : undefined

      setPlayer({
        ...playerData,
        real_teams: undefined,
        team
      })

      // 2. Obtener scores de todos los partidos.
      // Nota: fixtures tiene dos FKs a real_teams (home/away), así que NO se puede
      // embeber real_teams directamente (es ambiguo). Se obtienen los nombres de
      // equipo en una segunda consulta, igual que en la página de partidos.
      const { data: scoresData } = await supabase
        .from('player_scores')
        .select(`
          *,
          fixtures (
            start_time,
            matchday,
            home_team_id,
            away_team_id,
            home_score,
            away_score
          )
        `)
        .eq('player_id', playerId)

      let allScores = scoresData || []

      if (playerData.team_id) {
        const playedFixtureIds = new Set(allScores.map(s => s.fixture_id))
        const { data: teamFixtures } = await supabase
          .from('fixtures')
          .select('id, start_time, matchday, home_team_id, away_team_id, home_score, away_score, status')
          .lt('start_time', new Date().toISOString())
          .or(`home_team_id.eq.${playerData.team_id},away_team_id.eq.${playerData.team_id}`)

        if (teamFixtures) {
          const unplayedFixtures = teamFixtures.filter(f => !playedFixtureIds.has(f.id))
          const unplayedScores = unplayedFixtures.map(f => ({
            id: `unplayed-${f.id}`,
            fixture_id: f.id,
            match_id: f.id,
            total_points: 0,
            minutes_played: 0,
            is_starter: false,
            position: playerData.position,
            relevo_points: 0,
            goals: 0, goal_header_bonus: 0, goal_freekick_bonus: 0, own_goals: 0, goals_conceded: 0, clean_sheet: false,
            assists: 0, key_passes: 0, second_assists: 0, intent_assists: 0,
            shots_on_target: 0, shots_off_target: 0, shots_hit_woodwork: 0, big_chances_created: 0, big_chances_missed: 0,
            penalties_scored: 0, penalties_missed: 0, penalties_won: 0, penalties_conceded: 0,
            saves: 0, penalty_saves: 0, claims_ok: 0, claims_fail: 0, fumbles: 0, crosses_not_claimed: 0, punches_ok: 0, punches_fail: 0, smothers: 0, sweepers_ok: 0, sweepers_fail: 0, parries_safe: 0, parries_danger: 0,
            clearances: 0, clearances_last_line: 0, blocked_crosses: 0, interceptions: 0, interceptions_high: 0, interceptions_med: 0, interceptions_low: 0, tackles_won: 0, tackles_lost: 0, blocked_shots: 0, blocked_passes: 0, ball_recoveries: 0, recoveries_high: 0, recoveries_med: 0, recoveries_low: 0, offsides_provoked: 0, challenges_lost: 0,
            errors_leading_to_shot: 0, errors_leading_to_goal: 0,
            passes_completed: 0, passes_attempted: 0, progressive_passes: 0, passes_into_final_third: 0, passes_into_box: 0, through_balls: 0, crosses_completed: 0, crosses_attempted: 0, switch_plays: 0, pull_backs: 0, long_balls_completed: 0, lay_offs: 0, forward_passes: 0, set_pieces_taken: 0, successful_crosses: 0, box_entries: 0,
            takeons_won: 0, takeons_lost: 0, takeons_overrun: 0, good_skills: 0, dispossessed: 0, bad_touches: 0,
            aerials_won: 0, aerials_lost: 0,
            fouls_committed: 0, fouls_won: 0,
            yellow_cards: 0, second_yellow_cards: 0, red_cards: 0,
            fixtures: {
              start_time: f.start_time,
              matchday: f.matchday,
              home_team_id: f.home_team_id,
              away_team_id: f.away_team_id,
              home_score: f.home_score,
              away_score: f.away_score
            }
          } as any))
          allScores = [...allScores, ...unplayedScores]
        }
      }

      if (allScores.length > 0) {
        // Recopilar los ids de equipo de todos los fixtures
        const teamIds = [...new Set(
          allScores.flatMap(s => [s.fixtures?.home_team_id, s.fixtures?.away_team_id])
            .filter(Boolean)
        )] as string[]

        const teamsMap = new Map<string, string>()
        if (teamIds.length > 0) {
          const { data: teamsData } = await supabase
            .from('real_teams')
            .select('id, name')
            .in('id', teamIds)
          teamsData?.forEach(t => teamsMap.set(t.id, t.name))
        }

        const mapped = allScores.map(s => ({
          ...s,
          fixture: s.fixtures ? {
            start_time: s.fixtures.start_time,
            matchday: s.fixtures.matchday,
            home_team: { name: teamsMap.get(s.fixtures.home_team_id) || 'Local' },
            away_team: { name: teamsMap.get(s.fixtures.away_team_id) || 'Visitante' },
            home_score: s.fixtures.home_score,
            away_score: s.fixtures.away_score,
            home_team_id: s.fixtures.home_team_id,
            away_team_id: s.fixtures.away_team_id
          } : undefined
        }))

        // Ordenar por jornada descendente (más reciente primero); fallback a fecha
        mapped.sort((a, b) => {
          const ma = a.fixture?.matchday ?? 0
          const mb = b.fixture?.matchday ?? 0
          if (mb !== ma) return mb - ma
          const ta = a.fixture?.start_time ? new Date(a.fixture.start_time).getTime() : 0
          const tb = b.fixture?.start_time ? new Date(b.fixture.start_time).getTime() : 0
          return tb - ta
        })

        // Obtener todos los jugadores para la comparativa
        const { data: playersList } = await supabase
          .from('players')
          .select('id, short_name, first_name, last_name, position, team_id')
          .order('short_name', { ascending: true })
        if (playersList) {
          setAllPlayers(playersList)
        }

        setScores(mapped)
      }

      setLoading(false)
    }

    fetchJugador()
  }, [params.id])

  useEffect(() => {
    if (compareTarget !== 'media-pos' && compareTarget !== 'media-gen' && compareTarget) {
      const loadCompareData = async () => {
        const p = allPlayers.find(pl => pl.id === compareTarget)
        if (p) {
          setComparePlayer(p)
          const { data } = await supabase
            .from('player_scores')
            .select('*')
            .eq('player_id', p.id)
          if (data) {
            setCompareScores(data)
          }
        }
      }
      loadCompareData()
    } else {
      setComparePlayer(null)
      setCompareScores([])
    }
  }, [compareTarget, allPlayers])

  const getPositionLabel = (position: string) => {
    const posLower = position.toLowerCase()
    if (posLower.includes('goalkeeper') || posLower === 'gk') return 'POR'
    if (posLower.includes('defender') || posLower === 'def') return 'DEF'
    if (posLower.includes('midfielder') || posLower === 'mid') return 'MED'
    if (posLower.includes('forward') || posLower === 'fwd') return 'DEL'
    return 'MED'
  }

  const getPositionColor = (position: string) => {
    const code = getPositionLabel(position)
    const colors: Record<string, string> = {
      POR: 'bg-amber-500 text-white',
      DEF: 'bg-blue-500 text-white',
      MED: 'bg-emerald-500 text-white',
      DEL: 'bg-red-500 text-white',
    }
    return colors[code] || 'bg-slate-500 text-white'
  }

  // Calcular stats acumuladas
  const totalStats = scores.reduce((acc, s) => {
    const n = (v: any) => Number(v) || 0
    return {
      total_points: acc.total_points + n(s.total_points),
      minutes_played: acc.minutes_played + n(s.minutes_played),
      goals: acc.goals + n(s.goals),
      goal_header_bonus: acc.goal_header_bonus + n(s.goal_header_bonus),
      goal_freekick_bonus: acc.goal_freekick_bonus + n(s.goal_freekick_bonus),
      own_goals: acc.own_goals + n(s.own_goals),
      goals_conceded: acc.goals_conceded + n(s.goals_conceded),
      clean_sheets: acc.clean_sheets + (s.clean_sheet ? 1 : 0),
      assists: acc.assists + n(s.assists),
      key_passes: acc.key_passes + n(s.key_passes),
      second_assists: acc.second_assists + n(s.second_assists),
      intent_assists: acc.intent_assists + n(s.intent_assists),
      shots_on_target: acc.shots_on_target + n(s.shots_on_target),
      shots_off_target: acc.shots_off_target + n(s.shots_off_target),
      shots_hit_woodwork: acc.shots_hit_woodwork + n(s.shots_hit_woodwork),
      big_chances_created: acc.big_chances_created + n(s.big_chances_created),
      big_chances_missed: acc.big_chances_missed + n(s.big_chances_missed),
      penalties_scored: acc.penalties_scored + n(s.penalties_scored),
      penalties_missed: acc.penalties_missed + n(s.penalties_missed),
      penalties_won: acc.penalties_won + n(s.penalties_won),
      penalties_conceded: acc.penalties_conceded + n(s.penalties_conceded),
      saves: acc.saves + n(s.saves),
      penalty_saves: acc.penalty_saves + n(s.penalty_saves),
      claims_ok: acc.claims_ok + n(s.claims_ok),
      claims_fail: acc.claims_fail + n(s.claims_fail),
      fumbles: acc.fumbles + n(s.fumbles),
      crosses_not_claimed: acc.crosses_not_claimed + n(s.crosses_not_claimed),
      punches_ok: acc.punches_ok + n(s.punches_ok),
      punches_fail: acc.punches_fail + n(s.punches_fail),
      smothers: acc.smothers + n(s.smothers),
      sweepers_ok: acc.sweepers_ok + n(s.sweepers_ok),
      sweepers_fail: acc.sweepers_fail + n(s.sweepers_fail),
      parries_safe: acc.parries_safe + n(s.parries_safe),
      parries_danger: acc.parries_danger + n(s.parries_danger),
      clearances: acc.clearances + n(s.clearances),
      clearances_last_line: acc.clearances_last_line + n(s.clearances_last_line),
      blocked_crosses: acc.blocked_crosses + n(s.blocked_crosses),
      interceptions: acc.interceptions + n(s.interceptions),
      interceptions_high: acc.interceptions_high + n(s.interceptions_high),
      interceptions_med: acc.interceptions_med + n(s.interceptions_med),
      interceptions_low: acc.interceptions_low + n(s.interceptions_low),
      tackles_won: acc.tackles_won + n(s.tackles_won),
      tackles_lost: acc.tackles_lost + n(s.tackles_lost),
      blocked_shots: acc.blocked_shots + n(s.blocked_shots),
      blocked_passes: acc.blocked_passes + n(s.blocked_passes),
      ball_recoveries: acc.ball_recoveries + n(s.ball_recoveries),
      offsides_provoked: acc.offsides_provoked + n(s.offsides_provoked),
      challenges_lost: acc.challenges_lost + n(s.challenges_lost),
      errors_leading_to_shot: acc.errors_leading_to_shot + n(s.errors_leading_to_shot),
      errors_leading_to_goal: acc.errors_leading_to_goal + n(s.errors_leading_to_goal),
      passes_completed: acc.passes_completed + n(s.passes_completed),
      passes_attempted: acc.passes_attempted + n(s.passes_attempted),
      progressive_passes: acc.progressive_passes + n(s.progressive_passes),
      passes_into_final_third: acc.passes_into_final_third + n(s.passes_into_final_third),
      passes_into_box: acc.passes_into_box + n(s.passes_into_box),
      through_balls: acc.through_balls + n(s.through_balls),
      crosses_completed: acc.crosses_completed + n(s.crosses_completed),
      crosses_attempted: acc.crosses_attempted + n(s.crosses_attempted),
      switch_plays: acc.switch_plays + n(s.switch_plays),
      pull_backs: acc.pull_backs + n(s.pull_backs),
      long_balls_completed: acc.long_balls_completed + n(s.long_balls_completed),
      lay_offs: acc.lay_offs + n(s.lay_offs),
      forward_passes: acc.forward_passes + n(s.forward_passes),
      set_pieces_taken: acc.set_pieces_taken + n(s.set_pieces_taken),
      successful_crosses: acc.successful_crosses + n(s.successful_crosses),
      box_entries: acc.box_entries + n(s.box_entries),
      takeons_won: acc.takeons_won + n(s.takeons_won),
      takeons_lost: acc.takeons_lost + n(s.takeons_lost),
      takeons_overrun: acc.takeons_overrun + n(s.takeons_overrun),
      good_skills: acc.good_skills + n(s.good_skills),
      dispossessed: acc.dispossessed + n(s.dispossessed),
      bad_touches: acc.bad_touches + n(s.bad_touches),
      aerials_won: acc.aerials_won + n(s.aerials_won),
      aerials_lost: acc.aerials_lost + n(s.aerials_lost),
      fouls_committed: acc.fouls_committed + n(s.fouls_committed),
      fouls_won: acc.fouls_won + n(s.fouls_won),
      yellow_cards: acc.yellow_cards + n(s.yellow_cards),
      second_yellow_cards: acc.second_yellow_cards + n(s.second_yellow_cards),
      red_cards: acc.red_cards + n(s.red_cards),
      relevo_points: acc.relevo_points + n(s.relevo_points),
    }
  }, {
    total_points: 0,
    minutes_played: 0,
    goals: 0,
    goal_header_bonus: 0,
    goal_freekick_bonus: 0,
    own_goals: 0,
    goals_conceded: 0,
    clean_sheets: 0,
    assists: 0,
    key_passes: 0,
    second_assists: 0,
    intent_assists: 0,
    shots_on_target: 0,
    shots_off_target: 0,
    shots_hit_woodwork: 0,
    big_chances_created: 0,
    big_chances_missed: 0,
    penalties_scored: 0,
    penalties_missed: 0,
    penalties_won: 0,
    penalties_conceded: 0,
    saves: 0,
    penalty_saves: 0,
    claims_ok: 0,
    claims_fail: 0,
    fumbles: 0,
    crosses_not_claimed: 0,
    punches_ok: 0,
    punches_fail: 0,
    smothers: 0,
    sweepers_ok: 0,
    sweepers_fail: 0,
    parries_safe: 0,
    parries_danger: 0,
    clearances: 0,
    clearances_last_line: 0,
    blocked_crosses: 0,
    interceptions: 0,
    interceptions_high: 0,
    interceptions_med: 0,
    interceptions_low: 0,
    tackles_won: 0,
    tackles_lost: 0,
    blocked_shots: 0,
    blocked_passes: 0,
    ball_recoveries: 0,
    offsides_provoked: 0,
    challenges_lost: 0,
    errors_leading_to_shot: 0,
    errors_leading_to_goal: 0,
    passes_completed: 0,
    passes_attempted: 0,
    progressive_passes: 0,
    passes_into_final_third: 0,
    passes_into_box: 0,
    through_balls: 0,
    crosses_completed: 0,
    crosses_attempted: 0,
    switch_plays: 0,
    pull_backs: 0,
    long_balls_completed: 0,
    lay_offs: 0,
    forward_passes: 0,
    set_pieces_taken: 0,
    successful_crosses: 0,
    box_entries: 0,
    takeons_won: 0,
    takeons_lost: 0,
    takeons_overrun: 0,
    good_skills: 0,
    dispossessed: 0,
    bad_touches: 0,
    aerials_won: 0,
    aerials_lost: 0,
    fouls_committed: 0,
    fouls_won: 0,
    yellow_cards: 0,
    second_yellow_cards: 0,
    red_cards: 0,
    relevo_points: 0,
  } as any)

  const matchesPlayed = scores.length
  const avgPoints = matchesPlayed > 0 ? Math.round((totalStats.total_points / matchesPlayed) * 10) / 10 : 0

  // ============================================================
  // Reglas de puntuación v3.0 - RELEVO (espejo de scoring_rules.json)
  // Deben coincidir EXACTAMENTE con trigger_descarga_eventos.py
  // ============================================================
  type Pos = 'POR' | 'DEF' | 'MED' | 'DEL'

  // Tarifas resueltas desde scoring_config (con fallback a los valores oficiales).
  // Reflejan lo editado en Admin, así que el "× valor" de cada métrica cuadra.
  const SR = resolveRates(scoringRules)
  const r2 = (v: number) => Math.round(v * 100) / 100
  const fmtPts = (v: number): string => String(parseFloat(r2(v).toFixed(2)))

  const normPos = (position?: string): Pos => {
    const p = (position || '').toUpperCase()
    if (p === 'POR' || p === 'DEF' || p === 'MED' || p === 'DEL') return p
    return getPositionLabel(position || '') as Pos
  }

  // Desglose de puntos por BLOQUES (orden oficial RELEVO). Cada fila aporta
  // exactamente los puntos que suma al total_points oficial del motor.
  const getScoreBlocks = (score: PlayerScore): ScoreBlock[] => {
    const pos = normPos(score.position)
    const s = score as PlayerScore & Record<string, number>
    const g = (k: string) => Number(s[k]) || 0
    const u = (count: number, unit: number, label: string): ScoreRow =>
      ({ label, count, unit, points: r2(count * unit) })

    // BLOQUE 1: Participación
    const b1: ScoreRow[] = []
    if (score.minutes_played > 0) {
      const titular = score.minutes_played > SR.participation.minutes_threshold
      b1.push({
        label: titular ? `Participación · +60 min (${score.minutes_played}′)` : `Participación · suplente (${score.minutes_played}′)`,
        count: 0, unit: 0, points: titular ? SR.participation.starter_bonus : SR.participation.substitute_bonus, flat: true,
      })
    }

    // BLOQUE 2: Goles y Asistencias
    const b2: ScoreRow[] = []
    if (score.goals > 0) b2.push(u(score.goals, SR.goal[pos], `Gol (${pos})`))
    if (score.own_goals > 0) b2.push(u(score.own_goals, SR.own_goal, 'Gol en propia'))
    if (score.assists > 0) b2.push(u(score.assists, SR.assist_goal, 'Asistencia de gol'))
    if (score.intent_assists > 0) b2.push(u(score.intent_assists, SR.assist_no_goal, 'Asistencia sin gol'))

    // BLOQUE 3: Defensa y Portería a Cero
    const b3: ScoreRow[] = []
    if (score.clean_sheet) b3.push({ label: `Portería a cero · +60 min (${pos})`, count: 0, unit: 0, points: SR.clean_sheet[pos], flat: true })
    if (score.goals_conceded > 1) b3.push(u(score.goals_conceded, SR.goal_conceded[pos], `Gol encajado (${pos})`))

    // BLOQUE 4: Penaltis
    const b4: ScoreRow[] = []
    if (score.penalties_won > 0) b4.push(u(score.penalties_won, SR.penalty_won[pos], 'Penalti provocado'))
    if (score.penalties_conceded > 0) b4.push(u(score.penalties_conceded, SR.penalty_conceded[pos], 'Penalti cometido'))
    if (score.penalties_missed > 0) b4.push(u(score.penalties_missed, SR.penalty_missed, 'Penalti fallado'))
    if (score.penalty_saves > 0) b4.push(u(score.penalty_saves, SR.penalty_save[pos], 'Penalti parado'))

    // BLOQUE 5: Tarjetas
    const b5: ScoreRow[] = []
    if (score.yellow_cards > 0) b5.push(u(score.yellow_cards, SR.yellow_card, 'Amarilla'))
    if (score.second_yellow_cards > 0) b5.push(u(score.second_yellow_cards, SR.second_yellow_card, 'Doble amarilla'))
    if (score.red_cards > 0) b5.push(u(score.red_cards, SR.red_card, 'Roja directa'))

    // BLOQUE 6: Acciones de portero (sólo la parada puntúa por unidad en v4).
    const b6: ScoreRow[] = []
    if (g('saves') > 0) b6.push(u(g('saves'), SR.per_unit.saves, 'Paradas'))

    // BLOQUE 7: las cuatro métricas que puntúan por unidad en el sistema v4.
    const b7: ScoreRow[] = []
    if (score.clearances > 0) b7.push(u(score.clearances, SR.per_unit.clearances, 'Despejes'))
    if (score.shots_on_target > 0) b7.push(u(score.shots_on_target, SR.per_unit.shots_on_target, 'Tiros a puerta'))
    if (score.takeons_won > 0) b7.push(u(score.takeons_won, SR.per_unit.takeons_won, 'Regates completados'))
    if (g('box_entries') > 0) b7.push(u(g('box_entries'), SR.per_unit.box_entries, 'Balones al área'))

    // BLOQUE 8: Pérdidas
    const b8: ScoreRow[] = []
    const lostBalls = (score.dispossessed || 0) + (score.bad_touches || 0)
    if (lostBalls > 0) b8.push(u(lostBalls, SR.lost_balls, 'Balón perdido'))

    // BLOQUE 9: Puntos RELEVO. Un bloque superado = 1 punto; ninguno = -1.
    // Cada fila detalla qué métrica del bloque se cumplió (o la que más cerca quedó).
    const b9: ScoreRow[] = []
    if (g('minutes_played') > 0) {
      const relevoBlocks = evaluateRelevoBlocks(score as unknown as Record<string, unknown>, pos, SR.relevo_limits)
      for (const blk of relevoBlocks) {
        const hit = blk.metrics.find((m) => m.met)
        const shown = hit ?? blk.metrics[0]
        const fmtVal = (v: number, unit: 'count' | 'pct') =>
          unit === 'pct' ? `${v.toFixed(0)}%` : String(parseFloat(v.toFixed(2)))
        const detail = shown
          ? `${shown.label} ${fmtVal(shown.value, shown.unit)} (mín. ${fmtVal(shown.target, shown.unit)})`
          : ''
        b9.push({
          label: `Bloque ${blk.id} · ${blk.title}${detail ? ` — ${detail}` : ''}`,
          count: 0,
          unit: 0,
          points: blk.points,
          flat: true,
        })
      }
      if (relevoBlocks.every((blk) => blk.points <= 0)) {
        b9.push({ label: 'Ningún bloque superado', count: 0, unit: 0, points: -1, flat: true })
      }
    }

    return [
      { id: 'b1', emoji: '⏱️', title: 'Participación', accent: 'text-slate-600', chip: 'bg-slate-100 text-slate-700', rows: b1 },
      { id: 'b2', emoji: '⚽', title: 'Goles y Asistencias', accent: 'text-red-600', chip: 'bg-red-50 text-red-700', rows: b2 },
      { id: 'b3', emoji: '🛡️', title: 'Defensa y Portería a Cero', accent: 'text-indigo-600', chip: 'bg-indigo-50 text-indigo-700', rows: b3 },
      { id: 'b4', emoji: '🎯', title: 'Penaltis', accent: 'text-fuchsia-600', chip: 'bg-fuchsia-50 text-fuchsia-700', rows: b4 },
      { id: 'b5', emoji: '🟨', title: 'Tarjetas', accent: 'text-amber-600', chip: 'bg-amber-50 text-amber-700', rows: b5 },
      { id: 'b6', emoji: '🧤', title: 'Acciones de Portero', accent: 'text-cyan-600', chip: 'bg-cyan-50 text-cyan-700', rows: b6 },
      { id: 'b7', emoji: '📈', title: 'Bonus en Juego', accent: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700', rows: b7 },
      { id: 'b8', emoji: '📉', title: 'Penalizaciones', accent: 'text-rose-600', chip: 'bg-rose-50 text-rose-700', rows: b8 },
      { id: 'b9', emoji: '⭐', title: 'Puntos RELEVO', accent: 'text-violet-600', chip: 'bg-violet-50 text-violet-700', rows: b9 },
    ].filter(b => b.rows.length > 0)
  }

  // Suma de puntos del desglose (debe cuadrar con total_points salvo redondeo)
  const sumBlockPoints = (score: PlayerScore): number =>
    getScoreBlocks(score).reduce(
      (acc, blk) => acc + blk.rows.reduce((a, row) => a + row.points, 0),
      0
    )

  // Estadísticas informativas (sin puntos directos) para dar detalle completo
  const getInfoStats = (score: PlayerScore): Array<{ label: string; value: number }> => {
    const items: Array<{ label: string; value: number }> = [
      { label: 'Pases intentados', value: score.passes_attempted },
      { label: 'Pases progresivos', value: score.progressive_passes },
      { label: 'Pases hacia adelante', value: score.forward_passes || 0 },
      { label: 'Pases al área', value: score.passes_into_box },
      { label: 'Pases al último tercio', value: score.passes_into_final_third },
      { label: 'Pases al hueco', value: score.through_balls },
      { label: 'Centros completados', value: score.crosses_completed },
      { label: 'Centros intentados', value: score.crosses_attempted || 0 },
      { label: 'Pases clave', value: score.key_passes },
      { label: 'Lanzamientos a balón parado', value: score.set_pieces_taken || 0 },
      { label: 'Segundas asistencias', value: score.second_assists || 0 },
      { label: 'Tiros fuera', value: score.shots_off_target },
      { label: 'Tiros al palo', value: score.shots_hit_woodwork },
      { label: 'Ocasiones creadas', value: score.big_chances_created },
      { label: 'Ocasiones falladas', value: score.big_chances_missed },
      { label: 'Penaltis marcados', value: score.penalties_scored },
      { label: 'Entradas ganadas', value: score.tackles_won },
      { label: 'Entradas fallidas', value: score.tackles_lost || 0 },
      { label: 'Intercepciones', value: score.interceptions },
      { label: 'Tiros bloqueados', value: score.blocked_shots },
      { label: 'Pases bloqueados', value: score.blocked_passes || 0 },
      { label: 'Despejes última línea', value: score.clearances_last_line },
      { label: 'Duelos aéreos ganados', value: score.aerials_won },
      { label: 'Duelos aéreos perdidos', value: score.aerials_lost },
      { label: 'Faltas recibidas', value: score.fouls_won },
      { label: 'Faltas cometidas', value: score.fouls_committed },
      { label: 'Regates ganados', value: score.takeons_won },
      { label: 'Regates fallidos', value: score.takeons_lost },
      { label: 'Malos controles', value: score.bad_touches },
      { label: 'Balones recuperados', value: score.ball_recoveries },
      { label: 'Errores que llevan a tiro', value: score.errors_leading_to_shot || 0 },
      { label: 'Errores que llevan a gol', value: score.errors_leading_to_goal },
    ]
    return items.filter(i => (i.value || 0) > 0)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    })
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando jugador...</div>
  }

  if (!player) {
    return (
      <div className="text-center py-8">
        <h2 className="text-xl font-semibold text-slate-900">Jugador no encontrado</h2>
        <button
          onClick={() => router.back()}
          className="mt-4 text-emerald-600 hover:text-emerald-700"
        >
          ← Volver
        </button>
      </div>
    )
  }

  // ==========================================
  // ==========================================
  // LÓGICA DE RADAR Y COMPARATIVAS
  // ==========================================

  type RadarAxis = {
    label: string
    value: number
    metrics: { label: string; value: number | string }[]
  }

  const calculateRadarStats = (scoresList: PlayerScore[], posCode: string): RadarAxis[] => {
    const n = (v: any) => Number(v) || 0
    const matches = scoresList.length
    const isPOR = posCode.toUpperCase().includes('POR') || posCode.toUpperCase() === 'GK' || posCode.toUpperCase() === 'GOALKEEPER'

    const emptyRadar = (isPor: boolean): RadarAxis[] => {
      if (isPor) {
        return [
          { label: 'Portería', value: 0, metrics: [] },
          { label: 'Defensa (Área)', value: 0, metrics: [] },
          { label: 'Distribución', value: 0, metrics: [] },
          { label: 'Importancia', value: 0, metrics: [] },
          { label: 'Concentración', value: 0, metrics: [] }
        ]
      }
      return [
        { label: 'Defensa', value: 0, metrics: [] },
        { label: 'Ataque', value: 0, metrics: [] },
        { label: 'Finalización', value: 0, metrics: [] },
        { label: 'Importancia', value: 0, metrics: [] },
        { label: 'Balón parado', value: 0, metrics: [] }
      ]
    }

    if (matches === 0) return emptyRadar(isPOR)

    let goals = 0, assists = 0, shots_on_target = 0, passes_completed = 0
    let takeons_won = 0, clean_sheets = 0, interceptions = 0, ball_recoveries = 0
    let clearances = 0, saves = 0, penalty_saves = 0, claims_ok = 0, sweepers_ok = 0
    let minutes_played = 0, starter_count = 0, forward_passes = 0, progressive_passes = 0
    let long_balls_completed = 0, box_entries = 0, set_pieces_taken = 0
    let penalties_scored = 0, smothers = 0, aerials_won = 0

    scoresList.forEach(s => {
      goals += n(s.goals)
      assists += n(s.assists)
      shots_on_target += n(s.shots_on_target)
      passes_completed += n(s.passes_completed)
      takeons_won += n(s.takeons_won)
      clean_sheets += s.clean_sheet ? 1 : 0
      interceptions += n(s.interceptions_high) + n(s.interceptions_med) + n(s.interceptions_low) || n(s.interceptions)
      ball_recoveries += n(s.ball_recoveries)
      clearances += n(s.clearances)
      saves += n(s.saves)
      penalty_saves += n(s.penalty_saves)
      claims_ok += n(s.claims_ok)
      sweepers_ok += n(s.sweepers_ok)
      minutes_played += n(s.minutes_played)
      starter_count += s.is_starter ? 1 : 0
      forward_passes += n(s.forward_passes)
      progressive_passes += n(s.progressive_passes)
      long_balls_completed += n(s.long_balls_completed)
      box_entries += n(s.box_entries)
      set_pieces_taken += n(s.set_pieces_taken)
      penalties_scored += n(s.penalties_scored)
      smothers += n(s.smothers)
      aerials_won += n(s.aerials_won)
    })

    const r2 = (v: number) => Math.round(v * 100) / 100
    const norm = (val: number, maxExpected: number) => Math.round(Math.min(100, Math.max(0, (val / maxExpected) * 100)))

    const p_interceptions = interceptions / matches
    const p_recoveries = ball_recoveries / matches
    const p_aerials = aerials_won / matches
    const p_clearances = clearances / matches
    const p_takeons = takeons_won / matches
    const p_forward = (forward_passes + progressive_passes) / matches
    const p_assists = assists / matches
    const p_passes = passes_completed / matches
    const p_long_balls = long_balls_completed / matches
    const p_box_entries = box_entries / matches
    const p_shots = shots_on_target / matches
    const p_goals = goals / matches
    const p_minutes = minutes_played / (matches * 90)
    const p_starter = starter_count / matches
    const p_set_pieces = set_pieces_taken / matches
    const p_pen_scored = penalties_scored / matches
    const p_saves = saves / matches
    const p_clean_sheets = clean_sheets / matches
    const p_sweepers_claims = (sweepers_ok + claims_ok) / matches
    const p_pen_saves = penalty_saves / matches
    const p_smothers = smothers / matches

    if (!isPOR) {
      const defScore = p_interceptions * 10 + p_recoveries * 5 + p_aerials * 5 + p_clearances * 5
      const atkScore = p_takeons * 8 + p_forward * 1.5 + p_assists * 30 + p_passes * 0.5 + p_long_balls * 2
      const finScore = p_box_entries * 4 + p_shots * 15 + p_goals * 40
      const impScore = p_minutes * 70 + p_starter * 30
      const bpScore = p_set_pieces * 25 + p_pen_scored * 50

      return [
        {
          label: 'Defensa',
          value: norm(defScore, 120),
          metrics: [
            { label: 'Intercepciones p.p.', value: r2(p_interceptions) },
            { label: 'Recuperaciones p.p.', value: r2(p_recoveries) },
            { label: 'Duelos aéreos gan. p.p.', value: r2(p_aerials) },
            { label: 'Despejes p.p.', value: r2(p_clearances) }
          ]
        },
        {
          label: 'Ataque',
          value: norm(atkScore, 116.5),
          metrics: [
            { label: 'Regates p.p.', value: r2(p_takeons) },
            { label: 'Pases adelante p.p.', value: r2(p_forward) },
            { label: 'Asistencias p.p.', value: r2(p_assists) },
            { label: 'Pases completados p.p.', value: r2(p_passes) },
            { label: 'Pases largos p.p.', value: r2(p_long_balls) }
          ]
        },
        {
          label: 'Finalización',
          value: norm(finScore, 66),
          metrics: [
            { label: 'Centros/Área p.p.', value: r2(p_box_entries) },
            { label: 'Tiros a puerta p.p.', value: r2(p_shots) },
            { label: 'Goles p.p.', value: r2(p_goals) }
          ]
        },
        {
          label: 'Importancia',
          value: norm(impScore, 100),
          metrics: [
            { label: 'Minutos p.p.', value: r2(minutes_played / matches) },
            { label: '% Titular', value: r2(p_starter * 100) + '%' }
          ]
        },
        {
          label: 'Balón parado',
          value: norm(bpScore, 100),
          metrics: [
            { label: 'Lanzamientos p.p.', value: r2(p_set_pieces) },
            { label: 'Penaltis marcados p.p.', value: r2(p_pen_scored) }
          ]
        }
      ]
    } else {
      const portScore = p_saves * 15 + p_clean_sheets * 50
      const defScore = p_sweepers_claims * 10 + p_clearances * 5
      const distScore = p_long_balls * 4 + p_passes * 2
      const impScore = p_minutes * 70 + p_starter * 30
      const concScore = p_pen_saves * 300 + p_smothers * 20

      return [
        {
          label: 'Portería',
          value: norm(portScore, 80),
          metrics: [
            { label: 'Paradas p.p.', value: r2(p_saves) },
            { label: 'Porterías a cero p.p.', value: r2(p_clean_sheets) }
          ]
        },
        {
          label: 'Defensa (Área)',
          value: norm(defScore, 50),
          metrics: [
            { label: 'Salidas/Blocajes p.p.', value: r2(p_sweepers_claims) },
            { label: 'Despejes p.p.', value: r2(p_clearances) }
          ]
        },
        {
          label: 'Distribución',
          value: norm(distScore, 80),
          metrics: [
            { label: 'Pases completados p.p.', value: r2(p_passes) },
            { label: 'Pases largos p.p.', value: r2(p_long_balls) }
          ]
        },
        {
          label: 'Importancia',
          value: norm(impScore, 100),
          metrics: [
            { label: 'Minutos p.p.', value: r2(minutes_played / matches) },
            { label: '% Titular', value: r2(p_starter * 100) + '%' }
          ]
        },
        {
          label: 'Concentración',
          value: norm(concScore, 50),
          metrics: [
            { label: 'Penaltis parados p.p.', value: r2(p_pen_saves) },
            { label: 'Anticipaciones p.p.', value: r2(p_smothers) }
          ]
        }
      ]
    }
  }

  const playerRadar = calculateRadarStats(scores, player.position)

  let compareRadar: RadarAxis[] = []
  let compareLabel = ''

  if (compareTarget === 'media-pos') {
    const pos = normPos(player.position)
    compareLabel = `Media Liga (${pos})`
    const isPOR = pos === 'POR'
    if (isPOR) {
      compareRadar = [
        { label: 'Portería', value: 70, metrics: [] },
        { label: 'Defensa (Área)', value: 60, metrics: [] },
        { label: 'Distribución', value: 65, metrics: [] },
        { label: 'Importancia', value: 80, metrics: [] },
        { label: 'Concentración', value: 50, metrics: [] }
      ]
    } else if (pos === 'DEF') {
      compareRadar = [
        { label: 'Defensa', value: 75, metrics: [] },
        { label: 'Ataque', value: 40, metrics: [] },
        { label: 'Finalización', value: 20, metrics: [] },
        { label: 'Importancia', value: 75, metrics: [] },
        { label: 'Balón parado', value: 30, metrics: [] }
      ]
    } else if (pos === 'MED') {
      compareRadar = [
        { label: 'Defensa', value: 60, metrics: [] },
        { label: 'Ataque', value: 70, metrics: [] },
        { label: 'Finalización', value: 50, metrics: [] },
        { label: 'Importancia', value: 75, metrics: [] },
        { label: 'Balón parado', value: 50, metrics: [] }
      ]
    } else {
      compareRadar = [
        { label: 'Defensa', value: 30, metrics: [] },
        { label: 'Ataque', value: 75, metrics: [] },
        { label: 'Finalización', value: 80, metrics: [] },
        { label: 'Importancia', value: 75, metrics: [] },
        { label: 'Balón parado', value: 40, metrics: [] }
      ]
    }
  } else if (compareTarget === 'media-gen') {
    compareLabel = 'Media Liga'
    const isPOR = normPos(player.position) === 'POR'
    if (isPOR) {
      compareRadar = [
        { label: 'Portería', value: 65, metrics: [] },
        { label: 'Defensa (Área)', value: 60, metrics: [] },
        { label: 'Distribución', value: 60, metrics: [] },
        { label: 'Importancia', value: 75, metrics: [] },
        { label: 'Concentración', value: 45, metrics: [] }
      ]
    } else {
      compareRadar = [
        { label: 'Defensa', value: 50, metrics: [] },
        { label: 'Ataque', value: 50, metrics: [] },
        { label: 'Finalización', value: 50, metrics: [] },
        { label: 'Importancia', value: 70, metrics: [] },
        { label: 'Balón parado', value: 40, metrics: [] }
      ]
    }
  } else if (comparePlayer) {
    compareLabel = comparePlayer.short_name || `${comparePlayer.first_name} ${comparePlayer.last_name}`
    compareRadar = calculateRadarStats(compareScores, comparePlayer.position)
  } else {
    compareRadar = playerRadar.map(a => ({ ...a, value: 0 }))
  }

  const getPointsStr = (radar: RadarAxis[]) => {
    const cx = 160
    const cy = 135
    const r = 90
    const angles = [-Math.PI/2, -Math.PI/10, Math.PI/3.33, Math.PI * 0.7, Math.PI * 1.1]
    return radar.map((axis, idx) => {
      const d = (axis.value / 100) * r
      const x = cx + d * Math.cos(angles[idx])
      const y = cy + d * Math.sin(angles[idx])
      return `${x},${y}`
    }).join(' ')
  }

  const p1Points = getPointsStr(playerRadar)
  const p2Points = getPointsStr(compareRadar)

  const radarAngles = [-Math.PI/2, -Math.PI/10, Math.PI/3.33, Math.PI * 0.7, Math.PI * 1.1]
  const p1Values = playerRadar.map(a => a.value)
  const p2Values = compareRadar.map(a => a.value)

  // Preparar grupos de estadísticas para mostrar todas las métricas puntuables
  interface StatItem {
    label: string
    value: number | string
    valNum: number
    color?: string
  }

  interface StatGroup {
    title: string
    icon: string
    colorClass: string
    items: StatItem[]
  }

  const statGroups: StatGroup[] = [
    {
      title: 'Ataque y Distribución',
      icon: '⚽',
      colorClass: 'text-red-600 border-red-100 bg-red-50/30',
      items: [
        { label: 'Goles', value: totalStats.goals, valNum: totalStats.goals },
        { label: 'Goles de cabeza', value: totalStats.goal_header_bonus, valNum: totalStats.goal_header_bonus },
        { label: 'Goles de falta directa', value: totalStats.goal_freekick_bonus, valNum: totalStats.goal_freekick_bonus },
        { label: 'Asistencias de gol', value: totalStats.assists, valNum: totalStats.assists },
        { label: 'Pases clave', value: totalStats.key_passes, valNum: totalStats.key_passes },
        { label: 'Segundas asistencias', value: totalStats.second_assists, valNum: totalStats.second_assists },
        { label: 'Asistencias sin gol (ocasiones creadas)', value: totalStats.intent_assists, valNum: totalStats.intent_assists },
        { label: 'Tiros a puerta', value: totalStats.shots_on_target, valNum: totalStats.shots_on_target },
        { label: 'Tiros fuera', value: totalStats.shots_off_target, valNum: totalStats.shots_off_target },
        { label: 'Tiros al palo', value: totalStats.shots_hit_woodwork, valNum: totalStats.shots_hit_woodwork },
        { label: 'Grandes ocasiones creadas', value: totalStats.big_chances_created, valNum: totalStats.big_chances_created },
        { label: 'Grandes ocasiones falladas', value: totalStats.big_chances_missed, valNum: totalStats.big_chances_missed },
        { label: 'Regates ganados', value: totalStats.takeons_won, valNum: totalStats.takeons_won },
        { label: 'Regates fallados', value: totalStats.takeons_lost, valNum: totalStats.takeons_lost },
        { label: 'Regates desbordados', value: totalStats.takeons_overrun, valNum: totalStats.takeons_overrun },
        { label: 'Habilidades destacadas', value: totalStats.good_skills, valNum: totalStats.good_skills },
        { 
          label: 'Pases completados', 
          value: totalStats.passes_attempted > 0 ? `${totalStats.passes_completed} / ${totalStats.passes_attempted} (${Math.round((totalStats.passes_completed / totalStats.passes_attempted) * 100)}%)` : '0 / 0', 
          valNum: totalStats.passes_attempted 
        },
        { label: 'Pases hacia adelante', value: totalStats.forward_passes, valNum: totalStats.forward_passes },
        { label: 'Pases progresivos', value: totalStats.progressive_passes, valNum: totalStats.progressive_passes },
        { label: 'Pases al último tercio', value: totalStats.passes_into_final_third, valNum: totalStats.passes_into_final_third },
        { label: 'Pases al área', value: totalStats.passes_into_box, valNum: totalStats.passes_into_box },
        { label: 'Pases al hueco (Through balls)', value: totalStats.through_balls, valNum: totalStats.through_balls },
        { 
          label: 'Centros completados', 
          value: totalStats.crosses_attempted > 0 ? `${totalStats.crosses_completed} / ${totalStats.crosses_attempted} (${Math.round((totalStats.crosses_completed / totalStats.crosses_attempted) * 100)}%)` : '0 / 0', 
          valNum: totalStats.crosses_attempted 
        },
        { label: 'Centros exitosos', value: totalStats.successful_crosses, valNum: totalStats.successful_crosses },
        { label: 'Balones colgados al área (entries)', value: totalStats.box_entries, valNum: totalStats.box_entries },
        { label: 'Pases largos completados', value: totalStats.long_balls_completed, valNum: totalStats.long_balls_completed },
        { label: 'Lanzamientos a balón parado', value: totalStats.set_pieces_taken, valNum: totalStats.set_pieces_taken },
        { label: 'Pases en corto (lay offs)', value: totalStats.lay_offs, valNum: totalStats.lay_offs },
      ]
    },
    {
      title: 'Defensa',
      icon: '🛡️',
      colorClass: 'text-indigo-600 border-indigo-100 bg-indigo-50/30',
      items: [
        { label: 'Porterías a cero', value: totalStats.clean_sheets, valNum: totalStats.clean_sheets, color: 'text-emerald-600' },
        { label: 'Goles encajados', value: totalStats.goals_conceded, valNum: totalStats.goals_conceded, color: totalStats.goals_conceded > 0 ? 'text-red-600' : '' },
        { label: 'Entradas ganadas', value: totalStats.tackles_won, valNum: totalStats.tackles_won },
        { label: 'Entradas fallidas', value: totalStats.tackles_lost, valNum: totalStats.tackles_lost },
        { label: 'Interceptaciones', value: totalStats.interceptions, valNum: totalStats.interceptions },
        { label: 'Interceptaciones (Zona alta)', value: totalStats.interceptions_high, valNum: totalStats.interceptions_high },
        { label: 'Recuperaciones de balón', value: totalStats.ball_recoveries, valNum: totalStats.ball_recoveries },
        { label: 'Despejes', value: totalStats.clearances, valNum: totalStats.clearances },
        { label: 'Despejes en última línea', value: totalStats.clearances_last_line, valNum: totalStats.clearances_last_line },
        { label: 'Tiros bloqueados', value: totalStats.blocked_shots, valNum: totalStats.blocked_shots },
        { label: 'Centros bloqueados', value: totalStats.blocked_crosses, valNum: totalStats.blocked_crosses },
        { label: 'Fueras de juego provocados', value: totalStats.offsides_provoked, valNum: totalStats.offsides_provoked },
        { label: 'Duelos aéreos ganados', value: totalStats.aerials_won, valNum: totalStats.aerials_won },
        { label: 'Duelos aéreos perdidos', value: totalStats.aerials_lost, valNum: totalStats.aerials_lost },
        { label: 'Duelos terrestres perdidos (Challenges)', value: totalStats.challenges_lost, valNum: totalStats.challenges_lost },
      ]
    },
    {
      title: 'Portería',
      icon: '🧤',
      colorClass: 'text-cyan-600 border-cyan-100 bg-cyan-50/30',
      items: [
        { label: 'Paradas', value: totalStats.saves, valNum: totalStats.saves },
        { label: 'Penaltis parados', value: totalStats.penalty_saves, valNum: totalStats.penalty_saves },
        { label: 'Blocajes correctos (Claims)', value: totalStats.claims_ok, valNum: totalStats.claims_ok },
        { label: 'Blocajes fallidos', value: totalStats.claims_fail, valNum: totalStats.claims_fail },
        { label: 'Despejes de puños correctos', value: totalStats.punches_ok, valNum: totalStats.punches_ok },
        { label: 'Despejes de puños fallidos', value: totalStats.punches_fail, valNum: totalStats.punches_fail },
        { label: 'Salidas de área correctas', value: totalStats.sweepers_ok, valNum: totalStats.sweepers_ok },
        { label: 'Salidas de área fallidas', value: totalStats.sweepers_fail, valNum: totalStats.sweepers_fail },
        { label: 'Anticipaciones por bajo (Smothers)', value: totalStats.smothers, valNum: totalStats.smothers },
        { label: 'Paradas seguras (Parries safe)', value: totalStats.parries_safe, valNum: totalStats.parries_safe },
        { label: 'Paradas con peligro (Parries danger)', value: totalStats.parries_danger, valNum: totalStats.parries_danger },
        { label: 'Fumbles (Pérdidas de control)', value: totalStats.fumbles, valNum: totalStats.fumbles },
        { label: 'Centros no cortados', value: totalStats.crosses_not_claimed, valNum: totalStats.crosses_not_claimed },
      ]
    },
    {
      title: 'Penaltis, Disciplina y Penalizaciones',
      icon: '🟨',
      colorClass: 'text-amber-600 border-amber-100 bg-amber-50/30',
      items: [
        { label: 'Penaltis provocados', value: totalStats.penalties_won, valNum: totalStats.penalties_won },
        { label: 'Penaltis cometidos', value: totalStats.penalties_conceded, valNum: totalStats.penalties_conceded, color: totalStats.penalties_conceded > 0 ? 'text-red-600' : '' },
        { label: 'Penaltis fallados', value: totalStats.penalties_missed, valNum: totalStats.penalties_missed, color: totalStats.penalties_missed > 0 ? 'text-red-600' : '' },
        { label: 'Faltas cometidas', value: totalStats.fouls_committed, valNum: totalStats.fouls_committed },
        { label: 'Faltas recibidas', value: totalStats.fouls_won, valNum: totalStats.fouls_won },
        { label: 'Tarjetas amarillas', value: totalStats.yellow_cards, valNum: totalStats.yellow_cards, color: 'text-amber-600' },
        { label: 'Dobles amarillas', value: totalStats.second_yellow_cards, valNum: totalStats.second_yellow_cards, color: 'text-amber-600' },
        { label: 'Tarjetas rojas', value: totalStats.red_cards, valNum: totalStats.red_cards, color: 'text-red-600' },
        { label: 'Balones perdidos (Desposeído)', value: totalStats.dispossessed, valNum: totalStats.dispossessed },
        { label: 'Malos controles de balón', value: totalStats.bad_touches, valNum: totalStats.bad_touches },
        { label: 'Balones perdidos (Total)', value: totalStats.dispossessed + totalStats.bad_touches, valNum: totalStats.dispossessed + totalStats.bad_touches },
        { label: 'Errores que llevan a tiro', value: totalStats.errors_leading_to_shot, valNum: totalStats.errors_leading_to_shot, color: totalStats.errors_leading_to_shot > 0 ? 'text-red-600' : '' },
        { label: 'Errores que llevan a gol', value: totalStats.errors_leading_to_goal, valNum: totalStats.errors_leading_to_goal, color: totalStats.errors_leading_to_goal > 0 ? 'text-red-600' : '' },
        { label: 'Puntos RELEVO acumulados', value: totalStats.relevo_points, valNum: totalStats.relevo_points, color: 'text-violet-600' },
      ]
    }
  ]

  // Configuración de la gráfica de evolución
  const chartMetrics = [
    { key: 'puntos', label: 'Puntos', icon: '⭐' },
    { key: 'minutos', label: 'Minutos', icon: '⏱️' },
    { key: 'goles', label: 'Goles', icon: '⚽' },
    { key: 'asistencias', label: 'Asistencias', icon: '🅰️' },
    { key: 'tiros', label: 'Tiros a puerta', icon: '🎯' },
    { key: 'pases', label: 'Pases comp.', icon: '📈' },
    { key: 'regates', label: 'Regates gan.', icon: '👟' },
    { key: 'despejes', label: 'Despejes', icon: '🛡️' },
    { key: 'recuperaciones', label: 'Recup.', icon: '🔄' },
    { key: 'interceptaciones', label: 'Interc.', icon: '🛑' },
    { key: 'paradas', label: 'Paradas', icon: '🧤' },
    { key: 'perdidas', label: 'Pérdidas', icon: '📉' },
  ]

  const getMetricValue = (score: PlayerScore, key: string): number => {
    const n = (val: any) => Number(val) || 0
    switch (key) {
      case 'puntos':
        return Math.round((score.total_points || 0) * 10) / 10
      case 'minutos':
        return n(score.minutes_played)
      case 'goles':
        return n(score.goals)
      case 'asistencias':
        return n(score.assists)
      case 'tiros':
        return n(score.shots_on_target)
      case 'pases':
        return n(score.passes_completed)
      case 'regates':
        return n(score.takeons_won)
      case 'despejes':
        return n(score.clearances)
      case 'recuperaciones':
        return n(score.ball_recoveries)
      case 'interceptaciones':
        return n(score.interceptions_high) + n(score.interceptions_med) + n(score.interceptions_low) || n(score.interceptions)
      case 'paradas':
        return n(score.saves)
      case 'perdidas':
        return n(score.dispossessed) + n(score.bad_touches)
      default:
        return 0
    }
  }

  const chronologicalScores = [...scores].reverse()

  const chartData = chronologicalScores.map(score => ({
    matchday: score.fixture?.matchday ?? 0,
    opponent: score.fixture?.home_team_id === player.team_id 
      ? score.fixture?.away_team?.name || 'Visitante'
      : score.fixture?.home_team?.name || 'Local',
    isHome: score.fixture?.home_team_id === player.team_id,
    homeScore: score.fixture?.home_score,
    awayScore: score.fixture?.away_score,
    value: getMetricValue(score, selectedMetric),
    score: score
  }))

  const selectedMetricConfig = chartMetrics.find(m => m.key === selectedMetric) || chartMetrics[0]

  // Configuración SVG de la gráfica
  const chartValues = chartData.map(d => d.value)
  let maxVal = Math.max(...chartValues, 0)
  let minVal = Math.min(...chartValues, 0)

  if (maxVal === 0 && minVal === 0) {
    maxVal = 10
    minVal = 0
  }

  const paddingVal = (maxVal - minVal) * 0.1 || 1
  const scaleMax = maxVal + paddingVal
  const scaleMin = minVal - paddingVal
  const range = scaleMax - scaleMin

  const svgW = 800
  const svgH = 240
  const marginT = 20
  const marginB = 40
  const marginL = 50
  const marginR = 20
  const graphW = svgW - marginL - marginR
  const graphH = svgH - marginT - marginB

  const getSvgY = (val: number) => {
    const pct = (val - scaleMin) / range
    return marginT + (1 - pct) * graphH
  }

  const baselineY = getSvgY(0)

  const tickCount = 4
  const ticks = []
  for (let i = 0; i < tickCount; i++) {
    ticks.push(scaleMin + (i * range) / (tickCount - 1))
  }

  const barCount = chartData.length
  const barAreaW = graphW / Math.max(1, barCount)
  const barGap = Math.max(4, barAreaW * 0.15)
  const barW = Math.max(8, barAreaW - barGap)

  return (
    <div className="space-y-6">
      {/* Botón volver */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a jugadores
      </button>

      {/* Cabecera del jugador */}
      <Card className="!bg-slate-800 border-slate-700">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left gap-4 sm:gap-6">
            {player.photo ? (
              <img
                src={player.photo}
                alt={player.short_name || ''}
                className="w-32 h-32 sm:w-48 sm:h-48 object-contain shrink-0 drop-shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-slate-700 flex items-center justify-center text-4xl font-bold text-slate-400 border-4 border-slate-600 shrink-0">
                {player.shirt_number || '?'}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center justify-center sm:justify-start gap-3 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                  {player.first_name} {player.last_name}
                </h1>
                <Badge className={getPositionColor(player.position)}>
                  {getPositionLabel(player.position)}
                </Badge>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-4 text-slate-300">
                {player.team?.logo_url && (
                  <img src={player.team.logo_url} alt={player.team.name} className="w-6 h-6 object-contain" />
                )}
                <span className="font-medium">{player.team?.name || 'Sin equipo'}</span>
                {player.shirt_number && (
                  <span 
                    className="font-black text-white/95 text-3xl sm:text-4xl leading-none ml-2"
                    style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.9), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }}
                  >
                    {player.shirt_number}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-4 text-sm text-slate-400">
                {player.nationality && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {player.nationality}
                  </div>
                )}
                {player.date_of_birth && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(player.date_of_birth).toLocaleDateString('es-ES')}
                  </div>
                )}
                {player.height && <span>{player.height} cm</span>}
                {player.weight && <span>{player.weight} kg</span>}
                {player.foot && <span>Pie: {player.foot.toUpperCase()}</span>}
              </div>
            </div>
            <div className="text-center sm:text-right shrink-0">
              <div className="text-4xl sm:text-5xl font-bold text-emerald-400">{player.precio ? `${player.precio}M` : '-'}</div>
              <p className="text-slate-400 text-sm">Precio</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats acumuladas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="!bg-emerald-50 border-emerald-100">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
            <p className="text-emerald-800 text-sm font-semibold">Puntos Totales</p>
            <p className="text-4xl font-bold text-emerald-600">{Math.round((totalStats.total_points || 0) * 10) / 10}</p>
            <p className="text-emerald-600 text-xs mt-1">Media: {avgPoints} pts</p>
          </CardContent>
        </Card>
        <Card className="!bg-slate-50 border-slate-100">
          <CardContent className="p-4 text-center">
            <Calendar className="w-6 h-6 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-600 text-sm font-semibold">Partidos</p>
            <p className="text-4xl font-bold text-slate-800">{matchesPlayed}</p>
          </CardContent>
        </Card>
        <Card className="!bg-slate-50 border-slate-100">
          <CardContent className="p-4 text-center">
            <Clock className="w-6 h-6 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-600 text-sm font-semibold">Minutos</p>
            <p className="text-4xl font-bold text-slate-800">{totalStats.minutes_played}'</p>
          </CardContent>
        </Card>
        <Card className="!bg-slate-50 border-slate-100">
          <CardContent className="p-4 text-center">
            <Goal className="w-6 h-6 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-600 text-sm font-semibold">Goles</p>
            <p className="text-4xl font-bold text-slate-800">{totalStats.goals}</p>
          </CardContent>
        </Card>
        <Card className="!bg-slate-50 border-slate-100">
          <CardContent className="p-4 text-center">
            <span className="text-2xl">🅰️</span>
            <p className="text-slate-600 text-sm font-semibold">Asistencias</p>
            <p className="text-4xl font-bold text-slate-800">{totalStats.assists}</p>
          </CardContent>
        </Card>
      </div>

      {/* Selector y Contenedor de Stats Detalladas */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-2">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            📊 Estadísticas Detalladas Acumuladas
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-violet-500 font-semibold bg-violet-50 px-2 py-1 rounded-full border border-violet-100">
              ⚡ /90 min junto a cada valor
            </span>
            <button
              onClick={() => setHideZeros(!hideZeros)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-colors shadow-sm cursor-pointer"
            >
              {hideZeros ? '✨ Mostrar métricas en cero' : '🙈 Ocultar métricas en cero'}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {statGroups.map((group, gIdx) => {
            const minutesPer90 = totalStats.minutes_played > 0 ? totalStats.minutes_played / 90 : null

            const visibleItems = hideZeros
              ? group.items.filter(item => item.valNum > 0)
              : group.items

            if (visibleItems.length === 0) return null

            return (
              <Card key={gIdx} className="overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className={`px-4 py-3 border-b flex items-center gap-2.5 ${group.colorClass}`}>
                  <span className="text-xl leading-none">{group.icon}</span>
                  <h3 className="font-bold text-slate-800 text-base">{group.title}</h3>
                </div>
                <CardContent className="p-4 divide-y divide-slate-100">
                  {visibleItems.map((item, idx) => {
                    const per90Val = minutesPer90 && typeof item.valNum === 'number'
                      ? Math.round((item.valNum / minutesPer90) * 100) / 100
                      : null
                    return (
                      <div key={idx} className="flex justify-between items-center py-2.5 text-sm hover:bg-slate-50/50 px-2 -mx-2 rounded transition-colors duration-150">
                        <span className="text-slate-600 font-medium">{item.label}</span>
                        <div className="flex items-center gap-3">
                          {per90Val !== null && (
                            <span className="text-[11px] text-violet-500 font-semibold tabular-nums bg-violet-50 px-1.5 py-0.5 rounded">
                              {per90Val}/90
                            </span>
                          )}
                          <span className={`font-bold tabular-nums ${item.color || 'text-slate-800'}`}>
                            {item.value}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )
          })}

          {/* Tarjeta de Gráfico de Radar de Comparativa */}
          <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="px-4 py-3 border-b flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-xl leading-none">🕸️</span>
                <h3 className="font-bold text-slate-800 text-base">Comparativa de Rendimiento</h3>
              </div>
              <select
                value={compareTarget}
                onChange={(e) => setCompareTarget(e.target.value)}
                className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate-500 max-w-[150px] truncate"
              >
                <option value="media-pos">Media Posición</option>
                <option value="media-gen">Media Liga</option>
                {allPlayers.length > 0 && (
                  <optgroup label="Comparar con jugador">
                    {allPlayers
                      .filter(p => p.id !== player.id)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.short_name || `${p.first_name} ${p.last_name}`} ({getPositionLabel(p.position)})
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>
            <CardContent className="p-4 flex flex-col items-center relative">
              {activeRadarAxis !== null && (
                <div 
                  className="absolute z-10 bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs flex flex-col gap-1 pointer-events-none transition-all duration-150 min-w-[160px]"
                  style={{
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div className="font-bold text-emerald-400 border-b border-slate-700 pb-1 mb-1 text-sm text-center">
                    {playerRadar[activeRadarAxis]?.label}
                  </div>
                  {playerRadar[activeRadarAxis]?.metrics.map((m, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span className="text-slate-400">{m.label}</span>
                      <span className="font-bold text-slate-100">{m.value}</span>
                    </div>
                  ))}
                  <div className="text-[10px] text-slate-500 italic mt-1 text-center border-t border-slate-800 pt-1">
                    Valor eje: {playerRadar[activeRadarAxis]?.value}/100
                  </div>
                </div>
              )}

              <div className="w-full flex justify-center py-2">
                <svg width="320" height="280" viewBox="0 0 320 280" className="overflow-visible">
                  {/* Concentric grids at 25, 50, 75, 100 */}
                  {[25, 50, 75, 100].map((pct) => {
                    const d = (pct / 100) * 90
                    const points = radarAngles.map(angle => {
                      return `${160 + d * Math.cos(angle)},${135 + d * Math.sin(angle)}`
                    }).join(' ')
                    return (
                      <polygon
                        key={pct}
                        points={points}
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="1"
                        strokeDasharray={pct === 100 ? "0" : "2 2"}
                      />
                    )
                  })}

                  {/* Axis lines */}
                  {radarAngles.map((angle, idx) => {
                    const x2 = 160 + 90 * Math.cos(angle)
                    const y2 = 135 + 90 * Math.sin(angle)
                    return (
                      <line
                        key={idx}
                        x1={160}
                        y1={135}
                        x2={x2}
                        y2={y2}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                    )
                  })}

                  {/* Axis Labels */}
                  {radarAngles.map((angle, idx) => {
                    const d = 110
                    let x = 160 + d * Math.cos(angle)
                    let y = 135 + d * Math.sin(angle)
                    let textAnchor: "start" | "end" | "middle" = "middle"
                    if (Math.abs(Math.cos(angle)) > 0.1) {
                      textAnchor = Math.cos(angle) > 0 ? "start" : "end"
                    }
                    if (Math.sin(angle) > 0) y += 5
                    
                    return (
                      <text 
                        key={idx} 
                        x={x} 
                        y={y} 
                        textAnchor={textAnchor} 
                        className="text-[10px] font-bold fill-slate-500 cursor-pointer hover:fill-emerald-600 transition-colors"
                        onMouseEnter={() => setActiveRadarAxis(idx)}
                        onMouseLeave={() => setActiveRadarAxis(null)}
                      >
                        {playerRadar[idx]?.label}
                      </text>
                    )
                  })}

                  {/* Target polygon (P2) */}
                  <polygon
                    points={p2Points}
                    fill="rgba(249, 115, 22, 0.15)"
                    stroke="rgba(249, 115, 22, 0.75)"
                    strokeWidth="2"
                    className="transition-all duration-300"
                  />

                  {/* Player polygon (P1) */}
                  <polygon
                    points={p1Points}
                    fill="rgba(16, 185, 129, 0.25)"
                    stroke="rgba(16, 185, 129, 0.85)"
                    strokeWidth="2.5"
                    className="transition-all duration-300 pointer-events-none"
                  />

                  {/* Vertex circles for P2 */}
                  {p2Values.map((val, idx) => {
                    const angle = radarAngles[idx]
                    const d = (val / 100) * 90
                    const x = 160 + d * Math.cos(angle)
                    const y = 135 + d * Math.sin(angle)
                    return (
                      <circle
                        key={`p2-${idx}`}
                        cx={x}
                        cy={y}
                        r="3"
                        className="fill-orange-500 stroke-white stroke-[1.5]"
                      />
                    )
                  })}

                  {/* Vertex circles for P1 (Interactive) */}
                  {p1Values.map((val, idx) => {
                    const angle = radarAngles[idx]
                    const d = (val / 100) * 90
                    const x = 160 + d * Math.cos(angle)
                    const y = 135 + d * Math.sin(angle)
                    return (
                      <circle
                        key={`p1-${idx}`}
                        cx={x}
                        cy={y}
                        r="5"
                        className="fill-emerald-500 stroke-white stroke-[2] cursor-pointer transition-all hover:r-6"
                        onMouseEnter={() => setActiveRadarAxis(idx)}
                        onMouseLeave={() => setActiveRadarAxis(null)}
                      />
                    )
                  })}
                </svg>
              </div>

              {/* Leyenda comparativa con números */}
              <div className="w-full grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 mt-1 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate max-w-[120px]">{player.short_name || player.first_name}</span>
                  </div>
                  <div className="pl-3.5 text-slate-500 space-y-0.5 font-medium">
                    {playerRadar.map((axis, i) => (
                      <div key={i} className="flex justify-between gap-1">
                        <span className="truncate">{axis.label}:</span> 
                        <span className="font-bold text-slate-700 tabular-nums shrink-0">{axis.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-orange-600">
                    <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                    <span className="truncate max-w-[120px]">{compareLabel}</span>
                  </div>
                  <div className="pl-3.5 text-slate-500 space-y-0.5 font-medium">
                    {compareRadar.map((axis, i) => (
                      <div key={i} className="flex justify-between gap-1">
                        <span className="truncate">{axis.label}:</span> 
                        <span className="font-bold text-slate-700 tabular-nums shrink-0">{axis.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Gráfica de Evolución por Jornadas */}
      <Card className="overflow-hidden border border-slate-200 bg-white shadow-md">
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">📈 Evolución del Rendimiento</h3>
              <p className="text-xs text-slate-500 mt-0.5">Elige una métrica para visualizar su evolución jornada a jornada</p>
            </div>
            {/* Selector de Métrica */}
            <div className="relative shrink-0 w-full sm:w-56">
              <select
                value={selectedMetric}
                onChange={(e) => {
                  setSelectedMetric(e.target.value)
                  setActiveBar(null)
                }}
                className="w-full pl-4 pr-10 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all duration-200 cursor-pointer shadow-sm appearance-none"
              >
                {chartMetrics.map(m => (
                  <option key={m.key} value={m.key}>
                    {m.icon} {m.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="text-slate-500 text-center py-12">
              No hay datos de evolución para este jugador.
            </div>
          ) : (
            <div className="relative w-full">
              {/* Tooltip flotante HTML */}
              {activeBar !== null && chartData[activeBar] && (
                <div
                  className="absolute z-10 bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs flex flex-col gap-1 pointer-events-none transition-all duration-150"
                  style={{
                    left: `${(activeBar * barAreaW + marginL + barAreaW / 2) / svgW * 100}%`,
                    bottom: '85%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div className="font-bold text-emerald-400">Jornada {chartData[activeBar].matchday}</div>
                  <div className="font-semibold text-slate-200">
                    {chartData[activeBar].isHome ? 'Casa' : 'Fuera'} vs {chartData[activeBar].opponent}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Resultado: {chartData[activeBar].homeScore !== undefined && chartData[activeBar].awayScore !== undefined 
                      ? `${chartData[activeBar].homeScore} - ${chartData[activeBar].awayScore}` 
                      : 'N/D'}
                  </div>
                  <div className="flex justify-between gap-4 mt-1 border-t border-slate-800 pt-1">
                    <span className="capitalize">{selectedMetricConfig.label}:</span>
                    <span className="font-bold text-emerald-300">{chartData[activeBar].value}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 italic">
                    {chartData[activeBar].score.minutes_played > 0 
                      ? `${chartData[activeBar].score.minutes_played}' min · ${chartData[activeBar].score.is_starter ? 'Titular' : 'Suplente'}` 
                      : <span className="text-red-500 font-bold">Sin minutos</span>}
                  </div>
                </div>
              )}

              {/* Área SVG responsiva */}
              <div className="w-full overflow-hidden">
                <svg width="100%" height="100%" viewBox={`0 0 ${svgW} ${svgH}`} className="overflow-visible">
                  <defs>
                    <linearGradient id="grad-puntos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="1" />
                      <stop offset="100%" stopColor="#059669" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-puntos-neg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="1" />
                      <stop offset="100%" stopColor="#be123c" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-minutos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity="1" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-goles" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity="1" />
                      <stop offset="100%" stopColor="#dc2626" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-asistencias" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity="1" />
                      <stop offset="100%" stopColor="#d97706" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-tiros" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c084fc" stopOpacity="1" />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-pases" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity="1" />
                      <stop offset="100%" stopColor="#0891b2" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-regates" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f472b6" stopOpacity="1" />
                      <stop offset="100%" stopColor="#db2777" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-despejes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#94a3b8" stopOpacity="1" />
                      <stop offset="100%" stopColor="#475569" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-recuperaciones" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4ade80" stopOpacity="1" />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-interceptaciones" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2dd4bf" stopOpacity="1" />
                      <stop offset="100%" stopColor="#0d9488" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-paradas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity="1" />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="grad-perdidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb7185" stopOpacity="1" />
                      <stop offset="100%" stopColor="#e11d48" stopOpacity="1" />
                    </linearGradient>
                  </defs>

                  {/* Rejilla de fondo y Ticks del eje Y */}
                  {ticks.map((tick, idx) => {
                    const yVal = getSvgY(tick)
                    return (
                      <g key={idx} className="opacity-20">
                        <line
                          x1={marginL}
                          y1={yVal}
                          x2={svgW - marginR}
                          y2={yVal}
                          stroke="#94a3b8"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <text
                          x={marginL - 10}
                          y={yVal + 4}
                          textAnchor="end"
                          className="text-[10px] font-bold fill-slate-500 tabular-nums"
                        >
                          {Math.round(tick * 10) / 10}
                        </text>
                      </g>
                    )
                  })}

                  {/* Eje Base Horizontal (Y=0) */}
                  {scaleMin < 0 && scaleMax > 0 && (
                    <line
                      x1={marginL}
                      y1={baselineY}
                      x2={svgW - marginR}
                      y2={baselineY}
                      stroke="#475569"
                      strokeWidth="1.5"
                      className="opacity-40"
                    />
                  )}

                  {/* Barras verticales */}
                  {chartData.map((d, i) => {
                    const xPos = marginL + i * barAreaW + (barAreaW - barW) / 2
                    const val = d.value
                    const yPos = val >= 0 ? getSvgY(val) : baselineY
                    let height = val >= 0 ? baselineY - yPos : getSvgY(val) - baselineY

                    if (val !== 0 && height < 2) height = 2 // Altura mínima para visibilidad

                    // Esquinas redondeadas personalizadas según signo de la métrica
                    const rSize = Math.min(6, height, barW / 2)
                    let pathD = ''
                    if (val >= 0) {
                      pathD = `M ${xPos} ${baselineY} 
                               L ${xPos} ${yPos + rSize} 
                               Q ${xPos} ${yPos} ${xPos + rSize} ${yPos} 
                               L ${xPos + barW - rSize} ${yPos} 
                               Q ${xPos + barW} ${yPos} ${xPos + barW} ${yPos + rSize} 
                               L ${xPos + barW} ${baselineY} 
                               Z`
                    } else {
                      pathD = `M ${xPos} ${baselineY} 
                               L ${xPos + barW} ${baselineY} 
                               L ${xPos + barW} ${yPos + height - rSize} 
                               Q ${xPos + barW} ${yPos + height} ${xPos + barW - rSize} ${yPos + height} 
                               L ${xPos + rSize} ${yPos + height} 
                               Q ${xPos} ${yPos + height} ${xPos} ${yPos + height - rSize} 
                               L ${xPos} ${baselineY} 
                               Z`
                    }

                    const fillUrl = (selectedMetric === 'puntos' && val < 0)
                      ? 'url(#grad-puntos-neg)'
                      : `url(#grad-${selectedMetric})`

                    return (
                      <g key={i}>
                        {/* Barra interactiva */}
                        {val !== 0 ? (
                          <path
                            d={pathD}
                            fill={fillUrl}
                            className="transition-all duration-300 cursor-pointer"
                            style={{
                              filter: activeBar === i ? 'drop-shadow(0px 2px 8px rgba(0, 0, 0, 0.15))' : 'none',
                              opacity: activeBar !== null && activeBar !== i ? 0.35 : 1
                            }}
                            onMouseEnter={() => setActiveBar(i)}
                            onMouseLeave={() => setActiveBar(null)}
                          />
                        ) : (
                          // Indicador de valor cero (pequeño punto en la base)
                          <circle
                            cx={xPos + barW / 2}
                            cy={baselineY}
                            r="3"
                            className="fill-slate-300 hover:fill-slate-500 cursor-pointer transition-colors duration-150"
                            style={{
                              opacity: activeBar !== null && activeBar !== i ? 0.35 : 1
                            }}
                            onMouseEnter={() => setActiveBar(i)}
                            onMouseLeave={() => setActiveBar(null)}
                          />
                        )}
                        {/* Línea invisible más ancha para facilitar el hover en móviles */}
                        <rect
                          x={marginL + i * barAreaW}
                          y={marginT}
                          width={barAreaW}
                          height={graphH}
                          fill="transparent"
                          className="cursor-pointer"
                          onMouseEnter={() => setActiveBar(i)}
                          onMouseLeave={() => setActiveBar(null)}
                        />
                      </g>
                    )
                  })}

                  {/* Eje X (Línea base inferior) */}
                  <line
                    x1={marginL}
                    y1={svgH - marginB}
                    x2={svgW - marginR}
                    y2={svgH - marginB}
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                  />

                  {/* Etiquetas del eje X (Jornadas) */}
                  {chartData.map((d, i) => {
                    const xPos = marginL + i * barAreaW + barAreaW / 2
                    const showLabel = barCount < 20 || i % 2 === 0
                    if (!showLabel) return null
                    return (
                      <text
                        key={i}
                        x={xPos}
                        y={svgH - 18}
                        textAnchor="middle"
                        className="text-[10px] font-bold fill-slate-400"
                      >
                        J.{d.matchday}
                      </text>
                    )
                  })}
                </svg>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rendimiento por partido */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Repaso por Jornadas</h3>
          {scores.length === 0 ? (
            <p className="text-slate-500 text-center py-6">
              Todavía no hay datos de rendimiento para este jugador.
            </p>
          ) : (
          <div className="space-y-2">
            {scores.map((score) => (
              <div
                key={score.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                onClick={() => setSelectedMatch(score)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${score.is_starter ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {score.fixture?.matchday !== undefined && score.fixture?.matchday !== null && (
                    <div className="flex flex-col items-center justify-center w-11 shrink-0">
                      <span className="text-[10px] uppercase text-slate-400 leading-none">Jor.</span>
                      <span className="text-lg font-bold text-slate-700 leading-none">{score.fixture.matchday}</span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-slate-900">
                      {score.fixture?.home_team?.name || 'Local'} vs {score.fixture?.away_team?.name || 'Visitante'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {score.fixture?.start_time ? formatDate(score.fixture.start_time) : '-'}
                      {score.fixture?.home_score !== undefined && score.fixture?.away_score !== undefined && (
                        <span className="ml-2 font-semibold">
                          {score.fixture.home_score} - {score.fixture.away_score}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-emerald-600">{Math.round((score.total_points || 0) * 10) / 10}</p>
                  <p className="text-xs text-slate-500">
                    {score.minutes_played > 0 ? `${score.minutes_played}' ${score.is_starter ? '(T)' : '(S)'}` : <span className="text-red-500 font-semibold">Sin minutos</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de detalle de partido */}
      {selectedMatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedMatch(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 p-6 flex justify-between items-start">
              <div>
                {selectedMatch.fixture?.matchday !== undefined && selectedMatch.fixture?.matchday !== null && (
                  <span className="inline-block mb-1 text-xs font-semibold uppercase text-emerald-600">
                    Jornada {selectedMatch.fixture.matchday}
                  </span>
                )}
                <h2 className="text-xl font-bold text-slate-900">
                  {selectedMatch.fixture?.home_team?.name || 'Local'} vs {selectedMatch.fixture?.away_team?.name || 'Visitante'}
                </h2>
                <p className="text-sm text-slate-600">
                  {selectedMatch.fixture?.start_time ? new Date(selectedMatch.fixture.start_time).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                  }) : '-'}
                  {selectedMatch.fixture?.home_score !== undefined && (
                    <span className="ml-2 font-bold">
                      {selectedMatch.fixture.home_score} - {selectedMatch.fixture.away_score}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelectedMatch(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumen */}
            <div className="p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 bg-slate-50">
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-600">{Math.round((selectedMatch.total_points || 0) * 10) / 10}</p>
                <p className="text-xs text-slate-600">Puntos</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-800">{selectedMatch.minutes_played}'</p>
                <p className="text-xs text-slate-600">Minutos</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-800">{selectedMatch.goals}</p>
                <p className="text-xs text-slate-600">Goles</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-800">{selectedMatch.assists}</p>
                <p className="text-xs text-slate-600">Asistencias</p>
              </div>
            </div>

            {/* Desglose de puntos por bloques */}
            <div className="p-4 sm:p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Puntos por bloques</h3>

              {getScoreBlocks(selectedMatch).length === 0 && (
                <p className="text-slate-500 text-center py-4">
                  Sin métricas puntuables en este partido.
                </p>
              )}

              {getScoreBlocks(selectedMatch).map((blk) => {
                const subtotal = r2(blk.rows.reduce((acc, row) => acc + row.points, 0))
                return (
                  <div key={blk.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-lg leading-none">{blk.emoji}</span>
                        <h4 className={`font-bold text-sm ${blk.accent}`}>{blk.title}</h4>
                      </div>
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${subtotal >= 0 ? blk.chip : 'bg-red-50 text-red-700'}`}>
                        {subtotal >= 0 ? '+' : ''}{fmtPts(subtotal)}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {blk.rows.map((row, idx) => (
                        <div key={idx} className="flex items-center justify-between px-4 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{row.label}</p>
                            {!row.flat && (
                              <p className="text-xs text-slate-400">
                                {row.count} × {row.unit >= 0 ? '+' : ''}{fmtPts(row.unit)}
                              </p>
                            )}
                          </div>
                          <span className={`shrink-0 text-sm font-bold tabular-nums ${row.points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {row.points >= 0 ? '+' : ''}{fmtPts(row.points)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Ajuste de redondeo + total oficial */}
              {(() => {
                const desglose = sumBlockPoints(selectedMatch)
                const oficial = Math.round((selectedMatch.total_points || 0) * 10) / 10
                const ajuste = r2(oficial - desglose)
                return (
                  <>
                    {ajuste !== 0 && (
                      <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-sm text-slate-500">Ajuste / redondeo</span>
                        <span className={`text-sm font-semibold ${ajuste >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {ajuste >= 0 ? '+' : ''}{fmtPts(ajuste)}
                        </span>
                      </div>
                    )}
                    <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-4 flex items-center justify-between shadow-md">
                      <span className="text-white font-bold text-lg">Puntos totales</span>
                      <span className="text-white font-extrabold text-3xl tabular-nums">{fmtPts(oficial)}</span>
                    </div>
                  </>
                )
              })()}

              {/* Estadísticas informativas (no puntúan directamente) */}
              {getInfoStats(selectedMatch).length > 0 && (
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-lg font-bold text-slate-900 mb-3">Otras estadísticas</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {getInfoStats(selectedMatch).map((stat, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                        <span className="text-slate-600">{stat.label}</span>
                        <span className="font-bold text-slate-900">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
