import { applySanctionsToTeam } from '@/lib/infractions'
import {
  DivisionId,
  DivisionMembership,
  DivisionTeam,
  divisionsToCompute,
  loadDivisionMembership,
  userDisplayName,
} from '@/lib/divisions'
import { computeOutOfOrderLocks, type FixtureLite } from '@/lib/locked-teams-core'

export interface UserStanding {
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
  last_place_finishes: number
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

export interface StandingsResult {
  standings: UserStanding[]
  lastPlayedMatchday: number
  /**
   * `true` si alguna de las páginas de `team_players` o `player_scores` falló.
   * Con los datos a medias saldrían puntuaciones más bajas que las reales, así
   * que quien pinte la tabla debe conservar la anterior en lugar de mostrar
   * esto.
   */
  incomplete: boolean
}

interface LeagueConfig {
  budget_limit: number
  max_players_per_team: number
  formations: string[]
  max_changes_per_matchday: number
  fantasy_starting_matchday: number
  matchday_start_hours_before: number
  starting_balance: number
  div1_win_percent?: number
  div1_lose_percent?: number
  div2_win_percent?: number
  div2_lose_percent?: number
  div3_win_percent?: number
  div3_lose_percent?: number
  infraction_penalty_cost?: number
  pay_winner?: number
  pay_loser?: number
  pay_rest?: number
}

interface TeamPlayerRow {
  team_id: string
  player_id: string
  is_starter: boolean
  is_captain: boolean
  matchday: number
  created_at?: string
  position?: string | null
}

/** Todo lo que NO depende de la división y por tanto se carga una sola vez. */
interface SharedData {
  incomplete: boolean
  config: LeagueConfig
  fantasyStart: number
  playersInfoMap: Map<string, any>
  realTeamNames: Map<string, string>
  playerPointsByMatchday: Map<string, Map<number, number>>
  teamPlayersByMatchday: Map<string, Map<number, TeamPlayerRow[]>>
  teamMatchdayLatestChange: Map<string, Map<number, Date>>
  matchdayToDeadline: Map<number, Date>
  sortedPlayedMatchdays: number[]
  maxPlayed: number
  penalties: { user_id: string | null; matchday: any; points: any; description: string | null }[]
  sessionCounts: Map<string, number>
  financeByUser: Map<string, { amount_paid: number; infraction_penalties: number }>
  lastPlaceCount: Map<string, number>
  allScores: {
    player_id: string
    total_points: number
    fixture_id?: string
    matchday?: number
    minutes_played?: number
  }[]
  fixtureToMatchday: Map<string, number>
  restrictedMatchdayTeams: Map<number, Set<string>>
}

async function fetchPaginated<T>(
  supabase: any,
  table: string,
  select: string
): Promise<{ rows: T[]; incomplete: boolean }> {
  const rows: T[] = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data: page, error } = await supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      console.error(`[STANDINGS] Error cargando ${table}:`, error)
      return { rows, incomplete: true }
    }
    if (!page || page.length === 0) break
    rows.push(...(page as T[]))
    if (page.length < pageSize) break
    from += pageSize
  }
  return { rows, incomplete: false }
}

async function loadSharedData(supabase: any): Promise<SharedData> {
  const { data: configData } = await supabase.from('league_config').select('*').eq('id', 1).maybeSingle()
  const config: LeagueConfig = {
    budget_limit: configData?.budget_limit ?? 275,
    max_players_per_team: configData?.max_players_per_team ?? 4,
    formations: configData?.formations ?? ['3-5-2', '3-4-3', '4-4-2', '4-3-3', '4-5-1', '5-4-1', '5-3-2'],
    max_changes_per_matchday: configData?.max_changes_per_matchday ?? 3,
    // Nunca por debajo de 1: una jornada 0 o negativa dejaría pasar los
    // registros sin jornada asignada.
    fantasy_starting_matchday: Math.max(1, configData?.fantasy_starting_matchday ?? 1),
    matchday_start_hours_before: configData?.matchday_start_hours_before ?? 1,
    starting_balance: configData?.starting_balance ?? 40,
    div1_win_percent: configData?.div1_win_percent ?? 3,
    div1_lose_percent: configData?.div1_lose_percent ?? 3,
    div2_win_percent: configData?.div2_win_percent ?? 3,
    div2_lose_percent: configData?.div2_lose_percent ?? 3,
    div3_win_percent: configData?.div3_win_percent ?? 3,
    div3_lose_percent: configData?.div3_lose_percent ?? 3,
    infraction_penalty_cost: configData?.infraction_penalty_cost ?? 3,
    pay_winner: configData?.pay_winner ?? 0,
    pay_loser: configData?.pay_loser ?? 2,
    pay_rest: configData?.pay_rest ?? 1,
  }
  const fantasyStart = config.fantasy_starting_matchday

  const empty = (): SharedData => ({
    incomplete: true,
    config,
    fantasyStart,
    playersInfoMap: new Map(),
    realTeamNames: new Map(),
    playerPointsByMatchday: new Map(),
    teamPlayersByMatchday: new Map(),
    teamMatchdayLatestChange: new Map(),
    matchdayToDeadline: new Map(),
    sortedPlayedMatchdays: [],
    maxPlayed: 1,
    penalties: [],
    sessionCounts: new Map(),
    financeByUser: new Map(),
    lastPlaceCount: new Map(),
    allScores: [],
    fixtureToMatchday: new Map(),
    restrictedMatchdayTeams: new Map(),
  })

  const { rows: teamPlayers, incomplete: tpIncomplete } = await fetchPaginated<TeamPlayerRow>(
    supabase,
    'team_players',
    'team_id, player_id, is_starter, is_captain, matchday, created_at, position'
  )
  if (tpIncomplete) return empty()
  if (teamPlayers.length === 0) return { ...empty(), incomplete: false }

  const playerIds = [...new Set(teamPlayers.map(tp => tp.player_id))]
  const playerIdSet = new Set(playerIds)

  const [{ data: playersData }, { data: realTeams }, { data: fixturesData }] = await Promise.all([
    supabase.from('players').select('id, position, team_id, precio, short_name, first_name').in('id', playerIds),
    supabase.from('real_teams').select('id, name'),
    supabase.from('fixtures').select('id, matchday, status, start_time, home_team_id, away_team_id'),
  ])

  const playersInfoMap = new Map<string, any>(playersData?.map((p: any) => [p.id, p]) || [])
  const realTeamNames = new Map<string, string>(realTeams?.map((rt: any) => [rt.id, rt.name]) || [])

  const fixtureToMatchday = new Map<string, number>()
  const matchdayToDeadline = new Map<number, Date>()
  fixturesData?.forEach((f: any) => {
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

  // Jornadas con un partido adelantado (fuera de orden cronológico) cuyo resto
  // de partidos todavía no se ha jugado: mientras dure, esa jornada solo cuenta
  // para los jugadores de los dos equipos que disputaron el adelantado, porque
  // es lo único que realmente se ha jugado de ella. Se levanta sola en cuanto
  // el resto de partidos de esa jornada terminan.
  const restrictedMatchdayTeams = new Map<number, Set<string>>()
  {
    const offsets = {
      startHoursBeforeMidweek: configData?.matchday_start_hours_before_midweek ?? config.matchday_start_hours_before ?? 1,
      startHoursBeforeWeekend: configData?.matchday_start_hours_before_weekend ?? config.matchday_start_hours_before ?? 1,
      endHoursAfter: configData?.matchday_end_hours_after ?? 2,
    }
    const MATCH_DURATION_MS = 2.5 * 60 * 60 * 1000
    const advancedLocks = computeOutOfOrderLocks((fixturesData || []) as FixtureLite[], offsets, fantasyStart)
      .filter(l => l.type === 'advanced')
    const byMatchday = new Map<number, typeof advancedLocks>()
    advancedLocks.forEach(l => {
      if (!byMatchday.has(l.ownMatchday)) byMatchday.set(l.ownMatchday, [])
      byMatchday.get(l.ownMatchday)!.push(l)
    })
    for (const [md, locks] of byMatchday) {
      const mdFixtures = (fixturesData || []).filter((f: any) => f.matchday === md)
      const allPlayed = mdFixtures.every((f: any) => {
        const status = (f.status || '').toLowerCase()
        if (status === 'finished') return true
        const startTime = f.start_time ? new Date(f.start_time).getTime() : 0
        return startTime > 0 && startTime + MATCH_DURATION_MS < Date.now()
      })
      if (allPlayed) continue
      const teamIds = new Set<string>()
      locks.forEach(l => l.teamIds.forEach(id => teamIds.add(id)))
      restrictedMatchdayTeams.set(md, teamIds)
    }
  }

  const { rows: allScores, incomplete: scoresIncomplete } = await fetchPaginated<{
    player_id: string
    total_points: number
    fixture_id?: string
    matchday?: number
    minutes_played?: number
  }>(supabase, 'player_scores', 'player_id, total_points, fixture_id, matchday, minutes_played')
  if (scoresIncomplete) return empty()

  const playerPointsByMatchday = new Map<string, Map<number, number>>()
  for (const score of allScores) {
    if (!playerIdSet.has(score.player_id)) continue

    let md: number | undefined = score.matchday && score.matchday > 0 ? score.matchday : undefined
    if (!md && score.fixture_id) md = fixtureToMatchday.get(score.fixture_id)

    // Las jornadas anteriores al arranque del juego no suman para nadie.
    if (!md || md < fantasyStart) continue

    // Jornada con partido adelantado sin terminar: solo cuentan los jugadores
    // de los dos equipos que ya jugaron ese partido.
    const restrictedTeamIds = restrictedMatchdayTeams.get(md)
    if (restrictedTeamIds) {
      const playerTeamId = playersInfoMap.get(score.player_id)?.team_id
      if (!playerTeamId || !restrictedTeamIds.has(playerTeamId)) continue
    }

    if (!playerPointsByMatchday.has(score.player_id)) {
      playerPointsByMatchday.set(score.player_id, new Map())
    }
    const current = playerPointsByMatchday.get(score.player_id)!.get(md) || 0
    playerPointsByMatchday.get(score.player_id)!.set(md, current + (score.total_points || 0))
  }

  const teamPlayersByMatchday = new Map<string, Map<number, TeamPlayerRow[]>>()
  const teamMatchdayLatestChange = new Map<string, Map<number, Date>>()

  for (const tp of teamPlayers) {
    const md = tp.matchday && tp.matchday > 0 ? tp.matchday : 0

    if (!teamPlayersByMatchday.has(tp.team_id)) teamPlayersByMatchday.set(tp.team_id, new Map())
    if (!teamPlayersByMatchday.get(tp.team_id)!.has(md)) teamPlayersByMatchday.get(tp.team_id)!.set(md, [])
    teamPlayersByMatchday.get(tp.team_id)!.get(md)!.push(tp)

    // Kamikaze tracking (solo desde la jornada en la que arranca el juego)
    if (tp.created_at && md >= fantasyStart) {
      const created = new Date(tp.created_at)
      const deadline = matchdayToDeadline.get(md)
      if (deadline && created < deadline) {
        if (!teamMatchdayLatestChange.has(tp.team_id)) teamMatchdayLatestChange.set(tp.team_id, new Map())
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
  const maxPlayed =
    sortedPlayedMatchdays.length > 0 ? sortedPlayedMatchdays[sortedPlayedMatchdays.length - 1] : 1

  // Auto-duplicar alineaciones para jornadas jugadas donde un equipo no tiene entradas.
  // Así los usuarios que no hicieron cambios tendrán sus 11 jugadores persistidos.
  for (const [teamId, matchdays] of teamPlayersByMatchday.entries()) {
    for (const playedMd of sortedPlayedMatchdays) {
      if (matchdays.has(playedMd)) continue // Ya tiene datos para esta jornada

      // Buscar la alineación más reciente anterior a esta jornada
      let activeMd = -1
      for (const savedMd of matchdays.keys()) {
        if (savedMd > 0 && savedMd <= playedMd && savedMd > activeMd) activeMd = savedMd
      }
      if (activeMd === -1) continue

      const prevPlayers = matchdays.get(activeMd) || []
      if (prevPlayers.length === 0) continue

      const rpcPlayers = prevPlayers.map((tp, i) => ({
        player_id: tp.player_id,
        is_starter: tp.is_starter,
        is_captain: tp.is_captain,
        order: i,
        replaced_player_id: null
      }))

      // Insertar en la base de datos (persistir la herencia usando la RPC con lock)
      supabase.rpc('save_team_lineup', {
        p_team_id: teamId,
        p_matchday: playedMd,
        p_players: rpcPlayers
      }).then(({ error }: any) => {
        if (error) {
          console.log(`[STANDINGS] Auto-herencia J${playedMd} equipo ${teamId}:`, error.message)
        }
      })

      // Actualizar el mapa local para que el cálculo de esta carga sea correcto
      matchdays.set(playedMd, prevPlayers.map(tp => ({ ...tp, matchday: playedMd })))
    }
  }

  const { data: penaltiesData } = await supabase
    .from('penalties')
    .select('user_id, matchday, points, description')

  // Sesiones (solo desde el bloqueo de la primera jornada jugable)
  const firstDeadline = matchdayToDeadline.get(Number(fantasyStart))
  const lockTime =
    firstDeadline && !isNaN(firstDeadline.getTime())
      ? new Date(firstDeadline.getTime() - config.matchday_start_hours_before * 60 * 60 * 1000)
      : // Fallback robusto para evitar contar todas las sesiones históricas si falla el deadline
        new Date('2026-08-14T00:00:00.000Z')

  const { data: sessionsData } = await supabase
    .from('user_sessions')
    .select('user_id')
    .gte('started_at', lockTime.toISOString())

  const sessionCounts = new Map<string, number>()
  for (const s of sessionsData ?? []) {
    sessionCounts.set(s.user_id, (sessionCounts.get(s.user_id) || 0) + 1)
  }

  const { data: financeRows } = await supabase
    .from('profiles')
    .select('id, amount_paid, infraction_penalties')

  const financeByUser = new Map<string, { amount_paid: number; infraction_penalties: number }>()
  for (const f of financeRows ?? []) {
    financeByUser.set(f.id, {
      amount_paid: Number(f.amount_paid) || 0,
      infraction_penalties: Number(f.infraction_penalties) || 0,
    })
  }

  return {
    incomplete: false,
    config,
    fantasyStart,
    playersInfoMap,
    realTeamNames,
    playerPointsByMatchday,
    teamPlayersByMatchday,
    teamMatchdayLatestChange,
    matchdayToDeadline,
    sortedPlayedMatchdays,
    maxPlayed,
    penalties: (penaltiesData ?? []) as SharedData['penalties'],
    sessionCounts,
    financeByUser,
    lastPlaceCount: new Map(),
    allScores,
    fixtureToMatchday,
    restrictedMatchdayTeams,
  }
}

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

/**
 * Clasificación de UNA división, calculada como si el resto de la liga no
 * existiera: la exclusividad, los podios y los últimos puestos solo miran a los
 * equipos que se pasan aquí.
 */
function computeDivisionStandings(
  division: DivisionId,
  teams: DivisionTeam[],
  membership: DivisionMembership,
  shared: SharedData,
  activeMatchday?: number | null
): UserStanding[] {
  if (teams.length === 0) return []

  const userTeamsMap = new Map<string, { teamId: string; teamName: string }[]>()
  for (const ut of teams) {
    if (!userTeamsMap.has(ut.user_id)) userTeamsMap.set(ut.user_id, [])
    userTeamsMap.get(ut.user_id)!.push({ teamId: ut.id, teamName: ut.name })
  }

  const userIds = Array.from(userTeamsMap.keys())
  const userIdSet = new Set(userIds)

  const teamIdToUserName = new Map<string, string>()
  for (const ut of teams) {
    teamIdToUserName.set(ut.id, userDisplayName(membership.profilesById.get(ut.user_id)))
  }

  const { fantasyStart, config, playersInfoMap, realTeamNames, playerPointsByMatchday } = shared

  const userPointsByMatchday = new Map<string, Map<number, number>>()
  const userChangesCount = new Map<string, number>()
  const userChangesPointsDiff = new Map<string, number>()
  const userSanctionCount = new Map<string, number>()
  const userMatchdaysFromTeamPlayers = new Map<string, Set<number>>()

  const mdHasDbPenalties = new Set(shared.penalties.map(p => {
    return typeof p.matchday === 'string' ? parseInt(p.matchday, 10) : (p.matchday as number)
  }))

  let prevStartersByTeam = new Map<string, string[]>()
  let prevSquadByTeam = new Map<string, string[]>()

  for (const md of shared.sortedPlayedMatchdays) {
    // Exclusividad: quién tenía a cada jugador en la jornada anterior. Solo se
    // construye con los equipos de ESTA división, así que un jugador alineado
    // por alguien de otra división nunca genera sanción aquí.
    const heldByOthersPrev = new Map<string, string[]>()
    for (const [otherTeamId, pids] of prevStartersByTeam.entries()) {
      const otherName = teamIdToUserName.get(otherTeamId) || 'otro usuario'
      for (const pid of pids) {
        if (!heldByOthersPrev.has(pid)) heldByOthersPrev.set(pid, [])
        heldByOthersPrev.get(pid)!.push(otherName)
      }
    }

    const currentStartersByTeam = new Map<string, string[]>()
    const currentSquadByTeam = new Map<string, string[]>()

    // Jornada con partido adelantado (o aplazado) sin terminar: solo se ha
    // jugado un partido suelto de ella, no la jornada completa. Las sanciones
    // (y la plantilla que cuenta como "anterior" para la exclusividad) solo
    // deben calcularse sobre una jornada resuelta del todo — si no, se estaría
    // sancionando o comparando plantillas de una jornada que técnicamente aún
    // no ha pasado para casi nadie. `restrictedMatchdayTeams` ya marca (con
    // sus claves) qué jornadas están en ese estado.
    const mdUnresolved = shared.restrictedMatchdayTeams.has(md)

    for (const [userId, userTeams] of userTeamsMap.entries()) {
      if (!userPointsByMatchday.has(userId)) userPointsByMatchday.set(userId, new Map())
      if (!userMatchdaysFromTeamPlayers.has(userId)) userMatchdaysFromTeamPlayers.set(userId, new Set())

      for (const team of userTeams) {
        if (mdUnresolved) continue

        const teamMatchdays = shared.teamPlayersByMatchday.get(team.teamId)
        if (!teamMatchdays) continue

        const players = teamMatchdays.get(md) || []
        if (players.length === 0) continue

        userMatchdaysFromTeamPlayers.get(userId)!.add(md)
        if (!userPointsByMatchday.get(userId)!.has(md)) userPointsByMatchday.get(userId)!.set(md, 0)

        const startersList: any[] = []

        for (const tp of players) {
          const points = playerPointsByMatchday.get(tp.player_id)?.get(md) ?? 0
          const pInfo = playersInfoMap.get(tp.player_id)
          const teamNameStr = pInfo?.team_id ? realTeamNames.get(pInfo.team_id) : 'equipo'

          const playerObj = {
            id: tp.player_id,
            puntos: points,
            position: tp.position || pInfo?.position || '',
            team_id: pInfo?.team_id,
            valor: pInfo?.precio ?? 0,
            team: { name: teamNameStr },
            is_starter: tp.is_starter,
          }

          if (tp.is_starter) startersList.push(playerObj)
        }

        currentStartersByTeam.set(team.teamId, startersList.map(s => s.id))
        currentSquadByTeam.set(team.teamId, players.map(p => p.player_id))

        const prevMine = new Set<string>(prevSquadByTeam.get(team.teamId) || [])

        // Un usuario no se sanciona a sí mismo por sus propios jugadores.
        const teamHeldByOthersPrev = new Map<string, string[]>()
        for (const [pid, owners] of heldByOthersPrev.entries()) {
          const otherOwners = owners.filter(name => name !== teamIdToUserName.get(team.teamId))
          if (otherOwners.length > 0) teamHeldByOthersPrev.set(pid, otherOwners)
        }

        const sanctionResult = applySanctionsToTeam(
          startersList,
          prevMine,
          teamHeldByOthersPrev,
          config,
          false, // Clasificacion is for past matchdays
          undefined,
          undefined,
          undefined,
          md === fantasyStart
        )

        startersList.forEach(s => {
          if (sanctionResult.zeroedPlayers.has(s.id)) s.puntos = 0
        })

        if (!mdHasDbPenalties.has(md) && sanctionResult.zeroedPlayers.size > 0) {
          const uniqueReasons = new Set(sanctionResult.zeroedPlayers.values())
          userSanctionCount.set(userId, (userSanctionCount.get(userId) || 0) + uniqueReasons.size)
        }

        const prevIds = prevStartersByTeam.get(team.teamId) || []
        const currentStarterIds = startersList.map(s => s.id)

        if (prevIds.length > 0) {
          const inIds = currentStarterIds.filter(id => !prevIds.includes(id))
          const outIds = prevIds.filter(id => !currentStarterIds.includes(id))
          const numChanges = Math.min(inIds.length, outIds.length)

          if (numChanges > 0) {
            let inPoints = 0
            for (let i = 0; i < numChanges; i++) {
              const starterObj = startersList.find(s => s.id === inIds[i])
              inPoints += starterObj ? (starterObj.puntos ?? 0) : 0
            }

            let outPoints = 0
            for (let i = 0; i < numChanges; i++) {
              outPoints += playerPointsByMatchday.get(outIds[i])?.get(md) ?? 0
            }

            if (md > fantasyStart) {
              userChangesPointsDiff.set(userId, (userChangesPointsDiff.get(userId) || 0) + (inPoints - outPoints))
              userChangesCount.set(userId, (userChangesCount.get(userId) || 0) + numChanges)
            }
          }
        }

        const mdPoints = startersList.reduce((sum, s) => sum + s.puntos, 0)
        userPointsByMatchday.get(userId)!.set(md, userPointsByMatchday.get(userId)!.get(md)! + mdPoints)
      }
    }

    // Si esta jornada no está resuelta del todo, nadie ha "jugado" todavía a
    // estos efectos: se conserva la plantilla anterior de todos los equipos,
    // para que la cadena de exclusividad no se rompa cuando la jornada se
    // complete de verdad.
    if (mdUnresolved) {
      for (const [teamId, starters] of prevStartersByTeam.entries()) {
        if (!currentStartersByTeam.has(teamId)) currentStartersByTeam.set(teamId, starters)
      }
      for (const [teamId, squad] of prevSquadByTeam.entries()) {
        if (!currentSquadByTeam.has(teamId)) currentSquadByTeam.set(teamId, squad)
      }
    }

    prevStartersByTeam = currentStartersByTeam
    prevSquadByTeam = currentSquadByTeam
  }

  // Restar las SANCIONES (tabla penalties) para mostrar puntos NETOS por jornada.
  for (const pen of shared.penalties) {
    const uid = pen.user_id
    const md = typeof pen.matchday === 'string' ? parseInt(pen.matchday, 10) : (pen.matchday as number)
    const pts = typeof pen.points === 'string' ? parseFloat(pen.points) : (pen.points as number)
    if (!uid || !userIdSet.has(uid) || !md || md < fantasyStart) continue

    // Incrementar el contador total de sanciones para este usuario
    userSanctionCount.set(uid, (userSanctionCount.get(uid) || 0) + 1)

    // Si es una sanción de alineación, la ignoramos porque ya la hemos calculado y restado en JS
    if (isLineupSanction(pen.description || '')) continue

    const userMap = userPointsByMatchday.get(uid)
    if (!userMap || !userMap.has(md)) continue
    userMap.set(md, (userMap.get(md) || 0) - (pts || 0))
  }

  // Podios y colistas: dentro de la división, nunca contra toda la liga.
  const podiumCount = new Map<string, number>()
  const bottomCount = new Map<string, number>()

  let winCount = 3
  let loseCount = 3
  if (division === 1) {
    winCount = config.div1_win_percent ?? 3
    loseCount = config.div1_lose_percent ?? 3
  } else if (division === 2) {
    winCount = config.div2_win_percent ?? 3
    loseCount = config.div2_lose_percent ?? 3
  } else if (division === 3) {
    winCount = config.div3_win_percent ?? 3
    loseCount = config.div3_lose_percent ?? 3
  }

  const participantsByMatchday = new Map<number, { userId: string; points: number }[]>()
  for (const [userId, pointsMap] of userPointsByMatchday.entries()) {
    for (const [md, pts] of pointsMap.entries()) {
      if (md < fantasyStart) continue
      if (!participantsByMatchday.has(md)) participantsByMatchday.set(md, [])
      participantsByMatchday.get(md)!.push({ userId, points: pts })
    }
  }

  for (const [, participants] of participantsByMatchday.entries()) {
    const maxPoints = participants.reduce((max, p) => Math.max(max, p.points), 0)
    if (maxPoints <= 0) continue

    const sorted = [...participants].sort((a, b) => b.points - a.points)
    
    // Contar ganadores (podios)
    const winners = sorted.slice(0, winCount)
    for (const p of winners) {
      podiumCount.set(p.userId, (podiumCount.get(p.userId) || 0) + 1)
    }

    // Contar colistas y bacona (último)
    if (sorted.length > winCount) {
      const losers = sorted.slice(winCount).slice(-loseCount)
      for (const p of losers) {
        bottomCount.set(p.userId, (bottomCount.get(p.userId) || 0) + 1)
      }
      const absoluteLast = sorted[sorted.length - 1]
      if (absoluteLast) {
        const lastPlaceCountMap = shared.lastPlaceCount || new Map<string, number>()
        lastPlaceCountMap.set(absoluteLast.userId, (lastPlaceCountMap.get(absoluteLast.userId) || 0) + 1)
        shared.lastPlaceCount = lastPlaceCountMap
      }
    }
  }

  const userKamikazeMinutes = new Map<string, number[]>()
  for (const [userId, userTeams] of userTeamsMap.entries()) {
    const minutesBeforeArr: number[] = []
    for (const team of userTeams) {
      const latestChanges = shared.teamMatchdayLatestChange.get(team.teamId)
      if (!latestChanges) continue
      for (const [md, latestCreated] of latestChanges.entries()) {
        const deadline = shared.matchdayToDeadline.get(md)
        if (deadline) {
          const diffMins = Math.max(0, (deadline.getTime() - latestCreated.getTime()) / (1000 * 60))
          minutesBeforeArr.push(diffMins)
        }
      }
    }
    userKamikazeMinutes.set(userId, minutesBeforeArr)
  }

  // Calcular pagos por jornada dinámicamente para evitar desfases de la base de datos
  const userMatchdayPaymentsTotal = new Map<string, number>()
  const payWinner = config.pay_winner ?? 0
  const payLoser = config.pay_loser ?? 2
  const payRest = config.pay_rest ?? 1

  // Indexar puntuaciones de la jornada activa para búsquedas O(1)
  const activeScoresByPlayer = new Map<string, { total_points: number, minutes_played: number }>()
  if (activeMatchday) {
    for (const s of shared.allScores) {
      let md: number | undefined = s.matchday && s.matchday > 0 ? s.matchday : undefined
      if (!md && s.fixture_id) md = shared.fixtureToMatchday.get(s.fixture_id)
      if (md === activeMatchday) {
        activeScoresByPlayer.set(s.player_id, {
          total_points: s.total_points || 0,
          minutes_played: s.minutes_played || 0
        })
      }
    }
  }

  for (const md of shared.sortedPlayedMatchdays) {
    const participants: { userId: string; points: number }[] = []
    
    for (const [userId, pointsMap] of userPointsByMatchday.entries()) {
      if (pointsMap.has(md)) {
        const userTeams = userTeamsMap.get(userId) || []
        let hasLineup = false
        for (const team of userTeams) {
          const teamMatchdays = shared.teamPlayersByMatchday.get(team.teamId)
          if (teamMatchdays && teamMatchdays.has(md) && (teamMatchdays.get(md) || []).length > 0) {
            hasLineup = true
            break
          }
        }
        if (hasLineup) {
          participants.push({ userId, points: pointsMap.get(md) || 0 })
        }
      }
    }

    if (participants.length === 0) continue

    const sorted = [...participants].sort((a, b) => b.points - a.points)
    
    const winners = sorted.slice(0, winCount)
    const losers = sorted.length > winCount ? sorted.slice(winCount).slice(-loseCount) : []
    
    const winnersSet = new Set(winners.map(w => w.userId))
    const losersSet = new Set(losers.map(l => l.userId))
    
    for (const p of sorted) {
      let cost = payRest
      if (winnersSet.has(p.userId)) {
        cost = payWinner
      } else if (losersSet.has(p.userId)) {
        cost = payLoser
      }
      userMatchdayPaymentsTotal.set(p.userId, (userMatchdayPaymentsTotal.get(p.userId) || 0) + cost)
    }
  }

  return userIds.map(userId => {
    const profile = membership.profilesById.get(userId)
    const pointsMap = userPointsByMatchday.get(userId) || new Map<number, number>()
    const teamPlayerMatchdays = userMatchdaysFromTeamPlayers.get(userId) || new Set<number>()

    let totalPoints = 0
    for (const [md, pts] of pointsMap.entries()) {
      if (md > 0) totalPoints += pts
    }

    const matchesPlayed = teamPlayerMatchdays.size
    const averagePoints = matchesPlayed > 0 ? Math.round((totalPoints / matchesPlayed) * 10) / 10 : 0

    const sortedMatchdays = Array.from(teamPlayerMatchdays).sort((a, b) => b - a)

    const last3Matchdays = sortedMatchdays.slice(0, 3)
    const last3Points = last3Matchdays.reduce((sum, md) => sum + (pointsMap.get(md) || 0), 0)
    const last3Avg = last3Matchdays.length > 0 ? Math.round((last3Points / last3Matchdays.length) * 10) / 10 : 0

    // Tendencia: pendiente (slope) sobre las últimas 5 jornadas de team_players
    const last5Matchdays = sortedMatchdays.slice(0, 5).reverse()
    let last5Trend: 'up' | 'down' | 'stable' = 'stable'
    if (last5Matchdays.length >= 2) {
      const n = last5Matchdays.length
      const points5 = last5Matchdays.map(md => pointsMap.get(md) || 0)
      const sumX = (n * (n - 1)) / 2
      const sumY = points5.reduce((a, b) => a + b, 0)
      const sumXY = points5.reduce((acc, y, i) => acc + i * y, 0)
      const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)

      if (slope > 2) last5Trend = 'up'
      else if (slope < -2) last5Trend = 'down'
    }

    let bestMatchdayPoints = 0
    let bestMatchday = 0
    for (const [md, pts] of pointsMap.entries()) {
      if (pts > bestMatchdayPoints) {
        bestMatchdayPoints = pts
        bestMatchday = md
      }
    }

    let minMinutes = Infinity
    for (const m of userKamikazeMinutes.get(userId) || []) {
      if (m < minMinutes) minMinutes = m
    }

    // Saldo: Saldo Inicial (Virtual) - amount_paid (perder/no ganar) - infraction_penalties (sanciones)
    const dynamicAmountPaid = userMatchdayPaymentsTotal.get(userId) || 0
    const dynamicInfractionPenalties = (userSanctionCount.get(userId) || 0) * (config.infraction_penalty_cost ?? 3)
    const saldo = (config.starting_balance ?? 40) - dynamicAmountPaid - dynamicInfractionPenalties

    // Calcular puntos y jugadores que ya jugaron en la jornada activa
    let activeMatchdayPoints: number | null = null
    let activeMatchdayPlayed = 0
    let activeMatchdayTotal = 0

    if (activeMatchday && activeMatchday >= fantasyStart) {
      // Si la jornada activa tiene un partido adelantado sin resolver, de
      // momento solo han jugado (o están jugando) los dos equipos reales de
      // ese partido: el "X/11" debe contar solo esos titulares, igual que
      // hace la página Jornada con restrictedTeamIds.
      const restrictedRealTeamIds = shared.restrictedMatchdayTeams.get(activeMatchday)

      const userTeams = userTeamsMap.get(userId) || []
      for (const team of userTeams) {
        const teamMatchdays = shared.teamPlayersByMatchday.get(team.teamId)
        if (teamMatchdays) {
          const availableMds = Array.from(teamMatchdays.keys()).filter(m => m <= activeMatchday)
          if (availableMds.length > 0) {
            const targetMd = Math.max(...availableMds)
            const players = teamMatchdays.get(targetMd) || []
            let starters = players.filter(tp => tp.is_starter)
            if (restrictedRealTeamIds) {
              starters = starters.filter(tp => {
                const realTeamId = shared.playersInfoMap.get(tp.player_id)?.team_id
                return realTeamId && restrictedRealTeamIds.has(realTeamId)
              })
            }

            if (starters.length > 0) {
              activeMatchdayPoints = activeMatchdayPoints || 0
              activeMatchdayTotal += starters.length
              for (const tp of starters) {
                const pScore = activeScoresByPlayer.get(tp.player_id)
                if (pScore) {
                  activeMatchdayPoints += pScore.total_points
                  if (pScore.minutes_played > 0) {
                    activeMatchdayPlayed++
                  }
                }
              }
            }
          }
        }
      }
    }

    return {
      user_id: userId,
      user_name: userDisplayName(profile),
      division,
      total_points: totalPoints,
      average_points: averagePoints,
      matches_played: matchesPlayed,
      last_3_jornadas_avg: last3Avg,
      last_5_trend: last5Trend,
      best_change_score: 0,
      total_changes: userChangesCount.get(userId) || 0,
      successful_changes: 0,
      change_impact_points: userChangesPointsDiff.get(userId) || 0,
      podium_finishes: podiumCount.get(userId) || 0,
      bottom_finishes: bottomCount.get(userId) || 0,
      last_place_finishes: shared.lastPlaceCount?.get(userId) || 0,
      current_position: 0,
      previous_position: 0,
      position_change: 0,
      teams_count: userTeamsMap.get(userId)?.length || 0,
      best_matchday_points: bestMatchdayPoints,
      best_matchday: bestMatchday,
      sanctioned_matchdays: userSanctionCount.get(userId) ?? 0,
      kamikaze_score: minMinutes === Infinity ? 999999 : minMinutes,
      app_opens: shared.sessionCounts.get(userId) || 0,
      saldo,
      active_matchday_points: activeMatchdayPoints !== null ? Math.round(activeMatchdayPoints * 10) / 10 : null,
      active_matchday_played: activeMatchdayPlayed,
      active_matchday_total: activeMatchdayTotal,
    }
  })
}

/**
 * Clasificación de una división (`1|2|3`) o de todas a la vez (`0` / `null`).
 *
 * En la vista conjunta cada división se calcula POR SEPARADO y después se
 * mezclan los resultados: los puntos de un usuario son siempre los mismos que
 * ve en la tabla de su división. No existe ningún camino que calcule sanciones
 * mezclando divisiones.
 */
export async function getStandings(supabase: any, division?: number | null, activeMatchday?: number | null): Promise<StandingsResult> {
  const [membership, shared] = await Promise.all([
    loadDivisionMembership(supabase),
    loadSharedData(supabase),
  ])

  if (shared.incomplete) {
    return { standings: [], lastPlayedMatchday: 1, incomplete: true }
  }

  const standings: UserStanding[] = []
  for (const d of divisionsToCompute(division)) {
    standings.push(...computeDivisionStandings(d, membership.teamsByDivision.get(d) ?? [], membership, shared, activeMatchday))
  }

  standings.sort((a, b) => b.total_points - a.total_points)
  standings.forEach((standing, index) => {
    standing.current_position = index + 1
  })

  return { standings, lastPlayedMatchday: shared.maxPlayed, incomplete: false }
}
