import { SupabaseClient } from '@supabase/supabase-js'
import {
  computeOutOfOrderLocks,
  isLockActive,
  DEFAULT_LOCK_OFFSETS,
  type FixtureLite,
  type LockOffsets,
  type OutOfOrderLock,
} from '@/lib/locked-teams-core'

export interface BellNotification {
  id: string
  type: string
  title: string
  body: string
  created_at: string
  read_at: string | null
}

/** Con cuánta antelación se avisa de un bloqueo que aún no ha empezado (14 días). */
const HEADS_UP_MS = 14 * 24 * 60 * 60 * 1000

function formatDateTime(d: Date): string {
  return d.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fetchLockOffsets(supabase: SupabaseClient): Promise<LockOffsets> {
  const { data: cfg } = await supabase
    .from('league_config')
    .select('matchday_start_hours_before, matchday_start_hours_before_midweek, matchday_start_hours_before_weekend, matchday_end_hours_after')
    .eq('id', 1)
    .maybeSingle()
  return {
    startHoursBeforeMidweek: cfg?.matchday_start_hours_before_midweek != null
      ? Number(cfg.matchday_start_hours_before_midweek)
      : (cfg?.matchday_start_hours_before != null ? Number(cfg.matchday_start_hours_before) : DEFAULT_LOCK_OFFSETS.startHoursBeforeMidweek),
    startHoursBeforeWeekend: cfg?.matchday_start_hours_before_weekend != null
      ? Number(cfg.matchday_start_hours_before_weekend)
      : (cfg?.matchday_start_hours_before != null ? Number(cfg.matchday_start_hours_before) : DEFAULT_LOCK_OFFSETS.startHoursBeforeWeekend),
    endHoursAfter: cfg?.matchday_end_hours_after != null
      ? Number(cfg.matchday_end_hours_after)
      : DEFAULT_LOCK_OFFSETS.endHoursAfter,
  }
}

function buildBody(lock: OutOfOrderLock, teams: string, active: boolean): string {
  const cuando = formatDateTime(lock.kickoff)
  const hasta = formatDateTime(lock.until)
  const contexto = `${teams} adelantan su partido de la J${lock.ownMatchday} al ${cuando}, antes de que se dispute la J${lock.playedSlot}.`

  const bloqueo = active
    ? `Sus jugadores están bloqueados: no se pueden fichar ni poner o quitar del once hasta el ${hasta}.`
    : `Sus jugadores quedarán bloqueados desde el ${formatDateTime(lock.from)} hasta el ${hasta}: no se podrán fichar ni cambiar durante ese tramo.`

  return `${contexto} ${bloqueo}`
}

/**
 * Avisos de partidos adelantados y suspendidos.
 * Se derivan de `fixtures` en cada petición.
 */
export async function getOutOfOrderMatchNotifications(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<BellNotification[]> {
  const [offsets, { data: leagueData }, { data: fixtures }] = await Promise.all([
    fetchLockOffsets(supabase),
    supabase.from('league_config').select('fantasy_starting_matchday').eq('id', 1).maybeSingle(),
    supabase
      .from('fixtures')
      .select('id,matchday,start_time,status,home_team_id,away_team_id'),
  ])

  if (!fixtures || fixtures.length === 0) return []

  const fantasyStart = leagueData?.fantasy_starting_matchday ?? 1
  const locks = computeOutOfOrderLocks(fixtures as FixtureLite[], offsets, fantasyStart)

  // Nos quedamos con los bloqueos vigentes y con los que empiezan pronto
  const relevant = locks.filter(l => {
    if (isLockActive(l, now)) return true
    const startsIn = l.from.getTime() - now.getTime()
    return startsIn > 0 && startsIn <= HEADS_UP_MS
  })

  // Partidos suspendidos / aplazados
  const postponedFixtures = fixtures.filter(f => {
    const s = (f.status || '').toLowerCase()
    return s === 'postponed' || s === 'suspended' || s === 'cancelled'
  })

  const teamIds = [
    ...new Set([
      ...relevant.flatMap(l => l.teamIds),
      ...postponedFixtures.flatMap(f => [f.home_team_id, f.away_team_id].filter(Boolean) as string[])
    ])
  ]

  const { data: teams } = teamIds.length > 0
    ? await supabase.from('real_teams').select('id, name').in('id', teamIds)
    : { data: [] }
  const nameById = new Map((teams || []).map(t => [t.id as string, t.name as string]))

  const result: BellNotification[] = []

  // 1. Notificaciones de partidos suspendidos/aplazados
  for (const pf of postponedFixtures) {
    const home = nameById.get(pf.home_team_id || '') || 'Equipo'
    const away = nameById.get(pf.away_team_id || '') || 'Equipo'
    const cuando = pf.start_time ? formatDateTime(new Date(pf.start_time)) : ''
    const fechaTexto = cuando ? ` (se jugará el ${cuando})` : ''
    result.push({
      id: `postponed-fx-${pf.id}`,
      type: 'match_postponed',
      title: `Partido suspendido (J${pf.matchday || 0})`,
      body: `${home} vs ${away}: el partido cambia de día por la suspensión${fechaTexto} y la jornada quedará finalizada cuando se acabe de jugar este partido.`,
      created_at: now.toISOString(),
      read_at: null,
    })
  }

  // 2. Notificaciones de partidos adelantados (bloqueos)
  relevant.sort((a, b) => a.from.getTime() - b.from.getTime())
  for (const lock of relevant) {
    const active = isLockActive(lock, now)
    const teamNames = lock.teamIds.map(id => nameById.get(id) || 'Equipo')
    const teamsStr = teamNames.join(' y ')
    result.push({
      id: `locked-fx-${lock.fixtureId}`,
      type: 'players_locked',
      title: active
        ? `Jugadores bloqueados: partido adelantado (J${lock.ownMatchday})`
        : `Próximo bloqueo: partido adelantado (J${lock.ownMatchday})`,
      body: buildBody(lock, teamsStr, active),
      created_at: now.toISOString(),
      read_at: null,
    })
  }

  return result
}
