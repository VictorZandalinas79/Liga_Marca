'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, TrendingUp, TrendingDown, Minus, Medal, User, Filter, ArrowUpDown, Target, CheckCircle } from 'lucide-react'

interface UserStanding {
  user_id: string
  user_name: string
  total_points: number
  average_points: number
  current_position: number
  previous_position: number
  position_change: number
  teams_count: number
  matches_played: number
  last_3_jornadas_points: number
  last_3_trend: 'up' | 'down' | 'stable'
  best_change_score: number
  total_changes: number
  successful_changes: number
}

interface MatchdayStatus {
  matchday: number
  is_open: boolean
}

type SortField = 'total_points' | 'average_points' | 'last_3_jornadas_points' | 'best_change_score' | 'successful_changes'
type SortOrder = 'asc' | 'desc'

export default function ClasificacionPage() {
  const [standings, setStandings] = useState<UserStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMatchday, setCurrentMatchday] = useState<number>(1)
  const [selectedMatchday, setSelectedMatchday] = useState<number>(0) // 0 = todas
  const [sortField, setSortField] = useState<SortField>('total_points')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const supabase = createClient()

  // Obtener jornada actual y todas las disponibles
  const fetchMatchdays = async () => {
    const { data: statusData } = await supabase
      .from('matchday_status')
      .select('matchday, is_open')
      .order('matchday', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (statusData) {
      setCurrentMatchday(statusData.matchday)
    }
  }

  useEffect(() => {
    const fetchStandings = async () => {
      await fetchMatchdays()

      // 1. Obtener todos los user_teams
      const { data: userTeamsData } = await supabase
        .from('user_teams')
        .select('id, user_id, name')

      if (!userTeamsData || userTeamsData.length === 0) {
        setLoading(false)
        return
      }

      // Agrupar equipos por usuario
      const userTeamsMap = new Map<string, { teamId: string; teamName: string }[]>()
      for (const ut of userTeamsData) {
        if (!userTeamsMap.has(ut.user_id)) {
          userTeamsMap.set(ut.user_id, [])
        }
        userTeamsMap.get(ut.user_id)!.push({ teamId: ut.id, teamName: ut.name })
      }

      // 2. Obtener todos los team_players
      const { data: teamPlayers } = await supabase
        .from('team_players')
        .select('team_id, player_id, is_starter, is_captain, matchday')

      if (!teamPlayers) {
        setLoading(false)
        return
      }

      // Agrupar jugadores por equipo y jornada
      const teamPlayersByMatchday = new Map<string, Map<number, typeof teamPlayers>>()
      for (const tp of teamPlayers) {
        if (!teamPlayersByMatchday.has(tp.team_id)) {
          teamPlayersByMatchday.set(tp.team_id, new Map())
        }
        const md = tp.matchday ?? 0
        if (!teamPlayersByMatchday.get(tp.team_id)!.has(md)) {
          teamPlayersByMatchday.get(tp.team_id)!.set(md, [])
        }
        teamPlayersByMatchday.get(tp.team_id)!.get(md)!.push(tp)
      }

      // 3. Obtener IDs de jugadores únicos
      const playerIds = [...new Set(teamPlayers.map(tp => tp.player_id))]

      // 4. Obtener datos de jugadores
      const { data: playersData } = await supabase
        .from('players')
        .select('id')
        .in('id', playerIds)

      // 5. Obtener puntos de jugadores (player_scores) si existe
      const { data: scoresData } = await supabase
        .from('player_scores')
        .select('player_id, total_points, matchday')
        .in('player_id', playerIds)

      // Agrupar puntos por jugador y jornada
      const playerPointsByMatchday = new Map<string, Map<number, number>>()
      if (scoresData) {
        for (const score of scoresData) {
          if (!playerPointsByMatchday.has(score.player_id)) {
            playerPointsByMatchday.set(score.player_id, new Map())
          }
          const md = score.matchday ?? 0
          playerPointsByMatchday.get(score.player_id)!.set(
            md,
            (playerPointsByMatchday.get(score.player_id)!.get(md) || 0) + (score.total_points || 0)
          )
        }
      }

      // 6. Calcular puntos por usuario por jornada
      const userPointsByMatchday = new Map<string, Map<number, number>>()
      const userChangesByMatchday = new Map<string, Map<number, { total: number; successful: number }>>()

      for (const [userId, teams] of userTeamsMap.entries()) {
        if (!userPointsByMatchday.has(userId)) {
          userPointsByMatchday.set(userId, new Map())
        }
        if (!userChangesByMatchday.has(userId)) {
          userChangesByMatchday.set(userId, new Map())
        }

        for (const team of teams) {
          const teamMatchdays = teamPlayersByMatchday.get(team.teamId)
          if (teamMatchdays) {
            for (const [md, players] of teamMatchdays.entries()) {
              if (md <= 0) continue // Saltar jornada 0

              // Inicializar mapa de jornada
              if (!userPointsByMatchday.get(userId)!.has(md)) {
                userPointsByMatchday.get(userId)!.set(md, 0)
              }
              if (!userChangesByMatchday.get(userId)!.has(md)) {
                userChangesByMatchday.get(userId)!.set(md, { total: 0, successful: 0 })
              }

              // Sumar puntos
              for (const tp of players) {
                const points = playerPointsByMatchday.get(tp.player_id)?.get(md) ?? 0
                const current = userPointsByMatchday.get(userId)!.get(md)!
                userPointsByMatchday.get(userId)!.set(md, current + points)

                // Contar cambios (jugadores no titulares = cambios)
                if (!tp.is_starter) {
                  const changes = userChangesByMatchday.get(userId)!.get(md)!
                  changes.total += 1
                  // Un cambio es "exitoso" si el jugador tiene más de 0 puntos
                  if (points > 0) {
                    changes.successful += 1
                  }
                  userChangesByMatchday.get(userId)!.set(md, changes)
                }
              }
            }
          }
        }
      }

      // 7. Obtener nombres de usuarios (profiles)
      const userIds = Array.from(userTeamsMap.keys())
      const { data: usersData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      const usersMap = new Map(usersData?.map(u => [u.id, u]) || [])

      // 8. Calcular estadísticas por usuario
      const standingsData: UserStanding[] = userIds.map((userId) => {
        const user = usersMap.get(userId)
        const pointsMap = userPointsByMatchday.get(userId) || new Map()
        const changesMap = userChangesByMatchday.get(userId) || new Map()

        // Puntos totales
        const totalPoints = Array.from(pointsMap.values()).reduce((sum, pts) => sum + pts, 0)

        // Jornadas jugadas
        const matchesPlayed = pointsMap.size

        // Promedio
        const averagePoints = matchesPlayed > 0 ? Math.round((totalPoints / matchesPlayed) * 10) / 10 : 0

        // Últimas 3 jornadas
        const sortedMatchdays = Array.from(pointsMap.keys()).sort((a, b) => b - a)
        const last3Matchdays = sortedMatchdays.slice(0, 3)
        const last3Points = last3Matchdays.reduce((sum, md) => sum + (pointsMap.get(md) || 0), 0)

        // Tendencia últimas 3 jornadas
        let last3Trend: 'up' | 'down' | 'stable' = 'stable'
        if (last3Matchdays.length >= 2) {
          const first = pointsMap.get(last3Matchdays[last3Matchdays.length - 1]) || 0
          const last = pointsMap.get(last3Matchdays[0]) || 0
          if (last > first + 5) last3Trend = 'up'
          else if (last < first - 5) last3Trend = 'down'
        }

        // Mejores cambios y estadísticas
        let bestChangeScore = 0
        let totalChanges = 0
        let successfulChanges = 0

        for (const [md, changes] of changesMap.entries()) {
          // Puntuación de cambios = (exitosos / total) * 100 si hay cambios
          const changeScore = changes.total > 0 ? Math.round((changes.successful / changes.total) * 100) : 0
          if (changeScore > bestChangeScore) {
            bestChangeScore = changeScore
          }
          totalChanges += changes.total
          successfulChanges += changes.successful
        }

        return {
          user_id: userId,
          user_name: user?.full_name || user?.email?.split('@')[0] || 'Usuario',
          total_points: totalPoints,
          average_points: averagePoints,
          matches_played: matchesPlayed,
          last_3_jornadas_points: last3Points,
          last_3_trend: last3Trend,
          best_change_score: bestChangeScore,
          total_changes: totalChanges,
          successful_changes: successfulChanges,
          current_position: 0,
          previous_position: 0,
          position_change: 0,
          teams_count: userTeamsMap.get(userId)?.length || 0,
        }
      })

      // 9. Filtrar por jornada si está seleccionada
      if (selectedMatchday > 0) {
        standingsData.forEach(standing => {
          const pointsMap = userPointsByMatchday.get(standing.user_id) || new Map()
          standing.total_points = pointsMap.get(selectedMatchday) || 0
          standing.average_points = standing.total_points
          standing.last_3_jornadas_points = standing.total_points
        })
      }

      // 10. Ordenar
      standingsData.sort((a, b) => {
        const multiplier = sortOrder === 'desc' ? -1 : 1
        return (b[sortField] - a[sortField]) * multiplier
      })

      // Actualizar posiciones
      standingsData.forEach((standing, index) => {
        standing.current_position = index + 1
      })

      setStandings(standingsData)
      setLoading(false)
    }

    fetchStandings()
  }, [selectedMatchday, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const getPositionMedal = (position: number) => {
    if (position === 1) return <Medal className="w-5 h-5 text-yellow-500" />
    if (position === 2) return <Medal className="w-5 h-5 text-slate-400" />
    if (position === 3) return <Medal className="w-5 h-5 text-amber-600" />
    return <span className="text-lg font-bold text-slate-600 w-5 text-center">{position}</span>
  }

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-emerald-600" />
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-600" />
    return <Minus className="w-4 h-4 text-slate-400" />
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />
    return sortOrder === 'desc'
      ? <ArrowUpDown className="w-3 h-3 ml-1 rotate-180" />
      : <ArrowUpDown className="w-3 h-3 ml-1" />
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando clasificación...</div>
  }

  // Top 3 estadísticas
  const topEvolution = [...standings].sort((a, b) => b.last_3_jornadas_points - a.last_3_jornadas_points)[0]
  const topChanges = [...standings].sort((a, b) => b.best_change_score - a.best_change_score)[0]

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Clasificación General</h1>
          <p className="text-slate-600 mt-1">
            Ranking acumulado de todas las jornadas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-emerald-600" />
          <span className="text-sm font-medium text-slate-600">
            {standings.length} jugadores
          </span>
        </div>
      </div>

      {/* Estadísticas destacadas */}
      <div className="grid md:grid-cols-2 gap-4">
        {topEvolution && (
          <Card className="!bg-emerald-50 border-emerald-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-emerald-700 uppercase">Mayor evolución (últimas 3 jornadas)</p>
                  <p className="text-lg font-bold text-emerald-900">{topEvolution.user_name}</p>
                  <p className="text-sm text-emerald-700">{topEvolution.last_3_jornadas_points} puntos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {topChanges && (
          <Card className="!bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-blue-700 uppercase">Mejor porcentaje de cambios</p>
                  <p className="text-lg font-bold text-blue-900">{topChanges.user_name}</p>
                  <p className="text-sm text-blue-700">{topChanges.best_change_score}% de acierto</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            <Filter className="w-4 h-4" />
            Filtros y opciones
          </button>

          {showFilters && (
            <div className="mt-4 space-y-4 pt-4 border-t border-slate-200">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">
                  Filtrar por jornada
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedMatchday(0)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      selectedMatchday === 0
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Todas
                  </button>
                  {Array.from({ length: currentMatchday }, (_, i) => i + 1).map(md => (
                    <button
                      key={md}
                      onClick={() => setSelectedMatchday(md)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        selectedMatchday === md
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Jornada {md}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabla de clasificación */}
      <Card className="!bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-sm font-semibold text-slate-300 p-4">Pos</th>
                  <th className="text-left text-sm font-semibold text-slate-300 p-4">Jugador</th>
                  <th
                    className="text-right text-sm font-semibold text-slate-300 p-4 cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('total_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Puntos Totales
                      <SortIcon field="total_points" />
                    </div>
                  </th>
                  <th
                    className="text-right text-sm font-semibold text-slate-300 p-4 cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('average_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Promedio
                      <SortIcon field="average_points" />
                    </div>
                  </th>
                  <th
                    className="text-right text-sm font-semibold text-slate-300 p-4 cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('last_3_jornadas_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Últimas 3
                      <SortIcon field="last_3_jornadas_points" />
                    </div>
                  </th>
                  <th className="text-center text-sm font-semibold text-slate-300 p-4">Tendencia</th>
                  <th
                    className="text-right text-sm font-semibold text-slate-300 p-4 cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('best_change_score')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      % Cambios
                      <SortIcon field="best_change_score" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((standing) => (
                  <tr
                    key={standing.user_id}
                    className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors"
                  >
                    <td className="p-4">
                      {getPositionMedal(standing.current_position)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                          <User className="w-4 h-4 text-slate-300" />
                        </div>
                        <div>
                          <p className="font-semibold text-white">{standing.user_name}</p>
                          <p className="text-xs text-slate-400">
                            {standing.teams_count} equipo{standing.teams_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-2xl font-bold text-emerald-400">
                        {standing.total_points}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">pts</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-lg font-semibold text-slate-200">
                        {standing.average_points}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">pts/jor</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-lg font-semibold text-blue-400">
                        {standing.last_3_jornadas_points}
                      </span>
                    </td>
                    <td className="p-4 flex justify-center">
                      {getTrendIcon(standing.last_3_trend)}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className={`text-lg font-bold ${
                          standing.best_change_score >= 70 ? 'text-emerald-400' :
                          standing.best_change_score >= 40 ? 'text-amber-400' : 'text-slate-400'
                        }`}>
                          {standing.best_change_score}%
                        </span>
                        {standing.best_change_score >= 70 && (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {standing.successful_changes}/{standing.total_changes} cambios
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Leyenda */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-600 mb-3">Leyenda</h3>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="text-slate-600">Tendencia positiva (+5 pts)</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-slate-600">Tendencia negativa (-5 pts)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-600">Maestro de cambios (&gt;70%)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sin datos */}
      {standings.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              No hay clasificación disponible
            </h3>
            <p className="text-slate-500">
              Los usuarios aún no tienen equipos registrados
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
