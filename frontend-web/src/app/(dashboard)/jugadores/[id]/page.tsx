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
  switch_plays: number
  pull_backs: number
  long_balls_completed: number
  lay_offs: number

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

  const getMetricBreakdown = (score: PlayerScore): MetricBreakdown[] => {
    const breakdowns: MetricBreakdown[] = []

    // Goles y Portería
    const goalMetrics = []
    if (score.goals > 0) goalMetrics.push({
      name: 'Goles',
      value: score.goals,
      points: score.goals * 6,
      icon: '⚽',
      description: 'Puntos base por gol (varía según posición)'
    })
    if (score.goal_header_bonus > 0) goalMetrics.push({
      name: 'Gol de cabeza',
      value: score.goal_header_bonus,
      points: score.goal_header_bonus * 0.5,
      icon: '🗣️',
      description: 'Bonus extra por gol de cabeza'
    })
    if (score.goal_freekick_bonus > 0) goalMetrics.push({
      name: 'Gol de falta directa',
      value: score.goal_freekick_bonus,
      points: score.goal_freekick_bonus * 1,
      icon: '🎯',
      description: 'Bonus extra por gol de falta'
    })
    if (score.own_goals > 0) goalMetrics.push({
      name: 'Autogol',
      value: score.own_goals,
      points: score.own_goals * -4,
      icon: '🤦',
      description: 'Penalización por autogol'
    })
    if (score.goals_conceded > 0 && score.goals_conceded < 10) goalMetrics.push({
      name: 'Goles encajados',
      value: score.goals_conceded,
      points: score.goals_conceded * -1,
      icon: '🥅',
      description: 'Penalización por gol encajado (solo afecta a POR y DEF)'
    })
    if (score.clean_sheet) goalMetrics.push({
      name: 'Portería a cero',
      value: 1,
      points: 4,
      icon: '🔒',
      description: 'Bonus por no encajar goles (titulares con +60 min)'
    })
    if (goalMetrics.length > 0) breakdowns.push({ category: 'Goles y Portería', metrics: goalMetrics })

    // Asistencias
    const assistMetrics = []
    if (score.assists > 0) assistMetrics.push({
      name: 'Asistencias',
      value: score.assists,
      points: score.assists * 4,
      icon: '🅰️',
      description: 'Puntos por asistencia de gol'
    })
    if (score.key_passes > 0) assistMetrics.push({
      name: 'Pases clave',
      value: score.key_passes,
      points: score.key_passes * 1.5,
      icon: '🔑',
      description: 'Pases que generan ocasión clara'
    })
    if (score.second_assists > 0) assistMetrics.push({
      name: 'Segundas asistencias',
      value: score.second_assists,
      points: score.second_assists * 1.5,
      icon: '🥈',
      description: 'Asistencia de la asistencia'
    })
    if (score.intent_assists > 0) assistMetrics.push({
      name: 'Intento de asistencia',
      value: score.intent_assists,
      points: score.intent_assists * 0.8,
      icon: '💭',
      description: 'Pase que casi genera gol'
    })
    if (assistMetrics.length > 0) breakdowns.push({ category: 'Asistencias', metrics: assistMetrics })

    // Tiros
    const shotMetrics = []
    if (score.shots_on_target > 0) shotMetrics.push({
      name: 'Tiros a puerta',
      value: score.shots_on_target,
      points: score.shots_on_target * 1,
      icon: '🏹',
      description: 'Tiros entre los tres palos'
    })
    if (score.shots_off_target > 0) shotMetrics.push({
      name: 'Tiros fuera',
      value: score.shots_off_target,
      points: score.shots_off_target * 0.2,
      icon: '💨',
      description: 'Tiros desviados'
    })
    if (score.shots_hit_woodwork > 0) shotMetrics.push({
      name: 'Tiros al palo',
      value: score.shots_hit_woodwork,
      points: score.shots_hit_woodwork * 1.5,
      icon: '🪵',
      description: 'Impactos en el larguero o postes'
    })
    if (score.big_chances_created > 0) shotMetrics.push({
      name: 'Ocasiones creadas',
      value: score.big_chances_created,
      points: score.big_chances_created * 0.5,
      icon: '✨',
      description: 'Ocasiones claras de gol creadas'
    })
    if (score.big_chances_missed > 0) shotMetrics.push({
      name: 'Ocasiones falladas',
      value: score.big_chances_missed,
      points: score.big_chances_missed * -0.5,
      icon: '😭',
      description: 'Ocasiones claras de gol falladas'
    })
    if (score.penalties_scored > 0) shotMetrics.push({
      name: 'Penaltis marcados',
      value: score.penalties_scored,
      points: score.penalties_scored * 6,
      icon: '🎯',
      description: 'Penaltis transformados'
    })
    if (score.penalties_missed > 0) shotMetrics.push({
      name: 'Penaltis fallados',
      value: score.penalties_missed,
      points: score.penalties_missed * -2,
      icon: '❌',
      description: 'Penaltis fallados'
    })
    if (shotMetrics.length > 0) breakdowns.push({ category: 'Tiros', metrics: shotMetrics })

    // Penaltis
    const penaltyMetrics = []
    if (score.penalties_won > 0) penaltyMetrics.push({
      name: 'Penaltis ganados',
      value: score.penalties_won,
      points: score.penalties_won * 3,
      icon: '🎁',
      description: 'Faltas dentro del área que generan penalti'
    })
    if (score.penalties_conceded > 0) penaltyMetrics.push({
      name: 'Penaltis concedidos',
      value: score.penalties_conceded,
      points: score.penalties_conceded * -3,
      icon: '💔',
      description: 'Faltas dentro del área que resultan en penalti en contra'
    })
    if (penaltyMetrics.length > 0) breakdowns.push({ category: 'Penaltis', metrics: penaltyMetrics })

    // Portero
    const keeperMetrics = []
    if (score.saves > 0) keeperMetrics.push({
      name: 'Paradas',
      value: score.saves,
      points: score.saves * 0.6,
      icon: '🧤',
      description: 'Paradas realizadas'
    })
    if (score.penalty_saves > 0) keeperMetrics.push({
      name: 'Penaltis parados',
      value: score.penalty_saves,
      points: score.penalty_saves * 6,
      icon: '💪🧤',
      description: 'Penaltis detenidos'
    })
    if (score.claims_ok > 0) keeperMetrics.push({
      name: 'Balones cogidos',
      value: score.claims_ok,
      points: score.claims_ok * 0.4,
      icon: '🙌',
      description: 'Centros capturados con seguridad'
    })
    if (score.claims_fail > 0) keeperMetrics.push({
      name: 'Balones fallados',
      value: score.claims_fail,
      points: score.claims_fail * -0.5,
      icon: '😱',
      description: 'Centros que no pudo capturar'
    })
    if (score.fumbles > 0) keeperMetrics.push({
      name: 'Fallos',
      value: score.fumbles,
      points: score.fumbles * -0.5,
      icon: '🫳',
      description: 'Balones que se le escapan de las manos'
    })
    if (score.smothers > 0) keeperMetrics.push({
      name: 'Cierres',
      value: score.smothers,
      points: score.smothers * 0.5,
      icon: '🛬',
      description: 'Balones cubiertos saliendo del área'
    })
    if (score.sweepers_ok > 0) keeperMetrics.push({
      name: 'Acciones de portero líbero',
      value: score.sweepers_ok,
      points: score.sweepers_ok * 0.4,
      icon: '🚀',
      description: 'Intervenciones exitosas fuera del área'
    })
    if (score.sweepers_fail > 0) keeperMetrics.push({
      name: 'Acciones fallidas fuera del área',
      value: score.sweepers_fail,
      points: score.sweepers_fail * -0.6,
      icon: '⚠️',
      description: 'Intervenciones fallidas fuera del área'
    })
    if (score.punches_ok > 0) keeperMetrics.push({
      name: 'Punches exitosos',
      value: score.punches_ok,
      points: score.punches_ok * 0.3,
      icon: '👊',
      description: 'Balones despejados con los puños correctamente'
    })
    if (score.punches_fail > 0) keeperMetrics.push({
      name: 'Punches fallidos',
      value: score.punches_fail,
      points: score.punches_fail * -0.5,
      icon: '⚠️',
      description: 'Punches que no despejan bien el balón'
    })
    if (score.parries_safe > 0) keeperMetrics.push({
      name: 'Paradas con desvío seguro',
      value: score.parries_safe,
      points: score.parries_safe * 0.2,
      icon: '✅',
      description: 'Paradas que desvían el balón de forma controlada'
    })
    if (score.parries_danger > 0) keeperMetrics.push({
      name: 'Paradas con desvío peligroso',
      value: score.parries_danger,
      points: score.parries_danger * -0.2,
      icon: '⚠️',
      description: 'Paradas que desvían el balón de forma peligrosa'
    })
    if (keeperMetrics.length > 0) breakdowns.push({ category: 'Portero', metrics: keeperMetrics })

    // Defensa
    const defenseMetrics = []
    if (score.clearances > 0) defenseMetrics.push({
      name: 'Despejes',
      value: score.clearances,
      points: score.clearances * 0.3,
      icon: '🛡️',
      description: 'Balones despejados de la defensa'
    })
    if (score.clearances_last_line > 0) defenseMetrics.push({
      name: 'Despejes de última línea',
      value: score.clearances_last_line,
      points: score.clearances_last_line * 0.8,
      icon: '🦸',
      description: 'Despejes que evitan gol seguro'
    })
    if (score.blocked_crosses > 0) defenseMetrics.push({
      name: 'Centros bloqueados',
      value: score.blocked_crosses,
      points: score.blocked_crosses * 0.3,
      icon: '🚫',
      description: 'Centros interceptados'
    })
    if (score.interceptions > 0) defenseMetrics.push({
      name: 'Intercepciones',
      value: score.interceptions,
      points: score.interceptions * 0.3,
      icon: '🧲',
      description: 'Balones robados por anticipación'
    })
    if (score.tackles_won > 0) defenseMetrics.push({
      name: 'Entradas ganadas',
      value: score.tackles_won,
      points: score.tackles_won * 0.4,
      icon: '⚔️',
      description: 'Entradas que recuperan el balón'
    })
    if (score.tackles_lost > 0) defenseMetrics.push({
      name: 'Entradas fallidas',
      value: score.tackles_lost,
      points: score.tackles_lost * -0.1,
      icon: '🗡️',
      description: 'Entradas que no recuperan el balón'
    })
    if (score.blocked_shots > 0) defenseMetrics.push({
      name: 'Tiros bloqueados',
      value: score.blocked_shots,
      points: score.blocked_shots * 0.5,
      icon: '🧱',
      description: 'Tiros interceptados con el cuerpo'
    })
    if (score.blocked_passes > 0) defenseMetrics.push({
      name: 'Pases bloqueados',
      value: score.blocked_passes,
      points: score.blocked_passes * 0.2,
      icon: '🚧',
      description: 'Pases interceptados'
    })
    if (score.ball_recoveries > 0) defenseMetrics.push({
      name: 'Recuperaciones',
      value: score.ball_recoveries,
      points: score.ball_recoveries * 0.2,
      icon: '♻️',
      description: 'Balones recuperados'
    })
    if (score.offsides_provoked > 0) defenseMetrics.push({
      name: 'Fueras de juego provocados',
      value: score.offsides_provoked,
      points: score.offsides_provoked * 0.2,
      icon: '🚩',
      description: 'Rivales puestos en fuera de juego'
    })
    if (score.challenges_lost > 0) defenseMetrics.push({
      name: 'Duelos perdidos',
      value: score.challenges_lost,
      points: score.challenges_lost * -0.1,
      icon: '⚠️',
      description: 'Duelos físicos perdidos'
    })
    if (defenseMetrics.length > 0) breakdowns.push({ category: 'Defensa', metrics: defenseMetrics })

    // Errores
    const errorMetrics = []
    if (score.errors_leading_to_shot > 0) errorMetrics.push({
      name: 'Errores que llevan a tiro',
      value: score.errors_leading_to_shot,
      points: score.errors_leading_to_shot * -1.5,
      icon: '😬',
      description: 'Fallos que permiten tiro rival'
    })
    if (score.errors_leading_to_goal > 0) errorMetrics.push({
      name: 'Errores que llevan a gol',
      value: score.errors_leading_to_goal,
      points: score.errors_leading_to_goal * -4,
      icon: '🚨',
      description: 'Fallos que resultan en gol'
    })
    if (errorMetrics.length > 0) breakdowns.push({ category: 'Errores', metrics: errorMetrics })

    // Pases
    const passMetrics = []
    if (score.passes_completed > 0) passMetrics.push({
      name: 'Pases completados',
      value: score.passes_completed,
      points: Math.round(score.passes_completed * 0.02 * 10) / 10,
      icon: '✅',
      description: 'Pases correctos (0.02 pts cada uno)'
    })
    if (score.progressive_passes > 0) passMetrics.push({
      name: 'Pases progresivos',
      value: score.progressive_passes,
      points: score.progressive_passes * 0.2,
      icon: '⏩',
      description: 'Pases que avanzan +25m hacia portería rival'
    })
    if (score.passes_into_final_third > 0) passMetrics.push({
      name: 'Pases a último tercio',
      value: score.passes_into_final_third,
      points: score.passes_into_final_third * 0.15,
      icon: '➡️',
      description: 'Pases que entran en el último tercio del campo'
    })
    if (score.passes_into_box > 0) passMetrics.push({
      name: 'Pases al área',
      value: score.passes_into_box,
      points: score.passes_into_box * 0.3,
      icon: '📦',
      description: 'Pases que penetran el área rival'
    })
    if (score.through_balls > 0) passMetrics.push({
      name: 'Pases al hueco',
      value: score.through_balls,
      points: score.through_balls * 0.5,
      icon: '🎯',
      description: 'Pases que rompen líneas defensivas'
    })
    if (score.crosses_completed > 0) passMetrics.push({
      name: 'Centros completados',
      value: score.crosses_completed,
      points: score.crosses_completed * 0.3,
      icon: '↗️',
      description: 'Centros que encuentran compañero'
    })
    if (score.switch_plays > 0) passMetrics.push({
      name: 'Cambios de juego',
      value: score.switch_plays,
      points: score.switch_plays * 0.3,
      icon: '🔄',
      description: 'Pases largos de banda a banda'
    })
    if (score.pull_backs > 0) passMetrics.push({
      name: 'Pases hacia atrás',
      value: score.pull_backs,
      points: score.pull_backs * 0.3,
      icon: '↩️',
      description: 'Centros hacia atrás desde línea de fondo'
    })
    if (score.long_balls_completed > 0) passMetrics.push({
      name: 'Balones largos',
      value: score.long_balls_completed,
      points: score.long_balls_completed * 0.15,
      icon: '🏹',
      description: 'Pases largos completados'
    })
    if (score.lay_offs > 0) passMetrics.push({
      name: 'Pases de apoyo',
      value: score.lay_offs,
      points: score.lay_offs * 0.2,
      icon: '🔁',
      description: 'Pases cortos de apoyo tras control'
    })
    if (passMetrics.length > 0) breakdowns.push({ category: 'Pases', metrics: passMetrics })

    // Regates
    const skillMetrics = []
    if (score.takeons_won > 0) skillMetrics.push({
      name: 'Regates completados',
      value: score.takeons_won,
      points: score.takeons_won * 0.6,
      icon: '🌀',
      description: 'Regates que superan al rival'
    })
    if (score.takeons_lost > 0) skillMetrics.push({
      name: 'Regates fallidos',
      value: score.takeons_lost,
      points: score.takeons_lost * -0.2,
      icon: '💫',
      description: 'Regates que pierden el balón'
    })
    if (score.takeons_overrun > 0) skillMetrics.push({
      name: 'Desbordado',
      value: score.takeons_overrun,
      points: score.takeons_overrun * -0.3,
      icon: '⚠️',
      description: 'Rival que lo supera en el 1vs1'
    })
    if (score.good_skills > 0) skillMetrics.push({
      name: 'Buenas habilidades',
      value: score.good_skills,
      points: score.good_skills * 0.2,
      icon: '🪄',
      description: 'Toques de calidad técnica'
    })
    if (score.dispossessed > 0) skillMetrics.push({
      name: 'Balones perdidos',
      value: score.dispossessed,
      points: score.dispossessed * -0.2,
      icon: '😵',
      description: 'Veces que le quitan el balón'
    })
    if (score.bad_touches > 0) skillMetrics.push({
      name: 'Malos controles',
      value: score.bad_touches,
      points: score.bad_touches * -0.1,
      icon: '👟',
      description: 'Controles defectuosos'
    })
    if (skillMetrics.length > 0) breakdowns.push({ category: 'Regates y Técnica', metrics: skillMetrics })

    // Aéreos
    const aerialMetrics = []
    if (score.aerials_won > 0) aerialMetrics.push({
      name: 'Duelos aéreos ganados',
      value: score.aerials_won,
      points: score.aerials_won * 0.3,
      icon: '🆙',
      description: 'Balones ganados por arriba'
    })
    if (score.aerials_lost > 0) aerialMetrics.push({
      name: 'Duelos aéreos perdidos',
      value: score.aerials_lost,
      points: score.aerials_lost * -0.1,
      icon: '⬇️',
      description: 'Balones perdidos por arriba'
    })
    if (aerialMetrics.length > 0) breakdowns.push({ category: 'Juego Aéreo', metrics: aerialMetrics })

    // Faltas y Tarjetas
    const foulMetrics = []
    if (score.fouls_won > 0) foulMetrics.push({
      name: 'Faltas ganadas',
      value: score.fouls_won,
      points: score.fouls_won * 0.05,
      icon: '🎯',
      description: 'Faltas que le cometen'
    })
    if (score.fouls_committed > 0) foulMetrics.push({
      name: 'Faltas cometidas',
      value: score.fouls_committed,
      points: score.fouls_committed * -0.1,
      icon: '🚫',
      description: 'Faltas que comete'
    })
    if (score.yellow_cards > 0) foulMetrics.push({
      name: 'Tarjetas amarillas',
      value: score.yellow_cards,
      points: score.yellow_cards * -1,
      icon: '🟨',
      description: 'Amonestaciones'
    })
    if (score.second_yellow_cards > 0) foulMetrics.push({
      name: 'Segunda amarilla',
      value: score.second_yellow_cards,
      points: score.second_yellow_cards * -3,
      icon: '🟧',
      description: 'Expulsión por doble amarilla'
    })
    if (score.red_cards > 0) foulMetrics.push({
      name: 'Tarjetas rojas',
      value: score.red_cards,
      points: score.red_cards * -5,
      icon: '🟥',
      description: 'Expulsiones directas'
    })
    if (foulMetrics.length > 0) breakdowns.push({ category: 'Faltas y Tarjetas', metrics: foulMetrics })

    return breakdowns
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
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            {player.photo ? (
              <img
                src={player.photo}
                alt={player.short_name || ''}
                className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-slate-700 flex items-center justify-center text-4xl font-bold text-slate-400 border-4 border-slate-600">
                {player.shirt_number || '?'}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-white">
                  {player.first_name} {player.last_name}
                </h1>
                <Badge className={getPositionColor(player.position)}>
                  {getPositionLabel(player.position)}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-slate-300">
                {player.team?.logo_url && (
                  <img src={player.team.logo_url} alt={player.team.name} className="w-6 h-6 object-contain" />
                )}
                <span className="font-medium">{player.team?.name || 'Sin equipo'}</span>
                {player.shirt_number && (
                  <span className="text-slate-400">#{player.shirt_number}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-4 mt-4 text-sm text-slate-400">
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
            <div className="text-right">
              <div className="text-5xl font-bold text-emerald-400">{player.precio ? `${player.precio}M` : '-'}</div>
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
            <div className="p-6 grid grid-cols-4 gap-4 bg-slate-50">
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
