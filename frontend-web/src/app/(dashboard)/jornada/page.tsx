'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Users } from 'lucide-react'

interface Player {
  id: string
  first_name: string
  last_name: string
  short_name: string
  position: string
  photo?: string
  shirt_number?: number
  puntos?: number
  is_starter?: boolean
  is_captain?: boolean
  team?: { name: string; logo_url?: string }
}

interface UserTeam {
  team_id: string
  user_id: string
  user_name: string
  team_name: string
  created_at: string
  jugadores: Player[]
  puntos_totales: number
  posicion?: number
}

interface MatchdayInfo {
  matchday: number | string
  momento?: string
  start_time: string
  end_time?: string
  is_complete?: boolean
}

export default function JornadaPage() {
  const [loading, setLoading] = useState(true)
  const [selectedMatchday, setSelectedMatchday] = useState<number>(0)
  const [availableMatchdays, setAvailableMatchdays] = useState<MatchdayInfo[]>([])
  const [userTeams, setUserTeams] = useState<UserTeam[]>([])
  const [userCreatedDates, setUserCreatedDates] = useState<Map<string, string>>(new Map())
  const supabase = createClient()

  // Obtener todas las jornadas disponibles con matchday lógico
  const fetchMatchdays = async () => {
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('matchday, momento, start_time')
      .order('start_time', { ascending: true })

    if (!fixtures) return

    // Calcular el matchday numérico máximo
    const numericMatchdays = fixtures
      .filter(f => f.matchday && f.matchday > 0)
      .map(f => f.matchday as number)
    const maxNumericMatchday = numericMatchdays.length > 0 ? Math.max(...numericMatchdays) : 0

    // Agrupar por matchday/momento
    const matchdaysMap = new Map<string, { matchday: number | string; momento: string | null; start_time: string; fixtures: typeof fixtures }>()

    for (const fixture of fixtures) {
      let key: string

      if (fixture.matchday && fixture.matchday > 0) {
        key = `md-${fixture.matchday}`
      } else {
        const momentoName = fixture.momento || 'Unknown'
        key = `momento-${momentoName}`
      }

      if (!matchdaysMap.has(key)) {
        const momentoName = fixture.momento || 'Unknown'
        matchdaysMap.set(key, {
          matchday: fixture.matchday && fixture.matchday > 0 ? fixture.matchday : momentoName,
          momento: fixture.momento,
          start_time: fixture.start_time,
          fixtures: []
        })
      }
      matchdaysMap.get(key)!.fixtures.push(fixture)
    }

    // Convertir a array, calculando fecha de inicio (min) y de fin (max) de cada jornada
    let matchdays: MatchdayInfo[] = Array.from(matchdaysMap.values())
      .map(m => ({
        matchday: m.matchday,
        momento: m.momento ?? undefined,
        start_time: m.fixtures.length > 0
          ? m.fixtures.reduce((min, f) => f.start_time < min ? f.start_time : min, m.fixtures[0].start_time)
          : m.start_time,
        end_time: m.fixtures.length > 0
          ? m.fixtures.reduce((max, f) => f.start_time > max ? f.start_time : max, m.fixtures[0].start_time)
          : m.start_time,
      }))

    // Separar numèriques i moments
    const numericMatchdaysInfo = matchdays
      .filter(m => typeof m.matchday === 'number' && m.matchday > 0)
      .sort((a, b) => (a.matchday as number) - (b.matchday as number))

    const momentMatchdaysInfo = matchdays
      .filter(m => typeof m.matchday === 'string')
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    // Assignar números correlatius als moments: maxNumeric + 1, maxNumeric + 2, ...
    const momentMatchdaysWithNumbers: MatchdayInfo[] = momentMatchdaysInfo.map((m, index) => ({
      matchday: maxNumericMatchday + 1 + index,
      momento: m.momento || undefined,
      start_time: m.start_time,
      end_time: m.end_time,
    }))

    // Unir: primer numèriques, després moments
    matchdays = [...numericMatchdaysInfo, ...momentMatchdaysWithNumbers]

    // SOLO jornadas YA FINALIZADAS: el tramo cierra 2h después del último partido.
    // Las jornadas en curso (tramo activo) y las futuras quedan ocultas, así que no
    // se pueden ver los equipos de los demás usuarios hasta que la jornada termine.
    const now = new Date()
    const LOCK_BUFFER_MS = 2 * 60 * 60 * 1000
    const finishedMatchdays = matchdays.filter(
      m => new Date(m.end_time || m.start_time).getTime() + LOCK_BUFFER_MS < now.getTime()
    )

    setAvailableMatchdays(finishedMatchdays)

    if (finishedMatchdays.length > 0) {
      // Por defecto, la última jornada finalizada
      setSelectedMatchday(finishedMatchdays[finishedMatchdays.length - 1].matchday as number)
    } else {
      // No hay ninguna jornada finalizada todavía
      setLoading(false)
    }
  }

  // Obtener fechas de creación de usuarios
  const fetchUserCreatedDates = async () => {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, created_at')

    const { data: teams } = await supabase
      .from('user_teams')
      .select('user_id, created_at')

    const datesMap = new Map<string, string>()

    profiles?.forEach(p => {
      datesMap.set(p.id, p.created_at)
    })

    teams?.forEach(t => {
      if (!datesMap.has(t.user_id)) {
        datesMap.set(t.user_id, t.created_at)
      }
    })

    setUserCreatedDates(datesMap)
    return datesMap
  }

  // Verificar si un usuario puede participar en una jornada
  const canParticipateInMatchday = (userCreatedAt: string, matchday: number | string, matchdayDate: string): boolean => {
    const userDate = new Date(userCreatedAt)
    const matchDate = new Date(matchdayDate)
    return userDate <= matchDate
  }

  // Cargar equipos y jugadores de la jornada seleccionada
  const loadUserTeamsForMatchday = async (matchday: number) => {
    setLoading(true)

    // Obtener todas las fechas de creación de usuarios
    const createdDates = await fetchUserCreatedDates()

    // Obtener fecha de la jornada seleccionada
    const matchdayInfo = availableMatchdays.find(m => m.matchday === matchday)
    const matchdayDate = matchdayInfo?.start_time || new Date().toISOString()

    // Determinar si es un momento especial (matchday > maxNumericMatchday)
    const maxNumericMatchday = availableMatchdays
      .filter(m => typeof m.matchday === 'number' && m.momento === undefined)
      .map(m => m.matchday as number)
      .reduce((a, b) => Math.max(a, b), 0)
    const isMomento = matchday > maxNumericMatchday

    // Obtener todos los user_teams
    const { data: userTeamsData } = await supabase
      .from('user_teams')
      .select('id, user_id, name')

    if (!userTeamsData || userTeamsData.length === 0) {
      setLoading(false)
      return
    }

    // Obtener team_players de esta jornada
    let teamPlayersData = null

    if (isMomento) {
      // Para momentos especiales: el matchday lógico se guarda como el número en team_players
      const { data: specificPlayers } = await supabase
        .from('team_players')
        .select('team_id, player_id, is_starter, is_captain, matchday')
        .in('team_id', userTeamsData.map(t => t.id))
        .eq('matchday', matchday)

      teamPlayersData = specificPlayers

      // Si no hay, buscar el último matchday disponible
      if (!specificPlayers || specificPlayers.length === 0) {
        const { data: fallbackPlayers } = await supabase
          .from('team_players')
          .select('team_id, player_id, is_starter, is_captain, matchday')
          .in('team_id', userTeamsData.map(t => t.id))
          .lte('matchday', matchday)
          .order('matchday', { ascending: false })
          .limit(11)

        teamPlayersData = fallbackPlayers
      }
    } else if (matchday > 0) {
      // Para jornadas numéricas, intentar primero esa jornada
      const { data: specificPlayers } = await supabase
        .from('team_players')
        .select('team_id, player_id, is_starter, is_captain, matchday')
        .in('team_id', userTeamsData.map(t => t.id))
        .eq('matchday', matchday)

      teamPlayersData = specificPlayers

      // Si no hay, buscar el último matchday disponible
      if (!specificPlayers || specificPlayers.length === 0) {
        const { data: fallbackPlayers } = await supabase
          .from('team_players')
          .select('team_id, player_id, is_starter, is_captain, matchday')
          .in('team_id', userTeamsData.map(t => t.id))
          .lte('matchday', matchday)
          .order('matchday', { ascending: false })
          .limit(11)

        teamPlayersData = fallbackPlayers
      }
    }

    if (!teamPlayersData || teamPlayersData.length === 0) {
      console.log('[Jornada] No hay team_players para esta jornada')
      console.log('[Jornada] matchday:', matchday)
      console.log('[Jornada] userTeamsData:', userTeamsData?.length)
      setUserTeams([])
      setLoading(false)
      return
    }

    console.log('[Jornada] teamPlayersData cargados:', teamPlayersData.length)

    // Obtener IDs de jugadores únicos
    const playerIds = [...new Set(teamPlayersData.map(tp => tp.player_id))]

    // Obtener datos de jugadores con sus equipos
    const { data: playersData } = await supabase
      .from('players')
      .select('id, first_name, last_name, short_name, position, photo, shirt_number, team_id')
      .in('id', playerIds)

    // Obtener equipos
    const teamIds = [...new Set(playersData?.map(p => p.team_id).filter(Boolean) || [])]
    const { data: teamsData } = await supabase
      .from('real_teams')
      .select('id, name, logo_url')
      .in('id', teamIds)

    const teamsMap = new Map(teamsData?.map(t => [t.id, t]) || [])

    // Obtener puntos de jugadores para esta jornada
    const { data: scoresData } = await supabase
      .from('player_scores')
      .select('player_id, total_points, fixture_id')
      .in('player_id', playerIds)

    // Agrupar puntos por jugador (suma de todos los fixtures)
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

    // Crear mapa de player_id -> team_players info (is_starter, is_captain, team_id)
    const teamPlayersInfoMap = new Map<string, { team_id: string; is_starter: boolean; is_captain: boolean }>()
    for (const tp of teamPlayersData) {
      teamPlayersInfoMap.set(tp.player_id, {
        team_id: tp.team_id,
        is_starter: tp.is_starter,
        is_captain: tp.is_captain,
      })
    }

    // Crear equipos con jugadores y puntos
    const teams: UserTeam[] = []

    for (const ut of userTeamsData) {
      const user = usersMap.get(ut.user_id)
      const userName = user?.full_name || user?.email?.split('@')[0] || 'Usuario'
      const userCreatedAt = createdDates.get(ut.user_id) || new Date().toISOString()

      // Verificar si el usuario puede participar en esta jornada
      if (!canParticipateInMatchday(userCreatedAt, matchday, matchdayDate)) {
        continue // Saltar usuarios que se registraron después de esta jornada
      }

      // Obtener jugadores de este equipo
      const teamPlayerIds = teamPlayersData
        .filter(tp => tp.team_id === ut.id)
        .map(tp => tp.player_id)

      const jugadores: Player[] = (playersData || [])
        .filter(p => teamPlayerIds.includes(p.id))
        .map(p => {
          const tpInfo = teamPlayersInfoMap.get(p.id)
          const teamObj = teamsMap.get(p.team_id)
          return {
            ...p,
            team: teamObj ? { name: teamObj.name, logo_url: teamObj.logo_url } : undefined,
            puntos: playerPointsMap.get(p.id) ?? 0,
            is_starter: tpInfo?.is_starter || false,
            is_captain: tpInfo?.is_captain || false,
          }
        })

      // Ordenar: titulares primero, luego por puntos
      jugadores.sort((a, b) => {
        if (a.is_starter && !b.is_starter) return -1
        if (!a.is_starter && b.is_starter) return 1
        return (b.puntos || 0) - (a.puntos || 0)
      })

      const puntos_totales = jugadores.reduce((sum, p) => sum + (p.puntos || 0), 0)

      teams.push({
        team_id: ut.id,
        user_id: ut.user_id,
        user_name: userName,
        team_name: ut.name,
        created_at: userCreatedAt,
        jugadores,
        puntos_totales,
      })
    }

    // Ordenar equipos por puntos totales y asignar posición
    teams.sort((a, b) => b.puntos_totales - a.puntos_totales)
    teams.forEach((team, index) => {
      team.posicion = index + 1
    })

    setUserTeams(teams)
    setLoading(false)
  }

  // Efecto para cargar datos cuando cambia la jornada
  useEffect(() => {
    fetchMatchdays()
  }, [])

  useEffect(() => {
    if (selectedMatchday && availableMatchdays.length > 0) {
      loadUserTeamsForMatchday(selectedMatchday)
    }
  }, [selectedMatchday])

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

  const getMatchdayLabel = (matchday: number | string, momento?: string) => {
    if (typeof matchday === 'string') {
      // És un moment especial
      return matchday
    }
    if (matchday === 0 && momento) return momento
    return `Jornada ${matchday}`
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando jornada...</div>
  }

  return (
    <div className="space-y-6">
      {/* Cabecera con selector de jornada */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Jornada</h1>
          <p className="text-slate-600 mt-1">
            Clasificación y equipos de jornadas ya finalizadas
          </p>
        </div>

        {/* Selector de jornada */}
        <div className="flex items-center gap-2">
          <select
            value={selectedMatchday}
            onChange={(e) => setSelectedMatchday(Number(e.target.value) || 0)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-emerald-500"
          >
            {availableMatchdays.map(m => (
              <option key={m.matchday} value={m.matchday}>
                {getMatchdayLabel(m.matchday, m.momento)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Clasificación de la jornada */}
      {userTeams.length > 0 && (
        <Card className="border-2 border-emerald-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Clasificación {getMatchdayLabel(selectedMatchday, availableMatchdays.find(m => m.matchday === selectedMatchday)?.momento)}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-600">Pos</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-600">Usuario</th>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-slate-600">Equipo</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-slate-600">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {userTeams.map((team) => (
                    <tr key={team.team_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {team.posicion === 1 && <Trophy className="w-4 h-4 text-yellow-500" />}
                          {team.posicion === 2 && <Trophy className="w-4 h-4 text-gray-400" />}
                          {team.posicion === 3 && <Trophy className="w-4 h-4 text-amber-600" />}
                          <span className={`font-bold ${(team.posicion ?? 0) <= 3 ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {team.posicion}º
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-slate-900">{team.user_name}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-sm text-slate-600">{team.team_name}</span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Badge className="bg-emerald-600 text-white text-sm px-3 py-1">
                          {team.puntos_totales} pts
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Equipos de usuarios - Mini tablas por usuario */}
      {userTeams.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-bold text-slate-900">Equipos por Usuario</h2>
          </div>

          {userTeams.map((team) => (
            <Card key={team.team_id} className="!border-slate-200">
              <CardContent className="p-0">
                {/* Cabecera del equipo */}
                <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        team.posicion === 1 ? 'bg-yellow-500' :
                        team.posicion === 2 ? 'bg-gray-400' :
                        team.posicion === 3 ? 'bg-amber-600' :
                        'bg-emerald-600'
                      }`}>
                        <span className="text-white font-bold">{team.posicion}º</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{team.user_name}</h3>
                        <p className="text-xs text-slate-500">{team.team_name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Puntos jornada</p>
                      <p className="text-2xl font-bold text-emerald-600">{team.puntos_totales}</p>
                    </div>
                  </div>
                </div>

                {/* Jugadores */}
                <div className="p-4">
                  <div className="space-y-2">
                    {/* Titulares */}
                    {team.jugadores.filter(p => p.is_starter).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Titulares</p>
                        <div className="grid gap-2">
                          {team.jugadores
                            .filter(p => p.is_starter)
                            .map((player, idx) => (
                              <div
                                key={player.id}
                                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-bold text-slate-400 w-6">{idx + 1}</span>
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
                                      <span className="font-semibold text-slate-900">{player.short_name || player.first_name}</span>
                                      <Badge className={`text-xs ${getPositionColor(player.position)}`}>
                                        {getPositionLabel(player.position)}
                                      </Badge>
                                      {player.is_captain && (
                                        <Badge className="text-xs bg-yellow-500 text-white">C</Badge>
                                      )}
                                      {player.team && (
                                        <span className="text-xs text-slate-500">{player.team.name}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="text-lg font-bold text-emerald-600">{player.puntos ?? 0}</span>
                                  <p className="text-xs text-slate-500">puntos</p>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Suplentes */}
                    {team.jugadores.filter(p => !p.is_starter).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Suplentes</p>
                        <div className="grid gap-2">
                          {team.jugadores
                            .filter(p => !p.is_starter)
                            .map((player, idx) => (
                              <div
                                key={player.id}
                                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-bold text-slate-400 w-6">{idx + 1}</span>
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
                                      <span className="font-semibold text-slate-900">{player.short_name || player.first_name}</span>
                                      <Badge className={`text-xs ${getPositionColor(player.position)}`}>
                                        {getPositionLabel(player.position)}
                                      </Badge>
                                      {player.team && (
                                        <span className="text-xs text-slate-500">{player.team.name}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="text-lg font-bold text-emerald-600">{player.puntos ?? 0}</span>
                                  <p className="text-xs text-slate-500">puntos</p>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            {availableMatchdays.length === 0 ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Aún no hay jornadas finalizadas
                </h3>
                <p className="text-slate-500">
                  Cuando termine una jornada podrás ver aquí los equipos y la clasificación del resto de usuarios
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  No hay equipos para esta jornada
                </h3>
                <p className="text-slate-500">
                  Los usuarios aún no han alineado jugadores para esta jornada
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
