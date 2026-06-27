import { SupabaseClient } from '@supabase/supabase-js'

export interface Infraction {
  id: string
  user_id: string
  full_name: string
  matchday: number
  description: string
  points: number
  is_pending: boolean
}

export async function getCurrentMatchday(supabase: SupabaseClient): Promise<number> {


  // 2. Si no, calcular dinámicamente usando las fechas de fixtures y league_config (como useMatchdayLock)
  const { data: cfg } = await supabase
    .from('league_config')
    .select('matchday_start_hours_before, matchday_end_hours_after')
    .eq('id', 1)
    .maybeSingle()

  let unlockOffsetMs = 60 * 60 * 1000
  let lockOffsetMs = 2 * 60 * 60 * 1000
  if (cfg) {
    if (cfg.matchday_start_hours_before != null) unlockOffsetMs = Number(cfg.matchday_start_hours_before) * 60 * 60 * 1000
    if (cfg.matchday_end_hours_after != null) lockOffsetMs = Number(cfg.matchday_end_hours_after) * 60 * 60 * 1000
  }

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('matchday, start_time')
    .order('start_time', { ascending: true })

  if (!fixtures || fixtures.length === 0) return 1

  const numericMatchdays = fixtures
    .filter(f => f.matchday && f.matchday > 0)
    .map(f => f.matchday as number)
  const maxNumericMatchday = numericMatchdays.length > 0 ? Math.max(...numericMatchdays) : 1

  // Agrupar por jornada
  const jornadasMap = new Map<number, { matchday: number; start_time: string; fixtures: typeof fixtures }>()
  for (const fixture of fixtures) {
    const md = fixture.matchday || 1
    if (!jornadasMap.has(md)) {
      jornadasMap.set(md, { matchday: md, start_time: fixture.start_time, fixtures: [] })
    }
    jornadasMap.get(md)!.fixtures.push(fixture)
  }

  const sortedJornadas = Array.from(jornadasMap.values()).map(j => ({
    ...j,
    start_time: j.fixtures.reduce((min, f) => f.start_time < min ? f.start_time : min, j.fixtures[0].start_time),
    end_time: j.fixtures.reduce((max, f) => f.start_time > max ? f.start_time : max, j.fixtures[0].start_time)
  })).sort((a, b) => a.matchday - b.matchday)

  const now = Date.now()
  // Buscar jornada activa
  for (const j of sortedJornadas) {
    const first = new Date(j.start_time).getTime()
    const last = new Date(j.end_time).getTime()
    const unlock = first - unlockOffsetMs
    const lock = last + lockOffsetMs
    if (now >= unlock && now <= lock) {
      return j.matchday
    }
  }

  // Buscar próxima jornada
  for (const j of sortedJornadas) {
    const first = new Date(j.start_time).getTime()
    const unlock = first - unlockOffsetMs
    if (unlock > now) {
      return j.matchday
    }
  }

  // Si no hay próxima, devolver la última
  return sortedJornadas.length > 0 ? sortedJornadas[sortedJornadas.length - 1].matchday : 1
}

export async function getLiveInfractions(supabase: SupabaseClient, matchday: number): Promise<Infraction[]> {
  // 1. Obtener perfiles y equipos
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email')
  const { data: teams } = await supabase.from('user_teams').select('id, user_id, name')
  if (!profiles || !teams) return []

  const profileMap = new Map(profiles.map(p => [p.id, p]))
  const teamToUser = new Map(teams.map(t => [t.id, t.user_id]))

  // 2. Obtener config de liga
  const { data: configData } = await supabase.from('league_config').select('*').eq('id', 1).maybeSingle()
  const config = {
    budget_limit: configData?.budget_limit ?? 300,
    max_players_per_team: configData?.max_players_per_team ?? 4,
    formations: configData?.formations ?? ["3-5-2", "3-4-3", "4-4-2", "4-3-3", "4-5-1", "5-4-1", "5-3-2"]
  }

  // 3. Obtener todos los team_players registrados hasta la jornada actual
  const { data: allTeamPlayers } = await supabase
    .from('team_players')
    .select('team_id, player_id, is_starter, is_captain, matchday')
    .lte('matchday', matchday)

  if (!allTeamPlayers) return []

  // 4. Obtener todos los jugadores reales
  const { data: players } = await supabase.from('players').select('id, position, team_id, precio, short_name, first_name')
  if (!players) return []
  const playerMap = new Map(players.map(p => [p.id, p]))

  // Helper para obtener alineación titular de un equipo en la jornada m
  const getLineupForMatchday = (teamId: string, m: number): any[] => {
    let maxM = -1
    allTeamPlayers.forEach(tp => {
      if (tp.team_id === teamId && tp.matchday <= m && tp.is_starter) {
        if (tp.matchday > maxM) maxM = tp.matchday
      }
    })
    if (maxM === -1) return []
    return allTeamPlayers
      .filter(tp => tp.team_id === teamId && tp.matchday === maxM && tp.is_starter)
      .map(tp => {
        const p = playerMap.get(tp.player_id)
        return p ? { ...p, valor: p.precio, puntos: 0 } : null
      })
      .filter(Boolean)
  }

  // Puntos de los jugadores en cada jornada (para la ordenación de exceso de cambios)
  const { data: allScores } = await supabase
    .from('player_scores')
    .select('player_id, total_points, matchday')
    .lte('matchday', matchday)
  
  const scoresByMd = new Map<number, Map<string, number>>()
  allScores?.forEach(s => {
    const md = s.matchday
    const pid = s.player_id
    if (!scoresByMd.has(md)) scoresByMd.set(md, new Map())
    const mdMap = scoresByMd.get(md)!
    mdMap.set(pid, (mdMap.get(pid) || 0) + (s.total_points || 0))
  })

  // 5. Inicializar estructuras históricas
  const lineupHistory: { [m: number]: { [teamId: string]: Set<string> } } = {}
  const zeroedHistory: { [m: number]: { [teamId: string]: Set<string> } } = {}
  const penaltiesHistory: { [m: number]: { [teamId: string]: any[] } } = {}

  const teamIds = teams.map(t => t.id)
  lineupHistory[0] = {}
  zeroedHistory[0] = {}
  penaltiesHistory[0] = {}
  teamIds.forEach(tid => {
    lineupHistory[0][tid] = new Set()
    zeroedHistory[0][tid] = new Set()
    penaltiesHistory[0][tid] = []
  })

  // 6. Calcular secuencialmente desde J1 hasta la jornada actual
  for (let m = 1; m <= matchday; m++) {
    lineupHistory[m] = {}
    zeroedHistory[m] = {}
    penaltiesHistory[m] = {}

    // Lineups de todos los equipos en la jornada m
    teamIds.forEach(tid => {
      const starters = getLineupForMatchday(tid, m)
      lineupHistory[m][tid] = new Set(starters.map(s => s.id))
    })

    // heldByOthersPrev para m (dueños en m-1)
    const heldByOthersPrevM = new Map<string, Map<string, string[]>>()
    teamIds.forEach(tid => {
      const teamHeld = new Map<string, string[]>()
      const prevMineOther = lineupHistory[m - 1]
      for (const [ownerTid, pids] of Object.entries(prevMineOther)) {
        if (ownerTid !== tid) {
          const ownerTeam = teams.find(t => t.id === ownerTid)
          const ownerProfile = ownerTeam ? profileMap.get(ownerTeam.user_id) : null
          const ownerName = ownerProfile?.full_name || ownerProfile?.email?.split('@')[0] || 'otro usuario'
          pids.forEach(pid => {
            if (!teamHeld.has(pid)) teamHeld.set(pid, [])
            teamHeld.get(pid)!.push(ownerName)
          })
        }
      }
      heldByOthersPrevM.set(tid, teamHeld)
    })

    // Ejecutar sanciones para cada equipo en la jornada m
    teamIds.forEach(tid => {
      const starters = getLineupForMatchday(tid, m)
      if (starters.length === 0) {
        zeroedHistory[m][tid] = new Set()
        penaltiesHistory[m][tid] = []
        return
      }

      // Asignar puntos correctos de la jornada m si existen
      const pointsM = scoresByMd.get(m)
      starters.forEach(s => {
        s.puntos = pointsM?.get(s.id) || 0
      })

      const prevMine = lineupHistory[m - 1][tid]
      const heldByOthersPrev = heldByOthersPrevM.get(tid) || new Map()

      const prevPenalties = penaltiesHistory[m - 1][tid]
      const lineupPrev = lineupHistory[m - 1][tid]
      const zeroedPrev = zeroedHistory[m - 1][tid]

      const result = applySanctionsToTeam(
        starters,
        prevMine,
        heldByOthersPrev,
        config,
        false, // no es en vivo para el cálculo de historial intermedio
        prevPenalties,
        lineupPrev,
        zeroedPrev
      )

      zeroedHistory[m][tid] = new Set(result.zeroedPlayers.keys())
      
      const uniqueReasons = Array.from(new Set(result.zeroedPlayers.values()))
      penaltiesHistory[m][tid] = uniqueReasons.map(desc => ({ description: desc, points: 0 }))
    })
  }

  // 7. Recopilar infracciones para la jornada actual (N)
  const infractions: Infraction[] = []

  for (const team of teams) {
    const teamId = team.id
    const userId = team.user_id
    const profile = profileMap.get(userId)
    const fullName = profile?.full_name || profile?.email?.split('@')[0] || 'Usuario'

    const teamPenalties = penaltiesHistory[matchday][teamId] || []
    teamPenalties.forEach((p, idx) => {
      infractions.push({
        id: `inf-${teamId}-live-${idx}`,
        user_id: userId,
        full_name: fullName,
        matchday,
        description: p.description,
        points: p.points,
        is_pending: true
      })
    })
  }

  return infractions
}

export interface PlayerSanctionResult {
  zeroedPlayers: Map<string, string> // player_id -> reason
  netPoints: number
}

export function applySanctionsToTeam(
  starters: any[],
  prevMine: Set<string>,
  heldByOthersPrev: Map<string, string[]>,
  config: { budget_limit: number; max_players_per_team: number; formations: string[] },
  isLive: boolean = false,
  prevPenalties?: any[],
  lineupPrev?: Set<string>,
  zeroedPrev?: Set<string>
): PlayerSanctionResult {
  const zeroedPlayers = new Map<string, string>()

  const points = new Map<string, number>()
  starters.forEach(p => points.set(p.id, p.puntos ?? 0))

  const bestPlayer = (candidates: any[], excludeMap: Map<string, boolean>): any | null => {
    let best: any | null = null
    let bestPts = -99999
    for (const p of candidates) {
      if (excludeMap.has(p.id) || zeroedPlayers.has(p.id)) continue
      const pts = points.get(p.id) ?? 0
      if (best === null || pts > bestPts) {
        best = p
        bestPts = pts
      }
    }
    return best
  }

  const getPositionCode = (position: string): string => {
    const posLower = (position || '').toLowerCase()
    if (posLower.includes('goalkeeper') || posLower === 'gk') return 'GK'
    if (posLower.includes('defender') || posLower === 'def') return 'DEF'
    if (posLower.includes('midfielder') || posLower === 'mid') return 'MID'
    if (posLower.includes('forward') || posLower === 'fwd') return 'FWD'
    return 'MID'
  }

  const zero = (pids: string[], reason: string) => {
    pids.forEach(pid => {
      if (pid && !zeroedPlayers.has(pid)) {
        zeroedPlayers.set(pid, reason)
      }
    })
  }

  const getNoCambiadoLabel = (desc: string): string => {
    return desc.endsWith(" (no cambiado)") ? desc : `${desc} (no cambiado)`
  }

  // Identificar sanciones no resueltas de la jornada anterior
  const unresolvedTypes = new Set<string>()
  if (prevPenalties && lineupPrev) {
    prevPenalties.forEach(p => {
      const desc = p.description || ''
      
      // 1. Dolly rule (exclusividad)
      if (desc.startsWith("Jugador de ")) {
        const cleanDesc = desc.endsWith(" (no cambiado)") ? desc.slice(0, -" (no cambiado)".length) : desc
        const parts = cleanDesc.split(":")
        if (parts.length >= 2) {
          const playerName = parts[parts.length - 1].trim().toLowerCase()
          // Buscar el ID del jugador en lineupPrev
          let offenderId: string | null = null
          lineupPrev.forEach(pid => {
            const starter = starters.find(s => s.id === pid)
            const name = starter ? (starter.short_name || starter.first_name || '') : ''
            if (name.toLowerCase() === playerName) {
              offenderId = pid
            }
          })
          
          if (offenderId && starters.some(s => s.id === offenderId)) {
            const offender = starters.find(s => s.id === offenderId)
            const exclude = new Map<string, boolean>([[offenderId, true]])
            const rest = bestPlayer(starters.filter(x => x.id !== offenderId), exclude)
            const lbl = getNoCambiadoLabel(desc)
            zero([offenderId], lbl)
            if (rest) {
              zero([rest.id], `${lbl} (Mejor del resto)`)
            }
            unresolvedTypes.add("exclusivity")
          }
        }
      }
      
      // 2. Más de max_players_per_team
      else if (desc.includes("jugadores de un mismo equipo") || desc.includes("jugadores de la misma")) {
        // Contar qué equipo real causaba la infracción en lineupPrev
        const realTeamCountsPrev = new Map<string, number>()
        lineupPrev.forEach(pid => {
          const starter = starters.find(s => s.id === pid)
          const rt = starter?.team_id
          if (rt) {
            realTeamCountsPrev.set(rt, (realTeamCountsPrev.get(rt) || 0) + 1)
          }
        })
        
        for (const [rt, count] of realTeamCountsPrev.entries()) {
          if (count > config.max_players_per_team) {
            // Verificar si sigue superando en starters actuales
            const realTeamCountsNow = new Map<string, number>()
            starters.forEach(s => {
              if (s.team_id) {
                realTeamCountsNow.set(s.team_id, (realTeamCountsNow.get(s.team_id) || 0) + 1)
              }
            })
            
            if ((realTeamCountsNow.get(rt) || 0) > config.max_players_per_team) {
              // No resuelto
              const teamPlayers = starters.filter(s => s.team_id === rt)
              const excludeMap = new Map<string, boolean>()
              const bestOfLineup = bestPlayer(starters, excludeMap)
              const lbl = getNoCambiadoLabel(desc)
              
              if (bestOfLineup) {
                zero([bestOfLineup.id], lbl)
              }
              
              const introduced = teamPlayers.filter(s => !prevMine.has(s.id))
              const excludeWithBest = new Map<string, boolean>()
              if (bestOfLineup) excludeWithBest.set(bestOfLineup.id, true)
              const bestIntroduced = bestPlayer(introduced, excludeWithBest)
              if (bestIntroduced) {
                zero([bestIntroduced.id], `${lbl} (Fichaje)`)
              }
              unresolvedTypes.add("max_players")
            }
          }
        }
      }
      
      // 3. Presupuesto superado
      else if (desc.includes("Presupuesto superado")) {
        const totalBudget = starters.reduce((sum, p) => sum + (p.valor ?? 0), 0)
        if (totalBudget > config.budget_limit) {
          const first = bestPlayer(starters, new Map())
          if (first) {
            const lbl = getNoCambiadoLabel(desc)
            zero([first.id], lbl)
            const excludeFirst = new Map<string, boolean>([[first.id, true]])
            const second = bestPlayer(starters, excludeFirst)
            if (second) {
              zero([second.id], lbl)
            }
          }
          unresolvedTypes.add("budget")
        }
      }
      
      // 4. Táctica incorrecta
      else if (desc.includes("Táctica incorrecta")) {
        const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
        starters.forEach(p => {
          const code = getPositionCode(p.position) as keyof typeof counts
          counts[code] = (counts[code] || 0) + 1
        })

        const validFormations = config.formations.map(f => {
          const parts = f.split('-').map(n => parseInt(n.trim(), 10))
          return { defenders: parts[0], midfielders: parts[1], forwards: parts[2] }
        })

        const isFormationValid = counts.GK === 1 && validFormations.some(f => 
          f.defenders === counts.DEF && f.midfielders === counts.MID && f.forwards === counts.FWD
        )

        if (!isFormationValid) {
          const maxDef = Math.max(...validFormations.map(f => f.defenders))
          const maxMid = Math.max(...validFormations.map(f => f.midfielders))
          const maxFwd = Math.max(...validFormations.map(f => f.forwards))
          const posMax = { DEF: maxDef, MID: maxMid, FWD: maxFwd }

          let offendingPos: 'DEF' | 'MID' | 'FWD' | null = null
          for (const pos of ['DEF', 'MID', 'FWD'] as const) {
            if (counts[pos] > posMax[pos]) {
              offendingPos = pos
              break
            }
          }

          const lbl = getNoCambiadoLabel(desc)
          if (offendingPos) {
            const inPos = starters.filter(p => getPositionCode(p.position) === offendingPos)
            const introduced = inPos.filter(p => !prevMine.has(p.id))
            const worstIntro = bestPlayer(introduced.length > 0 ? introduced : inPos, new Map())
            if (worstIntro) {
              zero([worstIntro.id], lbl)
              const excludeWorst = new Map<string, boolean>([[worstIntro.id, true]])
              const rest = bestPlayer(starters.filter(p => p.id !== worstIntro.id), excludeWorst)
              if (rest) {
                zero([rest.id], lbl)
              }
            }
          } else {
            const first = bestPlayer(starters, new Map())
            if (first) {
              zero([first.id], lbl)
              const excludeFirst = new Map<string, boolean>([[first.id, true]])
              const rest = bestPlayer(starters.filter(p => p.id !== first.id), excludeFirst)
              if (rest) {
                zero([rest.id], lbl)
              }
            }
          }
          unresolvedTypes.add("tactics")
        }
      }
    })
  }

  // 1) Dolly Rule (exclusivity)
  starters.forEach(p => {
    const owners = heldByOthersPrev.get(p.id)
    if (owners && owners.length > 0 && !prevMine.has(p.id)) {
      const offender = p
      const exclude = new Map<string, boolean>([[offender.id, true]])
      const rest = bestPlayer(starters.filter(x => x.id !== offender.id), exclude)
      const ownersStr = owners.join(', ')
      const playerName = p.short_name || p.first_name || p.id
      const reason = `Jugador de ${ownersStr}: ${playerName}`
      zero([offender.id], reason)
      if (rest) {
        zero([rest.id], `${reason} (Mejor del resto)`)
      }
    }
  })

  // 2) Max players per team
  if (!unresolvedTypes.has("max_players")) {
    const realTeamCount = new Map<string, number>()
    starters.forEach(p => {
      if (p.team_id) {
        realTeamCount.set(p.team_id, (realTeamCount.get(p.team_id) || 0) + 1)
      }
    })

    for (const [rtId, count] of realTeamCount.entries()) {
      if (count > config.max_players_per_team) {
        const teamPlayers = starters.filter(p => p.team_id === rtId)
        const excludeMap = new Map<string, boolean>()
        const bestOfLineup = bestPlayer(starters, excludeMap)

        const reason = `Más de ${config.max_players_per_team} jugadores de un mismo equipo (${count})`

        if (bestOfLineup) {
          zero([bestOfLineup.id], reason)
        }

        const introduced = teamPlayers.filter(p => !prevMine.has(p.id))
        const excludeWithBest = new Map<string, boolean>()
        if (bestOfLineup) excludeWithBest.set(bestOfLineup.id, true)
        const bestIntroduced = bestPlayer(introduced, excludeWithBest)
        if (bestIntroduced) {
          zero([bestIntroduced.id], `${reason} (Fichaje)`)
        }
      }
    }
  }

  // 3) Budget limit
  if (!unresolvedTypes.has("budget")) {
    const totalBudget = starters.reduce((sum, p) => sum + (p.valor ?? 0), 0)
    if (totalBudget > config.budget_limit) {
      const first = bestPlayer(starters, new Map())
      if (first) {
        const reason = `Presupuesto superado (${totalBudget}M/${config.budget_limit}M)`
        zero([first.id], reason)
        const excludeFirst = new Map<string, boolean>([[first.id, true]])
        const second = bestPlayer(starters, excludeFirst)
        if (second) {
          zero([second.id], reason)
        }
      }
    }
  }

  // 4) Táctica incorrecta
  if (!unresolvedTypes.has("tactics")) {
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
    starters.forEach(p => {
      const code = getPositionCode(p.position) as keyof typeof counts
      counts[code] = (counts[code] || 0) + 1
    })

    const validFormations = config.formations.map(f => {
      const parts = f.split('-').map(n => parseInt(n.trim(), 10))
      return { defenders: parts[0], midfielders: parts[1], forwards: parts[2] }
    })

    const isFormationValid = counts.GK === 1 && validFormations.some(f => 
      f.defenders === counts.DEF && f.midfielders === counts.MID && f.forwards === counts.FWD
    )

    if (!isFormationValid) {
      const maxDef = Math.max(...validFormations.map(f => f.defenders))
      const maxMid = Math.max(...validFormations.map(f => f.midfielders))
      const maxFwd = Math.max(...validFormations.map(f => f.forwards))
      const posMax = { DEF: maxDef, MID: maxMid, FWD: maxFwd }

      let offendingPos: 'DEF' | 'MID' | 'FWD' | null = null
      for (const pos of ['DEF', 'MID', 'FWD'] as const) {
        if (counts[pos] > posMax[pos]) {
          offendingPos = pos
          break
        }
      }

      const tReason = `Táctica incorrecta (${counts.GK}-${counts.DEF}-${counts.MID}-${counts.FWD})`

      if (offendingPos) {
        const inPos = starters.filter(p => getPositionCode(p.position) === offendingPos)
        const introduced = inPos.filter(p => !prevMine.has(p.id))
        const worstIntro = bestPlayer(introduced.length > 0 ? introduced : inPos, new Map())
        if (worstIntro) {
          zero([worstIntro.id], tReason)
          const excludeWorst = new Map<string, boolean>([[worstIntro.id, true]])
          const rest = bestPlayer(starters.filter(p => p.id !== worstIntro.id), excludeWorst)
          if (rest) {
            zero([rest.id], tReason)
          }
        }
      } else {
        const first = bestPlayer(starters, new Map())
        if (first) {
          zero([first.id], tReason)
          const excludeFirst = new Map<string, boolean>([[first.id, true]])
          const rest = bestPlayer(starters.filter(p => p.id !== first.id), excludeFirst)
          if (rest) {
            zero([rest.id], tReason)
          }
        }
      }
    }
  }

  // 5) Exceso de cambios (máx. 3 cambios, salvo J1 y excepción de multas previas)
  if (lineupPrev && lineupPrev.size > 0) {
    const newPlayers = starters.filter(s => !lineupPrev.has(s.id))
    const numChanges = newPlayers.length
    
    const penalizedPrev = zeroedPrev || new Set<string>()
    const replacedPenalized = [...penalizedPrev].filter(pid => !starters.some(s => s.id === pid))
    const replacedPenalizedCount = replacedPenalized.length
    
    const allowedChanges = 3 + replacedPenalizedCount
    if (numChanges > allowedChanges) {
      const excess = numChanges - allowedChanges
      const newPlayersSorted = [...newPlayers].sort((a, b) => (b.puntos ?? 0) - (a.puntos ?? 0))
      const newPlayersCandidates = newPlayersSorted.filter(s => !zeroedPlayers.has(s.id))
      const toZero = newPlayersCandidates.slice(0, excess)
      
      const reason = `Exceso de cambios (${numChanges} cambios/máx ${allowedChanges})`
      toZero.forEach(s => {
        zero([s.id], reason)
      })
    }
  }

  // Calculate net points
  let netPoints = 0
  starters.forEach(p => {
    if (!zeroedPlayers.has(p.id)) {
      netPoints += p.puntos ?? 0
    }
  })

  return { zeroedPlayers, netPoints }
}
