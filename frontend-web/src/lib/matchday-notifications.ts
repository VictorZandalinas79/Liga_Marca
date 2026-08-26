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
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fetchLockOffsets(supabase: SupabaseClient): Promise<LockOffsets> {
  const { data: cfg } = await supabase
    .from('league_config')
    .select('matchday_start_hours_before_midweek, matchday_start_hours_before_weekend, matchday_end_hours_after')
    .eq('id', 1)
    .maybeSingle()
  return {
    startHoursBeforeMidweek: cfg?.matchday_start_hours_before_midweek != null
      ? Number(cfg.matchday_start_hours_before_midweek)
      : DEFAULT_LOCK_OFFSETS.startHoursBeforeMidweek,
    startHoursBeforeWeekend: cfg?.matchday_start_hours_before_weekend != null
      ? Number(cfg.matchday_start_hours_before_weekend)
      : DEFAULT_LOCK_OFFSETS.startHoursBeforeWeekend,
    endHoursAfter: cfg?.matchday_end_hours_after != null
      ? Number(cfg.matchday_end_hours_after)
      : DEFAULT_LOCK_OFFSETS.endHoursAfter,
  }
}

function buildBody(lock: OutOfOrderLock, teams: string, active: boolean): string {
  const cuando = formatDateTime(lock.kickoff)
  const hasta = formatDateTime(lock.until)
  const contexto = lock.type === 'delayed'
    ? `${teams} juegan su partido de la J${lock.ownMatchday} el ${cuando}, cuando ya se está disputando la J${lock.playedSlot}.`
    : `${teams} adelantan su partido de la J${lock.ownMatchday} al ${cuando}, antes de que se dispute la J${lock.playedSlot}.`

  const bloqueo = active
    ? `Sus jugadores están bloqueados: no se pueden fichar ni poner o quitar del once hasta el ${hasta}.`
    : `Sus jugadores quedarán bloqueados desde el ${formatDateTime(lock.from)} hasta el ${hasta}: no se podrán fichar ni cambiar durante ese tramo.`

  return `${contexto} ${bloqueo}`
}

/**
 * Avisos de partidos intercalados entre jornadas (aplazados y adelantados) con
 * los equipos cuyos jugadores quedan bloqueados. Se derivan de `fixtures` en
 * cada petición, igual que el propio bloqueo, así aparecen y desaparecen solos
 * sin depender de que ningún script los inserte en base de datos.
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

  // Nos quedamos con los bloqueos vigentes y con los que empiezan pronto, para
  // que el usuario pueda reorganizar su once antes de que se le congele.
  const relevant = locks.filter(l => {
    if (isLockActive(l, now)) return true
    const startsIn = l.from.getTime() - now.getTime()
    return startsIn > 0 && startsIn <= HEADS_UP_MS
  })
  if (relevant.length === 0) return []

  const teamIds = [...new Set(relevant.flatMap(l => l.teamIds))]
  const { data: teams } = await supabase
    .from('real_teams')
    .select('id, name')
    .in('id', teamIds)
  const nameById = new Map((teams || []).map(t => [t.id as string, t.name as string]))

  // El bloqueo más inminente primero.
  relevant.sort((a, b) => a.from.getTime() - b.from.getTime())

  return relevant.map(lock => {
    const active = isLockActive(lock, now)
    const teamNames = lock.teamIds.map(id => nameById.get(id) || 'Equipo')
    const teams = teamNames.join(' y ')
    const motivo = lock.type === 'delayed' ? 'aplazado' : 'adelantado'
    return {
      // Id estable: el usuario lo marca como leído una vez y no le vuelve a
      // saltar mientras dure el bloqueo.
      id: `locked-fx-${lock.fixtureId}`,
      type: 'players_locked',
      title: active
        ? `Jugadores bloqueados: partido ${motivo} (J${lock.ownMatchday})`
        : `Próximo bloqueo: partido ${motivo} (J${lock.ownMatchday})`,
      body: buildBody(lock, teams, active),
      // Fecha actual (no la del bloqueo) para que no lo descarte el filtro de
      // "últimos 5 días" de la campana mientras siga siendo relevante.
      created_at: now.toISOString(),
      read_at: null,
    }
  })
}
