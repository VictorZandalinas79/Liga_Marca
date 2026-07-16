'use client'

import { useEffect, useState, useRef, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Medal, Trophy, Star, ChevronDown, ChevronUp, Minus, Search, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Clock, MousePointerClick, History, Target, Users, AlertTriangle, ArrowUpDown, CheckCircle } from 'lucide-react'

function formatKamikazeTime(totalMinutes: number): string {
  if (totalMinutes === Infinity || totalMinutes === 999999) return '-'
  const mins = Math.floor(totalMinutes)
  const secs = Math.round((totalMinutes % 1) * 60)
  if (mins === 0) return `${secs} s`
  if (secs === 0) return `${mins} min`
  return `${mins} min ${secs} s`
}
import { applySanctionsToTeam } from '@/lib/infractions'
import { useLeagueConfig } from '@/lib/league-config'

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
}

interface MatchdayStatus {
  matchday: number
  is_open: boolean
}

type SortField = 'total_points' | 'average_points' | 'last_3_jornadas_avg' | 'best_change_score' | 'change_impact_points' | 'podium_finishes' | 'bottom_finishes' | 'sanctioned_matchdays'
type SortOrder = 'asc' | 'desc'

export default function ClasificacionPage() {
  const config = useLeagueConfig()
  const [standings, setStandings] = useState<UserStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMatchday, setCurrentMatchday] = useState<number>(1)
  const [lastPlayedMatchday, setLastPlayedMatchday] = useState<number>(1)
  const [sortField, setSortField] = useState<SortField>('total_points')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
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

      const userIds = Array.from(userTeamsMap.keys())
      const { data: usersData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      const usersMap = new Map(usersData?.map(u => [u.id, u]) || [])

      const teamIdToUserName = new Map<string, string>()
      for (const ut of userTeamsData) {
        const user = usersMap.get(ut.user_id)
        const name = user?.full_name || user?.email?.split('@')[0] || 'Usuario'
        teamIdToUserName.set(ut.id, name)
      }

      const teamPlayers: { team_id: string; player_id: string; is_starter: boolean; is_captain: boolean; matchday: number; created_at?: string }[] = []
      {
        const pageSize = 1000
        let from = 0
        while (true) {
          const { data: page, error } = await supabase
            .from('team_players')
            .select('team_id, player_id, is_starter, is_captain, matchday, created_at')
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

      // Cargar info de jugadores reales y sus equipos para aplicar las sanciones
      const { data: playersData } = await supabase
        .from('players')
        .select('id, position, team_id, precio, short_name, first_name')
        .in('id', playerIds)
      const playersInfoMap = new Map(playersData?.map(p => [p.id, p]) || [])

      const { data: realTeams } = await supabase
        .from('real_teams')
        .select('id, name')
      const realTeamNames = new Map(realTeams?.map(rt => [rt.id, rt.name]) || [])

      // Obtener config de la liga desde Supabase
      const { data: configData } = await supabase.from('league_config').select('*').eq('id', 1).maybeSingle()
      const leagueConfig = {
        budget_limit: configData?.budget_limit ?? 275,
        max_players_per_team: configData?.max_players_per_team ?? 4,
        formations: configData?.formations ?? ['3-5-2', '3-4-3', '4-4-2', '4-3-3', '4-5-1', '5-4-1', '5-3-2']
      }

      const { data: fixturesData } = await supabase
        .from('fixtures')
        .select('id, matchday, status, start_time')

      const fixtureToMatchday = new Map<string, number>()
      const matchdayToDeadline = new Map<number, Date>()

      fixturesData?.forEach(f => {
        if (f.id && f.matchday && f.matchday > 0) {
          fixtureToMatchday.set(f.id, f.matchday)
          if (f.start_time) {
            const st = new Date(f.start_time)
            if (!matchdayToDeadline.has(f.matchday) || st < matchdayToDeadline.get(f.matchday)!) {
              matchdayToDeadline.set(f.matchday, st)
            }
          }
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
      const teamMatchdayLatestChange = new Map<string, Map<number, Date>>()

      for (const tp of teamPlayers) {
        const md = tp.matchday && tp.matchday > 0 ? tp.matchday : 0

        if (!teamPlayersByMatchday.has(tp.team_id)) {
          teamPlayersByMatchday.set(tp.team_id, new Map())
        }
        if (!teamPlayersByMatchday.get(tp.team_id)!.has(md)) {
          teamPlayersByMatchday.get(tp.team_id)!.set(md, [])
        }
        teamPlayersByMatchday.get(tp.team_id)!.get(md)!.push(tp)

        // Kamikaze tracking
        if (tp.created_at && md > 0) {
          const created = new Date(tp.created_at)
          const deadline = matchdayToDeadline.get(md)
          if (deadline && created < deadline) {
            if (!teamMatchdayLatestChange.has(tp.team_id)) {
              teamMatchdayLatestChange.set(tp.team_id, new Map())
            }
            const currentLatest = teamMatchdayLatestChange.get(tp.team_id)!.get(md)
            if (!currentLatest || created > currentLatest) {
              teamMatchdayLatestChange.get(tp.team_id)!.set(md, created)
            }
          }
        }
      }

      // Jornadas que REALMENTE se han jugado (tienen puntuaciones en player_scores)
      const playedMatchdays = new Set<number>()
      for (const playerMds of playerPointsByMatchday.values()) {
        for (const md of playerMds.keys()) {
          if (md > 0) playedMatchdays.add(md)
        }
      }
      const sortedPlayedMatchdays = Array.from(playedMatchdays).sort((a, b) => a - b)

      const maxPlayed = sortedPlayedMatchdays.length > 0 ? sortedPlayedMatchdays[sortedPlayedMatchdays.length - 1] : 1
      setLastPlayedMatchday(maxPlayed)

      // Auto-duplicar alineaciones para jornadas jugadas donde un equipo no tiene entradas.
      // Así los usuarios que no hicieron cambios tendrán sus 11 jugadores persistidos.
      for (const [teamId, matchdays] of teamPlayersByMatchday.entries()) {
        for (const playedMd of sortedPlayedMatchdays) {
          if (matchdays.has(playedMd)) continue // Ya tiene datos para esta jornada

          // Buscar la alineación más reciente anterior a esta jornada
          let activeMd = -1
          for (const savedMd of matchdays.keys()) {
            if (savedMd > 0 && savedMd <= playedMd && savedMd > activeMd) {
              activeMd = savedMd
            }
          }
          if (activeMd === -1) continue

          const prevPlayers = matchdays.get(activeMd) || []
          if (prevPlayers.length === 0) continue

          // Crear las filas heredadas para la nueva jornada
          const inheritedRows = prevPlayers.map((tp, index) => ({
            team_id: teamId,
            player_id: tp.player_id,
            is_starter: tp.is_starter,
            is_captain: tp.is_captain,
            matchday: playedMd,
          }))

          // Insertar en la base de datos (persistir la herencia)
          supabase.from('team_players').insert(inheritedRows).then(({ error }) => {
            if (error) {
              // Ignorar errores de duplicados (por si otra pestaña ya lo insertó)
              console.log(`[CLASIFICACION] Auto-herencia J${playedMd} equipo ${teamId}:`, error.message)
            }
          })

          // Actualizar el mapa local para que el cálculo de esta carga sea correcto
          const localCopy = prevPlayers.map(tp => ({ ...tp, matchday: playedMd }))
          matchdays.set(playedMd, localCopy)
        }
      }

      const userPointsByMatchday = new Map<string, Map<number, number>>()
      const userChangesCount = new Map<string, number>()
      const userChangesPointsDiff = new Map<string, number>()
      const userSanctionedMatchdays = new Map<string, Set<number>>()
      const userMatchdaysFromTeamPlayers = new Map<string, Set<number>>()

      // Inicializar variables para herencia y sanciones
      let prevStartersByTeam = new Map<string, string[]>()
      let prevSquadByTeam = new Map<string, string[]>()

      const posLabel = (pos: string) => {
        const l = (pos || '').toLowerCase()
        if (l.includes('goalkeeper') || l === 'gk') return 'POR'
        if (l.includes('defender') || l === 'def') return 'DEF'
        if (l.includes('midfielder') || l === 'mid') return 'MED'
        return 'DEL'
      }

      for (const md of sortedPlayedMatchdays) {
        // Construir heldByOthersPrev para esta jornada `md`
        const heldByOthersPrev = new Map<string, string[]>()
        for (const [otherTeamId, pids] of prevStartersByTeam.entries()) {
          const otherName = teamIdToUserName.get(otherTeamId) || 'otro usuario'
          for (const pid of pids) {
            if (!heldByOthersPrev.has(pid)) {
              heldByOthersPrev.set(pid, [])
            }
            heldByOthersPrev.get(pid)!.push(otherName)
          }
        }

        const currentStartersByTeam = new Map<string, string[]>()
        const currentSquadByTeam = new Map<string, string[]>()

        for (const [userId, teams] of userTeamsMap.entries()) {
          if (!userPointsByMatchday.has(userId)) {
            userPointsByMatchday.set(userId, new Map())
          }
          if (!userMatchdaysFromTeamPlayers.has(userId)) {
            userMatchdaysFromTeamPlayers.set(userId, new Set())
          }
          if (!userSanctionedMatchdays.has(userId)) {
            userSanctionedMatchdays.set(userId, new Set())
          }

          for (const team of teams) {
            const teamMatchdays = teamPlayersByMatchday.get(team.teamId)
            if (!teamMatchdays) continue

            // Obtener alineación de esta jornada (directa o heredada localmente)
            const players = teamMatchdays.get(md) || []
            if (players.length === 0) continue

            userMatchdaysFromTeamPlayers.get(userId)!.add(md)

            if (!userPointsByMatchday.get(userId)!.has(md)) {
              userPointsByMatchday.get(userId)!.set(md, 0)
            }

            const startersList: any[] = []
            const subsList: any[] = []

            for (const tp of players) {
              const points = playerPointsByMatchday.get(tp.player_id)?.get(md) ?? 0
              const pInfo = playersInfoMap.get(tp.player_id)
              const teamNameStr = pInfo?.team_id ? realTeamNames.get(pInfo.team_id) : 'equipo'

              const playerObj = {
                id: tp.player_id,
                puntos: points,
                position: pInfo?.position || '',
                team_id: pInfo?.team_id,
                valor: pInfo?.precio ?? 0,
                team: { name: teamNameStr },
                is_starter: tp.is_starter,
              }

              if (tp.is_starter) {
                startersList.push(playerObj)
              } else {
                subsList.push(playerObj)
              }
            }

            // Guardar en estados para la próxima jornada
            currentStartersByTeam.set(team.teamId, startersList.map(s => s.id))
            currentSquadByTeam.set(team.teamId, players.map(p => p.player_id))

            // Aplicar sanciones
            const prevMine = new Set<string>(prevSquadByTeam.get(team.teamId) || [])

            // Excluir a este equipo de la lista de otros poseedores en el mapa de exclusividad
            const teamHeldByOthersPrev = new Map<string, string[]>()
            for (const [pid, owners] of heldByOthersPrev.entries()) {
              const otherOwners = owners.filter(name => name !== teamIdToUserName.get(team.teamId))
              if (otherOwners.length > 0) {
                teamHeldByOthersPrev.set(pid, otherOwners)
              }
            }

            const isMatchdayFinished = true; // Clasificacion is for past matchdays
            const sanctionResult = applySanctionsToTeam(startersList, prevMine, teamHeldByOthersPrev, leagueConfig, !isMatchdayFinished)

            // Poner a 0 los puntos de los sancionados
            startersList.forEach(s => {
              if (sanctionResult.zeroedPlayers.has(s.id)) {
                s.puntos = 0
              }
            })

            // Registrar si hubo sanción en esta jornada
            if (sanctionResult.zeroedPlayers.size > 0) {
              userSanctionedMatchdays.get(userId)!.add(md)
            }

            // Calcular diferencia de puntos por cambios
            const prevIds = prevStartersByTeam.get(team.teamId) || []
            const currentStarterIds = startersList.map(s => s.id)

            if (prevIds.length > 0) {
              const inIds = currentStarterIds.filter(id => !prevIds.includes(id))
              const outIds = prevIds.filter(id => !currentStarterIds.includes(id))

              const numChanges = Math.min(inIds.length, outIds.length)

              if (numChanges > 0) {
                let inPoints = 0
                for (let i = 0; i < numChanges; i++) {
                  const inId = inIds[i]
                  const starterObj = startersList.find(s => s.id === inId)
                  inPoints += starterObj ? (starterObj.puntos ?? 0) : 0
                }

                let outPoints = 0
                for (let i = 0; i < numChanges; i++) {
                  const outId = outIds[i]
                  outPoints += playerPointsByMatchday.get(outId)?.get(md) ?? 0
                }

                const diff = inPoints - outPoints
                if (md > 1) {
                  userChangesPointsDiff.set(userId, (userChangesPointsDiff.get(userId) || 0) + diff)
                  userChangesCount.set(userId, (userChangesCount.get(userId) || 0) + numChanges)
                }
              }
            }

            // Sumar puntos
            const mdPoints = startersList.reduce((sum, s) => sum + s.puntos, 0)
            const current = userPointsByMatchday.get(userId)!.get(md)!
            userPointsByMatchday.get(userId)!.set(md, current + mdPoints)
          }
        }

        prevStartersByTeam = currentStartersByTeam
        prevSquadByTeam = currentSquadByTeam
      }

      // Restar las SANCIONES (tabla penalties) para mostrar puntos NETOS por jornada.
      const { data: penaltiesData } = await supabase
        .from('penalties')
        .select('user_id, matchday, points, description')

      const isLineupSanction = (desc: string): boolean => {
        const d = (desc || '').toLowerCase()
        return (
          d.startsWith('jugador de') ||
          d.startsWith('exclusividad') ||
          d.startsWith('más de') ||
          d.startsWith('exceso jugadores') ||
          d.startsWith('presupuesto') ||
          d.startsWith('táctica') ||
          d.startsWith('tactica')
        )
      }

      for (const pen of penaltiesData || []) {
        const uid = pen.user_id as string | null
        const md = typeof pen.matchday === 'string' ? parseInt(pen.matchday, 10) : (pen.matchday as number)
        const pts = typeof pen.points === 'string' ? parseFloat(pen.points) : (pen.points as number)
        if (!uid || !md || md <= 0) continue

        // Registrar la jornada sancionada en la base de datos para este usuario
        if (!userSanctionedMatchdays.has(uid)) {
          userSanctionedMatchdays.set(uid, new Set())
        }
        userSanctionedMatchdays.get(uid)!.add(md)

        // Si es una sanción de alineación, la ignoramos porque ya la hemos calculado y restado en JS
        if (isLineupSanction(pen.description || '')) continue

        const userMap = userPointsByMatchday.get(uid)
        if (!userMap || !userMap.has(md)) continue
        userMap.set(md, (userMap.get(md) || 0) - (pts || 0))
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



      // Calculate kamikaze stats per user
      const userKamikazeMinutes = new Map<string, number[]>()
      for (const [userId, teams] of userTeamsMap.entries()) {
          const minutesBeforeArr: number[] = []
          for (const team of teams) {
              const latestChanges = teamMatchdayLatestChange.get(team.teamId)
              if (latestChanges) {
                  for (const [md, latestCreated] of latestChanges.entries()) {
                      const deadline = matchdayToDeadline.get(md)
                      if (deadline) {
                          const diffMs = deadline.getTime() - latestCreated.getTime()
                          const diffMins = Math.max(0, diffMs / (1000 * 60))
                          minutesBeforeArr.push(diffMins)
                      }
                  }
              }
          }
          userKamikazeMinutes.set(userId, minutesBeforeArr)
      }

      const standingsData: UserStanding[] = userIds.map((userId) => {
        const user = usersMap.get(userId)
        const pointsMap = userPointsByMatchday.get(userId) || new Map()
        // Jornadas reales que aparecen en team_players para este usuario
        const teamPlayerMatchdays = userMatchdaysFromTeamPlayers.get(userId) || new Set<number>()

        let totalPoints = 0
        for (const [md, pts] of pointsMap.entries()) {
          if (md > 0) {
            totalPoints += pts
          }
        }
        // Promedio = puntos totales / nº de jornadas distintas en team_players
        const matchesPlayed = teamPlayerMatchdays.size
        const averagePoints = matchesPlayed > 0 ? Math.round((totalPoints / matchesPlayed) * 10) / 10 : 0

        // Ordenar jornadas de team_players de más reciente a más antigua
        const sortedMatchdays = Array.from(teamPlayerMatchdays)
          .sort((a, b) => b - a)

        // Últimas 3 jornadas: promedio de puntos solo en las últimas 3 jornadas de team_players
        const last3Matchdays = sortedMatchdays.slice(0, 3)
        const last3Points = last3Matchdays.reduce((sum, md) => sum + (pointsMap.get(md) || 0), 0)
        const last3Avg = last3Matchdays.length > 0 ? Math.round((last3Points / last3Matchdays.length) * 10) / 10 : 0

        // Tendencia: calcular pendiente (slope) sobre las últimas 5 jornadas de team_players
        const last5Matchdays = sortedMatchdays.slice(0, 5).reverse() // ordenar de antigua a reciente
        let last5Trend: 'up' | 'down' | 'stable' = 'stable'
        if (last5Matchdays.length >= 2) {
          // Regresión lineal simple: y = puntos, x = posición (0,1,2,...)
          const n = last5Matchdays.length
          const points5 = last5Matchdays.map(md => pointsMap.get(md) || 0)
          const sumX = (n * (n - 1)) / 2
          const sumY = points5.reduce((a, b) => a + b, 0)
          const sumXY = points5.reduce((acc, y, i) => acc + i * y, 0)
          const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6
          const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
          
          // Umbral: si la pendiente es significativa (>2 pts por jornada)
          if (slope > 2) last5Trend = 'up'
          else if (slope < -2) last5Trend = 'down'
        }

        const totalChanges = userChangesCount.get(userId) || 0
        const changeImpactPoints = userChangesPointsDiff.get(userId) || 0
        const sanctionedMatchdays = userSanctionedMatchdays.get(userId)?.size ?? 0

        // Calcular la mejor puntuación en una jornada
        let bestMatchdayPoints = 0
        let bestMatchday = 0
        for (const [md, pts] of pointsMap.entries()) {
          if (pts > bestMatchdayPoints) {
            bestMatchdayPoints = pts
            bestMatchday = md
          }
        }

        let minMinutes = Infinity;
        const userMins = userKamikazeMinutes.get(userId) || [];
        for (const m of userMins) {
            if (m < minMinutes) minMinutes = m;
        }

        return {
          user_id: userId,
          user_name: user?.full_name || user?.email?.split('@')[0] || 'Usuario',
          total_points: totalPoints,
          average_points: averagePoints,
          matches_played: matchesPlayed,
          last_3_jornadas_avg: last3Avg,
          last_5_trend: last5Trend,
          best_change_score: 0,
          total_changes: totalChanges,
          successful_changes: 0,
          change_impact_points: changeImpactPoints,
          podium_finishes: podiumCount.get(userId) || 0,
          bottom_finishes: bottomCount.get(userId) || 0,
          current_position: 0,
          previous_position: 0,
          position_change: 0,
          teams_count: userTeamsMap.get(userId)?.length || 0,
          best_matchday_points: bestMatchdayPoints,
          best_matchday: bestMatchday,
          sanctioned_matchdays: sanctionedMatchdays,
          kamikaze_score: minMinutes === Infinity ? 999999 : minMinutes,
          app_opens: 0, // se llenará luego
        }
      })

      // Fetch user_sessions
      const { data: sessionsData } = await supabase
        .from('user_sessions')
        .select('user_id')
      
      const sessionCounts = new Map<string, number>()
      if (sessionsData) {
        for (const s of sessionsData) {
          sessionCounts.set(s.user_id, (sessionCounts.get(s.user_id) || 0) + 1)
        }
      }

      standingsData.forEach(standing => {
        standing.app_opens = sessionCounts.get(standing.user_id) || 0
      })

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
  }, [sortField, sortOrder, tick])

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

    // Determinar la jornada a mostrar: en marcha o última jugada
    let targetMatchday = lastPlayedMatchday

    // Verificar si hay partidos en marcha
    const { data: fixturesInProgress } = await supabase
      .from('fixtures')
      .select('matchday')
      .eq('status', 'in_progress')
      .limit(1)
      .maybeSingle()

    if (fixturesInProgress?.matchday) {
      targetMatchday = fixturesInProgress.matchday
    }

    // Obtener los equipos del usuario
    const { data: userTeamsData } = await supabase
      .from('user_teams')
      .select('id, user_id, name')
      .eq('user_id', userId)

    if (!userTeamsData || userTeamsData.length === 0) return

    const teamId = userTeamsData[0].id
    const teamName = userTeamsData[0].name

    // Obtener jugadores del equipo en la jornada seleccionada o anterior disponible
    let { data: teamPlayersData } = await supabase
      .from('team_players')
      .select('player_id, is_starter, is_captain, matchday')
      .eq('team_id', teamId)
      .lte('matchday', targetMatchday)
      .order('matchday', { ascending: false })

    if (teamPlayersData && teamPlayersData.length > 0) {
      const maxMd = teamPlayersData[0].matchday
      teamPlayersData = teamPlayersData.filter(tp => tp.matchday === maxMd)
    }

    if (!teamPlayersData || teamPlayersData.length === 0) {
      setUserTeamData(prev => ({ ...prev, [userId]: null }))
      return
    }

    const playerIds = teamPlayersData.map(tp => tp.player_id)
    const actualMatchday = teamPlayersData[0].matchday

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
      .select('player_id, total_points')
      .eq('matchday', actualMatchday)
      .in('player_id', playerIds)

    if (scoresByMatchday && scoresByMatchday.length > 0) {
      scores = scoresByMatchday
    } else if (fixtureIds.length > 0) {
      const { data: scoresByFixture } = await supabase
        .from('player_scores')
        .select('player_id, total_points')
        .in('fixture_id', fixtureIds)
        .in('player_id', playerIds)
      scores = scoresByFixture
    }

    const playerPointsMap = new Map<string, number>()
    scores?.forEach(s => {
      playerPointsMap.set(s.player_id, (playerPointsMap.get(s.player_id) || 0) + (s.total_points || 0))
    })

    // Cargar team_players de la jornada anterior de todos los equipos
    const prevMatchday = actualMatchday - 1
    const prevStartersByTeam = new Map<string, string[]>()
    const prevSquadByTeam = new Map<string, string[]>()
    const heldByOthersPrev = new Map<string, string[]>()

    if (prevMatchday >= 1) {
      // Obtener perfiles de usuario para los nombres
      const { data: allProfiles } = await supabase.from('profiles').select('id, full_name, email')
      const profileMap = new Map(allProfiles?.map(p => [p.id, p]) || [])

      const { data: allTeams } = await supabase.from('user_teams').select('id, user_id')
      const teamMap = new Map(allTeams?.map(t => [t.id, t]) || [])

      const { data: prevStarters } = await supabase
        .from('team_players')
        .select('team_id, player_id, matchday, is_starter')
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
      }
    })

    const isMatchdayFinished = fixturesForMatchday ? fixturesForMatchday.every((f: any) => f.status === 'finished') : true;
    const prevMine = new Set<string>(prevMatchday >= 1 ? (prevSquadByTeam.get(teamId) || []) : [])
    const starters = jugadores.filter(j => j.is_starter)
    const sanctionResult = applySanctionsToTeam(starters, prevMine, heldByOthersPrev, config, !isMatchdayFinished)

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
    if (position === 1) return <Medal className="w-5 h-5 text-yellow-500" />
    if (position === 2) return <Medal className="w-5 h-5 text-slate-400" />
    if (position === 3) return <Medal className="w-5 h-5 text-amber-600" />
    if (isLast) return <span className="text-4xl leading-none">🐖</span>
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

  const topEvolution = [...standings].filter(u => u.last_3_jornadas_avg > 0).sort((a, b) => b.last_3_jornadas_avg - a.last_3_jornadas_avg).slice(0, 3)
  const topChanges = [...standings].filter(u => u.change_impact_points !== 0).sort((a, b) => b.change_impact_points - a.change_impact_points).slice(0, 3)
  const topTotalChanges = [...standings].filter(u => u.total_changes > 0).sort((a, b) => b.total_changes - a.total_changes).slice(0, 3)
  const kamikazes = [...standings].filter(s => (s.kamikaze_score ?? 999999) < 999999)
  kamikazes.sort((a, b) => (a.kamikaze_score || 0) - (b.kamikaze_score || 0))
  const topKamikaze = kamikazes.slice(0, 3)
  const topOpens = [...standings].filter(u => (u.app_opens || 0) > 0).sort((a, b) => (b.app_opens || 0) - (a.app_opens || 0)).slice(0, 3)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
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


      {/* Tabla de clasificación */}
      <Card className="!bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full">
            <table className="min-w-max w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-xs font-semibold text-slate-300 px-1 py-1.5 whitespace-nowrap">Pos</th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-1 py-1.5 whitespace-nowrap">Jugador</th>
                  <th
                    className="text-right text-xs font-semibold text-slate-300 px-1 py-1.5 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('total_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Pts Totales
                      <SortIcon field="total_points" />
                    </div>
                  </th>
                  <th
                    className="text-right text-xs font-semibold text-slate-300 px-1 py-1.5 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('average_points')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Promedio
                      <SortIcon field="average_points" />
                    </div>
                  </th>
                  <th
                    className="text-right text-xs font-semibold text-slate-300 px-1 py-1.5 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('last_3_jornadas_avg')}
                    title="Promedio de las últimas 3 jornadas"
                  >
                    <div className="flex items-center justify-end gap-1">
                      Últ. 3
                      <SortIcon field="last_3_jornadas_avg" />
                    </div>
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-300 px-1 py-1.5 whitespace-nowrap" title="Tendencia en las últimas 5 jornadas">Tendencia</th>
                  <th
                    className="text-center text-xs font-semibold text-slate-300 px-1 py-1.5 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('sanctioned_matchdays')}
                    title="Jornadas con alguna sanción"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Sanciones
                      <SortIcon field="sanctioned_matchdays" />
                    </div>
                  </th>
                  <th
                    className="text-right text-xs font-semibold text-slate-300 px-1 py-1.5 whitespace-nowrap cursor-pointer hover:bg-slate-700"
                    onClick={() => handleSort('change_impact_points')}
                    title="Puntos netos ganados o perdidos por cambios"
                  >
                    <div className="flex items-center justify-end gap-1">
                      Cambios
                      <SortIcon field="change_impact_points" />
                    </div>
                  </th>
                  <th
                    className="text-center text-xs font-semibold text-slate-300 px-1 py-1.5 whitespace-nowrap cursor-pointer hover:bg-slate-700"
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
                    className="text-center text-xs font-semibold text-slate-300 px-1 py-1.5 whitespace-nowrap cursor-pointer hover:bg-slate-700"
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
                  <Fragment key={standing.user_id}>
                  <tr
                    className={`border-b border-slate-700 transition-colors ${
                      isCurrentUser ? 'bg-emerald-900/30 animate-pulse' :
                      isExpanded ? 'bg-slate-600' : 'hover:bg-slate-700/50'
                    } cursor-pointer`}
                    onClick={() => handleUserClick(standing.user_id)}
                  >
                    <td className="px-1 py-1.5">
                      {getPositionMedal(standing.current_position, isLast)}
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="min-w-0">
                        <p className="font-semibold text-white text-xs whitespace-nowrap uppercase">{standing.user_name}</p>
                        {standing.best_matchday_points > 0 && (
                          <p className="text-xs text-amber-400 font-medium whitespace-nowrap">
                            Mejor: {Math.round(standing.best_matchday_points * 10) / 10} pts (J{standing.best_matchday})
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-right whitespace-nowrap">
                      <span className="text-base font-bold text-emerald-400">
                        {Math.round(standing.total_points * 10) / 10}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">pts</span>
                    </td>
                    <td className="px-1 py-1.5 text-right whitespace-nowrap">
                      <span className="text-sm font-semibold text-slate-200">
                        {standing.average_points}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">pts/j</span>
                    </td>
                    <td className="px-1 py-1.5 text-right whitespace-nowrap">
                      <span className="text-sm font-semibold text-blue-400">
                        {Math.round(standing.last_3_jornadas_avg * 10) / 10}
                      </span>
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="flex justify-center">
                        {getTrendIcon(standing.last_5_trend)}
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center whitespace-nowrap">
                      <span className={`text-sm font-bold ${
                        standing.sanctioned_matchdays > 0 ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {standing.sanctioned_matchdays}
                      </span>
                    </td>
                    <td className="px-1 py-1.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <span className={`text-sm font-bold ${
                          standing.change_impact_points > 0 ? 'text-emerald-400' :
                          standing.change_impact_points < 0 ? 'text-red-400' : 'text-slate-400'
                        }`}>
                          {standing.change_impact_points > 0 ? `+${Math.round(standing.change_impact_points * 10) / 10}` : Math.round(standing.change_impact_points * 10) / 10} pts
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 whitespace-nowrap">
                        {standing.total_changes} cambios
                      </p>
                    </td>
                    <td className="px-1 py-1.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />
                        <span className="text-sm font-bold text-yellow-400">
                          {standing.podium_finishes}
                        </span>
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center whitespace-nowrap">
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
                        <div ref={(el) => { teamRefs.current[standing.user_id] = el; }} className="bg-slate-700/50 px-3 py-2.5">
                          {/* Cabecera equipo — ancho máximo para no estirarse con la tabla */}
                          <div className="max-w-xs flex items-center gap-2 mb-2 flex-wrap">
                            <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-sm font-bold text-white truncate">
                              {userTeamData[standing.user_id]?.teamName}
                            </span>
                            <Badge className="bg-emerald-600 text-white text-xs shrink-0">
                              {Math.round((userTeamData[standing.user_id]?.totalPoints || 0) * 10) / 10} pts · J{userTeamData[standing.user_id]?.matchday}
                            </Badge>
                            {userTeamData[standing.user_id]?.penalties > 0 && (
                              <Badge className="bg-red-600 text-white text-xs shrink-0">
                                -{Math.round((userTeamData[standing.user_id]?.penalties || 0) * 10) / 10} pts multa
                              </Badge>
                            )}
                          </div>

                          {/* Lista de jugadores: grid de 3 columnas con ancho máximo fijo
                              col1=foto(24px) col2=nombre(crece) col3=puntos(56px fijos)
                              max-w-xs garantiza que la columna de puntos siempre sea visible en móvil */}
                          <div className="max-w-xs space-y-0.5">
                            {userTeamData[standing.user_id]?.jugadores.map((player: any) => (
                              <div
                                key={player.id}
                                className={`grid items-center gap-x-2 py-1 px-1.5 rounded ${
                                  player.sanctionReason
                                    ? 'bg-red-950/50 border border-red-800'
                                    : 'bg-slate-700/60'
                                }`}
                                style={{ gridTemplateColumns: '1.5rem 1fr 3.5rem' }}
                              >
                                {/* col 1: foto */}
                                {player.photo ? (
                                  <img src={player.photo} alt={player.short_name} className="w-6 h-6 rounded-full object-cover border border-slate-500" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-[9px] font-bold text-slate-300">
                                    {player.shirt_number || '?'}
                                  </div>
                                )}

                                {/* col 2: nombre + posición + equipo */}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className={`text-xs font-semibold truncate ${player.sanctionReason ? 'text-red-200' : 'text-white'}`}>
                                      {player.short_name}
                                    </span>
                                    <Badge className={`text-[9px] px-1 py-0 leading-tight shrink-0 ${getPositionColor(player.position)}`}>
                                      {getPositionLabel(player.position)}
                                    </Badge>
                                    {player.is_captain && (
                                      <Badge className="text-[9px] px-1 py-0 leading-tight shrink-0 bg-yellow-500 text-white">C</Badge>
                                    )}
                                    {player.sanctionReason && (
                                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {player.team?.logo_url && (
                                      <img src={player.team.logo_url} alt={player.team.name} className="w-3 h-3 object-contain shrink-0" />
                                    )}
                                    <span className="text-[10px] text-slate-400 truncate">{player.team?.name}</span>
                                  </div>
                                </div>

                                {/* col 3: puntos en amarillo — columna fija de 3.5rem */}
                                <div className="text-right">
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
                            <div className="max-w-xs mt-2 pt-2 border-t border-slate-700">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Suplentes</p>
                              <div className="space-y-0.5">
                                {userTeamData[standing.user_id]?.suplentes.map((player: any) => (
                                  <div
                                    key={player.id}
                                    className="grid items-center gap-x-2 py-0.5 px-1.5 rounded bg-slate-800/40"
                                    style={{ gridTemplateColumns: '1.5rem 1fr 3.5rem' }}
                                  >
                                    {player.photo ? (
                                      <img src={player.photo} alt={player.short_name} className="w-5 h-5 rounded-full object-cover border border-slate-600 opacity-70" />
                                    ) : (
                                      <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-500">
                                        {player.shirt_number || '?'}
                                      </div>
                                    )}
                                    <div className="min-w-0 flex items-center gap-1">
                                      <span className="text-[11px] font-medium text-slate-400 truncate">{player.short_name}</span>
                                      <Badge className={`text-[9px] px-1 py-0 leading-tight shrink-0 opacity-70 ${getPositionColor(player.position)}`}>
                                        {getPositionLabel(player.position)}
                                      </Badge>
                                    </div>
                                    <div className="text-right">
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
      {(topEvolution.length > 0 || topChanges.length > 0 || topTotalChanges.length > 0 || topKamikaze.length > 0 || topOpens.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topEvolution.length > 0 && (
            <Card className="!bg-emerald-50 border-emerald-200">
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
          )}

          {topChanges.length > 0 && (
            <Card className="!bg-blue-50 border-blue-200">
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
          )}

          {topTotalChanges.length > 0 && (
            <Card className="!bg-purple-50 border-purple-200">
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
          )}

          {topKamikaze.length > 0 && (
            <Card className="!bg-rose-50 border-rose-200">
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
          )}

          {topOpens.length > 0 && (
            <Card className="!bg-indigo-50 border-indigo-200">
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
