import { applySanctionsToTeam } from '@/lib/infractions'

export interface UserStanding {
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

export async function getStandings(supabase: any): Promise<{ standings: UserStanding[], lastPlayedMatchday: number }> {


      const { data: userTeamsData } = await supabase
        .from('user_teams')
        .select('id, user_id, name')

      if (!userTeamsData || userTeamsData.length === 0) {
        return { standings: [], lastPlayedMatchday: 1 }
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

      const usersMap = new Map<string, any>(usersData?.map((u: any) => [u.id, u]) || [])

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
        return { standings: [], lastPlayedMatchday: 1 }
      }

      const playerIds = [...new Set(teamPlayers.map(tp => tp.player_id))]
      const playerIdSet = new Set(playerIds)

      // Cargar info de jugadores reales y sus equipos para aplicar las sanciones
      const { data: playersData } = await supabase
        .from('players')
        .select('id, position, team_id, precio, short_name, first_name')
        .in('id', playerIds)
      const playersInfoMap = new Map<string, any>(playersData?.map((p: any) => [p.id, p]) || [])

      const { data: realTeams } = await supabase
        .from('real_teams')
        .select('id, name')
      const realTeamNames = new Map<string, string>(realTeams?.map((rt: any) => [rt.id, rt.name]) || [])

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
          supabase.from('team_players').insert(inheritedRows).then(({ error }: any) => {
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

      

      standingsData.sort((a, b) => b.total_points - a.total_points);
      standingsData.forEach((standing, index) => {
        standing.current_position = index + 1
      })

      
      
    
  return { standings: standingsData, lastPlayedMatchday: maxPlayed };
}
