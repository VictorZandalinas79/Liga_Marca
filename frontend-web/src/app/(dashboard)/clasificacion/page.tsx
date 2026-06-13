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
  podium_finishes: number   // veces entre los 3 primeros de una jornada
  bottom_finishes: number   // veces entre los 3 últimos de una jornada
}

interface MatchdayStatus {
  matchday: number
  is_open: boolean
}

type SortField = 'total_points' | 'average_points' | 'last_3_jornadas_points' | 'best_change_score' | 'successful_changes' | 'podium_finishes' | 'bottom_finishes'
type SortOrder = 'asc' | 'desc'

export default function ClasificacionPage() {
  const [standings, setStandings] = useState<UserStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMatchday, setCurrentMatchday] = useState<number>(1)
  const [selectedMatchday, setSelectedMatchday] = useState<number>(0) // 0 = todas
  const [sortField, setSortField] = useState<SortField>('total_points')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [tick, setTick] = useState(0)
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

      // 2. Obtener todos los team_players (paginando)
      const teamPlayers: { team_id: string; player_id: string; is_starter: boolean; is_captain: boolean; matchday: number }[] = []
      {
        const pageSize = 1000
        let from = 0
        while (true) {
          const { data: page, error } = await supabase
            .from('team_players')
            .select('team_id, player_id, is_starter, is_captain, matchday')
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1)
          if (error) {
            console.error('[CLASIFICACION] Error cargando team_players:', error)
            break
          }
          if (!page || page.length === 0) break
          teamPlayers.push(...(page as typeof teamPlayers))
          if (page.length < pageSize) break
          from += pageSize
        }
      }

      if (teamPlayers.length === 0) {
        setLoading(false)
        return
      }

      // 3. Obtener IDs de jugadores únicos
      const playerIds = [...new Set(teamPlayers.map(tp => tp.player_id))]
      const playerIdSet = new Set(playerIds)

      // 4. Obtener todos los fixtures para mapear fixture_id -> matchday
      const { data: fixturesData } = await supabase
        .from('fixtures')
        .select('id, matchday')

      const fixtureToMatchday = new Map<string, number>()
      fixturesData?.forEach(f => {
        if (f.id && f.matchday && f.matchday > 0) {
          fixtureToMatchday.set(f.id, f.matchday)
        }
      })

      // 5. Obtener todos los player_scores (paginando)
      const allScores: { player_id: string; total_points: number; fixture_id?: string; matchday?: number }[] = []
      {
        const pageSize = 1000
        let from = 0
        while (true) {
          const { data: page, error } = await supabase
            .from('player_scores')
            .select('player_id, total_points, fixture_id, matchday')
            .order('id', { ascending: true })
            .range(from, from + pageSize - 1)
          if (error) {
            console.error('[CLASIFICACION] Error cargando player_scores:', error)
            break
          }
          if (!page || page.length === 0) break
          allScores.push(...(page as typeof allScores))
          if (page.length < pageSize) break
          from += pageSize
        }
      }

      // 6. Mapear puntos por (player_id, matchday) usando fixture_id si matchday es null
      const playerPointsByMatchday = new Map<string, Map<number, number>>()
      let scoresConPuntos = 0
      let scoresSinMatchday = 0
      let scoresConMatchday = 0

      for (const score of allScores) {
        if (!playerIdSet.has(score.player_id)) continue

        // Determinar el matchday: usar matchday directo o inferir desde fixture_id
        let md: number | undefined = score.matchday && score.matchday > 0 ? score.matchday : undefined
        if (!md && score.fixture_id) {
          md = fixtureToMatchday.get(score.fixture_id)
        }

        if (!md || md <= 0) {
          scoresSinMatchday++
          continue
        } else {
          scoresConMatchday++
        }

        if ((score.total_points || 0) > 0) scoresConPuntos++

        if (!playerPointsByMatchday.has(score.player_id)) {
          playerPointsByMatchday.set(score.player_id, new Map())
        }
        const current = playerPointsByMatchday.get(score.player_id)!.get(md) || 0
        playerPointsByMatchday.get(score.player_id)!.set(md, current + (score.total_points || 0))
      }

      console.log('[CLASIFICACION] playerPointsByMatchday size:', playerPointsByMatchday.size)
      console.log('[CLASIFICACION] allScores length:', allScores.length)
      console.log('[CLASIFICACION] scoresConMatchday:', scoresConMatchday)
      console.log('[CLASIFICACION] scoresSinMatchday:', scoresSinMatchday)
      console.log('[CLASIFICACION] scoresConPuntos:', scoresConPuntos)
      console.log('[CLASIFICACION] fixtureToMatchday size:', fixtureToMatchday.size)

      // Ver fixtures mapeados
      console.log('[CLASIFICACION] fixtureToMatchday sample:', Array.from(fixtureToMatchday.entries()).slice(0, 5))

      // Ver algunos ejemplos de playerPoints
      const samplePlayers = Array.from(playerPointsByMatchday.entries()).slice(0, 3)
      console.log('[CLASIFICACION] playerPointsByMatchday sample:', samplePlayers.map(([pid, mdMap]) => ({
        player_id: pid,
        puntos: Array.from(mdMap.entries())
      })))

      // Ver sample de allScores
      console.log('[CLASIFICACION] allScores sample:', allScores.slice(0, 5).map(s => ({
        player_id: s.player_id,
        total_points: s.total_points,
        matchday: s.matchday,
        fixture_id: s.fixture_id
      })))

      // 7. Agrupar jugadores por equipo y jornada
      const teamPlayersByMatchday = new Map<string, Map<number, typeof teamPlayers>>()
      for (const tp of teamPlayers) {
        const md = tp.matchday && tp.matchday > 0 ? tp.matchday : 0

        if (!teamPlayersByMatchday.has(tp.team_id)) {
          teamPlayersByMatchday.set(tp.team_id, new Map())
        }
        if (!teamPlayersByMatchday.get(tp.team_id)!.has(md)) {
          teamPlayersByMatchday.get(tp.team_id)!.set(md, [])
        }
        teamPlayersByMatchday.get(tp.team_id)!.get(md)!.push(tp)
      }

      // 8. Calcular puntos por usuario por jornada
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
              if (md <= 0) continue

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

      // 6b. Calcular podios (top 3) y colistas (bottom 3) por jornada.
      // Para cada jornada ya disputada, rankeamos a los usuarios participantes
      // por sus puntos y contamos cuántas veces cada uno queda entre los 3
      // primeros y entre los 3 últimos.
      const podiumCount = new Map<string, number>()
      const bottomCount = new Map<string, number>()

      const participantsByMatchday = new Map<number, { userId: string; points: number }[]>()
      for (const [userId, pointsMap] of userPointsByMatchday.entries()) {
        for (const [md, pts] of pointsMap.entries()) {
          if (md <= 0) continue
          if (!participantsByMatchday.has(md)) participantsByMatchday.set(md, [])
          participantsByMatchday.get(md)!.push({ userId, points: pts })
        }
      }

      for (const [, participants] of participantsByMatchday.entries()) {
        // Saltar jornadas aún sin puntuar (todos a 0): no cuentan como disputadas
        const maxPoints = participants.reduce((max, p) => Math.max(max, p.points), 0)
        if (maxPoints <= 0) continue

        const sorted = [...participants].sort((a, b) => b.points - a.points)
        const top3 = sorted.slice(0, 3)
        for (const p of top3) {
          podiumCount.set(p.userId, (podiumCount.get(p.userId) || 0) + 1)
        }
        // Solo tiene sentido un "bottom 3" si hay más de 3 participantes
        if (sorted.length > 3) {
          const bottom3 = sorted.slice(-3)
          for (const p of bottom3) {
            bottomCount.set(p.userId, (bottomCount.get(p.userId) || 0) + 1)
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

        for (const changes of changesMap.values()) {
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
          podium_finishes: podiumCount.get(userId) || 0,
          bottom_finishes: bottomCount.get(userId) || 0,
          current_position: 0,
          previous_position: 0,
          position_change: 0,
          teams_count: userTeamsMap.get(userId)?.length || 0,
        }
      })

      // 9. Filtrar por jornada si está seleccionada (acumulado hasta esa jornada)
      if (selectedMatchday > 0) {
        standingsData.forEach(standing => {
          const pointsMap = userPointsByMatchday.get(standing.user_id) || new Map()
          // Sumar puntos acumulados desde jornada 1 hasta la seleccionada
          let accumulatedPoints = 0
          let jornadasPlayed = 0
          for (const [md, pts] of pointsMap.entries()) {
            if (md > 0 && md <= selectedMatchday) {
              accumulatedPoints += pts
              jornadasPlayed += 1
            }
          }
          standing.total_points = accumulatedPoints
          standing.average_points = jornadasPlayed > 0 ? Math.round((accumulatedPoints / jornadasPlayed) * 10) / 10 : 0
          standing.matches_played = jornadasPlayed
          // Últimas 3 jornadas hasta la seleccionada
          const sortedMds = Array.from(pointsMap.keys())
            .filter(md => md > 0 && md <= selectedMatchday)
            .sort((a, b) => b - a)
            .slice(0, 3)
          standing.last_3_jornadas_points = sortedMds.reduce((sum, md) => sum + (pointsMap.get(md) || 0), 0)
        })
      }

      // 10. Ordenar
      standingsData.sort((a, b) => {
        if (sortOrder === 'desc') {
          return b[sortField] - a[sortField]
        } else {
          return a[sortField] - b[sortField]
        }
      })

      // Actualizar posiciones
      standingsData.forEach((standing, index) => {
        standing.current_position = index + 1
      })

      setStandings(standingsData)
      setLoading(false)
    }

    fetchStandings()
  }, [selectedMatchday, sortField, sortOrder, tick])

  // Refresco automático: actualiza los puntos al momento cada 30s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30 * 1000)
    return () => clearInterval(interval)
  }, [])

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
                  <th className="text-left text-xs sm:text-sm font-semibold text-slate-300 p-2 sm:p-4">Pos</th>
                  <th className="text-left text-xs sm:text-sm font-semibold text-slate-300 p-2 sm:p-4">Jugador</th>
                  <th
                    className="text-right text-xs sm:text-sm font-semibold text-slate-300 p-2 sm:p-4 cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('total_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="sm:hidden">Pts</span>
                      <span className="hidden sm:inline">Puntos Totales</span>
                      <SortIcon field="total_points" />
                    </div>
                  </th>
                  <th
                    className="hidden sm:table-cell text-right text-sm font-semibold text-slate-300 p-4 cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('average_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Promedio
                      <SortIcon field="average_points" />
                    </div>
                  </th>
                  <th
                    className="hidden md:table-cell text-right text-sm font-semibold text-slate-300 p-4 cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('last_3_jornadas_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Últimas 3
                      <SortIcon field="last_3_jornadas_points" />
                    </div>
                  </th>
                  <th className="hidden sm:table-cell text-center text-sm font-semibold text-slate-300 p-4">Tendencia</th>
                  <th
                    className="hidden lg:table-cell text-right text-sm font-semibold text-slate-300 p-4 cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('best_change_score')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      % Cambios
                      <SortIcon field="best_change_score" />
                    </div>
                  </th>
                  <th
                    className="text-center text-xs sm:text-sm font-semibold text-slate-300 p-2 sm:p-4 cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('podium_finishes')}
                    title="Veces entre los 3 primeros de una jornada"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      <span className="hidden md:inline">Podios</span>
                      <SortIcon field="podium_finishes" />
                    </div>
                  </th>
                  <th
                    className="text-center text-xs sm:text-sm font-semibold text-slate-300 p-2 sm:p-4 cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('bottom_finishes')}
                    title="Veces entre los 3 últimos de una jornada"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <TrendingDown className="w-4 h-4 text-red-500" />
                      <span className="hidden md:inline">Colistas</span>
                      <SortIcon field="bottom_finishes" />
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
                    <td className="p-2 sm:p-4">
                      {getPositionMedal(standing.current_position)}
                    </td>
                    <td className="p-2 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="hidden sm:flex w-8 h-8 rounded-full bg-slate-600 items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-slate-300" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-sm sm:text-base truncate">{standing.user_name}</p>
                          <p className="text-xs text-slate-400">
                            {standing.teams_count} equipo{standing.teams_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-2 sm:p-4 text-right">
                      <span className="text-xl sm:text-2xl font-bold text-emerald-400">
                        {Math.round(standing.total_points * 10) / 10}
                      </span>
                      <span className="hidden sm:inline text-xs text-slate-400 ml-1">pts</span>
                    </td>
                    <td className="hidden sm:table-cell p-4 text-right">
                      <span className="text-lg font-semibold text-slate-200">
                        {standing.average_points}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">pts/jor</span>
                    </td>
                    <td className="hidden md:table-cell p-4 text-right">
                      <span className="text-lg font-semibold text-blue-400">
                        {Math.round(standing.last_3_jornadas_points * 10) / 10}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell p-4">
                      <div className="flex justify-center">
                        {getTrendIcon(standing.last_3_trend)}
                      </div>
                    </td>
                    <td className="hidden lg:table-cell p-4 text-right">
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
                    <td className="p-2 sm:p-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Trophy className="w-4 h-4 text-yellow-500 shrink-0" />
                        <span className="text-base sm:text-lg font-bold text-yellow-400">
                          {standing.podium_finishes}
                        </span>
                      </div>
                    </td>
                    <td className="p-2 sm:p-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
                        <span className="text-base sm:text-lg font-bold text-red-400">
                          {standing.bottom_finishes}
                        </span>
                      </div>
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
