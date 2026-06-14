'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, TrendingUp, TrendingDown, Minus, Medal, User, Filter, ArrowUpDown, Target, CheckCircle, Users, ChevronRight } from 'lucide-react'

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
  podium_finishes: number
  bottom_finishes: number
  best_matchday_points: number
  best_matchday: number
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
  const [selectedMatchday, setSelectedMatchday] = useState<number>(0)
  const [sortField, setSortField] = useState<SortField>('total_points')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [tick, setTick] = useState(0)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userTeamData, setUserTeamData] = useState<Record<string, any>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const supabase = createClient()
  const teamRefs = useRef<Record<string, HTMLDivElement | null>>({})

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

      const { data: userTeamsData } = await supabase
        .from('user_teams')
        .select('id, user_id, name')

      if (!userTeamsData || userTeamsData.length === 0) {
        setLoading(false)
        return
      }

      const userTeamsMap = new Map<string, { teamId: string; teamName: string }[]>()
      for (const ut of userTeamsData) {
        if (!userTeamsMap.has(ut.user_id)) {
          userTeamsMap.set(ut.user_id, [])
        }
        userTeamsMap.get(ut.user_id)!.push({ teamId: ut.id, teamName: ut.name })
      }

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

      const playerIds = [...new Set(teamPlayers.map(tp => tp.player_id))]
      const playerIdSet = new Set(playerIds)

      const { data: fixturesData } = await supabase
        .from('fixtures')
        .select('id, matchday')

      const fixtureToMatchday = new Map<string, number>()
      fixturesData?.forEach(f => {
        if (f.id && f.matchday && f.matchday > 0) {
          fixtureToMatchday.set(f.id, f.matchday)
        }
      })

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

      const playerPointsByMatchday = new Map<string, Map<number, number>>()
      let scoresConPuntos = 0
      let scoresSinMatchday = 0
      let scoresConMatchday = 0

      for (const score of allScores) {
        if (!playerIdSet.has(score.player_id)) continue

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

              if (!userPointsByMatchday.get(userId)!.has(md)) {
                userPointsByMatchday.get(userId)!.set(md, 0)
              }
              if (!userChangesByMatchday.get(userId)!.has(md)) {
                userChangesByMatchday.get(userId)!.set(md, { total: 0, successful: 0 })
              }

              for (const tp of players) {
                const points = playerPointsByMatchday.get(tp.player_id)?.get(md) ?? 0
                const current = userPointsByMatchday.get(userId)!.get(md)!
                userPointsByMatchday.get(userId)!.set(md, current + points)

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
        const maxPoints = participants.reduce((max, p) => Math.max(max, p.points), 0)
        if (maxPoints <= 0) continue

        const sorted = [...participants].sort((a, b) => b.points - a.points)
        const top3 = sorted.slice(0, 3)
        for (const p of top3) {
          podiumCount.set(p.userId, (podiumCount.get(p.userId) || 0) + 1)
        }
        if (sorted.length > 3) {
          const bottom3 = sorted.slice(-3)
          for (const p of bottom3) {
            bottomCount.set(p.userId, (bottomCount.get(p.userId) || 0) + 1)
          }
        }
      }

      const userIds = Array.from(userTeamsMap.keys())
      const { data: usersData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      const usersMap = new Map(usersData?.map(u => [u.id, u]) || [])

      const standingsData: UserStanding[] = userIds.map((userId) => {
        const user = usersMap.get(userId)
        const pointsMap = userPointsByMatchday.get(userId) || new Map()
        const changesMap = userChangesByMatchday.get(userId) || new Map()

        const totalPoints = Array.from(pointsMap.values()).reduce((sum, pts) => sum + pts, 0)
        const matchesPlayed = pointsMap.size
        const averagePoints = matchesPlayed > 0 ? Math.round((totalPoints / matchesPlayed) * 10) / 10 : 0

        const sortedMatchdays = Array.from(pointsMap.keys()).sort((a, b) => b - a)
        const last3Matchdays = sortedMatchdays.slice(0, 3)
        const last3Points = last3Matchdays.reduce((sum, md) => sum + (pointsMap.get(md) || 0), 0)

        let last3Trend: 'up' | 'down' | 'stable' = 'stable'
        if (last3Matchdays.length >= 2) {
          const first = pointsMap.get(last3Matchdays[last3Matchdays.length - 1]) || 0
          const last = pointsMap.get(last3Matchdays[0]) || 0
          if (last > first + 5) last3Trend = 'up'
          else if (last < first - 5) last3Trend = 'down'
        }

        let bestChangeScore = 0
        let totalChanges = 0
        let successfulChanges = 0

        for (const changes of changesMap.values()) {
          const changeScore = changes.total > 0 ? Math.round((changes.successful / changes.total) * 100) : 0
          if (changeScore > bestChangeScore) {
            bestChangeScore = changeScore
          }
          totalChanges += changes.total
          successfulChanges += changes.successful
        }

        // Calcular la mejor puntuación en una jornada
        let bestMatchdayPoints = 0
        let bestMatchday = 0
        for (const [md, pts] of pointsMap.entries()) {
          if (pts > bestMatchdayPoints) {
            bestMatchdayPoints = pts
            bestMatchday = md
          }
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
          best_matchday_points: bestMatchdayPoints,
          best_matchday: bestMatchday,
        }
      })

      if (selectedMatchday > 0) {
        standingsData.forEach(standing => {
          const pointsMap = userPointsByMatchday.get(standing.user_id) || new Map()
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
          const sortedMds = Array.from(pointsMap.keys())
            .filter(md => md > 0 && md <= selectedMatchday)
            .sort((a, b) => b - a)
            .slice(0, 3)
          standing.last_3_jornadas_points = sortedMds.reduce((sum, md) => sum + (pointsMap.get(md) || 0), 0)
        })
      }

      standingsData.sort((a, b) => {
        if (sortOrder === 'desc') {
          return b[sortField] - a[sortField]
        } else {
          return a[sortField] - b[sortField]
        }
      })

      standingsData.forEach((standing, index) => {
        standing.current_position = index + 1
      })

      setStandings(standingsData)
      setLoading(false)
    }

    fetchStandings()
  }, [selectedMatchday, sortField, sortOrder, tick])

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
      }
    }
    getCurrentUser()
  }, [])

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

  const handleUserClick = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null)
      return
    }

    setExpandedUser(userId)

    // Obtener la última jornada jugada o la actual
    const targetMatchday = currentMatchday

    // Obtener los equipos del usuario
    const { data: userTeamsData } = await supabase
      .from('user_teams')
      .select('id, user_id, name')
      .eq('user_id', userId)

    if (!userTeamsData || userTeamsData.length === 0) return

    const teamId = userTeamsData[0].id
    const teamName = userTeamsData[0].name

    // Obtener jugadores del equipo en la jornada seleccionada
    let { data: teamPlayersData } = await supabase
      .from('team_players')
      .select('player_id, is_starter, is_captain')
      .eq('team_id', teamId)
      .eq('matchday', targetMatchday)

    if (!teamPlayersData || teamPlayersData.length === 0) {
      const { data: fallbackData } = await supabase
        .from('team_players')
        .select('player_id, is_starter, is_captain')
        .eq('team_id', teamId)
        .lte('matchday', targetMatchday)
        .order('matchday', { ascending: false })
        .limit(15)
      teamPlayersData = fallbackData
    }

    if (!teamPlayersData || teamPlayersData.length === 0) {
      setUserTeamData(prev => ({ ...prev, [userId]: null }))
      return
    }

    const playerIds = teamPlayersData.map(tp => tp.player_id)

    const { data: playersData } = await supabase
      .from('players')
      .select('id, first_name, last_name, short_name, position, photo, shirt_number, team_id, precio')
      .in('id', playerIds)

    const realTeamIds = [...new Set(playersData?.map(p => p.team_id).filter(Boolean) || [])]
    const { data: teamsData } = await supabase
      .from('real_teams')
      .select('id, name, logo_url')
      .in('id', realTeamIds)
    const teamsMap = new Map(teamsData?.map(t => [t.id, t]) || [])

    // Obtener puntos de la jornada
    let scoresData: { player_id: string; total_points: number }[] | null = null
    const { data: scores } = await supabase
      .from('player_scores')
      .select('player_id, total_points')
      .eq('matchday', targetMatchday)
      .in('player_id', playerIds)
    scoresData = scores as { player_id: string; total_points: number }[] | null

    if (!scoresData || scoresData.length === 0) {
      const { data: fixtureScores } = await supabase
        .from('player_scores')
        .select('player_id, total_points')
        .in('player_id', playerIds)
      scoresData = fixtureScores as { player_id: string; total_points: number }[] | null
    }

    const playerPointsMap = new Map<string, number>()
    scoresData?.forEach(s => {
      playerPointsMap.set(s.player_id, (playerPointsMap.get(s.player_id) || 0) + (s.total_points || 0))
    })

    const jugadores = teamPlayersData.map(tp => {
      const p = playersData?.find(pl => pl.id === tp.player_id)
      const teamObj = p ? teamsMap.get(p.team_id) : undefined
      return {
        id: tp.player_id,
        short_name: p?.short_name || p?.first_name || '',
        position: p?.position || '',
        photo: p?.photo,
        shirt_number: p?.shirt_number,
        team: teamObj ? { name: teamObj.name, logo_url: teamObj.logo_url } : undefined,
        puntos: playerPointsMap.get(tp.player_id) ?? 0,
        valor: p?.precio ?? 0,
        is_starter: tp.is_starter || false,
        is_captain: tp.is_captain || false,
      }
    })

    const starters = jugadores.filter(j => j.is_starter)
    const subs = jugadores.filter(j => !j.is_starter)

    const totalPoints = jugadores.reduce((sum, j) => sum + j.puntos, 0)

    setUserTeamData(prev => ({
      ...prev,
      [userId]: { teamName, jugadores: starters, suplentes: subs, totalPoints }
    }))

    setTimeout(() => {
      teamRefs.current[userId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const getPositionMedal = (position: number, isLast: boolean = false) => {
    if (position === 1) return <Medal className="w-5 h-5 text-yellow-500" />
    if (position === 2) return <Medal className="w-5 h-5 text-slate-400" />
    if (position === 3) return <Medal className="w-5 h-5 text-amber-600" />
    if (isLast) return <span className="text-lg w-5 text-center">🐷</span>
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

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando clasificación...</div>
  }

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
          <div className="overflow-x-auto w-full">
            <table className="min-w-max w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-xs font-semibold text-slate-300 px-2 py-3 whitespace-nowrap">Pos</th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-2 py-3 whitespace-nowrap">Jugador</th>
                  <th
                    className="text-right text-xs font-semibold text-slate-300 px-2 py-3 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('total_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Pts Totales
                      <SortIcon field="total_points" />
                    </div>
                  </th>
                  <th
                    className="text-right text-xs font-semibold text-slate-300 px-2 py-3 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('average_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Promedio
                      <SortIcon field="average_points" />
                    </div>
                  </th>
                  <th
                    className="text-right text-xs font-semibold text-slate-300 px-2 py-3 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('last_3_jornadas_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Últ. 3
                      <SortIcon field="last_3_jornadas_points" />
                    </div>
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-300 px-2 py-3 whitespace-nowrap">Tendencia</th>
                  <th
                    className="text-right text-xs font-semibold text-slate-300 px-2 py-3 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('best_change_score')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      % Cambios
                      <SortIcon field="best_change_score" />
                    </div>
                  </th>
                  <th
                    className="text-center text-xs font-semibold text-slate-300 px-2 py-3 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('podium_finishes')}
                    title="Veces entre los 3 primeros de una jornada"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Trophy className="w-3 h-3 text-yellow-500" />
                      Podios
                      <SortIcon field="podium_finishes" />
                    </div>
                  </th>
                  <th
                    className="text-center text-xs font-semibold text-slate-300 px-2 py-3 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('bottom_finishes')}
                    title="Veces entre los 3 últimos de una jornada"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <TrendingDown className="w-3 h-3 text-red-500" />
                      Colistas
                      <SortIcon field="bottom_finishes" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {standings.map((standing, index) => {
                  const isLast = index === standings.length - 1
                  const isExpanded = expandedUser === standing.user_id
                  const isCurrentUser = currentUserId === standing.user_id
                  return (
                  <>
                  <tr
                    key={standing.user_id}
                    className={`border-b border-slate-700 transition-colors ${
                      isCurrentUser ? 'bg-emerald-900/30 animate-pulse' :
                      isExpanded ? 'bg-slate-600' : 'hover:bg-slate-700/50'
                    } cursor-pointer`}
                    onClick={() => handleUserClick(standing.user_id)}
                  >
                    <td className="px-2 py-3">
                      {getPositionMedal(standing.current_position, isLast)}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex w-7 h-7 rounded-full bg-slate-600 items-center justify-center shrink-0">
                          <User className="w-3 h-3 text-slate-300" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-xs whitespace-nowrap uppercase">{standing.user_name}</p>
                          {standing.best_matchday_points > 0 && (
                            <p className="text-xs text-amber-400 font-medium whitespace-nowrap">
                              Mejor: {Math.round(standing.best_matchday_points * 10) / 10} pts (J{standing.best_matchday})
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      <span className="text-base font-bold text-emerald-400">
                        {Math.round(standing.total_points * 10) / 10}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">pts</span>
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      <span className="text-sm font-semibold text-slate-200">
                        {standing.average_points}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">pts/j</span>
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      <span className="text-sm font-semibold text-blue-400">
                        {Math.round(standing.last_3_jornadas_points * 10) / 10}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex justify-center">
                        {getTrendIcon(standing.last_3_trend)}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <span className={`text-sm font-bold ${
                          standing.best_change_score >= 70 ? 'text-emerald-400' :
                          standing.best_change_score >= 40 ? 'text-amber-400' : 'text-slate-400'
                        }`}>
                          {standing.best_change_score}%
                        </span>
                        {standing.best_change_score >= 70 && (
                          <CheckCircle className="w-3 h-3 text-emerald-400" />
                        )}
                      </div>
                      <p className="text-xs text-slate-400 whitespace-nowrap">
                        {standing.successful_changes}/{standing.total_changes}
                      </p>
                    </td>
                    <td className="px-2 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />
                        <span className="text-sm font-bold text-yellow-400">
                          {standing.podium_finishes}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <TrendingDown className="w-3 h-3 text-red-500 shrink-0" />
                        <span className="text-sm font-bold text-red-400">
                          {standing.bottom_finishes}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {/* Equipo desplegable */}
                  {isExpanded && userTeamData[standing.user_id] && (
                    <tr>
                      <td colSpan={10} className="p-0">
                        <div ref={(el) => { teamRefs.current[standing.user_id] = el; }} className="bg-slate-700/50 p-4">
                          <Card className="!bg-slate-800 border-slate-600">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2 mb-4">
                                <Users className="w-5 h-5 text-emerald-400" />
                                <h3 className="text-lg font-bold text-white">
                                  {userTeamData[standing.user_id]?.teamName}
                                </h3>
                                <Badge className="bg-emerald-600 text-white">
                                  {userTeamData[standing.user_id]?.totalPoints || 0} pts (J{currentMatchday})
                                </Badge>
                              </div>
                              <div className="grid gap-3">
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Titulares</p>
                                  <div className="grid gap-2">
                                    {userTeamData[standing.user_id]?.jugadores.map((player: any, idx: number) => (
                                      <div key={player.id} className="flex items-center justify-between p-2 bg-slate-700 rounded-lg">
                                        <div className="flex items-center gap-3">
                                          {player.photo ? (
                                            <img src={player.photo} alt={player.short_name} className="w-8 h-8 rounded-full object-cover border-2 border-slate-500" />
                                          ) : (
                                            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-300">
                                              {player.shirt_number || '?'}
                                            </div>
                                          )}
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm font-semibold text-white">{player.short_name}</span>
                                              <Badge className={`text-xs ${getPositionColor(player.position)}`}>
                                                {getPositionLabel(player.position)}
                                              </Badge>
                                              {player.is_captain && <Badge className="text-xs bg-yellow-500 text-white">C</Badge>}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                              {player.team?.logo_url && (
                                                <img src={player.team.logo_url} alt={player.team.name} className="w-3 h-3 object-contain" />
                                              )}
                                              <span>{player.team?.name}</span>
                                            </div>
                                          </div>
                                        </div>
                                        <span className={`text-lg font-bold ${player.puntos > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                          {player.puntos}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                {userTeamData[standing.user_id]?.suplentes.length > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Suplentes</p>
                                    <div className="grid gap-2">
                                      {userTeamData[standing.user_id]?.suplentes.map((player: any, idx: number) => (
                                        <div key={player.id} className="flex items-center justify-between p-2 bg-slate-700/50 rounded-lg">
                                          <div className="flex items-center gap-3">
                                            {player.photo ? (
                                              <img src={player.photo} alt={player.short_name} className="w-8 h-8 rounded-full object-cover border-2 border-slate-600" />
                                            ) : (
                                              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                                {player.shirt_number || '?'}
                                              </div>
                                            )}
                                            <div>
                                              <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-slate-300">{player.short_name}</span>
                                                <Badge className={`text-xs ${getPositionColor(player.position)}`}>
                                                  {getPositionLabel(player.position)}
                                                </Badge>
                                              </div>
                                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                                {player.team?.logo_url && (
                                                  <img src={player.team.logo_url} alt={player.team.name} className="w-3 h-3 object-contain" />
                                                )}
                                                <span>{player.team?.name}</span>
                                              </div>
                                            </div>
                                          </div>
                                          <span className={`text-lg font-bold ${player.puntos > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            {player.puntos}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </td>
                    </tr>
                  )}
                  </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas destacadas - MOVIDAS ABAJO DE LA TABLA */}
      {(topEvolution || topChanges) && (
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
                    <p className="text-lg font-bold text-emerald-900 uppercase">{topEvolution.user_name}</p>
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
                    <p className="text-lg font-bold text-blue-900 uppercase">{topChanges.user_name}</p>
                    <p className="text-sm text-blue-700">{topChanges.best_change_score}% de acierto</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
