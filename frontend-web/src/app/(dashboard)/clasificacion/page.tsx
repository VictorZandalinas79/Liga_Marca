'use client'

import { useEffect, useState, useRef, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Medal, Trophy, Star, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Minus, Search, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Clock, MousePointerClick, History, Target, Users, AlertTriangle, ArrowUpDown, CheckCircle, X, ArrowUp, ArrowDown } from 'lucide-react'

function formatKamikazeTime(totalMinutes: number): string {
  if (totalMinutes === Infinity || totalMinutes === 999999) return '-'
  const mins = Math.floor(totalMinutes)
  const secs = Math.round((totalMinutes % 1) * 60)
  if (mins === 0) return `${secs} s`
  if (secs === 0) return `${mins} min`
  return `${mins} min ${secs} s`
}
import { applySanctionsToTeam, getCurrentMatchday } from '@/lib/infractions'
import { getStandings } from '@/lib/standings'
import { DIVISION_COMBINED, loadDivisionMembership } from '@/lib/divisions'
import { useLeagueConfig } from '@/lib/league-config'
import { computeOutOfOrderLocks, type FixtureLite } from '@/lib/locked-teams-core'

function formatPlayerName(name: string | undefined | null) {
  if (!name) return ''
  const trimmed = name.trim()
  if (trimmed.length > 12 && trimmed.includes(' ')) {
    const parts = trimmed.split(' ')
    if (parts.length >= 2) {
      return `${parts[0].charAt(0).toUpperCase()}. ${parts.slice(1).join(' ')}`
    }
  }
  return trimmed
}

interface UserStanding {
  user_id: string
  user_name: string
  division: number
  total_points: number
  average_points: number
  current_position: number
  previous_position: number
  position_change: number
  teams_count: number
  matches_played: number
  last_3_jornadas_avg: number
  last_5_trend: 'up' | 'down' | 'stable'
  best_change_score: number
  total_changes: number
  successful_changes: number
  change_impact_points: number
  podium_finishes: number
  bottom_finishes: number
  best_matchday_points: number
  best_matchday: number
  sanctioned_matchdays: number
  kamikaze_score?: number
  app_opens?: number
  saldo?: number
  active_matchday_points?: number | null
  active_matchday_played?: number
  active_matchday_total?: number
}

interface MatchdayStatus {
  matchday: number
  is_open: boolean
}

type SortField = 'total_points' | 'average_points' | 'last_3_jornadas_avg' | 'best_change_score' | 'change_impact_points' | 'podium_finishes' | 'bottom_finishes' | 'sanctioned_matchdays' | 'saldo'
type SortOrder = 'asc' | 'desc'

export default function ClasificacionPage() {
  const config = useLeagueConfig()
  const [standings, setStandings] = useState<UserStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMatchday, setCurrentMatchday] = useState<number>(1)
  const [isLeagueOpen, setIsLeagueOpen] = useState<boolean>(false)
  const [lastPlayedMatchday, setLastPlayedMatchday] = useState<number>(1)
  const [sortField, setSortField] = useState<SortField>('total_points')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedRanking, setSelectedRanking] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [expandedMatchday, setExpandedMatchday] = useState<number | null>(null)
  const [userTeamData, setUserTeamData] = useState<Record<string, any>>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  // División seleccionada (pestaña). Las clasificaciones son independientes por
  // división. Arranca en null hasta conocer la del usuario para no cargar nada global.
  const [selectedDivision, setSelectedDivision] = useState<number | null>(null)
  const [currentUserDivision, setCurrentUserDivision] = useState<number | null>(null)
  const supabase = createClient()
  const teamRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // Cada fetch lleva un id. Si mientras está en vuelo arranca otro (cambio de
  // división, de orden o el refresco automático), el viejo se descarta al volver
  // para que una respuesta lenta no pise datos más nuevos.
  const fetchIdRef = useRef(0)
  // Filtros con los que se pintó la tabla por última vez. Si no han cambiado, el
  // fetch viene del refresco automático y se actualiza en silencio, sin loader.
  const lastFetchKeyRef = useRef<string | null>(null)

  const fetchMatchdays = async () => {
    const md = await getCurrentMatchday(supabase)
    setCurrentMatchday(md)

    const { data: statusData } = await supabase
      .from('matchday_status')
      .select('is_open')
      .eq('matchday', md)
      .maybeSingle()

    let isOpen = false
    if (statusData) {
      setIsLeagueOpen(statusData.is_open)
      isOpen = statusData.is_open
    }
    return { currentMatchday: md, isLeagueOpen: isOpen }
  }

  useEffect(() => {
    if (selectedDivision == null) return

    // El loader a pantalla completa solo se muestra cuando el fetch lo provoca el
    // usuario (primera carga, cambio de división o de orden). El refresco de cada
    // 30 s reemplaza los datos en silencio para que la tabla no parpadee.
    const fetchKey = `${sortField}|${sortOrder}|${selectedDivision}`
    const isBackgroundRefresh = lastFetchKeyRef.current === fetchKey
    lastFetchKeyRef.current = fetchKey

    const fetchId = ++fetchIdRef.current
    const isStale = () => fetchIdRef.current !== fetchId

    const fetchStandings = async () => {
      if (!isBackgroundRefresh) setLoading(true)
      const { currentMatchday: md, isLeagueOpen: isOpen } = await fetchMatchdays()
      
      const activeMatchdayToFetch = !isOpen ? md : null

      // La clasificación la calcula `getStandings`, que recorre cada división
      // por separado. En la pestaña Conjunta no se recalcula nada mezclando
      // divisiones: se juntan los resultados que ya salieron de cada tabla, así
      // que los puntos de un usuario son siempre los mismos que ve en la suya.
      const { standings: standingsData, lastPlayedMatchday: maxPlayed, incomplete } =
        await getStandings(supabase, selectedDivision, activeMatchdayToFetch)

      if (isStale()) return

      // Con los datos a medias saldrían puntuaciones más bajas de las reales.
      // Preferimos mantener la tabla anterior hasta el siguiente refresco.
      if (incomplete) {
        if (!isBackgroundRefresh) setLoading(false)
        return
      }

      setLastPlayedMatchday(maxPlayed)

      if (standingsData.length === 0) {
        setStandings([])
        setLoading(false)
        return
      }

      standingsData.sort((a, b) => {
        const valA = (a[sortField] as number) ?? 0
        const valB = (b[sortField] as number) ?? 0
        return sortOrder === 'desc' ? valB - valA : valA - valB
      })

      standingsData.forEach((standing, index) => {
        standing.current_position = index + 1
      })

      setStandings(standingsData)
      setLoading(false)
    }

    fetchStandings()

    // Al desmontar (o al relanzar el efecto) invalidamos el fetch en vuelo para
    // que no intente pintar sobre un componente que ya no está.
    return () => { fetchIdRef.current++ }
  }, [sortField, sortOrder, tick, selectedDivision])

  useEffect(() => {
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
        // Pestaña por defecto: la división del usuario (o 1ª si aún no tiene).
        setSelectedDivision(prev => prev ?? (div ?? 1))
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

  const handleUserClick = async (userId: string, targetMatchdayOverride?: number) => {
    if (!targetMatchdayOverride && expandedUser === userId) {
      setExpandedUser(null)
      setExpandedMatchday(null)
      return
    }

    setExpandedUser(userId)

    // Determinar la jornada a mostrar:
    // Si la jornada está en juego (isLeagueOpen === false), mostramos la jornada actual (currentMatchday).
    // Si la jornada está abierta para cambios (isLeagueOpen === true), mostramos la jornada anterior (currentMatchday - 1).
    let maxTargetMatchday = currentMatchday
    if (isLeagueOpen) {
      maxTargetMatchday = currentMatchday - 1
    }

    let targetMatchday = targetMatchdayOverride ?? maxTargetMatchday
    setExpandedMatchday(targetMatchday)

    // Obtener los equipos del usuario
    const { data: userTeamsData } = await supabase
      .from('user_teams')
      .select('id, user_id, name')
      .eq('user_id', userId)

    if (!userTeamsData || userTeamsData.length === 0) return

    const teamId = userTeamsData[0].id
    const teamName = userTeamsData[0].name

    const fantasyStart = config?.fantasy_starting_matchday ?? 1

    if (targetMatchday < fantasyStart) {
      setUserTeamData(prev => ({
        ...prev,
        [userId]: { teamName, isHidden: true, hiddenReason: `Sin plantillas (la liga empieza en la J${fantasyStart}).` }
      }))
      setTimeout(() => {
        teamRefs.current[userId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      return
    }

    // Obtener jugadores del equipo en la jornada seleccionada o anterior disponible
    // respetando el límite inferior de la jornada de inicio de liga
    let { data: teamPlayersData } = await supabase
      .from('team_players')
      .select('player_id, is_starter, is_captain, matchday, replaced_player_id')
      .eq('team_id', teamId)
      .lte('matchday', targetMatchday)
      .gte('matchday', fantasyStart)
      .order('matchday', { ascending: false })

    if (teamPlayersData && teamPlayersData.length > 0) {
      const maxMd = teamPlayersData[0].matchday
      teamPlayersData = teamPlayersData.filter(tp => tp.matchday === maxMd)
    }

    if (!teamPlayersData || teamPlayersData.length === 0) {
      setUserTeamData(prev => ({
        ...prev,
        [userId]: { teamName, isHidden: true, hiddenReason: `Aún no hay plantilla guardada (J${fantasyStart}).` }
      }))
      setTimeout(() => {
        teamRefs.current[userId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      return
    }

    // Si la jornada de destino tiene un partido adelantado sin terminar el resto,
    // solo se muestran los jugadores de los dos equipos que ya jugaron ese
    // partido: es lo único que realmente se ha disputado de esa jornada.
    {
      const { data: allFixturesRaw } = await supabase
        .from('fixtures')
        .select('id, matchday, momento, start_time, status, home_team_id, away_team_id')
      const allFixturesLite = (allFixturesRaw || []) as FixtureLite[]
      const offsets = {
        startHoursBeforeMidweek: config.matchday_start_hours_before_midweek ?? config.matchday_start_hours_before ?? 1,
        startHoursBeforeWeekend: config.matchday_start_hours_before_weekend ?? config.matchday_start_hours_before ?? 1,
        endHoursAfter: config.matchday_end_hours_after ?? 2,
      }
      const MATCH_DURATION_MS = 2.5 * 60 * 60 * 1000
      const advancedLocks = computeOutOfOrderLocks(allFixturesLite, offsets, config.fantasy_starting_matchday ?? 1)
        .filter(l => l.type === 'advanced' && l.ownMatchday === actualMatchday)
      if (advancedLocks.length > 0) {
        const mdFixtures = allFixturesLite.filter(f => f.matchday === actualMatchday)
        const allPlayed = mdFixtures.every(f => {
          const status = (f.status || '').toLowerCase()
          if (status === 'finished') return true
          const startTime = f.start_time ? new Date(f.start_time).getTime() : 0
          return startTime > 0 && startTime + MATCH_DURATION_MS < Date.now()
        })
        if (!allPlayed) {
          const restrictedTeamIds = new Set<string>()
          advancedLocks.forEach(l => l.teamIds.forEach(id => restrictedTeamIds.add(id)))
          const { data: rosterPlayers } = await supabase
            .from('players')
            .select('id, team_id')
            .in('id', teamPlayersData.map(tp => tp.player_id))
          const teamIdByPlayer = new Map(rosterPlayers?.map(p => [p.id, p.team_id]) || [])
          teamPlayersData = teamPlayersData.filter(tp => {
            const tid = teamIdByPlayer.get(tp.player_id)
            return tid && restrictedTeamIds.has(tid)
          })
        }
      }
    }

    const playerIds = teamPlayersData.map(tp => tp.player_id)
    const replacedPlayerIds = teamPlayersData.map(tp => tp.replaced_player_id).filter(Boolean) as string[]
    const allQueryPlayerIds = [...new Set([...playerIds, ...replacedPlayerIds])]
    const actualMatchday = teamPlayersData[0].matchday

    const { data: playersData } = await supabase
      .from('players')
      .select('id, first_name, last_name, short_name, position, photo, shirt_number, team_id, precio')
      .in('id', allQueryPlayerIds)

    const realTeamIds = [...new Set(playersData?.map(p => p.team_id).filter(Boolean) || [])]
    const { data: teamsData } = await supabase
      .from('real_teams')
      .select('id, name, logo_url')
      .in('id', realTeamIds)
    const teamsMap = new Map(teamsData?.map(t => [t.id, t]) || [])

    // Obtener los fixtures de la jornada para obtener puntos
    const { data: fixturesForMatchday } = await supabase
      .from('fixtures')
      .select('id, status')
      .eq('matchday', actualMatchday)

    const fixtureIds = fixturesForMatchday?.map(f => f.id) || []

    // Obtener puntos de la jornada específica (NO acumulativos)
    // Primero por matchday, si no hay resultados, por fixture_id
    let scores = null
    const { data: scoresByMatchday } = await supabase
      .from('player_scores')
      .select('player_id, total_points, goals, assists, yellow_cards, red_cards')
      .eq('matchday', actualMatchday)
      .in('player_id', playerIds)

    if (scoresByMatchday && scoresByMatchday.length > 0) {
      scores = scoresByMatchday
    } else if (fixtureIds.length > 0) {
      const { data: scoresByFixture } = await supabase
        .from('player_scores')
        .select('player_id, total_points, goals, assists, yellow_cards, red_cards')
        .in('fixture_id', fixtureIds)
        .in('player_id', playerIds)
      scores = scoresByFixture
    }

    const playerPointsMap = new Map<string, number>()
    const playerEventsMap = new Map<string, { goals: number, assists: number, yellow_cards: number, red_cards: number }>()
    scores?.forEach(s => {
      playerPointsMap.set(s.player_id, (playerPointsMap.get(s.player_id) || 0) + (s.total_points || 0))
      const evs = playerEventsMap.get(s.player_id) || { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 }
      playerEventsMap.set(s.player_id, {
        goals: evs.goals + (s.goals || 0),
        assists: evs.assists + (s.assists || 0),
        yellow_cards: evs.yellow_cards + (s.yellow_cards || 0),
        red_cards: evs.red_cards + (s.red_cards || 0),
      })
    })

    // Cargar team_players de la jornada anterior de todos los equipos
    const prevMatchday = actualMatchday - 1
    const prevStartersByTeam = new Map<string, string[]>()
    const prevSquadByTeam = new Map<string, string[]>()
    const heldByOthersPrev = new Map<string, string[]>()

    if (prevMatchday >= 1) {
      // La exclusividad solo mira a los rivales de la MISMA división: si no se
      // acota aquí, el detalle de un usuario muestra sanciones provocadas por
      // gente de otra tabla, que no le compite.
      const membership = await loadDivisionMembership(supabase)
      const profileMap = membership.profilesById
      const ownDivision = membership.divisionByUser.get(userId) ?? null
      const divisionTeams = ownDivision ? (membership.teamsByDivision.get(ownDivision as 1 | 2 | 3) ?? []) : []
      const teamMap = new Map(divisionTeams.map(t => [t.id, t]))

      const { data: prevStarters } = await supabase
        .from('team_players')
        .select('team_id, player_id, matchday, is_starter')
        .in('team_id', divisionTeams.map(t => t.id))
        .lte('matchday', prevMatchday)
        .order('matchday', { ascending: false })

      // Agrupar por team_id y quedarnos con el max matchday <= prevMatchday para cada equipo
      const maxMdByTeam = new Map<string, number>()
      prevStarters?.forEach(p => {
        const curMax = maxMdByTeam.get(p.team_id)
        if (curMax === undefined || p.matchday > curMax) {
          maxMdByTeam.set(p.team_id, p.matchday)
        }
      })

      prevStarters?.forEach(p => {
        if (p.matchday === maxMdByTeam.get(p.team_id)) {
          if (!prevSquadByTeam.has(p.team_id)) prevSquadByTeam.set(p.team_id, [])
          prevSquadByTeam.get(p.team_id)!.push(p.player_id)
          
          if (p.is_starter) {
            if (!prevStartersByTeam.has(p.team_id)) prevStartersByTeam.set(p.team_id, [])
            prevStartersByTeam.get(p.team_id)!.push(p.player_id)
          }
        }
      })

      // Ahora calcular heldByOthersPrev para teamId
      for (const [otherTeamId, pids] of prevSquadByTeam.entries()) {
        if (otherTeamId !== teamId) {
          const otherTeam = teamMap.get(otherTeamId)
          const otherProfile = otherTeam ? profileMap.get(otherTeam.user_id) : null
          const otherName = otherProfile?.full_name || otherProfile?.email?.split('@')[0] || 'otro usuario'
          pids.forEach(pid => {
            if (!heldByOthersPrev.has(pid)) heldByOthersPrev.set(pid, [])
            heldByOthersPrev.get(pid)!.push(otherName)
          })
        }
      }
    }

    const jugadores = teamPlayersData.map(tp => {
      const p = playersData?.find(pl => pl.id === tp.player_id)
      const teamObj = p ? teamsMap.get(p.team_id) : undefined
      
      let replacedPlayerObj = null
      if (tp.replaced_player_id) {
        const rp = playersData?.find(pl => pl.id === tp.replaced_player_id)
        if (rp) {
          replacedPlayerObj = {
            id: rp.id,
            short_name: rp.short_name || rp.first_name || '',
            photo: rp.photo
          }
        }
      }

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
        originalPuntos: playerPointsMap.get(tp.player_id) ?? 0,
        sanctionReason: undefined as string | undefined,
        replacedPlayer: replacedPlayerObj,
        events: playerEventsMap.get(tp.player_id) || { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 },
      }
    })

    const isMatchdayFinished = fixturesForMatchday ? fixturesForMatchday.every((f: any) => f.status === 'finished') : true;
    const prevMine = new Set<string>(prevMatchday >= 1 ? (prevSquadByTeam.get(teamId) || []) : [])
    const starters = jugadores.filter(j => j.is_starter)
    
    const isCurrentOpenMatchday = isLeagueOpen && actualMatchday === currentMatchday;
    
    const sanctionResult = isCurrentOpenMatchday
      ? { zeroedPlayers: new Map<string, string>(), netPoints: starters.reduce((sum, j) => sum + (j.puntos || 0), 0) }
      : applySanctionsToTeam(
          starters, 
          prevMine, 
          heldByOthersPrev, 
          config, 
          !isMatchdayFinished,
          undefined,
          undefined,
          undefined,
          actualMatchday === Math.max(1, config.fantasy_starting_matchday)
        )

    jugadores.forEach(j => {
      if (j.is_starter && sanctionResult.zeroedPlayers.has(j.id)) {
        j.sanctionReason = sanctionResult.zeroedPlayers.get(j.id)
        if (isMatchdayFinished) {
          j.originalPuntos = j.puntos
          j.puntos = 0
        }
      }
    })

    // Obtener multas (penalties) de la tabla penalties para esta jornada y usuario
    const { data: penaltiesData } = await supabase
      .from('penalties')
      .select('points, description')
      .eq('user_id', userId)
      .eq('matchday', actualMatchday)

    let totalPenalties = 0
    penaltiesData?.forEach(p => {
      const pts = typeof p.points === 'string' ? parseFloat(p.points) : (p.points as number)
      totalPenalties += (pts || 0)
    })

    const startersAfterSanctions = jugadores.filter(j => j.is_starter)
    const positionOrder: Record<string, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 }
    const sortPlayersByPosition = (list: any[]) => {
      list.sort((a, b) => {
        const orderA = positionOrder[getPositionLabel(a.position)] ?? 99
        const orderB = positionOrder[getPositionLabel(b.position)] ?? 99
        if (orderA !== orderB) return orderA - orderB
        return (b.puntos || 0) - (a.puntos || 0)
      })
    }
    sortPlayersByPosition(startersAfterSanctions)

    const subs = jugadores.filter(j => !j.is_starter)
    sortPlayersByPosition(subs)

    const totalPoints = jugadores.reduce((sum, j) => sum + Math.round((j.puntos || 0) * 10) / 10, 0) - totalPenalties

    setUserTeamData(prev => ({
      ...prev,
      [userId]: { teamName, jugadores: startersAfterSanctions, suplentes: subs, totalPoints, matchday: actualMatchday, penalties: totalPenalties }
    }))

    setTimeout(() => {
      teamRefs.current[userId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const getPositionMedal = (position: number, isLast: boolean = false) => {
    if (position === 1) return <Medal className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
    if (position === 2) return <Medal className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
    if (position === 3) return <Medal className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
    if (isLast) return <span className="text-xl sm:text-4xl leading-none">🐖</span>
    return <span className="text-xs sm:text-lg font-bold text-slate-600 w-4 sm:w-5 text-center">{position}</span>
  }

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600" />
    if (trend === 'down') return <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
    return <Minus className="w-3 h-3 sm:w-4 sm:h-4 text-slate-400" />
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

  const topEvolution = [...standings].filter(u => u.last_3_jornadas_avg > 0).sort((a, b) => b.last_3_jornadas_avg - a.last_3_jornadas_avg).slice(0, 3)
  const topChanges = [...standings].filter(u => u.change_impact_points !== 0).sort((a, b) => b.change_impact_points - a.change_impact_points).slice(0, 3)
  const topTotalChanges = [...standings].filter(u => u.total_changes > 0).sort((a, b) => b.total_changes - a.total_changes).slice(0, 3)
  const kamikazes = [...standings].filter(s => (s.kamikaze_score ?? 999999) < 999999)
  kamikazes.sort((a, b) => (a.kamikaze_score || 0) - (b.kamikaze_score || 0))
  const topKamikaze = kamikazes.slice(0, 3)
  const topOpens = [...standings].filter(u => (u.app_opens || 0) > 0).sort((a, b) => (b.app_opens || 0) - (a.app_opens || 0)).slice(0, 3)
  const topBacona = [...standings].filter(u => (u.last_place_finishes || 0) > 0).sort((a, b) => (b.last_place_finishes || 0) - (a.last_place_finishes || 0)).slice(0, 3)

  return (
    <div className="space-y-3 max-w-5xl mx-auto">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clasificación General</h1>
          <p className="text-sm text-slate-600 mt-0">
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

      {/* Pestañas de división: cada una tiene su clasificación independiente o conjunta */}
      <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
        {([1, 2, 3, DIVISION_COMBINED] as const).map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDivision(d)}
            className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
              selectedDivision === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {d === 0 ? 'Conjunta' : `${d}ª División`}
            {currentUserDivision === d && d !== 0 && (
              <span className="ml-1.5 text-[10px] font-bold text-emerald-600">(la tuya)</span>
            )}
          </button>
        ))}
      </div>

      {selectedRanking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-4 bg-indigo-600 text-white flex justify-between items-center shrink-0">
              <h2 className="font-bold text-lg">
                {selectedRanking === 'avg3' && 'Mayor Promedio (Últ. 3)'}
                {selectedRanking === 'impact' && 'Mejor Impacto Cambios'}
                {selectedRanking === 'changes' && 'Más Cambios en Total'}
                {selectedRanking === 'kamikaze' && 'Premio Kamikaze'}
                {selectedRanking === 'appOpens' && 'Adictos a la App'}
                {selectedRanking === 'bacona' && 'Bacona Más Gorda'}
              </h2>
              <button onClick={() => setSelectedRanking(null)} className="p-1 hover:bg-indigo-500 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {(() => {
                let list: any[] = [];
                switch (selectedRanking) {
                   case 'avg3': list = [...standings].filter(u => u.last_3_jornadas_avg > 0).sort((a, b) => b.last_3_jornadas_avg - a.last_3_jornadas_avg); break;
                   case 'impact': list = [...standings].filter(u => u.change_impact_points !== 0).sort((a, b) => b.change_impact_points - a.change_impact_points); break;
                   case 'changes': list = [...standings].filter(u => u.total_changes > 0).sort((a, b) => b.total_changes - a.total_changes); break;
                   case 'kamikaze': list = [...standings].filter(u => u.kamikaze_score && u.kamikaze_score !== 999999).sort((a, b) => (a.kamikaze_score || Infinity) - (b.kamikaze_score || Infinity)); break;
                   case 'appOpens': list = [...standings].filter(u => (u.app_opens || 0) > 0).sort((a, b) => (b.app_opens || 0) - (a.app_opens || 0)); break;
                   case 'bacona': list = [...standings].filter(u => (u.last_place_finishes || 0) > 0).sort((a, b) => (b.last_place_finishes || 0) - (a.last_place_finishes || 0)); break;
                }
                return list.map((u: any, i: number) => (
                  <div key={u.user_id} className={`flex justify-between items-center py-3 border-b border-slate-100 last:border-0 ${u.user_id === currentUserId ? 'bg-indigo-50/50 -mx-4 px-4 font-bold' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-6 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-500'}`}>
                        {i + 1}
                      </span>
                      <span className="text-sm text-slate-700 uppercase">{u.user_name}</span>
                    </div>
                    <span className="text-sm font-semibold text-indigo-600">
                      {selectedRanking === 'avg3' && `${Math.round((u.last_3_jornadas_avg ?? 0) * 10) / 10} pts`}
                      {selectedRanking === 'impact' && `${(u.change_impact_points ?? 0) > 0 ? '+' : ''}${Math.round((u.change_impact_points ?? 0) * 10) / 10} pts`}
                      {selectedRanking === 'changes' && u.total_changes}
                      {selectedRanking === 'kamikaze' && formatKamikazeTime(u.kamikaze_score ?? 0)}
                      {selectedRanking === 'appOpens' && `${u.app_opens ?? 0} accesos`}
                      {selectedRanking === 'bacona' && `${u.last_place_finishes ?? 0} veces colista`}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}


      {/* Tabla de clasificación */}
      <Card className="!bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full">
            <table className="min-w-max w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-[9px] sm:text-xs font-semibold text-slate-300 px-0.5 sm:px-1 py-1 whitespace-nowrap">Pos</th>
                  <th className="text-left text-[9px] sm:text-xs font-semibold text-slate-300 px-0.5 sm:px-1 py-1 whitespace-nowrap">Jugador</th>
                  <th
                    className="text-right text-[9px] sm:text-xs font-semibold text-slate-300 px-0.5 sm:px-1 py-1 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('total_points')}
                  >
                    <div className="flex items-center justify-end gap-0.5">
                      <span className="hidden sm:inline">Pts Totales</span>
                      <span className="sm:hidden">Pts</span>
                      <SortIcon field="total_points" />
                    </div>
                  </th>
                  <th
                    className="text-right text-[9px] sm:text-xs font-semibold text-slate-300 px-0.5 sm:px-1 py-1 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('average_points')}
                  >
                    <div className="flex items-center justify-end gap-0.5">
                      <span className="hidden sm:inline">Promedio</span>
                      <span className="sm:hidden">Prom</span>
                      <SortIcon field="average_points" />
                    </div>
                  </th>
                  {!isLeagueOpen && (
                    <th
                      className="text-right text-[9px] sm:text-xs font-semibold text-amber-400 px-0.5 sm:px-1 py-1 whitespace-nowrap"
                      title={`Jugadores alineados que ya han jugado en la J${currentMatchday}`}
                    >
                      <div className="flex items-center justify-end gap-0.5">
                        <span className="hidden sm:inline">Jugados (J{currentMatchday})</span>
                        <span className="sm:hidden">Jug. J{currentMatchday}</span>
                      </div>
                    </th>
                  )}
                  <th
                    className="text-right text-[9px] sm:text-xs font-semibold text-slate-300 px-0.5 sm:px-1 py-1 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('last_3_jornadas_avg')}
                    title="Promedio de las últimas 3 jornadas"
                  >
                    <div className="flex items-center justify-end gap-0.5">
                      <span>Últ. 3</span>
                      <SortIcon field="last_3_jornadas_avg" />
                    </div>
                  </th>
                  <th className="text-center text-[9px] sm:text-xs font-semibold text-slate-300 px-0.5 sm:px-1 py-1 whitespace-nowrap" title="Tendencia en las últimas 5 jornadas">
                    <span className="hidden sm:inline">Tendencia</span>
                    <span className="sm:hidden">Tend</span>
                  </th>
                  <th
                    className="text-center text-[9px] sm:text-xs font-semibold text-slate-300 px-0.5 sm:px-1 py-1 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('sanctioned_matchdays')}
                    title="Número total de sanciones"
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="hidden sm:inline">Sanciones</span>
                      <span className="sm:hidden">Sanc</span>
                      <SortIcon field="sanctioned_matchdays" />
                    </div>
                  </th>
                  <th
                    className="text-right text-[9px] sm:text-xs font-semibold text-slate-300 px-0.5 sm:px-1 py-1 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('change_impact_points')}
                    title="Puntos netos ganados o perdidos por cambios"
                  >
                    <div className="flex items-center justify-end gap-0.5">
                      <span>Cambios</span>
                      <SortIcon field="change_impact_points" />
                    </div>
                  </th>
                  <th
                    className="text-right text-[9px] sm:text-xs font-semibold text-slate-300 px-0.5 sm:px-1 py-1 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('saldo')}
                    title="Saldo disponible (Saldo Inicial Virtual - Cuotas - Sanciones)"
                  >
                    <div className="flex items-center justify-end gap-0.5 text-emerald-400">
                      <span>Saldo</span>
                      <SortIcon field="saldo" />
                    </div>
                  </th>
                  <th
                    className="hidden sm:table-cell text-center text-xs font-semibold text-slate-300 px-1 py-1 whitespace-nowrap cursor-pointer hover:bg-slate-700"
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
                    className="hidden sm:table-cell text-center text-xs font-semibold text-slate-300 px-1 py-1 whitespace-nowrap cursor-pointer hover:bg-slate-700"
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
                  
                  let bgClass = 'hover:bg-slate-700/50'
                  let borderClass = 'border-slate-700'
                  let descCount = 0
                  
                  if (selectedDivision !== DIVISION_COMBINED && selectedDivision !== null) {
                    descCount = selectedDivision === 1 ? config.div1_descensos : selectedDivision === 2 ? config.div2_descensos : selectedDivision === 3 ? config.div3_descensos : 0;
                    const totalGreenRows = (selectedDivision === 2 || selectedDivision === 3) ? 5 : (selectedDivision === 1 ? (config.div1_win_percent || 3) : 0);
                    
                    if (index < totalGreenRows) {
                      if (index >= 3) {
                        // Filas 4ª y 5ª: verde más claro que las 3 primeras
                        bgClass = 'bg-gradient-to-r from-emerald-950/40 via-emerald-900/10 to-transparent hover:from-emerald-900/50 [&>td:first-child]:shadow-[inset_3px_0_0_0_#34d399]'
                        borderClass = 'border-emerald-800/30'
                      } else {
                        // Filas 1ª, 2ª y 3ª: verde principal
                        bgClass = 'bg-gradient-to-r from-emerald-900/60 via-emerald-900/10 to-transparent hover:from-emerald-800/60 [&>td:first-child]:shadow-[inset_3px_0_0_0_#10b981]'
                        borderClass = 'border-emerald-800/40'
                      }
                    } else if (index >= standings.length - descCount) {
                      bgClass = 'bg-gradient-to-r from-red-950/70 via-red-900/20 to-transparent hover:from-red-900/70 [&>td:first-child]:shadow-[inset_3px_0_0_0_#ef4444]'
                      borderClass = 'border-red-900/40'
                    }
                  }

                  const showGreenArrow = (selectedDivision === 2 || selectedDivision === 3) && index < 5
                  const showRedArrow = (selectedDivision === 1 || selectedDivision === 2) && descCount > 0 && index >= standings.length - descCount

                  if (isExpanded) {
                    bgClass = 'bg-slate-600'
                  } else if (isCurrentUser) {
                    if (bgClass === 'hover:bg-slate-700/50') {
                      bgClass = 'bg-slate-800/60 hover:bg-slate-700/60'
                    }
                    bgClass += ' animate-pulse ring-1 ring-inset ring-slate-500/50'
                  }

                  return (
                  <Fragment key={standing.user_id}>
                  <tr
                    className={`border-b transition-colors cursor-pointer ${borderClass} ${bgClass}`}
                    onClick={() => handleUserClick(standing.user_id)}
                  >
                    <td className="px-0.5 sm:px-1 py-1">
                      {getPositionMedal(standing.current_position, isLast)}
                    </td>
                    <td className="px-0.5 sm:px-1 py-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center shrink-0">
                          {showGreenArrow && (
                            <ArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 stroke-[2.5]" />
                          )}
                          {showRedArrow && (
                            <ArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500 stroke-[2.5]" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-[9px] min-[360px]:text-[10px] sm:text-[11px] whitespace-nowrap uppercase">{standing.user_name}</p>
                          {standing.best_matchday_points > 0 && (
                            <p className="hidden sm:block text-[10px] text-amber-400 font-medium whitespace-nowrap">
                              Mejor: {Math.round(standing.best_matchday_points * 10) / 10} pts (J{standing.best_matchday})
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-0.5 sm:px-1 py-1 text-right whitespace-nowrap tabular-nums">
                      <span className="text-base sm:text-xl font-bold text-emerald-400">
                        {(Math.round(standing.total_points * 10) / 10).toFixed(1)}
                      </span>
                      <span className="hidden sm:inline text-[10px] text-slate-400 ml-0.5">pts</span>
                    </td>
                     <td className="px-0.5 sm:px-1 py-1 text-right whitespace-nowrap">
                      <span className="text-[9px] sm:text-xs font-semibold text-slate-200">
                        {Number(standing.average_points).toFixed(1)}
                      </span>
                      <span className="hidden sm:inline text-[10px] text-slate-400 ml-0.5">pts/j</span>
                    </td>
                    {!isLeagueOpen && (
                      <td className="px-0.5 sm:px-1 py-1 text-right whitespace-nowrap">
                        {standing.active_matchday_points !== null ? (
                          <span className="text-[10px] sm:text-xs font-bold text-amber-400">
                            {standing.active_matchday_played}/{standing.active_matchday_total || 11}
                          </span>
                        ) : (
                          <span className="text-[9px] sm:text-xs text-slate-500">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-0.5 sm:px-1 py-1 text-right whitespace-nowrap">
                      <span className="text-[9px] sm:text-xs font-semibold text-blue-400">
                        {(Math.round(standing.last_3_jornadas_avg * 10) / 10).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-0.5 sm:px-1 py-1">
                      <div className="flex justify-center">
                        {getTrendIcon(standing.last_5_trend)}
                      </div>
                    </td>
                    <td className="px-0.5 sm:px-1 py-1 text-center whitespace-nowrap">
                      <span className={`text-[10px] sm:text-sm font-bold ${
                        standing.sanctioned_matchdays > 0 ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {standing.sanctioned_matchdays}
                      </span>
                    </td>
                    <td className="px-0.5 sm:px-1 py-1 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end">
                        <span className={`text-[9px] sm:text-xs font-bold leading-none ${standing.change_impact_points > 0 ? 'text-emerald-400' : standing.change_impact_points < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                          {standing.change_impact_points > 0 ? '+' : ''}{Math.round(standing.change_impact_points * 10) / 10}
                        </span>
                        <span className="hidden sm:inline text-[9px] text-slate-500">{standing.total_changes} cambios</span>
                        <span className="sm:hidden text-[7px] text-slate-500 leading-none mt-0.5">{standing.total_changes} c.</span>
                      </div>
                    </td>
                    <td className="px-0.5 sm:px-1 py-1 text-right whitespace-nowrap">
                      <span className={`font-bold text-[10px] sm:text-sm ${((standing.saldo || 0) < 0) ? 'text-red-400' : 'text-emerald-400'}`}>
                        <span className="hidden sm:inline">{standing.saldo?.toFixed(2)}€</span>
                        <span className="sm:hidden">{standing.saldo?.toFixed(0)}€</span>
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-1 py-1 text-center whitespace-nowrap">
                      <span className="text-[11px] font-bold text-yellow-500">{standing.podium_finishes}</span>
                    </td>
                    <td className="hidden sm:table-cell px-1 py-1 text-center whitespace-nowrap">
                      <span className="text-[11px] font-bold text-red-500">{standing.bottom_finishes}</span>
                    </td>
                  </tr>
                  {/* Equipo desplegable */}
                  {isExpanded && userTeamData[standing.user_id] && (
                    <tr>
                      <td colSpan={!isLeagueOpen ? 12 : 11} className="p-0">
                        <div ref={(el) => { teamRefs.current[standing.user_id] = el; }} className="bg-slate-700/50 px-3 py-2.5 sticky left-0 w-[calc(100vw-3.5rem)] sm:w-[400px] max-w-full shadow-lg border-r border-slate-600/50">
                          {/* Cabecera equipo */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-sm font-bold text-white truncate">
                              {userTeamData[standing.user_id]?.teamName}
                            </span>
                            {!userTeamData[standing.user_id]?.isHidden && (
                              <div className="flex items-center gap-1.5 ml-auto">
                                <Badge className="bg-emerald-600 text-white text-xs shrink-0 flex items-center gap-1 px-1.5 py-0.5">
                                  <span>{(Math.round((userTeamData[standing.user_id]?.totalPoints || 0) * 10) / 10).toFixed(1)} pts</span>
                                  <span className="text-emerald-200">·</span>
                                  <div className="flex items-center">
                                    <button
                                      disabled={expandedMatchday! <= 1}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleUserClick(standing.user_id, expandedMatchday! - 1)
                                      }}
                                      className="p-0.5 hover:bg-emerald-500 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                    >
                                      <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="px-1">J{userTeamData[standing.user_id]?.matchday}</span>
                                    <button
                                      disabled={expandedMatchday! >= (isLeagueOpen ? currentMatchday - 1 : currentMatchday)}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleUserClick(standing.user_id, expandedMatchday! + 1)
                                      }}
                                      className="p-0.5 hover:bg-emerald-500 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </Badge>
                                {userTeamData[standing.user_id]?.penalties > 0 && (
                                  <Badge className="bg-red-600 text-white text-xs shrink-0">
                                    -{Math.round((userTeamData[standing.user_id]?.penalties || 0) * 10) / 10} pts multa
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>

                          {userTeamData[standing.user_id]?.isHidden ? (
                            <div className="py-4 text-center">
                              <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2 opacity-80" />
                              <p className="text-sm text-amber-200/80 font-medium">
                                {userTeamData[standing.user_id]?.hiddenReason}
                              </p>
                            </div>
                          ) : (
                            <>
                              {/* Lista de jugadores */}
                              <div className="space-y-0.5">
                                {userTeamData[standing.user_id]?.jugadores.map((player: any) => (
                                  <div
                                    key={player.id}
                                    className={`flex items-center gap-x-2 py-1 px-1.5 rounded ${
                                      player.sanctionReason
                                        ? 'bg-red-950/50 border border-red-800'
                                        : 'bg-slate-700/60'
                                    }`}
                                  >
                                    {/* col 1: foto */}
                                    <div className="shrink-0">
                                    {player.photo ? (
                                      <img src={player.photo} alt={player.short_name} className="w-6 h-6 rounded-full object-cover border border-slate-500" />
                                    ) : (
                                      <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-[9px] font-bold text-slate-300">
                                        {player.shirt_number || '?'}
                                      </div>
                                    )}
                                    </div>

                                    {/* col 2: nombre + posición + equipo */}
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className={`text-xs font-semibold whitespace-nowrap ${player.sanctionReason ? 'text-red-200' : 'text-white'}`}>
                                          {formatPlayerName(player.short_name)}
                                        </span>
                                        <Badge className={`text-[9px] px-1 py-0 leading-tight shrink-0 ${getPositionColor(player.position)}`}>
                                          {getPositionLabel(player.position)}
                                        </Badge>
                                        {player.sanctionReason && (
                                          <span title={player.sanctionReason} className="inline-flex shrink-0">
                                            <AlertTriangle 
                                              className="w-3 h-3 text-red-400 cursor-help" 
                                            />
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 mt-0.5 min-h-[14px]">
                                        {player.team?.logo_url && (
                                          <img src={player.team.logo_url} alt={player.team.name} className="w-3.5 h-3.5 object-contain shrink-0" title={player.team.name} />
                                        )}
                                        {player.events?.goals > 0 && Array.from({length: player.events.goals}).map((_, i) => <span key={`g-${i}`} className="text-[10px] leading-none" title="Gol">⚽</span>)}
                                        {player.events?.assists > 0 && Array.from({length: player.events.assists}).map((_, i) => <span key={`a-${i}`} className="text-[10px] leading-none" title="Asistencia">👟</span>)}
                                        {player.events?.yellow_cards > 0 && Array.from({length: player.events.yellow_cards}).map((_, i) => <div key={`y-${i}`} className="w-2 h-2.5 bg-yellow-400 rounded-sm shadow-sm" title="Tarjeta Amarilla" />)}
                                        {player.events?.red_cards > 0 && Array.from({length: player.events.red_cards}).map((_, i) => <div key={`r-${i}`} className="w-2 h-2.5 bg-red-500 rounded-sm shadow-sm" title="Tarjeta Roja" />)}
                                      </div>
                                      {player.replacedPlayer && (
                                        <div className="flex items-center gap-1 mt-0.5">
                                          <span className="text-[9px] text-slate-400">por</span>
                                          {player.replacedPlayer.photo && (
                                            <img src={player.replacedPlayer.photo} className="w-3.5 h-3.5 rounded-full object-cover border border-slate-500 shrink-0" alt="" />
                                          )}
                                          <span className="text-[9px] text-red-400 font-semibold whitespace-nowrap">
                                            {formatPlayerName(player.replacedPlayer.short_name)}
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {/* col 3: puntos */}
                                    <div className="text-right shrink-0 ml-1 mr-auto">
                                      {player.sanctionReason ? (
                                        <>
                                          <span className="text-xs font-bold text-red-400 line-through block leading-none">
                                            {Math.round((player.originalPuntos || 0) * 10) / 10}
                                          </span>
                                          <span className="text-xs font-bold text-red-400 block leading-none">0 pts</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-sm font-bold text-yellow-400 leading-none">
                                            {Math.round((player.puntos || 0) * 10) / 10}
                                          </span>
                                          <span className="text-[10px] text-yellow-600 ml-0.5">pts</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Suplentes */}
                              {userTeamData[standing.user_id]?.suplentes.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-slate-700">
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Suplentes</p>
                                  <div className="space-y-0.5">
                                    {userTeamData[standing.user_id]?.suplentes.map((player: any) => (
                                      <div
                                        key={player.id}
                                        className="flex items-center gap-x-2 py-1 px-1.5 rounded bg-slate-800/40"
                                      >
                                        <div className="shrink-0">
                                          {player.photo ? (
                                            <img src={player.photo} alt={player.short_name} className="w-5 h-5 rounded-full object-cover border border-slate-600 opacity-70" />
                                          ) : (
                                            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-500">
                                              {player.shirt_number || '?'}
                                            </div>
                                          )}
                                        </div>
                                        <div className="min-w-0 flex items-center gap-1 flex-wrap">
                                          <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">{formatPlayerName(player.short_name)}</span>
                                          <Badge className={`text-[9px] px-1 py-0 leading-tight shrink-0 opacity-70 ${getPositionColor(player.position)}`}>
                                            {getPositionLabel(player.position)}
                                          </Badge>
                                          <div className="flex items-center gap-1 ml-1 min-h-[14px]">
                                            {player.team?.logo_url && (
                                              <img src={player.team.logo_url} alt={player.team.name} className="w-3 h-3 object-contain shrink-0 opacity-70" title={player.team.name} />
                                            )}
                                            {player.events?.goals > 0 && Array.from({length: player.events.goals}).map((_, i) => <span key={`g-${i}`} className="text-[9px] leading-none opacity-70" title="Gol">⚽</span>)}
                                            {player.events?.assists > 0 && Array.from({length: player.events.assists}).map((_, i) => <span key={`a-${i}`} className="text-[9px] leading-none opacity-70" title="Asistencia">👟</span>)}
                                            {player.events?.yellow_cards > 0 && Array.from({length: player.events.yellow_cards}).map((_, i) => <div key={`y-${i}`} className="w-1.5 h-2 bg-yellow-400/70 rounded-[1px] shadow-sm" title="Tarjeta Amarilla" />)}
                                            {player.events?.red_cards > 0 && Array.from({length: player.events.red_cards}).map((_, i) => <div key={`r-${i}`} className="w-1.5 h-2 bg-red-500/70 rounded-[1px] shadow-sm" title="Tarjeta Roja" />)}
                                          </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-1 mr-auto">
                                          <span className="text-xs font-bold text-yellow-500/60">
                                            {Math.round((player.puntos || 0) * 10) / 10}
                                          </span>
                                          <span className="text-[10px] text-slate-500 ml-0.5">pts</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas destacadas - MOVIDAS ABAJO DE LA TABLA */}
      {(topEvolution.length > 0 || topChanges.length > 0 || topTotalChanges.length > 0 || topKamikaze.length > 0 || topOpens.length > 0 || topBacona.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topEvolution.length > 0 && (
            <div onClick={() => setSelectedRanking('avg3')}>
              <Card className="!bg-emerald-50 border-emerald-200 cursor-pointer hover:bg-emerald-100 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 mt-1">
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-emerald-700 uppercase mb-2">Mayor promedio (últ. 3)</p>
                    {topEvolution.map((u, i) => (
                      <div key={u.user_id} className="flex justify-between items-start mb-2 border-b border-emerald-200/50 pb-2 last:border-0 last:pb-0">
                        <p className="text-sm font-bold text-emerald-900 uppercase pr-2 leading-tight">
                          {i + 1}. {u.user_name}
                        </p>
                        <p className="text-xs text-emerald-700 font-medium whitespace-nowrap pt-0.5">{Math.round(u.last_3_jornadas_avg * 10)/10} pts</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          )}

          {topChanges.length > 0 && (
            <div onClick={() => setSelectedRanking('impact')}>
              <Card className="!bg-blue-50 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mt-1">
                    <Target className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-2">Mejor impacto cambios</p>
                    {topChanges.map((u, i) => (
                      <div key={u.user_id} className="flex justify-between items-start mb-2 border-b border-blue-200/50 pb-2 last:border-0 last:pb-0">
                        <p className="text-sm font-bold text-blue-900 uppercase pr-2 leading-tight">
                          {i + 1}. {u.user_name}
                        </p>
                        <p className="text-xs text-blue-700 font-medium whitespace-nowrap pt-0.5">{u.change_impact_points > 0 ? `+${Math.round(u.change_impact_points * 10)/10}` : Math.round(u.change_impact_points * 10)/10} pts</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          )}

          {topTotalChanges.length > 0 && (
            <div onClick={() => setSelectedRanking('changes')}>
              <Card className="!bg-purple-50 border-purple-200 cursor-pointer hover:bg-purple-100 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0 mt-1">
                    <ArrowUpDown className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-purple-700 uppercase mb-2">Más cambios en total</p>
                    {topTotalChanges.map((u, i) => (
                      <div key={u.user_id} className="flex justify-between items-start mb-2 border-b border-purple-200/50 pb-2 last:border-0 last:pb-0">
                        <p className="text-sm font-bold text-purple-900 uppercase pr-2 leading-tight">
                          {i + 1}. {u.user_name}
                        </p>
                        <p className="text-xs text-purple-700 font-medium whitespace-nowrap pt-0.5">{u.total_changes}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          )}

          {topKamikaze.length > 0 && (
            <div onClick={() => setSelectedRanking('kamikaze')}>
              <Card className="!bg-rose-50 border-rose-200 cursor-pointer hover:bg-rose-100 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-rose-600 flex items-center justify-center shrink-0 mt-1">
                    <AlertTriangle className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-rose-700 uppercase mb-2">Premio Kamikaze</p>
                    {topKamikaze.map((u, i) => (
                      <div key={u.user_id} className="flex justify-between items-start mb-2 border-b border-rose-200/50 pb-2 last:border-0 last:pb-0">
                        <p className="text-sm font-bold text-rose-900 uppercase pr-2 leading-tight">
                          {i + 1}. {u.user_name}
                        </p>
                        <p className="text-xs text-rose-700 font-medium whitespace-nowrap pt-0.5">{formatKamikazeTime(u.kamikaze_score || 0)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          )}

          {topOpens.length > 0 && (
            <div onClick={() => setSelectedRanking('appOpens')}>
              <Card className="!bg-indigo-50 border-indigo-200 cursor-pointer hover:bg-indigo-100 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-1">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-indigo-700 uppercase mb-2">Adictos a la app</p>
                    {topOpens.map((u, i) => (
                      <div key={u.user_id} className="flex justify-between items-start mb-2 border-b border-indigo-200/50 pb-2 last:border-0 last:pb-0">
                        <p className="text-sm font-bold text-indigo-900 uppercase pr-2 leading-tight">
                          {i + 1}. {u.user_name}
                        </p>
                        <p className="text-xs text-indigo-700 font-medium whitespace-nowrap pt-0.5">{u.app_opens} accesos</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          )}

          {topBacona.length > 0 && (
            <div onClick={() => setSelectedRanking('bacona')}>
              <Card className="!bg-pink-50 border-pink-200 cursor-pointer hover:bg-pink-100 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center shrink-0 mt-1 overflow-hidden shadow-sm border border-pink-200">
                    <img src="/bacona.png" alt="Bacona" className="w-7 h-7 object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-pink-700 uppercase mb-2">Bacona más gorda</p>
                    {topBacona.map((u, i) => (
                      <div key={u.user_id} className="flex justify-between items-start mb-2 border-b border-pink-200/50 pb-2 last:border-0 last:pb-0">
                        <p className="text-sm font-bold text-pink-900 uppercase pr-2 leading-tight">
                          {i + 1}. {u.user_name}
                        </p>
                        <p className="text-xs text-pink-700 font-medium whitespace-nowrap pt-0.5">{u.last_place_finishes} veces colista</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          )}
        </div>
      )}

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
