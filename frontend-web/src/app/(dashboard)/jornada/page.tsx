'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Medal, Users, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Radio, X, TrendingUp, Search, AlertTriangle, Printer, FileSpreadsheet } from 'lucide-react'
import { MetricBreakdown } from '@/components/metric-breakdown'
import { applySanctionsToTeam } from '@/lib/infractions'
import { useLeagueConfig } from '@/lib/league-config'
import { PrintView } from './PrintView'

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
  hasSubstitutionWarning?: boolean
  hasMaxTeamWarning?: boolean
  replacedPlayer?: { id: string; short_name?: string; first_name?: string; photo?: string } | null
  originalPuntos?: number
  sanctionReason?: string
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
  hasBudgetWarning?: boolean
  hasTacticsWarning?: boolean
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
  const config = useLeagueConfig()
  const [loading, setLoading] = useState(true)
  const [selectedMatchday, setSelectedMatchday] = useState<number>(0)
  const [availableMatchdays, setAvailableMatchdays] = useState<MatchdayInfo[]>([])
  const [userTeams, setUserTeams] = useState<UserTeam[]>([])
  const [sortBy, setSortBy] = useState<'sistema' | 'valor' | 'puntos' | 'promedio'>('puntos')
  const [showEquipos, setShowEquipos] = useState(false)
  const [showSanciones, setShowSanciones] = useState(false)
  const [modalPlayer, setModalPlayer] = useState<Record<string, any> | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchActiveIndex, setSearchActiveIndex] = useState(0)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [matchdayInfractions, setMatchdayInfractions] = useState<any[]>([])
  const [selectedDivision, setSelectedDivision] = useState<number | null>(null)
  const [currentUserDivision, setCurrentUserDivision] = useState<number | null>(null)
  const [matchdayWinners, setMatchdayWinners] = useState<Set<string>>(new Set())
  const [matchdayLosers, setMatchdayLosers] = useState<Set<string>>(new Set())
  const supabase = createClient()
  const teamRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const playerRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const openPlayerStats = async (playerId: string, providedSanctionReason?: string) => {
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

    setModalPlayer({ ...(playerData || {}), ...(scoresData || {}), sanctionReason: providedSanctionReason })
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
      // Visible cuando se bloquean los cambios (según configuración de liga)
      const lockLeadMs = (config.matchday_start_hours_before || 1) * 60 * 60 * 1000
      const started = now >= first - lockLeadMs
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
    const { data: profiles } = await supabase.from('profiles').select('id, created_at, full_name, email, division')
    const createdDates = new Map<string, string>()
    profiles?.forEach(p => createdDates.set(p.id, p.created_at))
    const usersMap = new Map(profiles?.map(u => [u.id, u]) || [])

    // Usuarios de la división seleccionada (sanciones/jornada independientes por división)
    const divisionUserIds = new Set(
      (profiles ?? []).filter(p => (p as any).division === selectedDivision).map(p => p.id)
    )

    // Equipos de usuario, restringidos a la división seleccionada
    const { data: userTeamsRaw } = await supabase
      .from('user_teams')
      .select('id, user_id, name, created_at')

    const userTeamsData = (userTeamsRaw ?? []).filter(t => divisionUserIds.has(t.user_id))

    if (!userTeamsData || userTeamsData.length === 0) {
      setUserTeams([])
      setLoading(false)
      return
    }

    userTeamsData.forEach(t => {
      if (!createdDates.has(t.user_id)) createdDates.set(t.user_id, t.created_at)
    })

    const teamIdsUser = userTeamsData.map(t => t.id)

    // Cargar todos los team_players hasta la jornada actual
    const { data: allTeamPlayers } = await supabase
      .from('team_players')
      .select('team_id, player_id, is_starter, is_captain, matchday')
      .in('team_id', teamIdsUser)
      .lte('matchday', matchday)
      .order('matchday', { ascending: false })

    // Para cada equipo, encontrar su jornada máxima registrada <= matchday
    const maxMatchdayByTeam = new Map<string, number>()
    allTeamPlayers?.forEach(p => {
      const currentMax = maxMatchdayByTeam.get(p.team_id)
      if (currentMax === undefined || p.matchday > currentMax) {
        maxMatchdayByTeam.set(p.team_id, p.matchday)
      }
    })

    // Filtrar los jugadores de cada equipo correspondientes a su última jornada registrada
    let teamPlayersData = allTeamPlayers?.filter(p => p.matchday === maxMatchdayByTeam.get(p.team_id)) || []

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
    const prevSquadByTeam = new Map<string, string[]>()
    prevAllData?.forEach(tp => {
      if (tp.matchday !== latestMdPerTeam.get(tp.team_id)) return
      
      if (!prevSquadByTeam.has(tp.team_id)) prevSquadByTeam.set(tp.team_id, [])
      prevSquadByTeam.get(tp.team_id)!.push(tp.player_id)
      
      if (tp.is_starter) {
        if (!prevStartersByTeam.has(tp.team_id)) prevStartersByTeam.set(tp.team_id, [])
        prevStartersByTeam.get(tp.team_id)!.push(tp.player_id)
      }
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

    // Obtener sanciones de la jornada anterior
    const prevMatchday = matchday - 1
    let prevPenalties: any[] = []
    if (prevMatchday >= 1) {
      const { data } = await supabase
        .from('penalties')
        .select('team_id, description, points')
        .eq('matchday', prevMatchday)
      prevPenalties = data || []
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

      // 1. Build prevMine for this team
      // prevMine is now used in applySanctionsToTeam, but it needs to be the WHOLE squad.
      // So we will define prevMine later based on prevSquadByTeam.

      // 2. Build heldByOthersPrev for this matchday
      // heldByOthersPrev based on WHOLE squad
      const heldByOthersPrev = new Map<string, string[]>()
      for (const [otherTeamId, pids] of prevSquadByTeam.entries()) {
        if (otherTeamId !== ut.id) {
          const otherTeam = userTeamsData.find(t => t.id === otherTeamId)
          const otherProfile = profiles?.find(p => p.id === otherTeam?.user_id)
          const otherName = otherProfile?.full_name || otherProfile?.email?.split('@')[0] || 'otro usuario'
          pids.forEach(pid => {
            if (!heldByOthersPrev.has(pid)) heldByOthersPrev.set(pid, [])
            heldByOthersPrev.get(pid)!.push(otherName)
          })
        }
      }

      // 3. Apply sanctions
      const isLiveMatchday = info ? info.live || (info.started && Date.now() < new Date(info.end_time).getTime() + MATCH_DURATION_MS) : false;
      const starters = jugadores.filter(j => j.is_starter)
      const prevMine = new Set<string>(prevSquadByTeam.get(ut.id) || [])
      
      const prevTeamPenalties = prevPenalties.filter((p: any) => p.team_id === ut.id)
      const lineupPrevSet = new Set<string>(prevSquadByTeam.get(ut.id) || [])
      const zeroedPrevSet = new Set<string>()
      prevTeamPenalties.forEach((p: any) => {
        const desc = p.description || ''
        if (desc.startsWith("Jugador de ")) {
          const parts = desc.split(":")
          if (parts.length >= 2) {
            const playerName = parts[parts.length - 1].trim().toLowerCase()
            lineupPrevSet.forEach(pid => {
              const player = allPlayersById.get(pid)
              const name = player ? (player.short_name || player.first_name || '') : ''
              if (name.toLowerCase() === playerName) {
                zeroedPrevSet.add(pid)
              }
            })
          }
        }
      })

      const sanctionResult = applySanctionsToTeam(
        starters,
        prevMine,
        heldByOthersPrev,
        config,
        isLiveMatchday,
        prevTeamPenalties,
        lineupPrevSet,
        zeroedPrevSet,
        matchday === Math.max(1, config.fantasy_starting_matchday)
      )

      // 4. Update points and set sanctionReason
      jugadores.forEach(j => {
        if (j.is_starter && sanctionResult.zeroedPlayers.has(j.id)) {
          j.originalPuntos = j.puntos
          j.puntos = 0
          j.sanctionReason = sanctionResult.zeroedPlayers.get(j.id)
        }
      })

      const puntos_totales = jugadores.reduce((sum, p) => sum + Math.round((p.puntos || 0) * 10) / 10, 0)
      const valor_total = jugadores.reduce((sum, p) => sum + (p.valor || 0), 0)

      // Emparejar cambios por posición: asignar replacedPlayer a cada jugador que entró
      const prevIds = prevStartersByTeam.get(ut.id) || []
      const currentStarterIds = starters.map(j => j.id)
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
        const jug = jugadores.find(j => j.id === inId)
        if (jug) {
          if (available) {
            usedOutIds.add(available)
            jug.replacedPlayer = allPlayersById.get(available) || null
          }
          if (inIds.length > 3) {
            jug.hasSubstitutionWarning = true
          }
        }
      })

      // Validar Presupuesto
      const valor_starters = starters.reduce((sum, p) => sum + (p.valor || 0), 0)
      const hasBudgetWarning = valor_starters > config.budget_limit

      // Validar Táctica
      const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
      starters.forEach(p => {
        const posLower = (p.position || '').toLowerCase()
        let code = 'MID'
        if (posLower.includes('goalkeeper') || posLower === 'gk') code = 'GK'
        else if (posLower.includes('defender') || posLower === 'def') code = 'DEF'
        else if (posLower.includes('midfielder') || posLower === 'mid') code = 'MID'
        else if (posLower.includes('forward') || posLower === 'fwd') code = 'FWD'
        counts[code as keyof typeof counts] = (counts[code as keyof typeof counts] || 0) + 1
      })
      const validFormations = config.formations.map(f => {
        const parts = f.split('-').map(n => parseInt(n.trim(), 10))
        return { defenders: parts[0], midfielders: parts[1], forwards: parts[2] }
      })
      const isFormationValid = counts.GK === 1 && validFormations.some(f => 
        f.defenders === counts.DEF && f.midfielders === counts.MID && f.forwards === counts.FWD
      )
      const hasTacticsWarning = !isFormationValid

      // Validar Max Jugadores por Equipo
      const teamCounts = new Map<string, number>()
      starters.forEach(p => {
        if (p.team_id) {
          teamCounts.set(p.team_id, (teamCounts.get(p.team_id) || 0) + 1)
        }
      })
      teamCounts.forEach((count, tId) => {
        if (count > config.max_players_per_team) {
          jugadores.forEach(j => {
            if (j.is_starter && j.team_id === tId) {
              j.hasMaxTeamWarning = true
            }
          })
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
        hasBudgetWarning,
        hasTacticsWarning,
      })
    }

    // Ordenar por puntos y asignar posición
    teams.sort((a, b) => b.puntos_totales - a.puntos_totales)
    teams.forEach((team, index) => { team.posicion = index + 1 })

    // Determinar ganadores y perdedores visualmente para el reparto de pagos por división
    let qWinners = 0
    let qLosers = 0
    
    if (selectedDivision === 1) {
      qWinners = Math.max(1, Math.round(teams.length * ((config.div1_win_percent ?? 25) / 100.0)))
      qLosers = Math.max(1, Math.round(teams.length * ((config.div1_lose_percent ?? 25) / 100.0)))
    } else if (selectedDivision === 2) {
      qWinners = Math.max(1, Math.round(teams.length * ((config.div2_win_percent ?? 25) / 100.0)))
      qLosers = Math.max(1, Math.round(teams.length * ((config.div2_lose_percent ?? 25) / 100.0)))
    } else if (selectedDivision === 3) {
      qWinners = Math.max(1, Math.round(teams.length * ((config.div3_win_percent ?? 25) / 100.0)))
      qLosers = Math.max(1, Math.round(teams.length * ((config.div3_lose_percent ?? 25) / 100.0)))
    }
    const wSet = new Set<string>()
    const lSet = new Set<string>()
    for (let i = 0; i < qWinners; i++) {
      if (i < teams.length) wSet.add(teams[i].team_id)
    }
    for (let i = 0; i < qLosers; i++) {
      const idx = teams.length - 1 - i
      if (idx >= qWinners) lSet.add(teams[idx].team_id)
    }
    setMatchdayWinners(wSet)
    setMatchdayLosers(lSet)

    setUserTeams(teams)
    setLoading(false)
  }

  useEffect(() => {
    fetchMatchdays()
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        const { data: profile } = await supabase
          .from('profiles')
          .select('division')
          .eq('id', user.id)
          .maybeSingle()
        const div = (profile?.division as number | null) ?? null
        setCurrentUserDivision(div)
        setSelectedDivision(prev => prev ?? (div ?? 1))
      }
    }
    getCurrentUser()
  }, [config.matchday_start_hours_before])

  useEffect(() => {
    if (selectedMatchday > 0 && selectedDivision != null) {
      loadUserTeamsForMatchday(selectedMatchday)

      const fetchInfractions = async () => {
        const info = availableMatchdays.find(m => m.matchday === selectedMatchday)
        if (!info) return

        // Usuarios de la división seleccionada (para filtrar sanciones por división)
        const { data: divProfiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('division', selectedDivision)
        const divisionUserIds = new Set((divProfiles ?? []).map(p => p.id as string))

        let infractionsData: any[] = []
        // 1. Siempre intentar obtener las sanciones consolidadas de la base de datos
        const { data: dbPenalties } = await supabase
          .from('penalties')
          .select('id, matchday, description, points, user_id, profiles(full_name)')
          .eq('matchday', selectedMatchday)

        const dbPenaltiesDiv = (dbPenalties ?? []).filter(p => divisionUserIds.has(p.user_id as string))

        if (dbPenaltiesDiv.length > 0) {
          infractionsData = dbPenaltiesDiv
        } else if (info.started) {
          // 2. Si el mercado ya está cerrado (jornada iniciada) y no hay sanciones consolidadas, buscar las dinámicas
          const res = await fetch(`/api/penalties/live?matchday=${selectedMatchday}&division=${selectedDivision}`)
          if (res.ok) {
            const data = await res.json()
            infractionsData = data.infractions || []
          }
        }
        setMatchdayInfractions(infractionsData)
      }
      fetchInfractions()
    }
  }, [selectedMatchday, availableMatchdays, config, selectedDivision])

  // Polling en tiempo real cuando la jornada seleccionada está en directo
  useEffect(() => {
    const info = availableMatchdays.find(m => m.matchday === selectedMatchday)
    if (!info?.live || selectedDivision == null) return
    const interval = setInterval(() => {
      loadUserTeamsForMatchday(selectedMatchday, true)
    }, 45000)
    return () => clearInterval(interval)
  }, [selectedMatchday, availableMatchdays, selectedDivision])

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

  const getPositionMedal = (position: number, isLast: boolean = false) => {
    if (position === 1) return <Medal className="w-5 h-5 text-yellow-500" />
    if (position === 2) return <Medal className="w-5 h-5 text-slate-400" />
    if (position === 3) return <Medal className="w-5 h-5 text-amber-600" />
    if (isLast) return <span className="text-4xl leading-none">🐖</span>
    return <span className="text-lg font-bold text-slate-600 w-5 text-center">{position}</span>
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

  const getFormacion = (jugadores: Player[]): string => {
    const starters = jugadores.filter(p => p.is_starter)
    const gk = starters.filter(p => getPositionLabel(p.position) === 'POR').length
    const def = starters.filter(p => getPositionLabel(p.position) === 'DEF').length
    const mid = starters.filter(p => getPositionLabel(p.position) === 'MED').length
    const fwd = starters.filter(p => getPositionLabel(p.position) === 'DEL').length
    if (gk + def + mid + fwd === 0) return '-'
    return `${gk}-${def}-${mid}-${fwd}`
  }

  const sortedTeams = [...userTeams].sort((a, b) => {
    if (sortBy === 'sistema') {
      const formA = getFormacion(a.jugadores)
      const formB = getFormacion(b.jugadores)
      return formA.localeCompare(formB)
    }
    if (sortBy === 'valor') return b.valor_total - a.valor_total
    if (sortBy === 'promedio') return getPromedio(b) - getPromedio(a)
    return b.puntos_totales - a.puntos_totales
  })

  // Lógica de búsqueda tipo Ctrl+F: resaltar coincidencias y navegar
  const normalizeText = (text: string) =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const isPlayerMatch = useCallback((p: Player, q: string): boolean => {
    if (!q) return false
    const nameMatch =
      normalizeText(p.short_name || '').includes(q) ||
      normalizeText(p.first_name || '').includes(q) ||
      normalizeText(p.last_name || '').includes(q)
    const teamMatch = p.team ? normalizeText(p.team.name).includes(q) : false
    const priceMatch = p.valor ? String(p.valor).includes(q) : false
    return nameMatch || teamMatch || priceMatch
  }, [])

  // Lista plana de coincidencias: { teamId, playerId } para navegar
  const searchMatches = searchQuery.trim()
    ? sortedTeams.flatMap(team =>
        team.jugadores
          .filter(p => isPlayerMatch(p, normalizeText(searchQuery.trim())))
          .map(p => ({ teamId: team.team_id, playerId: p.id, key: `${team.team_id}-${p.id}` }))
      )
    : []

  const matchCount = searchMatches.length
  const safeActiveIndex = matchCount > 0 ? Math.min(searchActiveIndex, matchCount - 1) : 0
  const matchSet = new Set(searchMatches.map(m => m.key))
  const activeMatchKey = matchCount > 0 ? searchMatches[safeActiveIndex].key : null

  const goToMatch = useCallback((index: number) => {
    if (searchMatches.length === 0) return
    const safeIdx = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length
    setSearchActiveIndex(safeIdx)
    const match = searchMatches[safeIdx]
    if (match) {
      setTimeout(() => {
        playerRefs.current[match.key]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
    }
  }, [searchMatches])

  // Resetear índice activo al cambiar la query
  useEffect(() => {
    setSearchActiveIndex(0)
    if (searchMatches.length > 0) {
      setTimeout(() => {
        const firstMatch = searchMatches[0]
        if (firstMatch) {
          playerRefs.current[firstMatch.key]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }, [searchQuery])

  const exportToExcel = () => {
    let csv = '\uFEFFUsuario,Jugador,Posicion,Puntos,Sancion\n'
    userTeams.forEach(t => {
      t.jugadores.forEach(p => {
        csv += `"${t.user_name}","${p.short_name || p.first_name}","${getPositionLabel(p.position)}",${p.puntos || 0},"${p.sanctionReason || ''}"\n`
      })
    })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `Alineaciones_Jornada_${selectedMatchday}.csv`
    link.click()
  }

  const exportToPdf = async () => {
    const element = document.getElementById('pdf-content')
    if (!element) return

    // Hacemos el elemento visible temporalmente para que html2canvas pueda renderizarlo
    // Lo posicionamos fuera de la pantalla para que no cause saltos visuales
    const originalClasses = element.className
    element.className = "absolute left-[-9999px] top-0 bg-white w-[297mm] h-[210mm] overflow-hidden"

    try {
      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default
      
      const opt = {
        margin:       4,
        filename:     `Alineaciones_Jornada_${selectedMatchday}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
      }

      await html2pdf().set(opt).from(element).save()
    } catch (e) {
      console.error('Error generando PDF', e)
    } finally {
      element.className = originalClasses
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando jornada...</div>
  }

  return (
    <>
    <div className="print:hidden flex flex-col gap-3 max-w-screen-2xl mx-auto w-full pb-4">
      {/* Cabecera con selector de jornada por flechas */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Jornada</h1>
          <p className="text-slate-600 mt-1 text-xs sm:text-sm">
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

      {/* Pestañas de división: cada una tiene sus jornadas y sanciones independientes */}
      <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1">
        {([1, 2, 3] as const).map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDivision(d)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
              selectedDivision === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {d}ª División
            {currentUserDivision === d && (
              <span className="ml-1.5 text-[10px] font-bold text-emerald-600">(la tuya)</span>
            )}
          </button>
        ))}
      </div>

      {/* Botón para desplegar/ocultar las sanciones */}
      <button
        onClick={() => setShowSanciones(v => !v)}
        className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-slate-800 text-white font-semibold hover:bg-slate-700 transition-colors mt-2 text-sm"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          Sanciones {matchdayInfractions.length > 0 ? `(${matchdayInfractions.length})` : ''}
        </span>
        {showSanciones ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Sanciones de la Jornada */}
      {showSanciones && (
        <Card className="!bg-red-50 border-red-200 mt-2">
          <CardContent className="p-4">
            {matchdayInfractions.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No hay sanciones registradas en esta jornada.</p>
            ) : (
              <div className="space-y-2">
                {matchdayInfractions.map((inf: any) => {
                  const userName = inf.full_name || (inf.profiles ? (Array.isArray(inf.profiles) ? inf.profiles[0]?.full_name : inf.profiles.full_name) : 'Usuario')
                  const info = availableMatchdays.find(m => m.matchday === selectedMatchday)
                  const isLive = info?.live || false
                  return (
                    <div key={inf.id} className="flex justify-between items-start text-xs bg-white rounded p-2 border border-red-100 shadow-sm">
                      <div>
                        <span className="font-bold text-slate-800 mr-1">[{userName}]</span>
                        <span className="text-slate-700 font-medium">{inf.description}</span>
                      </div>
                      <span className={`font-bold shrink-0 ml-2 ${inf.is_pending || (inf.points === 0 && isLive) ? 'text-amber-600' : 'text-red-600'}`}>
                        {inf.is_pending || (inf.points === 0 && isLive) ? 'PENDIENTE' : `-${inf.points} pts`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Botones de Equipos e Imprimir */}
      <div className="flex flex-wrap gap-2 mt-2">
        <button
          onClick={() => setShowEquipos(v => !v)}
          className="flex-1 flex items-center justify-center sm:justify-between px-3 py-2 rounded-lg bg-slate-800 text-white font-semibold hover:bg-slate-700 transition-colors text-sm"
        >
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Equipos</span>
          </span>
          <span className="hidden sm:inline">
            {showEquipos ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
          </span>
        </button>
        <button
          onClick={() => exportToExcel()}
          disabled={!showEquipos || userTeams.length === 0}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-100 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title="Exportar a Excel (CSV)"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span className="hidden sm:inline">Exportar Excel</span>
        </button>
        <button
          onClick={() => exportToPdf()}
          disabled={!showEquipos || userTeams.length === 0}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title="Exportar PDF"
        >
          <Printer className="w-4 h-4" />
          <span className="hidden sm:inline">Exportar PDF</span>
        </button>
      </div>

      {/* Buscador tipo Ctrl+F */}
      {showEquipos && userTeams.length > 0 && (
        <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-300 shadow-md px-3 py-2 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por jugador, equipo o precio…"
            className="flex-1 min-w-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                goToMatch(e.shiftKey ? safeActiveIndex - 1 : safeActiveIndex + 1)
              }
            }}
          />
          {searchQuery && (
            <>
              <span className="text-xs text-slate-500 whitespace-nowrap font-medium">
                {matchCount > 0 ? `${safeActiveIndex + 1} / ${matchCount}` : '0 resultados'}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => goToMatch(safeActiveIndex - 1)}
                  disabled={matchCount === 0}
                  className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Anterior"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => goToMatch(safeActiveIndex + 1)}
                  disabled={matchCount === 0}
                  className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Siguiente"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Clasificación de la jornada (baja al fondo cuando se abren los equipos) */}
      {userTeams.length > 0 && (
        <Card className={`!bg-slate-800 border-slate-700 ${showEquipos ? 'order-last' : ''}`}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-1 px-1 text-xs sm:text-sm font-semibold text-slate-300">Pos</th>
                    <th className="text-left py-1 px-1 text-xs sm:text-sm font-semibold text-slate-300">Equipo</th>
                    <th
                      onClick={() => setSortBy('valor')}
                      className={`text-right py-1 px-1 text-xs sm:text-sm font-semibold cursor-pointer hover:text-white transition-colors ${sortBy === 'valor' ? 'text-emerald-400' : 'text-slate-300'}`}
                    >
                      Valor
                    </th>
                    <th
                      onClick={() => setSortBy('puntos')}
                      className={`text-right py-1 px-1 text-xs sm:text-sm font-semibold cursor-pointer hover:text-white transition-colors ${sortBy === 'puntos' ? 'text-emerald-400' : 'text-slate-300'}`}
                    >
                      Pts
                    </th>
                    <th
                      onClick={() => setSortBy('promedio')}
                      className={`text-right py-1 px-1 text-xs sm:text-sm font-semibold cursor-pointer hover:text-white transition-colors ${sortBy === 'promedio' ? 'text-emerald-400' : 'text-slate-300'}`}
                    >
                      Prom
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTeams.map((team, index) => {
                    const isLast = index === sortedTeams.length - 1
                    const pos = index + 1
                    const jugaron = getJugadoresJugaron(team.jugadores)
                    const total = team.jugadores.length
                    const promedio = getPromedio(team)
                    const isCurrentUser = currentUserId === team.user_id
                    const isWinner = matchdayWinners.has(team.team_id)
                    const isLoser = matchdayLosers.has(team.team_id)
                    return (
                    <tr
                      key={team.team_id}
                      className={`border-b transition-colors cursor-pointer ${
                        isWinner ? 'bg-emerald-900/40 border-emerald-700 hover:bg-emerald-800/60' :
                        isLoser ? 'bg-red-900/40 border-red-700 hover:bg-red-800/60' :
                        isCurrentUser ? 'bg-emerald-900/30 animate-pulse border-slate-700' : 'border-slate-700 hover:bg-slate-700/50'
                      }`}
                      onClick={() => {
                        teamRefs.current[team.team_id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }}
                    >
                      <td className="py-1 px-1">
                        {getPositionMedal(pos, isLast)}
                      </td>
                      <td className="py-1 px-1 max-w-[120px] sm:max-w-none">
                        <span className="font-semibold text-white text-[11px] uppercase">{team.user_name}</span>
                        <span className="block text-[10px] text-slate-400">
                          {jugaron} / {total} jugaron
                        </span>
                      </td>
                      <td className="py-1 px-1 text-right">
                        <span className="text-[11px] sm:text-xs font-semibold text-slate-200">{fmtValor(team.valor_total)}</span>
                      </td>
                      <td className="py-1 px-1 text-right whitespace-nowrap">
                        <span className="text-sm font-bold text-emerald-400">
                          {Math.round(team.puntos_totales * 10) / 10}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-0.5">pts</span>
                      </td>
                      <td className="py-1 px-1 text-right whitespace-nowrap">
                        <span className="text-xs font-semibold text-slate-200">
                          {jugaron > 0 ? Math.round(promedio * 10) / 10 : '—'}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-0.5">pts/j</span>
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

      {/* Equipos de usuarios - Mini tablas por usuario (desplegable) */}
      {showEquipos && (userTeams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {sortedTeams.map((team, index) => {
            const displayPos = index + 1
            const isCurrentUser = currentUserId === team.user_id
            const isWinner = matchdayWinners.has(team.team_id)
            const isLoser = matchdayLosers.has(team.team_id)
            return (
            <Card
              key={team.team_id}
              ref={(el) => { teamRefs.current[team.team_id] = el; }}
              className={`!border-slate-300 shadow-md scroll-mt-20 overflow-hidden min-w-0 flex flex-col ${
                isCurrentUser ? '!border-emerald-500 ring-2 ring-emerald-500/50' : ''
              } ${isWinner ? 'bg-emerald-50' : isLoser ? 'bg-red-50' : ''}`}
            >
              <CardContent className="p-0">
                {/* Cabecera del equipo */}
                <div className={`px-3 py-2 border-b flex items-center gap-3 ${
                  isWinner ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 border-emerald-800' :
                  isLoser ? 'bg-gradient-to-r from-red-600 to-red-700 border-red-800' :
                  'bg-gradient-to-r from-slate-700 to-slate-800 border-slate-600'
                }`}>
                  {/* Posición */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    displayPos === 1 ? 'bg-yellow-500' :
                    displayPos === 2 ? 'bg-gray-400' :
                    displayPos === 3 ? 'bg-amber-600' :
                    'bg-emerald-600'
                  }`}>
                    <span className="text-white text-sm font-bold">{displayPos}º</span>
                  </div>
                  
                  {/* Info: Nombre arriba, stats abajo */}
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-bold text-white text-[11px] sm:text-xs uppercase leading-tight tracking-tighter truncate">{team.user_name}</h3>
                      <div className="flex items-baseline gap-1 shrink-0 ml-auto">
                        <p className="text-[10px] text-slate-400 leading-none">Valor</p>
                        <p className={`text-[11px] font-bold leading-none ${team.hasBudgetWarning ? 'text-red-500 animate-pulse' : 'text-slate-200'}`}>{fmtValor(team.valor_total)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <p className="text-[10px] text-slate-400 leading-none">Sist</p>
                        <p className={`text-[11px] font-mono font-bold leading-none ${team.hasTacticsWarning ? 'text-red-500 animate-pulse' : 'text-slate-200'}`}>{getFormacion(team.jugadores)}</p>
                      </div>
                      <div className="w-px h-3 bg-slate-500" />
                      <div className="flex items-center gap-1">
                        <p className="text-[10px] text-slate-400 leading-none">Pts</p>
                        <p className="text-[12px] font-bold text-emerald-400 leading-none">{Math.round(team.puntos_totales * 10) / 10}</p>
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
                          {grupo !== 'Titulares' && (
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2 mt-2">{grupo}</p>
                          )}
                          <div className="flex flex-col gap-0">
                            {jugadoresGrupo.map((player, idx) => {
                              const matchKey = `${team.team_id}-${player.id}`
                              const isMatch = matchSet.has(matchKey)
                              const isActive = matchKey === activeMatchKey

                              let finalSanctionReason = player.sanctionReason;
                              if (!finalSanctionReason) {
                                const matchedInf = matchdayInfractions.find((inf: any) => {
                                  const matchesUser = inf.user_id === team.user_id || inf.team_id === team.team_id
                                  if (!matchesUser) return false

                                  const descLower = (inf.description || '').toLowerCase()
                                  
                                  // 1. Mencion de nombre de jugador
                                  const shortName = (player.short_name || '').toLowerCase().trim()
                                  const firstName = (player.first_name || '').toLowerCase().trim()
                                  if (shortName && descLower.includes(shortName)) return true
                                  if (firstName && descLower.includes(firstName)) return true

                                  // 2. Mencion de equipo real en sancion de max por equipo
                                  const realTeamName = (player.team?.name || '').toLowerCase().trim()
                                  if (realTeamName && descLower.includes(realTeamName) && descLower.includes('jugadores de')) {
                                    return true
                                  }

                                  return false
                                })
                                if (matchedInf) {
                                  finalSanctionReason = matchedInf.description;
                                }
                              }
                              const isPenalized = !!finalSanctionReason;

                              return (
                              <div
                                key={player.id}
                                ref={isMatch ? (el) => { playerRefs.current[matchKey] = el; } : undefined}
                                onClick={() => openPlayerStats(player.id, finalSanctionReason)}
                                className={`flex items-center justify-between px-1 py-0.5 min-h-[38px] rounded-lg transition-all gap-1 cursor-pointer ${
                                  isActive
                                    ? 'ring-2 ring-orange-500 ring-offset-1 shadow-md relative z-10 scale-[1.02]'
                                    : isMatch
                                    ? 'ring-2 ring-amber-400 ring-offset-1'
                                    : ''
                                } ${
                                  isPenalized
                                    ? 'bg-red-50 border border-red-500 animate-pulse hover:bg-red-100 text-red-950 shadow-sm'
                                    : isActive
                                    ? 'bg-orange-200 hover:bg-orange-300'
                                    : isMatch
                                    ? 'bg-yellow-100 hover:bg-yellow-200'
                                    : player.hasPlayed
                                    ? 'bg-slate-200 hover:bg-slate-300'
                                    : 'bg-slate-50 hover:bg-slate-100'
                                }`}
                              >
                                {/* Photo Leftmost */}
                                <div className="shrink-0 mr-1.5 flex items-center justify-center">
                                  {player.photo ? (
                                    <img
                                      src={player.photo}
                                      alt=""
                                      className={`w-8 h-8 rounded-full object-cover border ${
                                        isPenalized ? 'border-red-500' : player.hasPlayed ? 'border-slate-400 opacity-70' : 'border-slate-300'
                                      }`}
                                    />
                                  ) : (
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${
                                      isPenalized ? 'border-red-500 bg-red-100 text-red-700' : player.hasPlayed ? 'border-slate-400 bg-slate-400 text-slate-700' : 'border-slate-400 bg-slate-200 text-slate-600'
                                    }`}>
                                      {player.shirt_number || '?'}
                                    </div>
                                  )}
                                </div>

                                {/* Left Side: Stacked Name + Info */}
                                <div className="flex flex-col min-w-0 flex-1 justify-center gap-0.5">
                                  {/* Row 1: Name and badges */}
                                  <div className="flex items-center gap-1.5 min-w-0 w-full">
                                    <span className={`font-semibold whitespace-normal break-words ${
                                      (player.short_name || player.first_name || '').length > 15
                                        ? 'text-[10px]'
                                        : 'text-xs'
                                    } ${isPenalized ? 'text-red-800 font-extrabold' : player.hasPlayed ? 'text-slate-500' : 'text-slate-900'}`}>
                                      {player.short_name || player.first_name}
                                    </span>
                                    {isPenalized && (
                                      <AlertTriangle className="w-3 h-3 text-red-600 animate-pulse shrink-0" />
                                    )}
                                    <Badge className={`text-[9px] px-1 py-0 shrink-0 leading-none ${getPositionColor(player.position)}`}>
                                      {getPositionLabel(player.position)}
                                    </Badge>
                                    {player.is_captain && (
                                      <Badge className="text-[9px] px-1 py-0 bg-yellow-500 text-white shrink-0 leading-none">C</Badge>
                                    )}
                                    {player.hasPlayed && (
                                      <Badge className="text-[9px] px-1 py-0 bg-emerald-500 text-white shrink-0 leading-none">J</Badge>
                                    )}
                                  </div>
                                  
                                  {/* Row 2: Metadata (Order, Shirt, Photo, Team, Value) */}
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 min-w-0 w-full">
                                    <span className="font-bold text-slate-400 shrink-0">{idx + 1}</span>
                                    
                                    {player.shirt_number && (
                                      <span className="font-black text-slate-600 shrink-0">{player.shirt_number}</span>
                                    )}
                                    

                                    {player.team?.logo_url && (
                                      <img src={player.team.logo_url} alt="" className="w-3 h-3 object-contain shrink-0" title={player.team?.name} />
                                    )}
                                    
                                    <span className="shrink-0 text-[10px] text-slate-400 font-medium">{fmtValor(player.valor || 0)}</span>
                                  </div>
                                </div>

                                {/* Right Side: Points + Replacement */}
                                <div className="flex flex-col items-end justify-center shrink min-w-0 pl-1">
                                  {player.sanctionReason ? (
                                    <div className="flex flex-col items-end justify-center leading-none">
                                      <span className="text-[9px] font-bold text-red-500 line-through mb-0.5 whitespace-nowrap">
                                        {Math.round((player.originalPuntos ?? 0) * 10) / 10} pts
                                      </span>
                                      <span className="text-sm font-extrabold text-red-600 whitespace-nowrap">
                                        0 pts
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-baseline justify-end leading-tight">
                                      <span className={`text-sm font-bold ${player.hasPlayed ? 'text-slate-500' : 'text-emerald-600'}`}>
                                        {Math.round((player.puntos ?? 0) * 10) / 10}
                                      </span>
                                      <span className="text-[10px] text-slate-500 ml-0.5">pts</span>
                                    </div>
                                  )}
                                  
                                  {/* Replacement Row on the right */}
                                  {player.replacedPlayer && (
                                    <div className="flex items-center gap-1 mt-0.5 justify-end w-full">
                                      <span className="text-[9px] text-slate-400">por</span>
                                      {player.replacedPlayer.photo && (
                                        <img src={player.replacedPlayer.photo} className="w-3.5 h-3.5 rounded-full object-cover border border-slate-300 shrink-0" alt="" />
                                      )}
                                      <span className="text-[9px] text-red-500 font-medium truncate max-w-[70px]">
                                        {player.replacedPlayer.short_name || player.replacedPlayer.first_name}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )})}
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
      ))}

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
              ) : (
                <>
                  {modalPlayer.sanctionReason && (
                    <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-lg mb-4 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />
                      <div>
                        <p className="font-bold text-sm">Sanción aplicada</p>
                        <p className="text-sm">{modalPlayer.sanctionReason}</p>
                      </div>
                    </div>
                  )}
                  {!modalPlayer.total_points && modalPlayer.total_points !== 0 ? (
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    
    <PrintView teams={userTeams} matchday={selectedMatchday} division={selectedDivision} />
    </>
  )
}
