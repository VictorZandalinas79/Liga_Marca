import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Particionado de la liga en divisiones.
 *
 * La liga se juega en 3 divisiones INDEPENDIENTES. Cada división es, a todos los
 * efectos, una liga completa: su propia clasificación, sus propias sanciones y su
 * propio reparto de pagos. La regla de exclusividad ("jugador de otro usuario")
 * solo mira a los rivales de la MISMA división.
 *
 * Este módulo es la única fuente de verdad de ese particionado. Todo lo que
 * calcule clasificaciones o sanciones debe recorrer `teamsByDivision` división a
 * división y no volver a filtrar `profiles.division` por su cuenta: cada filtro
 * duplicado es una oportunidad de que una vista se salte el aislamiento.
 *
 * La división se asigna antes de la primera jornada del juego y no cambia
 * durante la temporada, así que `profiles.division` basta como fuente de verdad
 * y el histórico se puede recalcular entero sin guardar a qué división
 * pertenecía cada usuario en cada jornada.
 */

export const DIVISION_IDS = [1, 2, 3] as const

/** Pestaña "Conjunta": las tres divisiones juntas, cada una calculada por separado. */
export const DIVISION_COMBINED = 0

export type DivisionId = (typeof DIVISION_IDS)[number]

export interface DivisionTeam {
  id: string
  user_id: string
  name: string
}

export interface DivisionMembership {
  /** Equipos de cada división, ya listos para calcular. Solo divisiones 1/2/3. */
  teamsByDivision: Map<DivisionId, DivisionTeam[]>
  /** División de cada usuario (`null` si no tiene ninguna asignada). */
  divisionByUser: Map<string, number | null>
  /** Perfiles indexados por id, para nombres. */
  profilesById: Map<string, { id: string; full_name?: string | null; email?: string | null }>
  /**
   * Usuarios con equipo pero sin división asignada. No entran en ninguna
   * clasificación ni generan sanciones: se asignan todas las divisiones antes de
   * la primera jornada, así que esto siempre indica un olvido del admin y se
   * muestra como aviso en el panel en lugar de dejarlos desaparecer en silencio.
   */
  unassignedUserIds: string[]
}

export function divisionLabel(d: number | null | undefined): string {
  if (d === DIVISION_COMBINED) return 'Conjunta'
  if (d === 1) return '1ª División'
  if (d === 2) return '2ª División'
  if (d === 3) return '3ª División'
  return 'Sin asignar'
}

export function isDivisionId(d: unknown): d is DivisionId {
  return d === 1 || d === 2 || d === 3
}

/**
 * Divisiones que hay que calcular para una selección dada.
 * `1|2|3` → solo esa. `0` (Conjunta), `null` o `undefined` → las tres.
 *
 * Nunca devuelve "todos los equipos juntos": no existe ningún camino que
 * calcule sanciones mezclando divisiones.
 */
export function divisionsToCompute(selected: number | null | undefined): DivisionId[] {
  return isDivisionId(selected) ? [selected] : [...DIVISION_IDS]
}

/** Carga el reparto de usuarios y equipos por división. Una sola consulta por tabla. */
export async function loadDivisionMembership(supabase: SupabaseClient): Promise<DivisionMembership> {
  const [{ data: profiles }, { data: teams }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, division'),
    supabase.from('user_teams').select('id, user_id, name'),
  ])

  const divisionByUser = new Map<string, number | null>()
  const profilesById = new Map<string, { id: string; full_name?: string | null; email?: string | null }>()
  for (const p of profiles ?? []) {
    const div = (p.division as number | null) ?? null
    divisionByUser.set(p.id as string, div ?? null)
    profilesById.set(p.id as string, { id: p.id as string, full_name: p.full_name, email: p.email })
  }

  const teamsByDivision = new Map<DivisionId, DivisionTeam[]>()
  for (const d of DIVISION_IDS) teamsByDivision.set(d, [])

  const unassigned = new Set<string>()
  for (const t of teams ?? []) {
    const team: DivisionTeam = { id: t.id as string, user_id: t.user_id as string, name: t.name as string }
    const div = divisionByUser.get(team.user_id) ?? null
    if (isDivisionId(div)) {
      teamsByDivision.get(div)!.push(team)
    } else {
      unassigned.add(team.user_id)
    }
  }

  return {
    teamsByDivision,
    divisionByUser,
    profilesById,
    unassignedUserIds: [...unassigned],
  }
}

export interface DivisionLockState {
  locked: boolean
  /** Momento en que se congelan (cierre de mercado de la primera jornada). `null` si aún no hay fixtures. */
  lockAt: string | null
  /** Jornada en la que arranca el juego. */
  startingMatchday: number
}

/**
 * Las divisiones se pueden cambiar hasta que cierra el mercado de la primera
 * jornada del juego; a partir de ahí quedan congeladas para toda la temporada.
 *
 * Es lo que permite tratar `profiles.division` como un dato fijo: una vez
 * empezada la liga nadie cambia de tabla, así que el histórico de sanciones se
 * puede recalcular entero sin guardar a qué división pertenecía cada usuario en
 * cada jornada. Mover a alguien después reescribiría multas ya cobradas —suyas y
 * de sus rivales, porque la exclusividad depende de con quién compartes tabla—,
 * y por eso se bloquea en el servidor y no solo en la interfaz.
 */
export async function getDivisionLockState(supabase: SupabaseClient): Promise<DivisionLockState> {
  const { data: cfg } = await supabase
    .from('league_config')
    .select('fantasy_starting_matchday, matchday_start_hours_before')
    .eq('id', 1)
    .maybeSingle()

  const startingMatchday = Math.max(1, cfg?.fantasy_starting_matchday ?? 1)
  const hoursBefore = cfg?.matchday_start_hours_before != null ? Number(cfg.matchday_start_hours_before) : 1

  const { data: firstFixture } = await supabase
    .from('fixtures')
    .select('start_time')
    .eq('matchday', startingMatchday)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!firstFixture?.start_time) {
    // Sin calendario todavía no ha podido empezar nada: siguen abiertas.
    return { locked: false, lockAt: null, startingMatchday }
  }

  const lockAt = new Date(new Date(firstFixture.start_time).getTime() - hoursBefore * 60 * 60 * 1000)
  return { locked: Date.now() >= lockAt.getTime(), lockAt: lockAt.toISOString(), startingMatchday }
}

/** Nombre visible de un usuario, con los mismos criterios en toda la app. */
export function userDisplayName(
  profile: { full_name?: string | null; email?: string | null } | null | undefined,
  fallback = 'Usuario'
): string {
  return profile?.full_name || profile?.email?.split('@')[0] || fallback
}
