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
  recoveries_high: number
  recoveries_med: number
  recoveries_low: number
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

      if (scoresData) {
        // Recopilar los ids de equipo de todos los fixtures
        const teamIds = [...new Set(
          scoresData.flatMap(s => [s.fixtures?.home_team_id, s.fixtures?.away_team_id])
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

        const mapped = scoresData.map(s => ({
          ...s,
          fixture: s.fixtures ? {
            start_time: s.fixtures.start_time,
            matchday: s.fixtures.matchday,
            home_team: { name: teamsMap.get(s.fixtures.home_team_id) || 'Local' },
            away_team: { name: teamsMap.get(s.fixtures.away_team_id) || 'Visitante' },
            home_score: s.fixtures.home_score,
            away_score: s.fixtures.away_score
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

        setScores(mapped)
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
    penalty_save: 5,
    penalty_missed: -2,
    penalty_won: 2,        // Penalti provocado
    penalty_conceded: -2,  // Penalti cometido
    yellow_card: -1,
    second_yellow_card: -1,
    red_card: -3,
    // Bonus DECIMALES por unidad — valores EXACTOS de scoring_rules.json
    per_unit: {
      saves: 0.5,              // save
      punches_ok: 0.2,         // punch_ok
      punches_fail: 0.1,       // punch_fail
      claims: 0.1,             // claim (blocaje)
      sweepers: 0.1,           // sweeper (salida del área)
      shots_on_target: 0.3,    // shots_on_target
      takeons_won: 0.5,        // takeons_won
      box_entries: 0.1,        // box_entries
      clearances: 0.5,         // clearances
      passes_completed: 0.05,  // passes_completed
      forward_passes: 0.2,     // forward_passes
      set_pieces_taken: 0.2,   // set_pieces_taken
      successful_crosses: 0.3, // successful_crosses
      recoveries_high: 0.3,        // recoveries_high
      recoveries_med: 0.2,         // recoveries_med
      recoveries_low: 0.1,         // recoveries_low
      long_balls_completed: 0.5,   // long_balls_completed
    },
    // Penalización por balón perdido: -0.1 uniforme (scoring_rules.json)
    lost_balls: -0.1,
  }
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
    if (score.goals_conceded > 0) b3.push(u(score.goals_conceded, SR.goal_conceded[pos], `Gol encajado (${pos})`))

    // BLOQUE 4: Penaltis
    const b4: ScoreRow[] = []
    if (score.penalties_won > 0) b4.push(u(score.penalties_won, SR.penalty_won, 'Penalti provocado'))
    if (score.penalties_conceded > 0) b4.push(u(score.penalties_conceded, SR.penalty_conceded, 'Penalti cometido'))
    if (score.penalties_missed > 0) b4.push(u(score.penalties_missed, SR.penalty_missed, 'Penalti fallado'))
    if (score.penalty_saves > 0) b4.push(u(score.penalty_saves, SR.penalty_save, 'Penalti parado'))

    // BLOQUE 5: Tarjetas
    const b5: ScoreRow[] = []
    if (score.yellow_cards > 0) b5.push(u(score.yellow_cards, SR.yellow_card, 'Amarilla'))
    if (score.second_yellow_cards > 0) b5.push(u(score.second_yellow_cards, SR.second_yellow_card, 'Doble amarilla'))
    if (score.red_cards > 0) b5.push(u(score.red_cards, SR.red_card, 'Roja directa'))

    // BLOQUE 6: Acciones de Portero
    const b6: ScoreRow[] = []
    if (score.saves > 0) b6.push(u(score.saves, SR.per_unit.saves, 'Parada'))
    if (g('punches_ok') > 0) b6.push(u(g('punches_ok'), SR.per_unit.punches_ok, 'Despeje de puños'))
    if (g('punches_fail') > 0) b6.push(u(g('punches_fail'), SR.per_unit.punches_fail, 'Despeje de puños fallido'))
    if (g('claims_ok') > 0) b6.push(u(g('claims_ok'), SR.per_unit.claims, 'Blocaje'))
    if (g('sweepers_ok') > 0) b6.push(u(g('sweepers_ok'), SR.per_unit.sweepers, 'Salida del área'))

    // BLOQUE 7: Bonus en Juego
    const b7: ScoreRow[] = []
    if (score.passes_completed > 0) b7.push(u(score.passes_completed, SR.per_unit.passes_completed, 'Pases completados'))
    if (g('forward_passes') > 0) b7.push(u(g('forward_passes'), SR.per_unit.forward_passes, 'Pases hacia adelante'))
    if (g('box_entries') > 0) b7.push(u(g('box_entries'), SR.per_unit.box_entries, 'Entradas al área'))
    if (g('successful_crosses') > 0) b7.push(u(g('successful_crosses'), SR.per_unit.successful_crosses, 'Centros exitosos'))
    if (g('set_pieces_taken') > 0) b7.push(u(g('set_pieces_taken'), SR.per_unit.set_pieces_taken, 'Balón parado'))
    if (score.takeons_won > 0) b7.push(u(score.takeons_won, SR.per_unit.takeons_won, 'Regates ganados'))
    if (g('long_balls_completed') > 0) b7.push(u(g('long_balls_completed'), SR.per_unit.long_balls_completed, 'Pases largos completados'))
    if (score.shots_on_target > 0) b7.push(u(score.shots_on_target, SR.per_unit.shots_on_target, 'Tiros a puerta'))
    if (g('recoveries_high') > 0) b7.push(u(g('recoveries_high'), SR.per_unit.recoveries_high, 'Recuperación alta'))
    if (g('recoveries_med') > 0) b7.push(u(g('recoveries_med'), SR.per_unit.recoveries_med, 'Recuperación media'))
    if (g('recoveries_low') > 0) b7.push(u(g('recoveries_low'), SR.per_unit.recoveries_low, 'Recuperación baja'))
    if (score.clearances > 0) b7.push(u(score.clearances, SR.per_unit.clearances, 'Despejes'))

    // BLOQUE 8: Penalizaciones
    const b8: ScoreRow[] = []
    const lostBalls = (score.dispossessed || 0) + (score.bad_touches || 0)
    if (lostBalls > 0) b8.push(u(lostBalls, SR.lost_balls, 'Balón perdido'))

    // BLOQUE 9: Puntos RELEVO
    const b9: ScoreRow[] = []
    if (score.relevo_points) {
      const takeonTotal = g('takeons_won') + g('takeons_lost')
      const takeonBonus = takeonTotal > 0 && (g('takeons_won') / takeonTotal) > 0.5 ? 1 : 0
      const baseRelevo = score.relevo_points - takeonBonus
      if (baseRelevo > 0) b9.push({ label: 'Bonus RELEVO (participación, pases, duelos, tiros)', count: 0, unit: 0, points: baseRelevo, flat: true })
      if (takeonBonus > 0) {
        const takeonAcc = Math.round((g('takeons_won') / takeonTotal) * 100)
        b9.push({ label: `Regates ${takeonAcc}% éxito (${g('takeons_won')}/${takeonTotal})`, count: 0, unit: 0, points: 1, flat: true })
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
                  <p className="text-xl font-bold text-emerald-600">{score.total_points}</p>
                  <p className="text-xs text-slate-500">{score.minutes_played}' {score.is_starter ? '(T)' : '(S)'}</p>
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
                const oficial = selectedMatch.total_points || 0
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
