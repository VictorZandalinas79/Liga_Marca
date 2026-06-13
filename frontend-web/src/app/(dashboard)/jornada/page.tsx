'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Users, ChevronLeft, ChevronRight, Radio, X, TrendingUp } from 'lucide-react'
import { MetricBreakdown } from '@/components/metric-breakdown'

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
  team_id?: string
  team?: { name: string; logo_url?: string }
  hasPlayed?: boolean
  replacedPlayer?: { id: string; short_name?: string; first_name?: string; photo?: string } | null
}

interface ChangeItem {
  inPlayer: { id: string; short_name?: string; first_name?: string; position?: string; photo?: string } | null
  outPlayer: { id: string; short_name?: string; first_name?: string; position?: string; photo?: string } | null
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
  changes: ChangeItem[]
}

interface PlayerScoreItem {
  player_id: string
  total_points: number
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

// La jornada se hace visible (y se bloquean los cambios) 1 hora antes del
// primer partido. Durante esa hora ya se ven los 11 de cada usuario.
const LOCK_LEAD_MS = 60 * 60 * 1000

export default function JornadaPage() {
  const [loading, setLoading] = useState(true)
  const [selectedMatchday, setSelectedMatchday] = useState<number>(0)
  const [availableMatchdays, setAvailableMatchdays] = useState<MatchdayInfo[]>([])
  const [userTeams, setUserTeams] = useState<UserTeam[]>([])
  const [sortBy, setSortBy] = useState<'puntos' | 'promedio'>('puntos')
  const [modalPlayer, setModalPlayer] = useState<Record<string, any> | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const supabase = createClient()

  const openPlayerStats = async (playerId: string) => {
    setModalLoading(true)
    setModalPlayer({})

    const info = availableMatchdays.find(m => m.matchday === selectedMatchday)

    const { data: playerData } = await supabase.from('players').select('*').eq('id', playerId).single()

    let scoresData: Record<string, any> | null = null
    if (info?.rawMatchday) {
      const { data } = await supabase.from('player_scores').select('*').eq('player_id', playerId).eq('matchday', info.rawMatchday).maybeSingle()
      scoresData = data
    }
    if (!scoresData && info?.fixtureIds?.length) {
      const { data } = await supabase.from('player_scores').select('*').eq('player_id', playerId).in('fixture_id', info.fixtureIds).maybeSingle()
      scoresData = data
    }

    setModalPlayer({ ...(playerData || {}), ...(scoresData || {}) })
    setModalLoading(false)
  }

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
      // Visible desde 1h antes del primer partido (cuando se bloquean los cambios)
      const started = now >= first - LOCK_LEAD_MS
      // "En directo" solo desde que arranca de verdad el primer partido
      const live = now >= first && now <= last + MATCH_DURATION_MS
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

  // Cargar equipos y jugadores de la jornada seleccionada
  const loadUserTeamsForMatchday = async (matchday: number, silent = false) => {
    if (!silent) setLoading(true)

    const info = availableMatchdays.find(m => m.matchday === matchday)

    // Fechas de creación de usuarios (para mostrar el nombre correcto)
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

    // Lineup de la jornada ANTERIOR por equipo (para detectar cambios)
    const { data: prevAllData } = await supabase
      .from('team_players')
      .select('team_id, player_id, is_starter, matchday')
      .in('team_id', teamIdsUser)
      .lt('matchday', matchday)
      .order('matchday', { ascending: false })

    const latestMdPerTeam = new Map<string, number>()
    prevAllData?.forEach(tp => {
      const cur = latestMdPerTeam.get(tp.team_id)
      if (cur === undefined || tp.matchday > cur) latestMdPerTeam.set(tp.team_id, tp.matchday)
    })

    const prevStartersByTeam = new Map<string, string[]>()
    prevAllData?.forEach(tp => {
      if (!tp.is_starter) return
      if (tp.matchday !== latestMdPerTeam.get(tp.team_id)) return
      if (!prevStartersByTeam.has(tp.team_id)) prevStartersByTeam.set(tp.team_id, [])
      prevStartersByTeam.get(tp.team_id)!.push(tp.player_id)
    })

    // Equipos reales que ya han jugado en esta jornada
    const playedTeamIds = new Set<string>()
    if (info && info.fixtureIds.length > 0) {
      const now = Date.now()
      const { data: fixtureDetails } = await supabase
        .from('fixtures')
        .select('home_team_id, away_team_id, status, start_time')
        .in('id', info.fixtureIds)
      fixtureDetails?.forEach(f => {
        const matchEnded =
          f.status === 'finished' ||
          (f.start_time && new Date(f.start_time).getTime() + MATCH_DURATION_MS < now)
        if (matchEnded) {
          if (f.home_team_id) playedTeamIds.add(f.home_team_id)
          if (f.away_team_id) playedTeamIds.add(f.away_team_id)
        }
      })
    }

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
    let scoresData: PlayerScoreItem[] | null = null
    if (info && info.rawMatchday != null) {
      const res = await supabase
        .from('player_scores')
        .select('player_id, total_points')
        .eq('matchday', info.rawMatchday)
        .in('player_id', playerIds)
      scoresData = res.data as PlayerScoreItem[] | null
    }

    // Aserción segura para obtener la longitud sin provocar el error "never"
    const scoresCount = (scoresData as PlayerScoreItem[])?.length ?? 0

    if (scoresCount === 0 && info && info.fixtureIds.length > 0) {
      const res = await supabase
        .from('player_scores')
        .select('player_id, total_points')
        .in('fixture_id', info.fixtureIds)
        .in('player_id', playerIds)
      scoresData = res.data as { player_id: string; total_points: number }[] | null
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

    // Jugadores que salieron (estaban antes, no están ahora) → fetch sus datos
    const allPrevIds = [...new Set([...(prevAllData || []).map(tp => tp.player_id)])]
    const outPlayerIds = allPrevIds.filter(id => !playerIds.includes(id))
    const allPlayersById = new Map(playersById)
    if (outPlayerIds.length > 0) {
      const { data: outPlayersData } = await supabase
        .from('players')
        .select('id, first_name, last_name, short_name, position, photo, shirt_number, team_id, precio')
        .in('id', outPlayerIds)
      outPlayersData?.forEach(p => allPlayersById.set(p.id, p))
    }

    const posLabel = (pos: string) => {
      const l = (pos || '').toLowerCase()
      if (l.includes('goalkeeper')) return 'POR'
      if (l.includes('defender')) return 'DEF'
      if (l.includes('midfielder')) return 'MED'
      return 'DEL'
    }

    const teams: UserTeam[] = []

    for (const ut of userTeamsData) {
      const user = usersMap.get(ut.user_id)
      const userName = user?.full_name || user?.email?.split('@')[0] || 'Usuario'
      const userCreatedAt = createdDates.get(ut.user_id) || new Date().toISOString()

      // Todos los usuarios con equipo aparecen en la jornada independientemente de cuándo se registraron

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
          team_id: p?.team_id,
          team: teamObj ? { name: teamObj.name, logo_url: teamObj.logo_url } : undefined,
          puntos: playerPointsMap.get(tp.player_id) ?? 0,
          valor: p?.precio ?? 0,
          is_starter: tp.is_starter || false,
          is_captain: tp.is_captain || false,
          hasPlayed: p?.team_id ? playedTeamIds.has(p.team_id) : false,
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

      // Emparejar cambios por posición: asignar replacedPlayer a cada jugador que entró
      const prevIds = prevStartersByTeam.get(ut.id) || []
      const currentStarterIds = teamPlayers.filter(tp => tp.is_starter).map(tp => tp.player_id)
      const inIds = currentStarterIds.filter(id => !prevIds.includes(id))
      const outIds = prevIds.filter(id => !currentStarterIds.includes(id))

      const outByPos: Record<string, string[]> = {}
      outIds.forEach(id => {
        const pos = posLabel(allPlayersById.get(id)?.position || '')
        ;(outByPos[pos] ??= []).push(id)
      })

      // Asignar replacedPlayer a cada jugador que entró (emparejando por posición)
      const usedOutIds = new Set<string>()
      inIds.forEach(inId => {
        const pos = posLabel(allPlayersById.get(inId)?.position || '')
        const available = (outByPos[pos] || []).find(outId => !usedOutIds.has(outId))
        if (available) {
          usedOutIds.add(available)
          const jug = jugadores.find(j => j.id === inId)
          if (jug) jug.replacedPlayer = allPlayersById.get(available) || null
        }
      })

      teams.push({
        team_id: ut.id,
        user_id: ut.user_id,
        user_name: userName,
        team_name: ut.name,
        created_at: userCreatedAt,
        jugadores,
        puntos_totales,
        valor_total,
        changes: [],
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

  const getJugadoresJugaron = (jugadores: Player[]) => jugadores.filter(p => p.hasPlayed).length

  const getPromedio = (team: UserTeam) => {
    const jugaron = getJugadoresJugaron(team.jugadores)
    return jugaron > 0 ? team.puntos_totales / jugaron : 0
  }

  const sortedTeams = [...userTeams].sort((a, b) => {
    if (sortBy === 'promedio') return getPromedio(b) - getPromedio(a)
    return b.puntos_totales - a.puntos_totales
  })

  const getFormacion = (jugadores: Player[]): string => {
    const starters = jugadores.filter(p => p.is_starter)
    const gk = starters.filter(p => getPositionLabel(p.position) === 'POR').length
    const def = starters.filter(p => getPositionLabel(p.position) === 'DEF').length
    const mid = starters.filter(p => getPositionLabel(p.position) === 'MED').length
    const fwd = starters.filter(p => getPositionLabel(p.position) === 'DEL').length
    if (gk + def + mid + fwd === 0) return '-'
    return `${gk}-${def}-${mid}-${fwd}`
  }

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
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Trophy className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">
                Clasificación {getMatchdayLabel(currentInfo)}
              </h2>
              {currentInfo?.live && (
                <Badge className="bg-red-500 text-white text-xs flex items-center gap-1 animate-pulse">
                  <Radio className="w-3 h-3" /> EN DIRECTO
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  onClick={() => setSortBy('puntos')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${sortBy === 'puntos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Puntos
                </button>
                <button
                  onClick={() => setSortBy('promedio')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${sortBy === 'promedio' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Promedio
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-1 sm:px-2 text-xs sm:text-sm font-semibold text-slate-600">Pos</th>
                    <th className="text-left py-2 px-1 sm:px-2 text-xs sm:text-sm font-semibold text-slate-600">Equipo</th>
                    <th className="text-center py-2 px-1 sm:px-2 text-xs sm:text-sm font-semibold text-slate-600">Sys</th>
                    <th className="text-right py-2 px-1 sm:px-2 text-xs sm:text-sm font-semibold text-slate-600">Valor</th>
                    <th className={`text-right py-2 px-1 sm:px-2 text-xs sm:text-sm font-semibold ${sortBy === 'puntos' ? 'text-emerald-600' : 'text-slate-600'}`}>Pts</th>
                    <th className={`text-right py-2 px-1 sm:px-2 text-xs sm:text-sm font-semibold ${sortBy === 'promedio' ? 'text-emerald-600' : 'text-slate-600'}`}>Prom</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTeams.map((team, index) => {
                    const isLast = index === sortedTeams.length - 1
                    const pos = index + 1
                    const jugaron = getJugadoresJugaron(team.jugadores)
                    const total = team.jugadores.length
                    const promedio = getPromedio(team)
                    return (
                    <tr key={team.team_id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-1 sm:px-2">
                        <div className="flex items-center gap-1 sm:gap-2">
                          {pos === 1 && <Trophy className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-500" />}
                          {pos === 2 && <Trophy className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />}
                          {pos === 3 && <Trophy className="w-3 h-3 sm:w-4 sm:h-4 text-amber-600" />}
                          {isLast && pos > 3 && (
                            <span className="text-base sm:text-lg">🐷</span>
                          )}
                          {!isLast && (
                            <span className={`font-bold text-xs sm:text-sm ${pos <= 3 ? 'text-emerald-600' : 'text-slate-700'}`}>
                              {pos}º
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-1 sm:px-2 max-w-[120px] sm:max-w-none">
                        <span className="font-medium text-slate-900 text-xs sm:text-sm">{team.team_name}</span>
                        <span className="block text-xs text-slate-500">
                          {jugaron} / {total} jugaron
                        </span>
                      </td>
                      <td className="py-2 px-1 sm:px-2 text-center">
                        <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-1 sm:px-2 py-0.5 rounded">
                          {getFormacion(team.jugadores)}
                        </span>
                      </td>
                      <td className="py-2 px-1 sm:px-2 text-right">
                        <span className="text-xs sm:text-sm font-semibold text-slate-700">{fmtValor(team.valor_total)}</span>
                      </td>
                      <td className="py-2 px-1 sm:px-2 text-right">
                        <Badge className={`text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 whitespace-nowrap ${sortBy === 'puntos' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                          {Math.round(team.puntos_totales * 10) / 10}
                        </Badge>
                      </td>
                      <td className="py-2 px-1 sm:px-2 text-right">
                        <Badge className={`text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 whitespace-nowrap ${sortBy === 'promedio' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                          {jugaron > 0 ? Math.round(promedio * 10) / 10 : '—'}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
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

          {sortedTeams.map((team, index) => {
            const displayPos = index + 1
            return (
            <Card key={team.team_id} className="!border-slate-200">
              <CardContent className="p-0">
                {/* Cabecera del equipo */}
                <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        displayPos === 1 ? 'bg-yellow-500' :
                        displayPos === 2 ? 'bg-gray-400' :
                        displayPos === 3 ? 'bg-amber-600' :
                        'bg-emerald-600'
                      }`}>
                        <span className="text-white font-bold">{displayPos}º</span>
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
                        <p className="text-2xl font-bold text-emerald-600">{Math.round(team.puntos_totales * 10) / 10}</p>
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
                                onClick={() => openPlayerStats(player.id)}
                                className={`flex items-center justify-between p-3 rounded-lg transition-colors gap-2 cursor-pointer ${
                                  player.hasPlayed
                                    ? 'bg-slate-200 hover:bg-slate-300'
                                    : 'bg-slate-50 hover:bg-slate-100'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-sm font-bold text-slate-400 w-5 shrink-0">{idx + 1}</span>
                                  {player.photo ? (
                                    <img
                                      src={player.photo}
                                      alt={player.short_name || ''}
                                      className={`w-10 h-10 rounded-full object-cover border-2 shrink-0 ${player.hasPlayed ? 'border-slate-400 opacity-70' : 'border-slate-300'}`}
                                    />
                                  ) : (
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0 ${player.hasPlayed ? 'bg-slate-400 text-slate-700 border-slate-500' : 'bg-slate-300 text-slate-600 border-slate-400'}`}>
                                      {player.shirt_number || '?'}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`font-semibold truncate ${player.hasPlayed ? 'text-slate-500' : 'text-slate-900'}`}>
                                        {player.short_name || player.first_name}
                                      </span>
                                      <Badge className={`text-xs ${getPositionColor(player.position)}`}>
                                        {getPositionLabel(player.position)}
                                      </Badge>
                                      {player.is_captain && (
                                        <Badge className="text-xs bg-yellow-500 text-white">C</Badge>
                                      )}
                                      {player.hasPlayed && (
                                        <span className="text-xs text-slate-400 font-medium">✓ jugó</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                                      {player.team && <span className="truncate">{player.team.name}</span>}
                                      <span className="text-slate-400">· {fmtValor(player.valor || 0)}</span>
                                    </div>
                                    {player.replacedPlayer && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <span className="text-[10px] text-slate-400">por</span>
                                        {player.replacedPlayer.photo && (
                                          <img src={player.replacedPlayer.photo} className="w-4 h-4 rounded-full object-cover border border-slate-300" alt="" />
                                        )}
                                        <span className="text-[10px] text-red-500 font-medium truncate">
                                          {player.replacedPlayer.short_name || player.replacedPlayer.first_name}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={`text-lg font-bold ${player.hasPlayed ? 'text-slate-500' : 'text-emerald-600'}`}>
                                    {Math.round((player.puntos ?? 0) * 10) / 10}
                                  </span>
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
          )})}
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

      {/* Modal de estadísticas del jugador */}
      {modalPlayer !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setModalPlayer(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 p-5 flex justify-between items-start z-10">
              <div className="flex items-center gap-4">
                {modalPlayer.photo ? (
                  <img src={modalPlayer.photo} alt={modalPlayer.short_name || ''} className="w-16 h-16 rounded-full object-cover border-4 border-white shadow" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 border-4 border-white shadow">
                    {modalPlayer.shirt_number || '?'}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {modalPlayer.first_name} {modalPlayer.last_name}
                  </h2>
                  <p className="text-sm text-slate-500">{modalPlayer.short_name}</p>
                </div>
              </div>
              <button
                onClick={() => setModalPlayer(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="p-4 sm:p-6">
              {modalLoading ? (
                <div className="text-center py-12 text-slate-400">Cargando estadísticas...</div>
              ) : !modalPlayer.total_points && modalPlayer.total_points !== 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Sin datos de partido para esta jornada</p>
                </div>
              ) : (
                <>
                  {/* Resumen */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <div className="bg-emerald-50 p-3 rounded-xl text-center">
                      <p className="text-emerald-700 text-xs font-semibold">Puntos</p>
                      <p className="text-3xl font-bold text-emerald-600">{Math.round((modalPlayer.total_points ?? 0) * 10) / 10}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl text-center">
                      <p className="text-slate-600 text-xs font-semibold">Minutos</p>
                      <p className="text-3xl font-bold text-slate-800">{modalPlayer.minutes_played || 0}′</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl text-center">
                      <p className="text-slate-600 text-xs font-semibold">Goles</p>
                      <p className="text-3xl font-bold text-slate-800">{modalPlayer.goals || 0}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl text-center">
                      <p className="text-slate-600 text-xs font-semibold">Asistencias</p>
                      <p className="text-3xl font-bold text-slate-800">{modalPlayer.assists || 0}</p>
                    </div>
                  </div>
                  <MetricBreakdown player={modalPlayer} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
