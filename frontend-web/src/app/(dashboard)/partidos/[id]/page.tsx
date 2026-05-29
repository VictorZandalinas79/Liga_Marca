'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Trophy, MapPin, Clock, Calendar, Users, Goal, TrendingUp, Shield, Heart, Zap, Target, Award, AlertCircle, RefreshCw } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'

interface Player {
  id: string
  first_name: string
  last_name: string
  short_name: string
  position: string
  photo?: string
  shirt_number?: number
  team_id: string
  is_starter?: boolean
  minutes_played?: number
  total_points?: number
  goals?: number
  assists?: number
  // Goles y remates
  shots_on_target?: number
  shots_off_target?: number
  shots_hit_woodwork?: number
  big_chances_created?: number
  big_chances_missed?: number
  penalties_scored?: number
  penalties_missed?: number
  // Asistencias
  key_passes?: number
  second_assists?: number
  intent_assists?: number
  // Defensa
  tackles_won?: number
  tackles_lost?: number
  interceptions?: number
  clearances?: number
  clearances_last_line?: number
  blocked_shots?: number
  blocked_passes?: number
  ball_recoveries?: number
  offsides_provoked?: number
  // Portero
  saves?: number
  penalty_saves?: number
  claims_ok?: number
  claims_fail?: number
  punches_ok?: number
  punches_fail?: number
  smothers?: number
  sweepers_ok?: number
  fumbles?: number
  // Pases
  passes_completed?: number
  progressive_passes?: number
  passes_into_final_third?: number
  passes_into_box?: number
  through_balls?: number
  crosses_completed?: number
  switch_plays?: number
  long_balls_completed?: number
  // Regates
  takeons_won?: number
  takeons_lost?: number
  good_skills?: number
  dispossessed?: number
  aerials_won?: number
  aerials_lost?: number
  // Faltas y tarjetas
  fouls_won?: number
  fouls_committed?: number
  yellow_cards?: number
  red_cards?: number
  // Errores
  errors_leading_to_shot?: number
  errors_leading_to_goal?: number
}

interface Team {
  id: string
  name: string
  logo_url?: string
  badge_url?: string
}

interface Fixture {
  id: string
  matchday: number
  home_team_id: string
  away_team_id: string
  start_time: string
  venue?: string
  status?: string
  home_score?: number
  away_score?: number
  match_id?: string
}

interface PlayerScore {
  player_id: string
  total_points: number
  minutes_played: number
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  is_starter: boolean
}

// Componente para mostrar el desglose de métricas con barras
function MetricBreakdown({ player }: { player: Player & Record<string, any> }) {
  interface MetricDef {
    key: string
    label: string
    max: number
    negative?: boolean
    isPercent?: boolean
    isBoolean?: boolean
  }

  // Definir todas las métricas posibles con sus categorías
  const metricsByCategory = [
    {
      category: '⚽ Goles y Remates',
      icon: Goal,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      metrics: [
        { key: 'goals', label: 'Goles', max: 5 },
        { key: 'shots_on_target', label: 'Tiros a puerta', max: 10 },
        { key: 'shots_off_target', label: 'Tiros fuera', max: 10 },
        { key: 'shots_hit_woodwork', label: 'Tiros al palo', max: 3 },
        { key: 'big_chances_created', label: 'Ocasiones creadas', max: 5 },
        { key: 'big_chances_missed', label: 'Ocasiones falladas', max: 5, negative: true },
        { key: 'penalties_scored', label: 'Penaltis marcados', max: 3 },
        { key: 'penalties_missed', label: 'Penaltis fallados', max: 3, negative: true },
        { key: 'penalties_won', label: 'Penaltis provocados', max: 3 },
        { key: 'penalties_conceded', label: 'Penaltis cometidos', max: 3, negative: true },
      ]
    },
    {
      category: '🅰️ Asistencias y Pases Clave',
      icon: Target,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      metrics: [
        { key: 'assists', label: 'Asistencias', max: 3 },
        { key: 'key_passes', label: 'Pases clave', max: 8 },
        { key: 'second_assists', label: 'Segundas asistencias', max: 3 },
        { key: 'intent_assists', label: 'Intentos de asistencia', max: 5 },
      ]
    },
    {
      category: '🛡️ Defensa',
      icon: Shield,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      metrics: [
        { key: 'tackles_won', label: 'Entradas ganadas', max: 10 },
        { key: 'tackles_lost', label: 'Entradas fallidas', max: 10, negative: true },
        { key: 'interceptions', label: 'Intercepciones', max: 10 },
        { key: 'clearances', label: 'Despejes', max: 15 },
        { key: 'clearances_last_line', label: 'Despejes última línea', max: 5 },
        { key: 'blocked_shots', label: 'Tiros bloqueados', max: 5 },
        { key: 'blocked_passes', label: 'Pases bloqueados', max: 5 },
        { key: 'ball_recoveries', label: 'Recuperaciones', max: 15 },
        { key: 'offsides_provoked', label: 'Fueras de juego provocados', max: 5 },
        { key: 'goals_conceded', label: 'Goles en contra', max: 5, negative: true },
        { key: 'clean_sheet', label: 'Clean sheet', max: 1, isBoolean: true },
      ]
    },
    {
      category: '🧤 Portero',
      icon: Award,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      metrics: [
        { key: 'saves', label: 'Paradas', max: 15 },
        { key: 'penalty_saves', label: 'Penaltis parados', max: 3 },
        { key: 'claims_ok', label: 'Balones cogidos', max: 10 },
        { key: 'claims_fail', label: 'Balones fallados', max: 5, negative: true },
        { key: 'punches_ok', label: 'Punches exitosos', max: 5 },
        { key: 'punches_fail', label: 'Punches fallidos', max: 3, negative: true },
        { key: 'smothers', label: 'Cierres', max: 5 },
        { key: 'sweepers_ok', label: 'Acciones de líbero', max: 5 },
        { key: 'fumbles', label: 'Fallos', max: 3, negative: true },
      ]
    },
    {
      category: '📊 Pases',
      icon: Zap,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      metrics: [
        { key: 'passes_completed', label: 'Pases completados', max: 100 },
        { key: 'progressive_passes', label: 'Pases progresivos', max: 20 },
        { key: 'passes_into_final_third', label: 'Pases a último tercio', max: 20 },
        { key: 'passes_into_box', label: 'Pases al área', max: 10 },
        { key: 'through_balls', label: 'Pases al hueco', max: 5 },
        { key: 'crosses_completed', label: 'Centros completados', max: 10 },
        { key: 'switch_plays', label: 'Cambios de juego', max: 5 },
        { key: 'long_balls_completed', label: 'Balones largos', max: 10 },
        { key: 'pass_accuracy', label: 'Precisión de pase', max: 100, isPercent: true },
      ]
    },
    {
      category: '💪 Regates y Técnica',
      icon: Heart,
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
      metrics: [
        { key: 'takeons_won', label: 'Regates completados', max: 10 },
        { key: 'takeons_lost', label: 'Regates fallidos', max: 10, negative: true },
        { key: 'good_skills', label: 'Buenas habilidades', max: 5 },
        { key: 'dispossessed', label: 'Balones perdidos', max: 10, negative: true },
        { key: 'aerials_won', label: 'Duelos aéreos ganados', max: 15 },
        { key: 'aerials_lost', label: 'Duelos aéreos perdidos', max: 15, negative: true },
        { key: 'aerial_success_rate', label: '% Duelos aéreos', max: 100, isPercent: true },
      ]
    },
    {
      category: '🟨 Faltas y Tarjetas',
      icon: AlertCircle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      metrics: [
        { key: 'fouls_won', label: 'Faltas ganadas', max: 5 },
        { key: 'fouls_committed', label: 'Faltas cometidas', max: 5, negative: true },
        { key: 'yellow_cards', label: 'Amarillas', max: 2, negative: true },
        { key: 'red_cards', label: 'Rojas', max: 1, negative: true },
      ]
    },
    {
      category: '⚠️ Errores',
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      metrics: [
        { key: 'errors_leading_to_shot', label: 'Errores → tiro', max: 3, negative: true },
        { key: 'errors_leading_to_goal', label: 'Errores → gol', max: 2, negative: true },
      ]
    },
  ]

  // Calcular puntos por métrica (simplificado)
  const getPointsForMetric = (key: string, value: number, isNegative: boolean): number => {
    const pointsMap: Record<string, number> = {
      'goals': 6,
      'assists': 4,
      'shots_on_target': 1,
      'key_passes': 1.5,
      'tackles_won': 0.4,
      'interceptions': 0.3,
      'clearances': 0.3,
      'saves': 0.6,
      'takeons_won': 0.6,
      'aerials_won': 0.3,
      // Pases (mitad de valor)
      'passes_completed': 0.01,
      'progressive_passes': 0.1,
      'passes_into_final_third': 0.15,
      'passes_into_box': 0.3,
      'through_balls': 0.4,
      'crosses_completed': 0.3,
      'switch_plays': 0.3,
      'long_balls_completed': 0.15,
      'lay_offs': 0.2,
      // Defensa
      'blocked_passes': 0.2,
      'ball_recoveries': 0.2,
      'offsides_provoked': 0.2,
      // Faltas y tarjetas
      'fouls_won': 0.05,
      'fouls_committed': -0.1,
      'yellow_cards': -1,
      'red_cards': -5,
      // Penaltis
      'penalties_scored': 6,
      'penalties_missed': -2,
      'penalties_won': 3,
      'penalties_conceded': -3,
      // Goles en contra (negativo si no hay clean sheet)
      'goals_conceded': -1,
    }
    const basePoints = pointsMap[key] || 0.1
    return isNegative ? -(basePoints * value) : (basePoints * value)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
        <TrendingUp className="w-5 h-5" />
        Desglose de Métricas del Partido
      </h3>

      {metricsByCategory.map((category) => {
        const Icon = category.icon
        const hasMetrics = category.metrics.some(m => (player[m.key] || 0) > 0)

        if (!hasMetrics) return null

        return (
          <div key={category.category} className="border border-slate-200 rounded-xl overflow-hidden">
            {/* Cabecera de categoría */}
            <div className={`${category.bgColor} px-4 py-3 flex items-center gap-2`}>
              <Icon className={`w-5 h-5 ${category.color}`} />
              <h4 className={`font-semibold ${category.color}`}>{category.category}</h4>
            </div>

            {/* Métricas */}
            <div className="p-4 space-y-3">
              {category.metrics.map((metric: MetricDef) => {
                const value = player[metric.key]
                const isBoolean = metric.isBoolean
                const displayValue = isBoolean ? (value ? 'Sí' : value) : (player[metric.key] || 0)

                if (!isBoolean && (value || 0) <= 0) return null
                if (isBoolean && !value) return null

                const isPercent = metric.isPercent
                const finalDisplayValue = isPercent ? `${value.toFixed(1)}%` : displayValue
                const points = (isPercent || isBoolean) ? 0 : getPointsForMetric(metric.key, value || 0, !!metric.negative)
                const barWidth = Math.min(((value || 0) / (isPercent ? 100 : metric.max)) * 100, 100)

                return (
                  <div key={metric.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 font-medium">{metric.label}</span>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${metric.negative ? 'text-red-600' : isBoolean ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {finalDisplayValue}
                        </span>
                        {!(isPercent || isBoolean) && (
                          <span className={`text-xs font-semibold ${points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {points >= 0 ? '+' : ''}{points.toFixed(1)} pts
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          metric.negative ? 'bg-red-500' : isBoolean ? 'bg-emerald-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Total de puntos */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
        <p className="text-emerald-800 text-sm font-semibold">Puntuación Total</p>
        <p className="text-4xl font-bold text-emerald-600 mt-1">{player.total_points || 0}</p>
      </div>
    </div>
  )
}

export default function PartidoDetallePage() {
  const [loading, setLoading] = useState(true)
  const [fixture, setFixture] = useState<Fixture | null>(null)
  const [homeTeam, setHomeTeam] = useState<Team | null>(null)
  const [awayTeam, setAwayTeam] = useState<Team | null>(null)
  const [homePlayers, setHomePlayers] = useState<Player[]>([])
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [matchMinute, setMatchMinute] = useState<number>(0)
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()

  const fetchPartido = async () => {
    const fixtureId = params.id as string

    // 1. Obtener fixture actualizado
    const { data: fixtureData } = await supabase
      .from('fixtures')
      .select('*')
      .eq('id', fixtureId)
      .single()

    if (!fixtureData) {
      setLoading(false)
      return
    }

    setFixture(fixtureData)

    // 2. Obtener equipos con escudos
    const { data: teamsData } = await supabase
      .from('real_teams')
      .select('id, name, logo_url')
      .in('id', [fixtureData.home_team_id, fixtureData.away_team_id])

    const homeTeamData = teamsData?.find(t => t.id === fixtureData.home_team_id)
    const awayTeamData = teamsData?.find(t => t.id === fixtureData.away_team_id)

    setHomeTeam(homeTeamData || null)
    setAwayTeam(awayTeamData || null)

    // 4. Obtener jugadores de ambos equipos con sus stats
    const loadTeamPlayers = async (teamId: string) => {
      // Obtener jugadores del equipo
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('team_id', teamId)
        .order('short_name', { ascending: true })

      if (!playersData) return []

      // Obtener player_scores para este partido específico
      const playerIds = playersData.map(p => p.id)

      // Primero obtener todos los player_scores del fixture
      const { data: allScoresData } = await supabase
        .from('player_scores')
        .select('*')
        .eq('fixture_id', fixtureId)

      console.log('player_scores encontrados:', allScoresData?.length || 0)
      console.log('fixture_id:', fixtureId)
      console.log('IDs de jugadores en players:', playerIds.slice(0, 5))
      console.log('IDs en player_scores:', allScoresData?.map(s => s.player_id).slice(0, 5))

      // Filtrar solo los de este equipo
      const scoresData = allScoresData?.filter(s => playerIds.includes(s.player_id)) || []

      const scoresMap = new Map(scoresData.map(s => [s.player_id, s]))

      // Combinar jugadores con TODAS las stats del partido
      const playersWithStats = playersData.map(player => {
        const score = scoresMap.get(player.id)
        return {
          ...player,
          is_starter: score?.is_starter || false,
          minutes_played: score?.minutes_played || 0,
          total_points: score?.total_points || 0,
          // Goles y remates
          goals: score?.goals || 0,
          shots_on_target: score?.shots_on_target || 0,
          shots_off_target: score?.shots_off_target || 0,
          shots_hit_woodwork: score?.shots_hit_woodwork || 0,
          big_chances_created: score?.big_chances_created || 0,
          big_chances_missed: score?.big_chances_missed || 0,
          penalties_scored: score?.penalties_scored || 0,
          penalties_missed: score?.penalties_missed || 0,
          // Asistencias
          assists: score?.assists || 0,
          key_passes: score?.key_passes || 0,
          second_assists: score?.second_assists || 0,
          intent_assists: score?.intent_assists || 0,
          // Defensa
          tackles_won: score?.tackles_won || 0,
          tackles_lost: score?.tackles_lost || 0,
          interceptions: score?.interceptions || 0,
          clearances: score?.clearances || 0,
          clearances_last_line: score?.clearances_last_line || 0,
          blocked_shots: score?.blocked_shots || 0,
          blocked_passes: score?.blocked_passes || 0,
          ball_recoveries: score?.ball_recoveries || 0,
          offsides_provoked: score?.offsides_provoked || 0,
          // Portero
          saves: score?.saves || 0,
          penalty_saves: score?.penalty_saves || 0,
          claims_ok: score?.claims_ok || 0,
          claims_fail: score?.claims_fail || 0,
          punches_ok: score?.punches_ok || 0,
          punches_fail: score?.punches_fail || 0,
          smothers: score?.smothers || 0,
          sweepers_ok: score?.sweepers_ok || 0,
          fumbles: score?.fumbles || 0,
          // Pases
          passes_completed: score?.passes_completed || 0,
          progressive_passes: score?.progressive_passes || 0,
          passes_into_final_third: score?.passes_into_final_third || 0,
          passes_into_box: score?.passes_into_box || 0,
          through_balls: score?.through_balls || 0,
          crosses_completed: score?.crosses_completed || 0,
          switch_plays: score?.switch_plays || 0,
          long_balls_completed: score?.long_balls_completed || 0,
          // Regates
          takeons_won: score?.takeons_won || 0,
          takeons_lost: score?.takeons_lost || 0,
          good_skills: score?.good_skills || 0,
          dispossessed: score?.dispossessed || 0,
          aerials_won: score?.aerials_won || 0,
          aerials_lost: score?.aerials_lost || 0,
          // Faltas y tarjetas
          fouls_won: score?.fouls_won || 0,
          fouls_committed: score?.fouls_committed || 0,
          yellow_cards: score?.yellow_cards || 0,
          red_cards: score?.red_cards || 0,
          // Errores
          errors_leading_to_shot: score?.errors_leading_to_shot || 0,
          errors_leading_to_goal: score?.errors_leading_to_goal || 0,
        }
      })

      // Si hay datos en player_scores, mostrar solo jugadores con puntos
      // Si no, mostrar todos los jugadores del equipo
      const hasScoreData = scoresData && scoresData.length > 0

      if (hasScoreData) {
        // Mostrar solo jugadores que tienen datos de partido
        return playersWithStats.filter(p =>
          (p.total_points && p.total_points > 0) ||
          (p.goals && p.goals > 0) ||
          (p.assists && p.assists > 0) ||
          (p.minutes_played && p.minutes_played > 0) ||
          (p.is_starter !== undefined && p.is_starter)
        )
      }

      return playersWithStats
    }

    const [home, away] = await Promise.all([
      loadTeamPlayers(fixtureData.home_team_id),
      loadTeamPlayers(fixtureData.away_team_id)
    ])

    setHomePlayers(home)
    setAwayPlayers(away)
    setLoading(false)
    setLastUpdated(new Date())
  }

  const handleSyncMatch = async () => {
    if (!fixture) return

    setSyncing(true)
    setSyncStatus(null)

    try {
      const matchId = fixture.match_id || fixture.id

      const response = await fetch('/api/sync-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_id: fixture.id,
          match_id: matchId
        })
      })

      const result = await response.json()

      if (response.ok) {
        setSyncStatus({
          type: 'success',
          message: `Partido sincronizado. ${result.output?.length || 0} jugadores actualizados.`
        })
        // Recargar datos del partido
        await fetchPartido()
      } else {
        setSyncStatus({
          type: 'error',
          message: result.error || 'Error al sincronizar'
        })
      }
    } catch (error) {
      setSyncStatus({
        type: 'error',
        message: 'Error de conexión al sincronizar'
      })
    } finally {
      setSyncing(false)
      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setSyncStatus(null), 5000)
    }
  }

  // Efecto para cargar datos inicialmente
  useEffect(() => {
    fetchPartido()
  }, [params.id])

  // Efecto para polling cuando el partido está en vivo o cerca de empezar
  useEffect(() => {
    if (!fixture) return

    const now = new Date()
    const matchTime = fixture.start_time ? new Date(fixture.start_time) : null

    if (!matchTime) return

    const diffMs = matchTime.getTime() - now.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    // Hacer polling si:
    // - El partido empezó (diffMins <= 0)
    // - O falta <= 5 minutos para empezar
    const matchStarted = diffMins <= 0
    const matchStartingSoon = diffMins > 0 && diffMins <= 5
    const matchFinished = fixture.status === 'finished'

    if ((matchStarted || matchStartingSoon) && !matchFinished) {
      const interval = setInterval(() => {
        fetchPartido()
      }, 30000) // 30 segundos

      return () => clearInterval(interval)
    }
  }, [fixture?.status, fixture?.start_time])

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return {
      date: date.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }),
      time: date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  const calculateMatchMinute = () => {
    if (!fixture?.start_time || fixture.status !== 'live') return 0
    const now = new Date()
    const kickOff = new Date(fixture.start_time)
    const diffMs = now.getTime() - kickOff.getTime()
    const minutes = Math.floor(diffMs / 60000)
    return Math.min(minutes, 90) // Máximo 90 minutos
  }

  // Actualizar minuto del partido cada 30 segundos si está en vivo
  useEffect(() => {
    if (fixture?.status === 'live') {
      setMatchMinute(calculateMatchMinute())
      const interval = setInterval(() => {
        setMatchMinute(calculateMatchMinute())
      }, 30000)
      return () => clearInterval(interval)
    }
  }, [fixture?.status, fixture?.start_time])

  const getPositionOrder = (position: string): number => {
    const posLower = position.toLowerCase()
    if (posLower.includes('goalkeeper') || posLower === 'gk') return 0 // Porteros primero
    if (posLower.includes('defender') || posLower === 'def') return 1 // Defensas segundo
    if (posLower.includes('midfielder') || posLower === 'mid') return 2 // Medios tercero
    if (posLower.includes('forward') || posLower === 'fwd') return 3 // Delanteros cuarto
    return 2 // Por defecto, medios
  }

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

  const renderPlayerCard = (player: Player) => (
    <div
      key={player.id}
      onClick={() => setSelectedPlayer(player)}
      className="cursor-pointer"
    >
      <Card className={`hover:shadow-lg transition-all !bg-slate-800 border-slate-700 hover:border-emerald-500 ${
        !player.is_starter ? 'opacity-75' : ''
      }`}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {player.photo ? (
                <img
                  src={player.photo}
                  alt={player.short_name || ''}
                  className="w-12 h-12 rounded-full object-cover border-2 border-slate-600"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-400 border-2 border-slate-600">
                  {player.shirt_number || '?'}
                </div>
              )}
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="font-semibold text-white text-sm">{player.short_name || `${player.first_name} ${player.last_name}`}</h4>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPositionColor(player.position)}`}>
                    {getPositionLabel(player.position)}
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                  <span>{player.is_starter ? 'Titular' : 'Suplente'}</span>
                  <span>{player.minutes_played || 0}'</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center space-x-1 text-emerald-400">
                <span className="text-xl font-bold">{player.total_points || 0}</span>
              </div>
              <p className="text-xs text-slate-400">puntos</p>
              {(player.goals || 0) > 0 && (
                <p className="text-xs text-green-400">⚽ {player.goals}</p>
              )}
              {(player.assists || 0) > 0 && (
                <p className="text-xs text-blue-400">🅰️ {player.assists}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando partido...</div>
  }

  const dateTime = fixture?.start_time ? formatDateTime(fixture.start_time) : null

  return (
    <div className="space-y-6">
      {/* Botón volver */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver
      </button>

      {/* Cabecera del partido */}
      <Card className="!bg-slate-800 border-slate-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {fixture?.status === 'live' ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-500 text-white animate-pulse">
                    En Juego
                  </Badge>
                  <span className="text-red-500 font-bold text-sm">{matchMinute}&apos;</span>
                </div>
              ) : (
                <Badge className={fixture?.status === 'finished' ? 'bg-emerald-500' : 'bg-slate-500'}>
                  {fixture?.status === 'finished' ? 'Finalizado' : 'Programado'}
                </Badge>
              )}
              {/* Botón de sincronizar */}
              <button
                onClick={handleSyncMatch}
                disabled={syncing}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white text-xs font-medium rounded-md transition-colors"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3" />
                    Sincronizar
                  </>
                )}
              </button>
            </div>
            {dateTime && (
              <div className="flex items-center gap-4 text-sm text-slate-300">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {dateTime.date}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {dateTime.time}
                </div>
              </div>
            )}
          </div>

          {/* Mensaje de estado de sincronización */}
          {syncStatus && (
            <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
              syncStatus.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {syncStatus.message}
            </div>
          )}

          {/* Marcador arriba del todo */}
          <div className="flex items-center justify-between mb-6">
            {/* Equipo Local */}
            <div className="flex-1 flex flex-col items-center">
              {homeTeam?.logo_url ? (
                <img src={homeTeam.logo_url} alt={homeTeam.name} className="w-20 h-20 object-contain mb-3" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center mb-3">
                  <Trophy className="w-10 h-10 text-slate-400" />
                </div>
              )}
              <h2 className="text-xl font-bold text-white text-center">{homeTeam?.name || 'Local'}</h2>
            </div>

            {/* Marcador Central */}
            <div className="px-8 flex flex-col items-center">
              <div className="flex items-center gap-4 text-4xl font-bold text-white">
                <span>{fixture?.home_score ?? 0}</span>
                <span className="text-slate-500">-</span>
                <span>{fixture?.away_score ?? 0}</span>
              </div>
              {fixture?.status === 'live' && (
                <Badge className="mt-2 bg-red-500 text-white animate-pulse">
                  En Juego
                </Badge>
              )}
              {fixture?.status === 'finished' && (
                <Badge className="mt-2 bg-emerald-500 text-white">
                  Finalizado
                </Badge>
              )}
            </div>

            {/* Equipo Visitante */}
            <div className="flex-1 flex flex-col items-center">
              {awayTeam?.logo_url ? (
                <img src={awayTeam.logo_url} alt={awayTeam.name} className="w-20 h-20 object-contain mb-3" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center mb-3">
                  <Trophy className="w-10 h-10 text-slate-400" />
                </div>
              )}
              <h2 className="text-xl font-bold text-white text-center">{awayTeam?.name || 'Visitante'}</h2>
            </div>
          </div>

          {fixture?.venue && (
            <div className="mt-6 pt-4 border-t border-slate-700 text-center">
              <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                <MapPin className="w-4 h-4" />
                {fixture.venue}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Jugadores de ambos equipos */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Equipo Local */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            {homeTeam?.badge_url && (
              <img src={homeTeam.badge_url} alt={homeTeam.name} className="w-6 h-6 object-contain" />
            )}
            <h3 className="text-lg font-bold text-white">{homeTeam?.name || 'Local'}</h3>
            <Badge variant="outline" className="ml-auto">
              <Users className="w-3 h-3 mr-1" />
              {homePlayers.length}
            </Badge>
          </div>

          <div className="space-y-4">
            {/* Porteros */}
            {homePlayers.filter(p => getPositionLabel(p.position) === 'POR').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-amber-600 uppercase mb-2">Porteros</h4>
                <div className="space-y-2">
                  {homePlayers
                    .filter(p => getPositionLabel(p.position) === 'POR')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Defensas */}
            {homePlayers.filter(p => getPositionLabel(p.position) === 'DEF').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-blue-600 uppercase mb-2">Defensas</h4>
                <div className="space-y-2">
                  {homePlayers
                    .filter(p => getPositionLabel(p.position) === 'DEF')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Medios */}
            {homePlayers.filter(p => getPositionLabel(p.position) === 'MED').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-emerald-600 uppercase mb-2">Mediocampistas</h4>
                <div className="space-y-2">
                  {homePlayers
                    .filter(p => getPositionLabel(p.position) === 'MED')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Delanteros */}
            {homePlayers.filter(p => getPositionLabel(p.position) === 'DEL').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-red-600 uppercase mb-2">Delanteros</h4>
                <div className="space-y-2">
                  {homePlayers
                    .filter(p => getPositionLabel(p.position) === 'DEL')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Equipo Visitante */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            {awayTeam?.badge_url && (
              <img src={awayTeam.badge_url} alt={awayTeam.name} className="w-6 h-6 object-contain" />
            )}
            <h3 className="text-lg font-bold text-white">{awayTeam?.name || 'Visitante'}</h3>
            <Badge variant="outline" className="ml-auto">
              <Users className="w-3 h-3 mr-1" />
              {awayPlayers.length}
            </Badge>
          </div>

          <div className="space-y-4">
            {/* Porteros */}
            {awayPlayers.filter(p => getPositionLabel(p.position) === 'POR').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-amber-600 uppercase mb-2">Porteros</h4>
                <div className="space-y-2">
                  {awayPlayers
                    .filter(p => getPositionLabel(p.position) === 'POR')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Defensas */}
            {awayPlayers.filter(p => getPositionLabel(p.position) === 'DEF').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-blue-600 uppercase mb-2">Defensas</h4>
                <div className="space-y-2">
                  {awayPlayers
                    .filter(p => getPositionLabel(p.position) === 'DEF')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Medios */}
            {awayPlayers.filter(p => getPositionLabel(p.position) === 'MED').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-emerald-600 uppercase mb-2">Mediocampistas</h4>
                <div className="space-y-2">
                  {awayPlayers
                    .filter(p => getPositionLabel(p.position) === 'MED')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Delanteros */}
            {awayPlayers.filter(p => getPositionLabel(p.position) === 'DEL').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-red-600 uppercase mb-2">Delanteros</h4>
                <div className="space-y-2">
                  {awayPlayers
                    .filter(p => getPositionLabel(p.position) === 'DEL')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de detalle de jugador con métricas completas */}
      {selectedPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedPlayer(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 p-6 flex justify-between items-start z-10">
              <div className="flex items-center space-x-4">
                {selectedPlayer.photo ? (
                  <img
                    src={selectedPlayer.photo}
                    alt={selectedPlayer.short_name || ''}
                    className="w-20 h-20 rounded-full object-cover border-4 border-white"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-600">
                    {selectedPlayer.shirt_number || '?'}
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {selectedPlayer.first_name} {selectedPlayer.last_name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPositionColor(selectedPlayer.position)}`}>
                      {getPositionLabel(selectedPlayer.position)}
                    </span>
                    <span className="text-sm text-slate-600">
                      {selectedPlayer.is_starter ? 'Titular' : 'Suplente'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500"
              >
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </button>
            </div>

            {/* Cuerpo con métricas */}
            <div className="p-6 space-y-6">
              {/* Resumen principal */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-emerald-50 p-4 rounded-xl text-center">
                  <p className="text-emerald-800 text-sm font-semibold">Puntos</p>
                  <p className="text-3xl font-bold text-emerald-600">{selectedPlayer.total_points || 0}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl text-center">
                  <p className="text-slate-600 text-sm font-semibold">Minutos</p>
                  <p className="text-3xl font-bold text-slate-800">{selectedPlayer.minutes_played || 0}'</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl text-center">
                  <p className="text-slate-600 text-sm font-semibold">Goles</p>
                  <p className="text-3xl font-bold text-slate-800">{selectedPlayer.goals || 0}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl text-center">
                  <p className="text-slate-600 text-sm font-semibold">Asistencias</p>
                  <p className="text-3xl font-bold text-slate-800">{selectedPlayer.assists || 0}</p>
                </div>
              </div>

              {/* Métricas por categoría */}
              <MetricBreakdown player={selectedPlayer} />

              {/* Botón para ver perfil completo */}
              <button
                onClick={() => {
                  router.push(`/jugadores/${selectedPlayer.id}`)
                  setSelectedPlayer(null)
                }}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-colors"
              >
                Ver perfil completo con historial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
