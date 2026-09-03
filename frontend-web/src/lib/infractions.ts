import { SupabaseClient } from '@supabase/supabase-js'
import {
  DivisionTeam,
  divisionsToCompute,
  loadDivisionMembership,
  userDisplayName,
} from '@/lib/divisions'
import { chronologicalPredecessors, computeOutOfOrderLocks, hasUnresolvedOutOfOrderMatch, resolveStartHoursBefore, type FixtureLite } from '@/lib/locked-teams-core'

export interface Infraction {
  id: string
  user_id: string
  full_name: string
  matchday: number
  description: string
  points: number
  is_pending: boolean
  division?: number
}

export async function getCurrentMatchday(supabase: SupabaseClient): Promise<number> {
  // Se calcula dinámicamente con las fechas de fixtures y league_config, con el
  // MISMO criterio que useMatchdayLock: la jornada es la del tramo de juego en
  // curso o, si el mercado está abierto, la del próximo tramo que se dispute.
  // Mirar la ventana completa de cada jornada (de su primer a su último partido)
  // no vale: un partido adelantado estira esa ventana varias semanas y se traga
  // los huecos de las jornadas intermedias.
  const { data: cfg } = await supabase
    .from('league_config')
    .select('matchday_start_hours_before_midweek, matchday_start_hours_before_weekend, matchday_end_hours_after, fantasy_starting_matchday')
    .eq('id', 1)
    .maybeSingle()

  const lockOffsets = {
    startHoursBeforeMidweek: cfg?.matchday_start_hours_before_midweek != null ? Number(cfg.matchday_start_hours_before_midweek) : 1,
    startHoursBeforeWeekend: cfg?.matchday_start_hours_before_weekend != null ? Number(cfg.matchday_start_hours_before_weekend) : 1,
    endHoursAfter: cfg?.matchday_end_hours_after != null ? Number(cfg.matchday_end_hours_after) : 2,
  }
  const lockOffsetMs = lockOffsets.endHoursAfter * 60 * 60 * 1000
  const fantasyStart = cfg?.fantasy_starting_matchday != null ? Number(cfg.fantasy_starting_matchday) : 1

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, matchday, start_time, status, home_team_id, away_team_id')
    .order('start_time', { ascending: true })

  if (!fixtures || fixtures.length === 0) return 1

  const outOfOrderIds = new Set(
    computeOutOfOrderLocks(fixtures as FixtureLite[], lockOffsets, fantasyStart).map(l => l.fixtureId)
  )

  // Agrupar por jornada
  const jornadasMap = new Map<number, typeof fixtures>()
  for (const fixture of fixtures) {
    const md = fixture.matchday || 1
    if (md < fantasyStart) continue
    if (!jornadasMap.has(md)) jornadasMap.set(md, [])
    jornadasMap.get(md)!.push(fixture)
  }

  // Un tramo por jornada (solo con sus partidos en orden) más un tramo por cada
  // partido fuera de orden, etiquetado con su jornada LÓGICA.
  interface Block { start: number; end: number; matchday: number; outOfOrder: boolean }
  const blocks: Block[] = []
  for (const [md, fs] of jornadasMap) {
    const regular = fs.filter(f => !outOfOrderIds.has(f.id)).sort((a, b) => a.start_time < b.start_time ? -1 : 1)
    if (regular.length > 0) {
      const firstDate = new Date(regular[0].start_time)
      blocks.push({
        start: firstDate.getTime() - resolveStartHoursBefore(firstDate, lockOffsets) * 60 * 60 * 1000,
        end: new Date(regular[regular.length - 1].start_time).getTime() + lockOffsetMs,
        matchday: md,
        outOfOrder: false,
      })
    }
    for (const f of fs.filter(f => outOfOrderIds.has(f.id))) {
      const fDate = new Date(f.start_time)
      blocks.push({
        start: fDate.getTime() - resolveStartHoursBefore(fDate, lockOffsets) * 60 * 60 * 1000,
        end: fDate.getTime() + lockOffsetMs,
        matchday: md,
        outOfOrder: true,
      })
    }
  }

  if (blocks.length === 0) return 1
  blocks.sort((a, b) => a.start - b.start)

  const now = Date.now()

  // Tramo en curso. Con tramos solapados (un aplazado que cae dentro del fin de
  // semana de otra jornada) manda la jornada regular, que es el hueco del
  // calendario en el que estamos de verdad; entre iguales, la última en empezar.
  let current: Block | null = null
  for (const b of blocks) {
    if (now < b.start || now > b.end) continue
    if (!current || !b.outOfOrder || current.outOfOrder) current = b
  }
  if (current) return current.matchday

  // Mercado abierto: la jornada es la del próximo tramo que se juegue.
  const next = blocks.find(b => b.start > now)
  return next ? next.matchday : blocks[blocks.length - 1].matchday
}

export async function isMatchdayLockStarted(supabase: SupabaseClient, matchday: number): Promise<boolean> {
  const { data: cfg } = await supabase
    .from('league_config')
    .select('matchday_start_hours_before_midweek, matchday_start_hours_before_weekend')
    .eq('id', 1)
    .maybeSingle()

  const lockOffsets = {
    startHoursBeforeMidweek: cfg?.matchday_start_hours_before_midweek != null ? Number(cfg.matchday_start_hours_before_midweek) : 1,
    startHoursBeforeWeekend: cfg?.matchday_start_hours_before_weekend != null ? Number(cfg.matchday_start_hours_before_weekend) : 1,
    endHoursAfter: 2, // not needed here but required by type
  }

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('start_time')
    .eq('matchday', matchday)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!fixtures || !fixtures.start_time) return false

  const firstMatchDate = new Date(fixtures.start_time)
  const unlockOffsetMs = resolveStartHoursBefore(firstMatchDate, lockOffsets) * 60 * 60 * 1000
  const unlockTime = firstMatchDate.getTime() - unlockOffsetMs
  
  return Date.now() >= unlockTime
}

/**
 * Si una jornada tiene un partido descolocado (adelantado/aplazado) sin
 * resolver, no se muestran sanciones para ella hasta que se complete del
 * todo: sus alineaciones y su historial dependen de partidos que aún no se
 * han jugado. Una jornada normal (sin ningún fixture fuera de orden) sigue
 * mostrando sanciones en cuanto cierra su mercado, como siempre.
 */
export async function canShowInfractionsForMatchday(supabase: SupabaseClient, matchday: number): Promise<boolean> {
  const isLocked = await isMatchdayLockStarted(supabase, matchday)
  if (!isLocked) return false

  const { data: configData } = await supabase.from('league_config').select('fantasy_starting_matchday').eq('id', 1).maybeSingle()
  const fantasyStart = Math.max(1, configData?.fantasy_starting_matchday ?? 1)

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, matchday, start_time, status, home_team_id, away_team_id')

  if (!fixtures) return true
  return !hasUnresolvedOutOfOrderMatch(fixtures as FixtureLite[], matchday, fantasyStart)
}

export async function getLiveInfractions(supabase: SupabaseClient, matchday: number, division?: number | null): Promise<Infraction[]> {
  // 1. Reparto de la liga en divisiones (fuente de verdad única)
  const membership = await loadDivisionMembership(supabase)
  const profileMap = membership.profilesById

  // 2. Obtener config de liga
  const { data: configData } = await supabase.from('league_config').select('*').eq('id', 1).maybeSingle()
  const config = {
    budget_limit: configData?.budget_limit ?? 300,
    max_players_per_team: configData?.max_players_per_team ?? 4,
    formations: configData?.formations ?? ["3-5-2", "3-4-3", "4-4-2", "4-3-3", "4-5-1", "5-4-1", "5-3-2"],
    max_changes_per_matchday: configData?.max_changes_per_matchday ?? 3
  }

  // Jornada en la que arranca el juego (Admin → Reglas del Juego). No tiene por
  // qué ser la J1 de la liga real, así que el histórico de sanciones se
  // construye desde ella: lo que los usuarios guardaran en jornadas anteriores
  // no es una alineación "oficial" y no puede generar multas ni contar como
  // plantilla previa.
  const fantasyStart = Math.max(1, configData?.fantasy_starting_matchday ?? 1)
  if (matchday < fantasyStart) return []

  // Función helper para paginación
  async function fetchAll<T>(table: string, select: string, matchdayFilter?: number): Promise<T[]> {
    const allData: T[] = []
    const pageSize = 1000
    let from = 0
    while (true) {
      let query = supabase.from(table).select(select).range(from, from + pageSize - 1)
      if (matchdayFilter !== undefined) {
        query = query.lte('matchday', matchdayFilter)
      }
      const { data, error } = await query
      if (error || !data) break
      allData.push(...(data as any))
      if (data.length < pageSize) break
      from += pageSize
    }
    return allData
  }

  // Calendario: hace falta antes que las alineaciones, porque de él sale de qué
  // jornada viene cada jornada.
  const { data: allFixtures } = await supabase
    .from('fixtures')
    .select('id, matchday, start_time, status, home_team_id, away_team_id')
  const fixtureToMatchday = new Map<string, number>()
  allFixtures?.forEach(f => {
    if (f.id && f.matchday && f.matchday > 0) fixtureToMatchday.set(f.id, f.matchday)
  })

  // Jornada de la que "viene" cada jornada, en orden de CALENDARIO. Normalmente
  // es m - 1, pero un partido adelantado rompe esa correspondencia: si la J6
  // juega un partido antes que la J4, el once de la J4 se hereda del que jugó
  // ese partido, y es contra ese contra el que hay que contar los cambios y la
  // exclusividad.
  const prevOf = chronologicalPredecessors(
    (allFixtures || []) as FixtureLite[],
    {
      startHoursBeforeMidweek: configData?.matchday_start_hours_before_midweek != null ? Number(configData.matchday_start_hours_before_midweek) : 1,
      startHoursBeforeWeekend: configData?.matchday_start_hours_before_weekend != null ? Number(configData.matchday_start_hours_before_weekend) : 1,
      endHoursAfter: configData?.matchday_end_hours_after != null ? Number(configData.matchday_end_hours_after) : 2,
    },
    fantasyStart
  )
  // La jornada anterior a efectos de PLANTILLA (cambios y exclusividad). Las
  // multas arrastradas y los jugadores anulados siguen mirando a m - 1: esos
  // salen de la última jornada PUNTUADA, y la jornada de un partido adelantado
  // no se puntúa hasta que se juegan todos sus partidos.
  const prevLineupMd = (m: number): number => prevOf.get(m) ?? m - 1

  // 3. Obtener todos los team_players registrados hasta la jornada actual.
  //    El tope sube hasta el predecesor más lejano: con un partido adelantado,
  //    la J4 necesita el once guardado para la J6, que va por delante.
  let maxLineupMd = matchday
  for (let m = fantasyStart; m <= matchday; m++) maxLineupMd = Math.max(maxLineupMd, prevLineupMd(m))
  const allTeamPlayers = await fetchAll<any>('team_players', 'team_id, player_id, is_starter, is_captain, matchday, position', maxLineupMd)

  if (!allTeamPlayers || allTeamPlayers.length === 0) return []

  // 4. Obtener todos los jugadores reales
  const players = await fetchAll<any>('players', 'id, position, team_id, precio, short_name, first_name')
  console.log(`[INFRACTIONS_TS_DEBUG] Total players fetched: ${players?.length}`)
  if (!players || players.length === 0) return []
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
        // La demarcación se congela por jornada (tp.position): un cambio de
        // posición no debe alterar retroactivamente la formación de jornadas
        // ya guardadas. Solo se cae a la posición en vivo del jugador cuando
        // la fila no tiene snapshot propio (alineaciones previas a la
        // congelación).
        return p ? { ...p, position: tp.position || p.position, valor: p.precio, puntos: 0 } : null
      })
      .filter(Boolean)
  }

  // Alineación EXACTA de una jornada, sin heredar de las anteriores. Hace falta
  // para el predecesor cronológico cuando va por delante en número: el once del
  // que viene la J4 es el que se guardó para la J6, y el helper de arriba, que
  // coge "la última jornada guardada hasta m", devolvería otra cosa.
  const getExactLineupForMatchday = (teamId: string, m: number): any[] =>
    allTeamPlayers
      .filter(tp => tp.team_id === teamId && tp.matchday === m && tp.is_starter)
      .map(tp => {
        const p = playerMap.get(tp.player_id)
        // La demarcación se congela por jornada (tp.position): un cambio de
        // posición no debe alterar retroactivamente la formación de jornadas
        // ya guardadas. Solo se cae a la posición en vivo del jugador cuando
        // la fila no tiene snapshot propio (alineaciones previas a la
        // congelación).
        return p ? { ...p, position: tp.position || p.position, valor: p.precio, puntos: 0 } : null
      })
      .filter(Boolean)

  // Puntos de los jugadores en cada jornada (para la ordenación de exceso de cambios).
  // La jornada de una puntuación es la del PARTIDO en el que se logró: cada
  // partido puntúa en la suya, también los adelantados o aplazados que se juegan
  // fuera de su hueco del calendario. `player_scores.matchday` está sin rellenar
  // (siempre NULL), así que filtrar por esa columna dejaba la consulta vacía y
  // todos los jugadores a 0 puntos. Se reutiliza el mapa de `allFixtures`.
  const allScores = await fetchAll<any>('player_scores', 'player_id, total_points, matchday, fixture_id')

  const scoresByMd = new Map<number, Map<string, number>>()
  allScores?.forEach(s => {
    const md = s.matchday && s.matchday > 0 ? s.matchday : fixtureToMatchday.get(s.fixture_id)
    if (!md || md > matchday) return
    const pid = s.player_id
    if (!scoresByMd.has(md)) scoresByMd.set(md, new Map())
    const mdMap = scoresByMd.get(md)!
    mdMap.set(pid, (mdMap.get(pid) || 0) + (s.total_points || 0))
  })

  // 5. Calcular las sanciones de UNA división, como si el resto no existiera.
  //    La exclusividad (regla Dolly) se construye recorriendo `teams`, así que
  //    pasando aquí solo los equipos de una división queda aislada por completo.
  const computeDivisionInfractions = (teams: DivisionTeam[]): Infraction[] => {
  if (teams.length === 0) return []

  const lineupHistory: { [m: number]: { [teamId: string]: Set<string> } } = {}
  const zeroedHistory: { [m: number]: { [teamId: string]: Set<string> } } = {}
  const penaltiesHistory: { [m: number]: { [teamId: string]: any[] } } = {}

  // El estado "anterior" a la primera jornada del juego está vacío a propósito:
  // nadie arrastra plantilla, ni multas, ni exclusividad sobre ningún jugador.
  const teamIds = teams.map(t => t.id)
  lineupHistory[fantasyStart - 1] = {}
  zeroedHistory[fantasyStart - 1] = {}
  penaltiesHistory[fantasyStart - 1] = {}
  teamIds.forEach(tid => {
    lineupHistory[fantasyStart - 1][tid] = new Set()
    zeroedHistory[fantasyStart - 1][tid] = new Set()
    penaltiesHistory[fantasyStart - 1][tid] = []
  })

  // 6. Calcular secuencialmente desde el arranque del juego hasta la jornada actual
  for (let m = fantasyStart; m <= matchday; m++) {
    lineupHistory[m] = {}
    zeroedHistory[m] = {}
    penaltiesHistory[m] = {}

    // Lineups de todos los equipos en la jornada m
    teamIds.forEach(tid => {
      const starters = getLineupForMatchday(tid, m)
      lineupHistory[m][tid] = new Set(starters.map(s => s.id))
    })

    // heldByOthersPrev para m (dueños en la jornada de la que viene m)
    const heldByOthersPrevM = new Map<string, Map<string, string[]>>()
    const prevLineupM = prevLineupMd(m)
    if (!lineupHistory[prevLineupM]) {
      // El predecesor va por delante en número (partido adelantado): su once no
      // lo ha calculado aún el bucle. Es el que se guardó para ESA jornada; si
      // el usuario no llegó a tocarla, se cae a la regla de siempre.
      lineupHistory[prevLineupM] = {}
      teamIds.forEach(tid => {
        const exact = getExactLineupForMatchday(tid, prevLineupM)
        const source = exact.length > 0 ? exact : getLineupForMatchday(tid, m - 1)
        lineupHistory[prevLineupM][tid] = new Set(source.map(s => s.id))
      })
    }
    teamIds.forEach(tid => {
      const teamHeld = new Map<string, string[]>()
      const prevMineOther = lineupHistory[prevLineupM]
      for (const [ownerTid, pids] of Object.entries(prevMineOther)) {
        if (ownerTid !== tid) {
          const ownerTeam = teams.find(t => t.id === ownerTid)
          const ownerName = userDisplayName(ownerTeam ? profileMap.get(ownerTeam.user_id) : null, 'otro usuario')
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

      const prevMine = lineupHistory[prevLineupM][tid]
      const heldByOthersPrev = heldByOthersPrevM.get(tid) || new Map()

      const prevPenalties = penaltiesHistory[m - 1][tid]
      const lineupPrev = lineupHistory[prevLineupM][tid]
      const zeroedPrev = zeroedHistory[m - 1][tid]

      const prevChangesM = prevLineupM > m ? m - 1 : prevLineupM
      const lineupPrevForChanges = lineupHistory[prevChangesM] ? lineupHistory[prevChangesM][tid] : undefined

      const result = applySanctionsToTeam(
        starters,
        prevMine,
        heldByOthersPrev,
        config,
        false, // no es en vivo para el cálculo de historial intermedio
        prevPenalties,
        lineupPrev,
        zeroedPrev,
        m === fantasyStart,
        lineupPrevForChanges
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
    const fullName = userDisplayName(profileMap.get(userId))

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

  // 8. Una división concreta (`1|2|3`) o todas por separado (`0` / `null`).
  //    Nunca se calculan mezcladas: un jugador alineado por alguien de otra
  //    división no puede generar sanción de exclusividad.
  const infractions: Infraction[] = []
  for (const d of divisionsToCompute(division)) {
    const divInfractions = computeDivisionInfractions(membership.teamsByDivision.get(d) ?? [])
    divInfractions.forEach(inf => inf.division = d)
    infractions.push(...divInfractions)
  }

  console.log(`[INFRACTIONS_TS] Computed ${infractions.length} live infractions. Sample:`, infractions.slice(0, 5))
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
  config: { budget_limit: number; max_players_per_team: number; formations: string[]; max_changes_per_matchday?: number },
  isLive: boolean = false,
  prevPenalties?: any[],
  lineupPrev?: Set<string>,
  zeroedPrev?: Set<string>,
  isFirstMatchday: boolean = false,
  lineupPrevForChanges?: Set<string>
): PlayerSanctionResult {
  // La jornada en la que arranca el juego (Admin → Reglas del Juego) no tiene
  // jornada anterior a efectos de sanciones, aunque la liga real lleve ya 20
  // jornadas jugadas: se sale de cero. Eso significa cambios libres y libertad
  // para alinear a cualquiera, porque nadie tenía todavía plantilla que
  // respetar; lo que hubiera guardado en jornadas previas no cuenta.
  //
  // Las sanciones que no miran al pasado —presupuesto, táctica, máximo por
  // equipo real y jugadores duplicados— sí se aplican con normalidad.
  if (isFirstMatchday) {
    prevMine = new Set()
    heldByOthersPrev = new Map()
    prevPenalties = undefined
    lineupPrev = undefined
    zeroedPrev = undefined
    lineupPrevForChanges = undefined
  }

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
              zero([rest.id], lbl)
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
                zero([bestIntroduced.id], lbl)
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
        zero([rest.id], reason)
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
          zero([bestIntroduced.id], reason)
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

  // 5) Exceso de cambios (salvo la primera jornada del juego y excepción de
  //    multas previas). El máximo lo fija el admin; antes estaba fijo en 3 aquí
  //    y el script de Python sí leía la configuración, así que la vista en vivo
  //    y las multas persistidas podían no coincidir.
  const changesBaseLineup = lineupPrevForChanges || lineupPrev;
  if (changesBaseLineup && changesBaseLineup.size > 0) {
    const newPlayers = starters.filter(s => !changesBaseLineup.has(s.id))
    const numChanges = newPlayers.length

    const penalizedPrev = zeroedPrev || new Set<string>()
    const replacedPenalized = [...penalizedPrev].filter(pid => !starters.some(s => s.id === pid))
    const replacedPenalizedCount = replacedPenalized.length

    const allowedChanges = (config.max_changes_per_matchday ?? 3) + replacedPenalizedCount
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

  // 6) Jugadores duplicados
  const playerCounts = new Map<string, number>()
  starters.forEach(p => {
    playerCounts.set(p.id, (playerCounts.get(p.id) || 0) + 1)
  })

  let hasDuplicates = false
  for (const [pid, count] of playerCounts.entries()) {
    if (count > 1) {
      hasDuplicates = true
      const reason = "Jugador duplicado en la alineación"
      zero([pid], reason)
    }
  }

  if (hasDuplicates) {
    const excludeMap = new Map<string, boolean>()
    const bestInTeam = bestPlayer(starters, excludeMap)
    if (bestInTeam) {
      zero([bestInTeam.id], "Sanción por jugador duplicado (Mejor jugador restante)")
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
