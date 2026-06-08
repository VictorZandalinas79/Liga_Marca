'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, TrendingUp, Goal, Ticket, X, Calendar, MapPin, Clock } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'

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
    home_team?: { name: string }
    away_team?: { name: string }
    home_score?: number
    away_score?: number
  }
}

interface MetricBreakdown {
  category: string
  metrics: Array<{
    name: string
    value: number
    points: number
    icon: string
    description: string
  }>
}

export default function JugadorDetallePage() {
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [scores, setScores] = useState<PlayerScore[]>([])
  const [selectedMatch, setSelectedMatch] = useState<PlayerScore | null>(null)
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

      // 2. Obtener scores de todos los partidos
      const { data: scoresData } = await supabase
        .from('player_scores')
        .select(`
          *,
          fixtures (
            start_time,
            home_team_id,
            away_team_id,
            home_score,
            away_score,
            real_teams_home (name),
            real_teams_away (name)
          )
        `)
        .eq('player_id', playerId)
        .order('fixtures.start_time', { ascending: false })

      if (scoresData) {
        setScores(scoresData.map(s => ({
          ...s,
          fixture: s.fixtures ? {
            start_time: s.fixtures.start_time,
            home_team: { name: (s.fixtures as any).real_teams_home?.name || 'Local' },
            away_team: { name: (s.fixtures as any).real_teams_away?.name || 'Visitante' },
            home_score: s.fixtures.home_score,
            away_score: s.fixtures.away_score
          } : undefined
        })))
      }

      setLoading(false)
    }

    fetchJugador()
  }, [params.id])

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
  const totalStats = scores.reduce((acc, s) => ({
    total_points: acc.total_points + (s.total_points || 0),
    minutes_played: acc.minutes_played + (s.minutes_played || 0),
    goals: acc.goals + (s.goals || 0),
    assists: acc.assists + (s.assists || 0),
    yellow_cards: acc.yellow_cards + (s.yellow_cards || 0),
    red_cards: acc.red_cards + (s.red_cards || 0),
    clean_sheets: acc.clean_sheets + (s.clean_sheet ? 1 : 0),
    saves: acc.saves + (s.saves || 0),
    tackles_won: acc.tackles_won + (s.tackles_won || 0),
    interceptions: acc.interceptions + (s.interceptions || 0),
    passes_completed: acc.passes_completed + (s.passes_completed || 0),
    aerials_won: acc.aerials_won + (s.aerials_won || 0),
  }), {
    total_points: 0,
    minutes_played: 0,
    goals: 0,
    assists: 0,
    yellow_cards: 0,
    red_cards: 0,
    clean_sheets: 0,
    saves: 0,
    tackles_won: 0,
    interceptions: 0,
    passes_completed: 0,
    aerials_won: 0,
  })

  const matchesPlayed = scores.length
  const avgPoints = matchesPlayed > 0 ? Math.round((totalStats.total_points / matchesPlayed) * 10) / 10 : 0

  // ============================================================
  // Reglas de puntuación v3.0 - RELEVO (espejo de scoring_rules.json)
  // Deben coincidir EXACTAMENTE con trigger_descarga_eventos.py
  // ============================================================
  type Pos = 'POR' | 'DEF' | 'MED' | 'DEL'

  const SR = {
    participation: { starter_bonus: 2, substitute_bonus: 1, minutes_threshold: 60 },
    goal: { POR: 6, DEF: 6, MED: 5, DEL: 4 } as Record<Pos, number>,
    own_goal: -2,
    assist_goal: 3,        // Asistencia que acaba en gol
    assist_no_goal: 1,     // Asistencia que no acaba en gol (intento)
    clean_sheet: { POR: 4, DEF: 3, MED: 2, DEL: 1 } as Record<Pos, number>,
    goal_conceded: { POR: -2, DEF: -2, MED: -1, DEL: -1 } as Record<Pos, number>, // Por gol encajado
    save_per_2: 1,
    penalty_save: 5,
    penalty_missed: -2,
    penalty_won: 1,        // Cambiado de 2 a 1
    penalty_conceded: -1,  // Cambiado de -2 a -1
    yellow_card: -1,
    second_yellow_card: -1,
    red_card: -3,
    bonuses_per_X: {
      shots_on_target: { required: 2, points: 1 },
      takeons_won: { required: 2, points: 1 },
      recoveries: { required: 5, points: 1 },
      clearances: { required: 3, points: 1 },
      forward_passes: { required: 10, points: 1 },      // Nuevo: pases hacia adelante
      set_pieces_taken: { required: 5, points: 1 },     // Nuevo: faltas/córners
      successful_crosses: { required: 3, points: 1 },   // Nuevo: centros completados
    },
    passes_per_10: 1,
    lost_balls: {
      POR: { required: 8, points: -1 },
      DEF: { required: 8, points: -1 },
      MED: { required: 10, points: -1 },
      DEL: { required: 12, points: -1 },
    } as Record<Pos, { required: number; points: number }>,
  }

  const normPos = (position?: string): Pos => {
    const p = (position || '').toUpperCase()
    if (p === 'POR' || p === 'DEF' || p === 'MED' || p === 'DEL') return p
    return getPositionLabel(position || '') as Pos
  }

  // Desglose de puntos REAL: replica el motor v3.0. Cada métrica suma
  // exactamente los puntos que aporta al total_points oficial.
  const getMetricBreakdown = (score: PlayerScore): MetricBreakdown[] => {
    const pos = normPos(score.position)
    const breakdowns: MetricBreakdown[] = []
    const floorDiv = (v: number, d: number) => Math.floor(v / d)

    // --- Participación ---
    const partMetrics = []
    if (score.minutes_played > 0) {
      const titular = score.minutes_played > SR.participation.minutes_threshold
      partMetrics.push({
        name: titular ? 'Participación (+60 min)' : 'Participación (suplente)',
        value: score.minutes_played,
        points: titular ? SR.participation.starter_bonus : SR.participation.substitute_bonus,
        icon: '⏱️',
        description: titular ? 'Bonus por jugar más de 60 minutos' : 'Bonus por participar (menos de 60 min)',
      })
    }
    if (partMetrics.length > 0) breakdowns.push({ category: 'Participación', metrics: partMetrics })

    // --- Goles y Portería ---
    const goalMetrics = []
    if (score.goals > 0) goalMetrics.push({
      name: 'Goles',
      value: score.goals,
      points: score.goals * SR.goal[pos],
      icon: '⚽',
      description: `Gol como ${pos}: ${SR.goal[pos]} pts cada uno`,
    })
    if (score.own_goals > 0) goalMetrics.push({
      name: 'Autogol',
      value: score.own_goals,
      points: score.own_goals * SR.own_goal,
      icon: '🤦',
      description: 'Penalización por gol en propia puerta',
    })
    if (score.clean_sheet) goalMetrics.push({
      name: 'Portería a cero',
      value: 1,
      points: SR.clean_sheet[pos],
      icon: '🔒',
      description: `Sin encajar (+60 min). Como ${pos}: ${SR.clean_sheet[pos]} pts`,
    })
    if (score.goals_conceded > 0) goalMetrics.push({
      name: 'Goles encajados',
      value: score.goals_conceded,
      points: score.goals_conceded * SR.goal_conceded[pos],
      icon: '🥅',
      description: `Penalización por gol encajado (${SR.goal_conceded[pos]} pts cada uno, solo POR/DEF penalizan más)`,
    })
    if (goalMetrics.length > 0) breakdowns.push({ category: 'Goles y Portería', metrics: goalMetrics })

    // --- Asistencias ---
    const assistMetrics = []
    if (score.assists > 0) assistMetrics.push({
      name: 'Asistencias de gol',
      value: score.assists,
      points: score.assists * SR.assist_goal,
      icon: '🅰️',
      description: `Asistencia que acaba en gol: ${SR.assist_goal} pts cada una`,
    })
    if (score.intent_assists > 0) assistMetrics.push({
      name: 'Asistencias sin gol',
      value: score.intent_assists,
      points: score.intent_assists * SR.assist_no_goal,
      icon: '💭',
      description: `Asistencia que no acaba en gol: ${SR.assist_no_goal} pts cada una`,
    })
    if (assistMetrics.length > 0) breakdowns.push({ category: 'Asistencias', metrics: assistMetrics })

    // --- Tiros (bonus por tramos) ---
    const shotMetrics = []
    if (score.shots_on_target >= SR.bonuses_per_X.shots_on_target.required) shotMetrics.push({
      name: 'Tiros a puerta',
      value: score.shots_on_target,
      points: floorDiv(score.shots_on_target, SR.bonuses_per_X.shots_on_target.required) * SR.bonuses_per_X.shots_on_target.points,
      icon: '🏹',
      description: `+${SR.bonuses_per_X.shots_on_target.points} pt por cada ${SR.bonuses_per_X.shots_on_target.required} tiros a puerta`,
    })
    if (shotMetrics.length > 0) breakdowns.push({ category: 'Tiros', metrics: shotMetrics })

    // --- Penaltis ---
    const penaltyMetrics = []
    if (score.penalties_missed > 0) penaltyMetrics.push({
      name: 'Penaltis fallados',
      value: score.penalties_missed,
      points: score.penalties_missed * SR.penalty_missed,
      icon: '❌',
      description: 'Penaltis fallados (-2 pts cada uno)',
    })
    if (score.penalties_won > 0) penaltyMetrics.push({
      name: 'Penaltis ganados',
      value: score.penalties_won,
      points: score.penalties_won * SR.penalty_won,
      icon: '🎁',
      description: `Penaltis provocados (+${SR.penalty_won} pts cada uno)`,
    })
    if (score.penalties_conceded > 0) penaltyMetrics.push({
      name: 'Penaltis concedidos',
      value: score.penalties_conceded,
      points: score.penalties_conceded * SR.penalty_conceded,
      icon: '💔',
      description: `Penaltis cometidos (${SR.penalty_conceded} pts cada uno)`,
    })
    if (score.penalty_saves > 0) penaltyMetrics.push({
      name: 'Penaltis parados',
      value: score.penalty_saves,
      points: score.penalty_saves * SR.penalty_save,
      icon: '💪',
      description: 'Penaltis detenidos (+5 pts cada uno)',
    })
    if (penaltyMetrics.length > 0) breakdowns.push({ category: 'Penaltis', metrics: penaltyMetrics })

    // --- Portero (paradas por tramos) ---
    const keeperMetrics = []
    if (score.saves >= 2) keeperMetrics.push({
      name: 'Paradas',
      value: score.saves,
      points: floorDiv(score.saves, 2) * SR.save_per_2,
      icon: '🧤',
      description: `+${SR.save_per_2} pt por cada 2 paradas`,
    })
    if (keeperMetrics.length > 0) breakdowns.push({ category: 'Portero', metrics: keeperMetrics })

    // --- Bonus por tramos (ataque/defensa) ---
    const bonusMetrics = []
    if (score.takeons_won >= SR.bonuses_per_X.takeons_won.required) bonusMetrics.push({
      name: 'Regates completados',
      value: score.takeons_won,
      points: floorDiv(score.takeons_won, SR.bonuses_per_X.takeons_won.required) * SR.bonuses_per_X.takeons_won.points,
      icon: '🌀',
      description: `+${SR.bonuses_per_X.takeons_won.points} pt por cada ${SR.bonuses_per_X.takeons_won.required} regates`,
    })
    if (score.ball_recoveries >= SR.bonuses_per_X.recoveries.required) bonusMetrics.push({
      name: 'Recuperaciones',
      value: score.ball_recoveries,
      points: floorDiv(score.ball_recoveries, SR.bonuses_per_X.recoveries.required) * SR.bonuses_per_X.recoveries.points,
      icon: '♻️',
      description: `+${SR.bonuses_per_X.recoveries.points} pt por cada ${SR.bonuses_per_X.recoveries.required} recuperaciones`,
    })
    if (score.clearances >= SR.bonuses_per_X.clearances.required) bonusMetrics.push({
      name: 'Despejes',
      value: score.clearances,
      points: floorDiv(score.clearances, SR.bonuses_per_X.clearances.required) * SR.bonuses_per_X.clearances.points,
      icon: '🛡️',
      description: `+${SR.bonuses_per_X.clearances.points} pt por cada ${SR.bonuses_per_X.clearances.required} despejes`,
    })
    // Nuevos bonus v3.0
    const forwardPasses = score.forward_passes || 0
    if (forwardPasses >= SR.bonuses_per_X.forward_passes.required) bonusMetrics.push({
      name: 'Pases hacia adelante',
      value: forwardPasses,
      points: floorDiv(forwardPasses, SR.bonuses_per_X.forward_passes.required) * SR.bonuses_per_X.forward_passes.points,
      icon: '⏩',
      description: `+${SR.bonuses_per_X.forward_passes.points} pt por cada ${SR.bonuses_per_X.forward_passes.required} pases hacia adelante`,
    })
    const setPieces = score.set_pieces_taken || 0
    if (setPieces >= SR.bonuses_per_X.set_pieces_taken.required) bonusMetrics.push({
      name: 'Lanzamientos a balón parado',
      value: setPieces,
      points: floorDiv(setPieces, SR.bonuses_per_X.set_pieces_taken.required) * SR.bonuses_per_X.set_pieces_taken.points,
      icon: '🎯',
      description: `+${SR.bonuses_per_X.set_pieces_taken.points} pt por cada ${SR.bonuses_per_X.set_pieces_taken.required} faltas/córners`,
    })
    const successfulCrosses = score.successful_crosses || 0
    if (successfulCrosses >= SR.bonuses_per_X.successful_crosses.required) bonusMetrics.push({
      name: 'Centros completados',
      value: successfulCrosses,
      points: floorDiv(successfulCrosses, SR.bonuses_per_X.successful_crosses.required) * SR.bonuses_per_X.successful_crosses.points,
      icon: '✈️',
      description: `+${SR.bonuses_per_X.successful_crosses.points} pt por cada ${SR.bonuses_per_X.successful_crosses.required} centros`,
    })
    if (bonusMetrics.length > 0) breakdowns.push({ category: 'Bonus Ataque y Defensa', metrics: bonusMetrics })

    // --- Pases (bonus por tramos de 10) ---
    const passMetrics = []
    if (score.passes_completed >= 10) passMetrics.push({
      name: 'Pases completados',
      value: score.passes_completed,
      points: floorDiv(score.passes_completed, 10) * SR.passes_per_10,
      icon: '✅',
      description: `+${SR.passes_per_10} pt por cada 10 pases completados`,
    })
    if (passMetrics.length > 0) breakdowns.push({ category: 'Pases', metrics: passMetrics })

    // --- Penalización por balones perdidos (posicional) ---
    const lostMetrics = []
    const lostBalls = (score.dispossessed || 0) + (score.bad_touches || 0)
    const lostRule = SR.lost_balls[pos]
    if (lostBalls >= lostRule.required) lostMetrics.push({
      name: 'Balones perdidos',
      value: lostBalls,
      points: floorDiv(lostBalls, lostRule.required) * lostRule.points,
      icon: '😵',
      description: `Pérdidas + malos controles. ${lostRule.points} pt por cada ${lostRule.required} como ${pos}`,
    })
    if (lostMetrics.length > 0) breakdowns.push({ category: 'Pérdidas', metrics: lostMetrics })

    // --- Tarjetas ---
    const cardMetrics = []
    if (score.yellow_cards > 0) cardMetrics.push({
      name: 'Tarjetas amarillas',
      value: score.yellow_cards,
      points: score.yellow_cards * SR.yellow_card,
      icon: '🟨',
      description: 'Amonestaciones',
    })
    if (score.second_yellow_cards > 0) cardMetrics.push({
      name: 'Segunda amarilla',
      value: score.second_yellow_cards,
      points: score.second_yellow_cards * SR.second_yellow_card,
      icon: '🟧',
      description: 'Expulsión por doble amarilla',
    })
    if (score.red_cards > 0) cardMetrics.push({
      name: 'Tarjetas rojas',
      value: score.red_cards,
      points: score.red_cards * SR.red_card,
      icon: '🟥',
      description: 'Expulsión directa',
    })
    if (cardMetrics.length > 0) breakdowns.push({ category: 'Tarjetas', metrics: cardMetrics })

    // --- Puntos RELEVO (0 a 4) ---
    if (score.relevo_points) breakdowns.push({
      category: 'Puntos RELEVO',
      metrics: [{
        name: 'Bonus RELEVO',
        value: score.relevo_points,
        points: score.relevo_points,
        icon: '🔁',
        description: 'Bonus por rendimiento global (participación, precisión de pase, duelos…)',
      }],
    })

    return breakdowns
  }

  // Suma de puntos del desglose (debe aproximarse a total_points)
  const sumBreakdownPoints = (score: PlayerScore): number =>
    getMetricBreakdown(score).reduce(
      (acc, cat) => acc + cat.metrics.reduce((a, m) => a + m.points, 0),
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
                className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-white shadow-lg shrink-0"
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
                  <span className="text-slate-400">#{player.shirt_number}</span>
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
            <p className="text-4xl font-bold text-emerald-600">{totalStats.total_points}</p>
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

      {/* Stats detalladas */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Goles y Portería */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              ⚽ Goles y Portería
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex justify-between">
                <span className="text-slate-600">Goles</span>
                <span className="font-bold">{totalStats.goals}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Porterías a cero</span>
                <span className="font-bold text-emerald-600">{totalStats.clean_sheets}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Defensa */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              🛡️ Defensa
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex justify-between">
                <span className="text-slate-600">Entradas ganadas</span>
                <span className="font-bold">{totalStats.tackles_won}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Intercepciones</span>
                <span className="font-bold">{totalStats.interceptions}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portero */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              🧤 Portero
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex justify-between">
                <span className="text-slate-600">Paradas</span>
                <span className="font-bold">{totalStats.saves}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Duelos aéreos ganados</span>
                <span className="font-bold">{totalStats.aerials_won}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Disciplinario */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              🟨 Disciplinario
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex justify-between">
                <span className="text-slate-600">Amarillas</span>
                <span className="font-bold text-amber-600">{totalStats.yellow_cards}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Rojas</span>
                <span className="font-bold text-red-600">{totalStats.red_cards}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rendimiento por partido */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Rendimiento por Partido</h3>
          <div className="space-y-2">
            {scores.map((score) => (
              <div
                key={score.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                onClick={() => setSelectedMatch(score)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${score.is_starter ? 'bg-emerald-500' : 'bg-amber-500'}`} />
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
                  <p className="text-xl font-bold text-emerald-600">{score.total_points}</p>
                  <p className="text-xs text-slate-500">{score.minutes_played}' {score.is_starter ? '(T)' : '(S)'}</p>
                </div>
              </div>
            ))}
          </div>
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
                <p className="text-3xl font-bold text-emerald-600">{selectedMatch.total_points}</p>
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

            {/* Desglose de métricas */}
            <div className="p-6 space-y-6">
              <h3 className="text-lg font-bold text-slate-900">Desglose de Puntos</h3>
              {getMetricBreakdown(selectedMatch).map((category) => (
                <div key={category.category}>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">{category.category}</h4>
                  <div className="space-y-2">
                    {category.metrics.map((metric, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{metric.icon}</span>
                          <div>
                            <p className="font-medium text-slate-900">{metric.name}</p>
                            <p className="text-xs text-slate-500">{metric.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">x{metric.value}</p>
                          <p className={`text-sm ${metric.points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {metric.points >= 0 ? '+' : ''}{metric.points} pts
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {getMetricBreakdown(selectedMatch).length === 0 && (
                <p className="text-slate-500 text-center py-4">
                  No hay métricas destacadas en este partido
                </p>
              )}

              {/* Reconciliación: el desglose debe cuadrar con el total oficial */}
              {(() => {
                const desglose = sumBreakdownPoints(selectedMatch)
                const oficial = selectedMatch.total_points || 0
                const otros = Math.round((oficial - desglose) * 10) / 10
                return (
                  <div className="mt-2 space-y-2 border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>Suma del desglose</span>
                      <span className="font-semibold">{Math.round(desglose * 10) / 10} pts</span>
                    </div>
                    {otros !== 0 && (
                      <div className="flex items-center justify-between p-2 bg-slate-50 rounded">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">➕</span>
                          <div>
                            <p className="font-medium text-slate-900">Otros / ajustes</p>
                            <p className="text-xs text-slate-500">Métricas sin detalle almacenado (entradas al área, etc.) y redondeos</p>
                          </div>
                        </div>
                        <p className={`text-sm ${otros >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {otros >= 0 ? '+' : ''}{otros} pts
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3">
                      <span className="font-bold text-emerald-800">Total oficial</span>
                      <span className="text-2xl font-bold text-emerald-600">{oficial} pts</span>
                    </div>
                  </div>
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
