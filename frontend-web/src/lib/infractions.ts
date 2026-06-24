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
  const budgetLimit = configData?.budget_limit ?? 300
  const maxPlayersPerTeam = configData?.max_players_per_team ?? 4
  const allowedFormations = configData?.formations ?? ["3-5-2", "3-4-3", "4-4-2", "4-3-3", "4-5-1", "5-4-1", "5-3-2"]

  // 3. Obtener jugadores de esta jornada (o última alineación <= matchday para cada equipo)
  const { data: allTeamPlayers } = await supabase
    .from('team_players')
    .select('team_id, player_id, is_starter, is_captain, matchday')
    .lte('matchday', matchday)

  if (!allTeamPlayers) return []

  // Agrupar y buscar última jornada activa por equipo
  const maxMatchdayByTeam = new Map<string, number>()
  allTeamPlayers.forEach(p => {
    const curMax = maxMatchdayByTeam.get(p.team_id)
    if (curMax === undefined || p.matchday > curMax) {
      maxMatchdayByTeam.set(p.team_id, p.matchday)
    }
  })

  const activeLineups = new Map<string, typeof allTeamPlayers>()
  allTeamPlayers.forEach(p => {
    if (p.matchday === maxMatchdayByTeam.get(p.team_id)) {
      if (!activeLineups.has(p.team_id)) activeLineups.set(p.team_id, [])
      activeLineups.get(p.team_id)!.push(p)
    }
  })

  // 4. Obtener alineaciones de la jornada anterior para la exclusividad
  const prevMatchday = matchday - 1
  const heldByOthersPrev = new Map<string, Set<string>>() // player_id -> set of team_ids
  const myPrevPlayers = new Map<string, Set<string>>() // team_id -> set of player_ids

  if (prevMatchday >= 1) {
    const prevMaxMatchdayByTeam = new Map<string, number>()
    allTeamPlayers.forEach(p => {
      if (p.matchday <= prevMatchday) {
        const curMax = prevMaxMatchdayByTeam.get(p.team_id)
        if (curMax === undefined || p.matchday > curMax) {
          prevMaxMatchdayByTeam.set(p.team_id, p.matchday)
        }
      }
    })

    allTeamPlayers.forEach(p => {
      if (p.matchday <= prevMatchday && p.matchday === prevMaxMatchdayByTeam.get(p.team_id)) {
        if (!myPrevPlayers.has(p.team_id)) myPrevPlayers.set(p.team_id, new Set())
        myPrevPlayers.get(p.team_id)!.add(p.player_id)

        if (!heldByOthersPrev.has(p.player_id)) heldByOthersPrev.set(p.player_id, new Set())
        heldByOthersPrev.get(p.player_id)!.add(p.team_id)
      }
    })
  }

  // 5. Obtener info de jugadores reales
  const { data: players } = await supabase.from('players').select('id, position, team_id, precio, short_name, first_name')
  if (!players) return []
  const playerMap = new Map(players.map(p => [p.id, p]))

  // Obtener equipos reales para nombres
  const { data: realTeams } = await supabase.from('real_teams').select('id, name')
  const realTeamNames = new Map(realTeams?.map(rt => [rt.id, rt.name]) || [])

  const getPositionCode = (position: string): string => {
    const posLower = (position || '').toLowerCase()
    if (posLower.includes('goalkeeper') || posLower === 'gk') return 'GK'
    if (posLower.includes('defender') || posLower === 'def') return 'DEF'
    if (posLower.includes('midfielder') || posLower === 'mid') return 'MID'
    if (posLower.includes('forward') || posLower === 'fwd') return 'FWD'
    return 'MID'
  }

  const infractions: Infraction[] = []

  // 6. Calcular infracciones por equipo
  for (const [teamId, lineup] of activeLineups.entries()) {
    const userId = teamToUser.get(teamId)
    if (!userId) continue
    const profile = profileMap.get(userId)
    const fullName = profile?.full_name || profile?.email?.split('@')[0] || 'Usuario'

    const starterPlayers = lineup.filter(p => p.is_starter).map(p => playerMap.get(p.player_id)).filter(Boolean) as typeof players
    if (starterPlayers.length === 0) continue

    // A. Jugador de otro usuario (exclusividad)
    if (prevMatchday >= 1) {
      const myPrev = myPrevPlayers.get(teamId) || new Set<string>()
      for (const p of starterPlayers) {
        const othersWhoHeld = heldByOthersPrev.get(p.id)
        const isHeldByOthers = othersWhoHeld && [...othersWhoHeld].some(tid => tid !== teamId)
        if (isHeldByOthers && !myPrev.has(p.id)) {
          const ownerTeamIds = [...othersWhoHeld].filter(tid => tid !== teamId)
          const ownerNames = ownerTeamIds.map(tid => {
            const uid = teamToUser.get(tid)
            const prof = uid ? profileMap.get(uid) : null
            return prof?.full_name || prof?.email?.split('@')[0] || 'otro usuario'
          })
          const ownerNamesStr = ownerNames.join(', ')

          infractions.push({
            id: `inf-${teamId}-excl-${p.id}`,
            user_id: userId,
            full_name: fullName,
            matchday,
            description: `${p.short_name || p.first_name} pertenece a ${ownerNamesStr}`,
            points: 0,
            is_pending: true
          })
        }
      }
    }

    // B. Superado nº de jugadores del mismo equipo real
    const realTeamCount = new Map<string, number>()
    starterPlayers.forEach(p => {
      if (p.team_id) {
        realTeamCount.set(p.team_id, (realTeamCount.get(p.team_id) || 0) + 1)
      }
    })

    for (const [rtId, count] of realTeamCount.entries()) {
      if (count > maxPlayersPerTeam) {
        const rtName = realTeamNames.get(rtId) || 'un mismo equipo'
        infractions.push({
          id: `inf-${teamId}-maxteam-${rtId}`,
          user_id: userId,
          full_name: fullName,
          matchday,
          description: `${count} jugadores de ${rtName} (máx. ${maxPlayersPerTeam})`,
          points: 0,
          is_pending: true
        })
      }
    }

    // C. Presupuesto superado
    const totalPrice = starterPlayers.reduce((sum, p) => sum + (p.precio ?? 0), 0)
    if (totalPrice > budgetLimit) {
      infractions.push({
        id: `inf-${teamId}-budget`,
        user_id: userId,
        full_name: fullName,
        matchday,
        description: `Presupuesto superado: ${totalPrice}M de ${budgetLimit}M`,
        points: 0,
        is_pending: true
      })
    }

    // D. Táctica / Count (excluidos de las multas/sanciones según reglas de la liga)
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
  isLive: boolean = false
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

  // 1) Dolly Rule (exclusivity)
  starters.forEach(p => {
    const owners = heldByOthersPrev.get(p.id)
    if (owners && owners.length > 0 && !prevMine.has(p.id)) {
      const offender = p
      const exclude = new Map<string, boolean>([[offender.id, true]])
      const rest = bestPlayer(starters.filter(x => x.id !== offender.id), exclude)
      const ownersStr = owners.join(', ')
      const reason = `Exclusividad: pertenece a ${ownersStr}`
      zero([offender.id], reason)
      if (rest && !isLive) {
        zero([rest.id], `${reason} (Mejor del resto)`)
      }
    }
  })

  // 2) Max players per team
  if (!isLive) {
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
        
        const teamName = teamPlayers[0]?.team?.name || 'equipo'
        const reason = `Exceso jugadores de ${teamName} (${count}/${config.max_players_per_team})`
        
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
  if (!isLive) {
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
  if (!isLive) {
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

  // Calculate net points
  let netPoints = 0
  starters.forEach(p => {
    if (!zeroedPlayers.has(p.id)) {
      netPoints += p.puntos ?? 0
    }
  })

  return { zeroedPlayers, netPoints }
}
