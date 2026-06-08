'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Users, ChevronLeft, ChevronRight, Radio } from 'lucide-react'

interface Player {
  id: string
  first_name: string
  last_name: string
  short_name: string
  position: string
  photo?: string
  shirt_number?: number
  puntos?: number
  valor?: number
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
  valor_total: number
  posicion?: number
}

interface MatchdayInfo {
  matchday: number       // número de jornada para mostrar (momentos remapeados)
  momento?: string
  rawMatchday: number | null  // fixtures.matchday real (null para fases/momentos)
  fixtureIds: string[]
  start_time: string
  end_time: string
  started: boolean
  live: boolean
}

// Duración aproximada de un partido (90' + descanso + añadido) para considerar
// una jornada "en directo" desde su primer partido hasta que acaba el último.
const MATCH_DURATION_MS = 2.5 * 60 * 60 * 1000

export default function JornadaPage() {
  const [loading, setLoading] = useState(true)
  const [selectedMatchday, setSelectedMatchday] = useState<number>(0)
  const [availableMatchdays, setAvailableMatchdays] = useState<MatchdayInfo[]>([])
  const [userTeams, setUserTeams] = useState<UserTeam[]>([])
  const supabase = createClient()

  // Obtener todas las jornadas disponibles (ya empezadas: en directo o finalizadas)
  const fetchMatchdays = async () => {
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, matchday, momento, start_time, status')
      .order('start_time', { ascending: true })

    if (!fixtures) {
      setLoading(false)
      return
    }

    // Calcular el matchday numérico máximo
    const numericMatchdays = fixtures
      .filter(f => f.matchday && f.matchday > 0)
      .map(f => f.matchday as number)
    const maxNumericMatchday = numericMatchdays.length > 0 ? Math.max(...numericMatchdays) : 0

    // Agrupar por matchday/momento, guardando los fixture_ids de cada grupo
    const matchdaysMap = new Map<string, {
      matchday: number | string
      momento: string | null
      rawMatchday: number | null
      fixtureIds: string[]
      starts: number[]
    }>()

    for (const fixture of fixtures) {
      const isNumeric = fixture.matchday && fixture.matchday > 0
      const momentoName = fixture.momento || 'Unknown'
      const key = isNumeric ? `md-${fixture.matchday}` : `momento-${momentoName}`

      if (!matchdaysMap.has(key)) {
        matchdaysMap.set(key, {
          matchday: isNumeric ? (fixture.matchday as number) : momentoName,
          momento: fixture.momento,
          rawMatchday: isNumeric ? (fixture.matchday as number) : null,
          fixtureIds: [],
          starts: [],
        })
      }
      const g = matchdaysMap.get(key)!
      g.fixtureIds.push(fixture.id)
      g.starts.push(new Date(fixture.start_time).getTime())
    }

    const now = Date.now()

    const toInfo = (g: ReturnType<typeof matchdaysMap.get> & object, displayNumber: number): MatchdayInfo => {
      const first = Math.min(...g.starts)
      const last = Math.max(...g.starts)
      const started = now >= first
      const live = started && now <= last + MATCH_DURATION_MS
      return {
        matchday: displayNumber,
        momento: g.momento ?? undefined,
        rawMatchday: g.rawMatchday,
        fixtureIds: g.fixtureIds,
        start_time: new Date(first).toISOString(),
        end_time: new Date(last).toISOString(),
        started,
        live,
      }
    }

    const groups = Array.from(matchdaysMap.values())

    // Jornadas numéricas (conservan su número)
    const numericInfos = groups
      .filter(g => g.rawMatchday != null)
      .sort((a, b) => (a.rawMatchday as number) - (b.rawMatchday as number))
      .map(g => toInfo(g, g.rawMatchday as number))

    // Momentos/fases especiales: se remapean a maxNumeric + 1, + 2, ...
    const momentoInfos = groups
      .filter(g => g.rawMatchday == null)
      .sort((a, b) => Math.min(...a.starts) - Math.min(...b.starts))
      .map((g, index) => toInfo(g, maxNumericMatchday + 1 + index))

    const allInfos = [...numericInfos, ...momentoInfos]

    // Solo mostramos jornadas que YA han empezado (en directo o finalizadas).
    // Las futuras quedan ocultas hasta su primer partido.
    const startedInfos = allInfos.filter(m => m.started)

    setAvailableMatchdays(startedInfos)

    if (startedInfos.length === 0) {
      setLoading(false)
      return
    }

    // Por defecto: la jornada en directo (la más alta si hay varias), si no, la última empezada
    const liveOnes = startedInfos.filter(m => m.live)
    const defaultMatchday = liveOnes.length > 0
      ? liveOnes[liveOnes.length - 1].matchday
      : startedInfos[startedInfos.length - 1].matchday

    setSelectedMatchday(defaultMatchday)
  }

  // Verificar si un usuario puede participar en una jornada (registrado antes)
  const canParticipateInMatchday = (userCreatedAt: string, matchdayDate: string): boolean => {
    return new Date(userCreatedAt) <= new Date(matchdayDate)
  }

  // Cargar equipos y jugadores de la jornada seleccionada
  const loadUserTeamsForMatchday = async (matchday: number, silent = false) => {
    if (!silent) setLoading(true)

    const info = availableMatchdays.find(m => m.matchday === matchday)
    const matchdayDate = info?.start_time || new Date().toISOString()
    const isMomento = info ? info.rawMatchday == null : false

    // Fechas de creación de usuarios (para el control de participación)
    const { data: profiles } = await supabase.from('profiles').select('id, created_at, full_name, email')
    const createdDates = new Map<string, string>()
    profiles?.forEach(p => createdDates.set(p.id, p.created_at))
    const usersMap = new Map(profiles?.map(u => [u.id, u]) || [])

    // Todos los equipos de usuario
    const { data: userTeamsData } = await supabase
      .from('user_teams')
      .select('id, user_id, name, created_at')

    if (!userTeamsData || userTeamsData.length === 0) {
      setUserTeams([])
      setLoading(false)
      return
    }

    userTeamsData.forEach(t => {
      if (!createdDates.has(t.user_id)) createdDates.set(t.user_id, t.created_at)
    })

    const teamIdsUser = userTeamsData.map(t => t.id)

    // team_players de esta jornada (con fallback al último matchday alineado <= jornada)
    let { data: teamPlayersData } = await supabase
      .from('team_players')
      .select('team_id, player_id, is_starter, is_captain, matchday')
      .in('team_id', teamIdsUser)
      .eq('matchday', matchday)

    if (!teamPlayersData || teamPlayersData.length === 0) {
      const { data: fallbackPlayers } = await supabase
        .from('team_players')
        .select('team_id, player_id, is_starter, is_captain, matchday')
        .in('team_id', teamIdsUser)
        .lte('matchday', matchday)
        .order('matchday', { ascending: false })
      teamPlayersData = fallbackPlayers
    }

    if (!teamPlayersData || teamPlayersData.length === 0) {
      setUserTeams([])
      setLoading(false)
      return
    }

    const playerIds = [...new Set(teamPlayersData.map(tp => tp.player_id))]

    // Datos de jugadores (incluye precio para el valor del equipo)
    const { data: playersData } = await supabase
      .from('players')
      .select('id, first_name, last_name, short_name, position, photo, shirt_number, team_id, precio')
      .in('id', playerIds)

    // Equipos reales (escudos)
    const realTeamIds = [...new Set(playersData?.map(p => p.team_id).filter(Boolean) || [])]
    const { data: teamsData } = await supabase
      .from('real_teams')
      .select('id, name, logo_url')
      .in('id', realTeamIds)
    const teamsMap = new Map(teamsData?.map(t => [t.id, t]) || [])

    // Puntos de la jornada: merge por (matchday, player_id) usando la columna matchday.
    // Si está vacío (momento o columna aún sin rellenar), caemos a filtrar por fixture_id.
    let scoresData: { player_id: string; total_points: number }[] | null = null
    if (info && info.rawMatchday != null) {
      const res = await supabase
        .from('player_scores')
        .select('player_id, total_points')
        .eq('matchday', info.rawMatchday)
        .in('player_id', playerIds)
      scoresData = res.data as typeof scoresData
    }
    if ((!scoresData || scoresData?.length === 0) && info && info.fixtureIds.length > 0) {
      const res = await supabase
        .from('player_scores')
        .select('player_id, total_points')
        .in('fixture_id', info.fixtureIds)
        .in('player_id', playerIds)
      scoresData = res.data as typeof scoresData
    }

    const playerPointsMap = new Map<string, number>()
    scoresData?.forEach(s => {
      playerPointsMap.set(s.player_id, (playerPointsMap.get(s.player_id) || 0) + (s.total_points || 0))
    })

    // Info de alineación por (team_id, player_id)
    const teamPlayersByTeam = new Map<string, typeof teamPlayersData>()
    for (const tp of teamPlayersData) {
      if (!teamPlayersByTeam.has(tp.team_id)) teamPlayersByTeam.set(tp.team_id, [])
      teamPlayersByTeam.get(tp.team_id)!.push(tp)
    }

    const playersById = new Map(playersData?.map(p => [p.id, p]) || [])

    const teams: UserTeam[] = []

    for (const ut of userTeamsData) {
      const user = usersMap.get(ut.user_id)
      const userName = user?.full_name || user?.email?.split('@')[0] || 'Usuario'
      const userCreatedAt = createdDates.get(ut.user_id) || new Date().toISOString()

      if (!canParticipateInMatchday(userCreatedAt, matchdayDate)) continue

      const teamPlayers = teamPlayersByTeam.get(ut.id) || []
      if (teamPlayers.length === 0) continue

      const jugadores: Player[] = teamPlayers.map(tp => {
        const p = playersById.get(tp.player_id)
        const teamObj = p ? teamsMap.get(p.team_id) : undefined
        return {
          id: tp.player_id,
          first_name: p?.first_name || '',
          last_name: p?.last_name || '',
          short_name: p?.short_name || '',
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

      // Ordenar: titulares primero, luego por posición (POR, DEF, MED, DEL)
      const positionOrder: Record<string, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 }
      jugadores.sort((a, b) => {
        if (a.is_starter && !b.is_starter) return -1
        if (!a.is_starter && b.is_starter) return 1
        const posA = getPositionLabel(a.position)
        const posB = getPositionLabel(b.position)
        const orderA = positionOrder[posA] ?? 99
        const orderB = positionOrder[posB] ?? 99
        if (orderA !== orderB) return orderA - orderB
        return (b.puntos || 0) - (a.puntos || 0)
      })

      const puntos_totales = jugadores.reduce((sum, p) => sum + (p.puntos || 0), 0)
      const valor_total = jugadores.reduce((sum, p) => sum + (p.valor || 0), 0)

      teams.push({
        team_id: ut.id,
        user_id: ut.user_id,
        user_name: userName,
        team_name: ut.name,
        created_at: userCreatedAt,
        jugadores,
        puntos_totales,
        valor_total,
      })
    }

    // Ordenar por puntos y asignar posición
    teams.sort((a, b) => b.puntos_totales - a.puntos_totales)
    teams.forEach((team, index) => { team.posicion = index + 1 })

    setUserTeams(teams)
    setLoading(false)
  }

  useEffect(() => {
    fetchMatchdays()
  }, [])

  useEffect(() => {
    if (selectedMatchday && availableMatchdays.length > 0) {
      loadUserTeamsForMatchday(selectedMatchday)
    }
  }, [selectedMatchday, availableMatchdays.length])

  // Polling en tiempo real cuando la jornada seleccionada está en directo
  useEffect(() => {
    const info = availableMatchdays.find(m => m.matchday === selectedMatchday)
    if (!info?.live) return
    const interval = setInterval(() => {
      loadUserTeamsForMatchday(selectedMatchday, true)
    }, 45000)
    return () => clearInterval(interval)
  }, [selectedMatchday, availableMatchdays])

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

  const currentInfo = availableMatchdays.find(m => m.matchday === selectedMatchday)
  const getMatchdayLabel = (info?: MatchdayInfo) => {
    if (!info) return `Jornada ${selectedMatchday}`
    if (info.rawMatchday == null && info.momento) return info.momento
    return `Jornada ${info.matchday}`
  }

  // Navegación por flechas
  const currentIndex = availableMatchdays.findIndex(m => m.matchday === selectedMatchday)
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex >= 0 && currentIndex < availableMatchdays.length - 1
  const goToAdjacent = (dir: -1 | 1) => {
    const target = availableMatchdays[currentIndex + dir]
    if (target) setSelectedMatchday(target.matchday)
  }

  const fmtValor = (v: number) => v > 0 ? `${v}M` : '-'

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando jornada...</div>
  }

  return (
    <div className="space-y-6">
      {/* Cabecera con selector de jornada por flechas */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Jornada</h1>
          <p className="text-slate-600 mt-1 text-sm sm:text-base">
            Equipos, puntos y valor de cada usuario por jornada
          </p>
        </div>

        {/* Flechas */}
        {availableMatchdays.length > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => goToAdjacent(-1)}
              disabled={!canGoPrev}
              className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="min-w-[140px] text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-base font-bold text-slate-900">{getMatchdayLabel(currentInfo)}</span>
                {currentInfo?.live && (
                  <Badge className="bg-red-500 text-white text-xs flex items-center gap-1 animate-pulse">
                    <Radio className="w-3 h-3" /> EN DIRECTO
                  </Badge>
                )}
              </div>
              <span className="text-xs text-slate-400">
                {currentIndex + 1} / {availableMatchdays.length}
              </span>
            </div>

            <button
              onClick={() => goToAdjacent(1)}
              disabled={!canGoNext}
              className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Clasificación de la jornada */}
      {userTeams.length > 0 && (
        <Card className="border-2 border-emerald-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Clasificación {getMatchdayLabel(currentInfo)}
              </h2>
              {currentInfo?.live && (
                <Badge className="bg-red-500 text-white text-xs flex items-center gap-1 animate-pulse ml-auto">
                  <Radio className="w-3 h-3" /> EN DIRECTO
                </Badge>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 sm:px-3 text-sm font-semibold text-slate-600">Pos</th>
                    <th className="text-left py-2 px-2 sm:px-3 text-sm font-semibold text-slate-600">Usuario</th>
                    <th className="hidden sm:table-cell text-left py-2 px-3 text-sm font-semibold text-slate-600">Equipo</th>
                    <th className="hidden sm:table-cell text-right py-2 px-3 text-sm font-semibold text-slate-600">Valor</th>
                    <th className="text-right py-2 px-2 sm:px-3 text-sm font-semibold text-slate-600">Puntos</th>
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
                      <td className="py-3 px-2 sm:px-3">
                        <span className="font-medium text-slate-900">{team.user_name}</span>
                        <span className="block sm:hidden text-xs text-slate-500 truncate">{team.team_name} · {fmtValor(team.valor_total)}</span>
                      </td>
                      <td className="hidden sm:table-cell py-3 px-3">
                        <span className="text-sm text-slate-600">{team.team_name}</span>
                      </td>
                      <td className="hidden sm:table-cell py-3 px-3 text-right">
                        <span className="text-sm font-semibold text-slate-700">{fmtValor(team.valor_total)}</span>
                      </td>
                      <td className="py-3 px-2 sm:px-3 text-right">
                        <Badge className="bg-emerald-600 text-white text-xs sm:text-sm px-2 sm:px-3 py-1 whitespace-nowrap">
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        team.posicion === 1 ? 'bg-yellow-500' :
                        team.posicion === 2 ? 'bg-gray-400' :
                        team.posicion === 3 ? 'bg-amber-600' :
                        'bg-emerald-600'
                      }`}>
                        <span className="text-white font-bold">{team.posicion}º</span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 truncate">{team.user_name}</h3>
                        <p className="text-xs text-slate-500 truncate">{team.team_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Valor</p>
                        <p className="text-lg font-bold text-slate-700">{fmtValor(team.valor_total)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Puntos</p>
                        <p className="text-2xl font-bold text-emerald-600">{team.puntos_totales}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Jugadores */}
                <div className="p-4">
                  <div className="space-y-3">
                    {(['Titulares', 'Suplentes'] as const).map((grupo) => {
                      const jugadoresGrupo = team.jugadores.filter(p =>
                        grupo === 'Titulares' ? p.is_starter : !p.is_starter
                      )
                      if (jugadoresGrupo.length === 0) return null
                      return (
                        <div key={grupo}>
                          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{grupo}</p>
                          <div className="grid gap-2">
                            {jugadoresGrupo.map((player, idx) => (
                              <div
                                key={player.id}
                                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors gap-2"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-sm font-bold text-slate-400 w-5 shrink-0">{idx + 1}</span>
                                  {player.photo ? (
                                    <img
                                      src={player.photo}
                                      alt={player.short_name || ''}
                                      className="w-10 h-10 rounded-full object-cover border-2 border-slate-300 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center text-sm font-bold text-slate-600 border-2 border-slate-400 shrink-0">
                                      {player.shirt_number || '?'}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-slate-900 truncate">{player.short_name || player.first_name}</span>
                                      <Badge className={`text-xs ${getPositionColor(player.position)}`}>
                                        {getPositionLabel(player.position)}
                                      </Badge>
                                      {player.is_captain && (
                                        <Badge className="text-xs bg-yellow-500 text-white">C</Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                                      {player.team && <span className="truncate">{player.team.name}</span>}
                                      <span className="text-slate-400">· {fmtValor(player.valor || 0)}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-lg font-bold text-emerald-600">{player.puntos ?? 0}</span>
                                  <p className="text-xs text-slate-500">puntos</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
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
                  Aún no ha empezado ninguna jornada
                </h3>
                <p className="text-slate-500">
                  Cuando arranque la primera jornada verás aquí los equipos, puntos y valor de cada usuario
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
