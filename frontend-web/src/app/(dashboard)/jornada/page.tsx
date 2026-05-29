'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, Lock, Unlock, Trophy, Users, RefreshCcw } from 'lucide-react'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'

interface Fixture {
  id: string
  matchday: number
  home_team_id: string
  away_team_id: string
  start_time: string
  status?: string
  home_score?: number
  away_score?: number
  home_team?: { name: string; badge_url?: string }
  away_team?: { name: string; badge_url?: string }
}

interface Player {
  id: string
  first_name: string
  last_name: string
  short_name: string
  position: string
  photo?: string
  shirt_number?: number
  points?: number
  is_starter?: boolean
  is_captain?: boolean
}

interface UserTeamWithPlayers {
  team_id: string
  team_name: string
  user_id: string
  user_name: string
  players: Player[]
  total_points: number
  matchday: number
}

interface MatchdayStatus {
  matchday: number
  deadline: string
  is_open: boolean
  current_time: string
}

export default function JornadaPage() {
  const [loading, setLoading] = useState(true)
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [userTeams, setUserTeams] = useState<UserTeamWithPlayers[]>([])
  const [matchdayStatus, setMatchdayStatus] = useState<MatchdayStatus | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<string>('')
  const supabase = createClient()
  const { isUnlockWindowOpen, isLocked, currentMatchday } = useMatchdayLock()

  // Calcular tiempo restante para el desbloqueo
  const calculateTimeRemaining = async (matchday: number) => {
    const { data: fixturesData } = await supabase
      .from('fixtures')
      .select('start_time')
      .eq('matchday', matchday)
      .order('start_time', { ascending: true })
      .limit(1)

    if (fixturesData && fixturesData.length > 0) {
      const firstMatchTime = new Date(fixturesData[0].start_time)
      const unlockTime = new Date(firstMatchTime.getTime() - 60 * 60 * 1000) // 1h antes
      const now = new Date()
      const diffMs = unlockTime.getTime() - now.getTime()

      if (diffMs > 0) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60))
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        setTimeRemaining(`${hours}h ${mins}min`)
      } else {
        setTimeRemaining('')
      }
    }
  }

  const loadUserTeamsWithPlayers = async (matchday: number) => {
    // Obtener todos los user_teams
    const { data: userTeamsData } = await supabase
      .from('user_teams')
      .select('id, user_id, name')

    if (!userTeamsData || userTeamsData.length === 0) return

    // Obtener team_players de esta jornada
    const { data: teamPlayers } = await supabase
      .from('team_players')
      .select('team_id, player_id, is_starter, is_captain')
      .eq('matchday', matchday)

    if (!teamPlayers || teamPlayers.length === 0) return

    // Obtener IDs de jugadores únicos
    const playerIds = [...new Set(teamPlayers.map(tp => tp.player_id))]

    // Obtener datos de jugadores
    const { data: playersData } = await supabase
      .from('players')
      .select('id, first_name, last_name, short_name, position, photo, shirt_number')
      .in('id', playerIds)

    const playersMap = new Map(playersData?.map(p => [p.id, p]) || [])

    // Obtener puntos de jugadores (si existe la tabla player_scores)
    const { data: scoresData } = await supabase
      .from('player_scores')
      .select('player_id, total_points')
      .in('player_id', playerIds)

    const playerPointsMap = new Map<string, number>()
    scoresData?.forEach(s => {
      playerPointsMap.set(s.player_id, (playerPointsMap.get(s.player_id) || 0) + (s.total_points || 0))
    })

    // Obtener nombres de usuarios
    const userIds = [...new Set(userTeamsData.map(ut => ut.user_id))]
    const { data: usersData } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)

    const usersMap = new Map(usersData?.map(u => [u.id, u]) || [])

    // Agrupar team_players por team_id
    const playersByTeam = new Map<string, typeof teamPlayers>()
    for (const tp of teamPlayers) {
      if (!playersByTeam.has(tp.team_id)) {
        playersByTeam.set(tp.team_id, [])
      }
      playersByTeam.get(tp.team_id)!.push(tp)
    }

    // Crear equipos con jugadores
    const teams: UserTeamWithPlayers[] = []

    for (const ut of userTeamsData) {
      const user = usersMap.get(ut.user_id)
      const userName = user?.full_name || user?.email?.split('@')[0] || 'Usuario'

      const teamPlayersList = playersByTeam.get(ut.id) || []
      const players: Player[] = teamPlayersList
        .map(tp => {
          const player = playersMap.get(tp.player_id)
          if (!player) return null
          return {
            ...player,
            points: playerPointsMap.get(tp.player_id) ?? 0,
            is_starter: tp.is_starter,
            is_captain: tp.is_captain,
          }
        })
        .filter(Boolean) as Player[]

      // Ordenar: titulares primero por puntos
      players.sort((a, b) => {
        if (a.is_starter && !b.is_starter) return -1
        if (!a.is_starter && b.is_starter) return 1
        return (b.points || 0) - (a.points || 0)
      })

      const totalPoints = players.reduce((sum, p) => sum + (p.points || 0), 0)

      teams.push({
        team_id: ut.id,
        team_name: ut.name,
        user_id: ut.user_id,
        user_name: userName,
        players,
        total_points: totalPoints,
        matchday,
      })
    }

    // Ordenar equipos por puntos totales
    teams.sort((a, b) => b.total_points - a.total_points)
    setUserTeams(teams)
  }

  const fetchJornada = async () => {
    if (!currentMatchday || currentMatchday <= 0) {
      setLoading(false)
      return
    }

    // Obtener estado de la jornada
    const { data: statusData } = await supabase
      .from('matchday_status')
      .select('*')
      .eq('matchday', currentMatchday)
      .maybeSingle()

    if (statusData) {
      setMatchdayStatus(statusData)
    }

    // Calcular tiempo restante
    await calculateTimeRemaining(currentMatchday)

    // Obtener fixtures de la jornada
    const { data: fixturesData } = await supabase
      .from('fixtures')
      .select('*')
      .eq('matchday', currentMatchday)
      .order('start_time', { ascending: true })

    if (!fixturesData) {
      setLoading(false)
      return
    }

    // Obtener información de los equipos
    const teamIds = [...new Set(fixturesData.flatMap(f => [f.home_team_id, f.away_team_id].filter(Boolean)))]
    const { data: teamsData } = await supabase
      .from('real_teams')
      .select('id, name')
      .in('id', teamIds)

    const teamsMap = new Map(teamsData?.map(t => [t.id, t]) || [])

    // Obtener escudos
    const { data: badgesData } = await supabase
      .from('team_badges')
      .select('team_id, badge_url')
      .in('id', teamIds)

    const badgesMap = new Map(badgesData?.map(b => [b.team_id, b.badge_url]) || [])

    // Combinar datos
    const fixturesWithTeams = fixturesData.map(f => ({
      ...f,
      home_team: f.home_team_id ? {
        name: teamsMap.get(f.home_team_id)?.name || 'Local',
        badge_url: badgesMap.get(f.home_team_id) || undefined
      } : null,
      away_team: f.away_team_id ? {
        name: teamsMap.get(f.away_team_id)?.name || 'Visitante',
        badge_url: badgesMap.get(f.away_team_id) || undefined
      } : null
    }))

    setFixtures(fixturesWithTeams)

    // Cargar equipos de usuarios si la jornada está desbloqueada
    if (isUnlockWindowOpen) {
      await loadUserTeamsWithPlayers(currentMatchday)
    } else {
      setUserTeams([])
    }

    setLoading(false)
  }

  useEffect(() => {
    if (currentMatchday && currentMatchday > 0) {
      fetchJornada()
    }
  }, [currentMatchday, isUnlockWindowOpen])

  // Polling cuando la jornada está desbloqueada
  useEffect(() => {
    if (!isUnlockWindowOpen || !currentMatchday) return

    const interval = setInterval(() => {
      fetchJornada()
    }, 30000)

    return () => clearInterval(interval)
  }, [isUnlockWindowOpen, currentMatchday])

  // Actualizar tiempo restante cada minuto
  useEffect(() => {
    if (!currentMatchday) return

    const interval = setInterval(() => {
      calculateTimeRemaining(currentMatchday)
    }, 60000)

    return () => clearInterval(interval)
  }, [currentMatchday])

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    })
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

  const renderPlayerRow = (player: Player, index: number) => (
    <div
      key={player.id}
      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-slate-400 w-6">{index + 1}</span>
        {player.photo ? (
          <img
            src={player.photo}
            alt={player.short_name || ''}
            className="w-10 h-10 rounded-full object-cover border-2 border-slate-300"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center text-sm font-bold text-slate-600 border-2 border-slate-400">
            {player.shirt_number || '?'}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{player.short_name || `${player.first_name} ${player.last_name}`}</span>
            <Badge className={`text-xs ${getPositionColor(player.position)}`}>
              {getPositionLabel(player.position)}
            </Badge>
            {player.is_captain && (
              <Badge className="text-xs bg-yellow-500 text-white">C</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        <span className="text-lg font-bold text-emerald-600">{player.points ?? 0}</span>
        <p className="text-xs text-slate-500">puntos</p>
      </div>
    </div>
  )

  // Agrupar partidos por fecha
  const fixturesByDate = fixtures.reduce((acc, fixture) => {
    const date = fixture.start_time.split('T')[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(fixture)
    return acc
  }, {} as Record<string, Fixture[]>)

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando jornada...</div>
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Jornada {currentMatchday}</h1>
          <p className="text-slate-600 mt-1">
            {isUnlockWindowOpen ? 'Alineaciones desbloqueadas' : 'Bloqueada hasta 1h antes del primer partido'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isUnlockWindowOpen ? (
            <Unlock className="w-5 h-5 text-emerald-600" />
          ) : (
            <Lock className="w-5 h-5 text-amber-600" />
          )}
        </div>
      </div>

      {/* Mensaje de bloqueo con cuenta atrás */}
      {isLocked && (
        <Card className="!bg-amber-50 border-amber-200">
          <CardContent className="p-6 text-center">
            <Lock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-amber-900 mb-2">
              Jornada bloqueada
            </h3>
            <p className="text-amber-700 mb-4">
              Las alineaciones se desbloquearán 1 hora antes del primer partido
            </p>
            {timeRemaining && (
              <div className="inline-flex items-center gap-2 bg-amber-100 px-4 py-2 rounded-full">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-amber-800">
                  Tiempo restante: {timeRemaining}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Partidos de la jornada */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Partidos de la jornada
          </h3>
          <div className="space-y-2">
            {fixtures.map(fixture => (
              <div key={fixture.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {fixture.home_team?.name || 'Local'}
                  </span>
                  <span className="text-slate-400">vs</span>
                  <span className="text-sm font-medium text-slate-900">
                    {fixture.away_team?.name || 'Visitante'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {formatTime(fixture.start_time)}
                  </Badge>
                  {fixture.status === 'finished' && (
                    <span className="text-sm font-bold text-emerald-600">
                      {fixture.home_score ?? 0} - {fixture.away_score ?? 0}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Equipos de usuarios (solo cuando está desbloqueado) */}
      {isUnlockWindowOpen && userTeams.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-600" />
              <h2 className="text-xl font-bold text-slate-900">
                Equipos de la Jornada {currentMatchday}
              </h2>
            </div>
            <Badge variant="outline" className="text-emerald-600 border-emerald-600">
              <Unlock className="w-3 h-3 mr-1" />
              Desbloqueado
            </Badge>
          </div>

          {userTeams.map((team) => (
            <Card key={team.team_id} className="!border-slate-200">
              <CardContent className="p-0">
                {/* Cabecera del equipo */}
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{team.user_name}</h3>
                        <p className="text-xs text-slate-500">{team.team_name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Puntos jornada</p>
                      <p className="text-2xl font-bold text-emerald-600">{team.total_points}</p>
                    </div>
                  </div>
                </div>

                {/* Jugadores */}
                <div className="p-4">
                  <div className="space-y-2">
                    {/* Titulares */}
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Titulares</p>
                      <div className="grid gap-2">
                        {team.players
                          .filter(p => p.is_starter)
                          .map((player, idx) => renderPlayerRow(player, idx))}
                      </div>
                    </div>

                    {/* Suplentes */}
                    {team.players.some(p => !p.is_starter) && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Suplentes</p>
                        <div className="grid gap-2">
                          {team.players
                            .filter(p => !p.is_starter)
                            .map((player, idx) => renderPlayerRow(player, idx))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Mensaje cuando no hay equipos */}
      {isUnlockWindowOpen && userTeams.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              No hay equipos alineados
            </h3>
            <p className="text-slate-500">
              Los usuarios aún no han alineado jugadores para esta jornada
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
