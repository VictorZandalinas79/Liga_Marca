// Metadatos para el editor del sistema de puntuación (página Admin).
//
// Las reglas viven en la tabla Supabase `scoring_config` (jsonb), sembrada
// desde scoring_rules.json. El editor sólo expone los valores numéricos
// editables; los metadatos (typeId, qualifierId, description, etc.) se
// preservan tal cual en el servidor. Aquí sólo definimos QUÉ se edita y con
// qué etiqueta, no los valores (que vienen del GET).

// El JSON tiene formas mixtas por clave, así que tipamos de forma laxa.
export type ScoringRules = Record<string, unknown>

export const POSITIONS = ['POR', 'DEF', 'MED', 'DEL'] as const
export type Position = (typeof POSITIONS)[number]

export const POSITION_LABELS: Record<Position, string> = {
  POR: 'Portero',
  DEF: 'Defensa',
  MED: 'Medio',
  DEL: 'Delantero',
}

export type EditableEvent = {
  key: string
  label: string
  // 'positional' → un valor por POR/DEF/MED/DEL ; 'single' → un único valor ('all')
  kind: 'positional' | 'single'
}

// Eventos editables (claves de `events`). El orden define el del formulario.
export const EDITABLE_EVENTS: EditableEvent[] = [
  { key: 'goal', label: 'Gol', kind: 'positional' },
  { key: 'clean_sheet', label: 'Portería a cero (≥60 min)', kind: 'positional' },
  { key: 'goal_conceded', label: 'Gol encajado (por gol)', kind: 'positional' },
  { key: 'assist_goal', label: 'Asistencia de gol', kind: 'single' },
  { key: 'assist_no_goal', label: 'Asistencia (sin gol)', kind: 'single' },
  { key: 'own_goal', label: 'Gol en propia', kind: 'single' },
  { key: 'penalty_won', label: 'Penalti provocado', kind: 'single' },
  { key: 'penalty_conceded', label: 'Penalti cometido', kind: 'single' },
  { key: 'penalty_save', label: 'Penalti parado', kind: 'single' },
  { key: 'penalty_missed', label: 'Penalti fallado', kind: 'single' },
  { key: 'save', label: 'Parada', kind: 'single' },
  { key: 'punch_ok', label: 'Despeje de puños (ok)', kind: 'single' },
  { key: 'punch_fail', label: 'Despeje de puños (fallido)', kind: 'single' },
  { key: 'claim', label: 'Blocaje', kind: 'single' },
  { key: 'sweeper', label: 'Salida del área', kind: 'single' },
  { key: 'yellow_card', label: 'Tarjeta amarilla', kind: 'positional' },
  { key: 'second_yellow_card', label: 'Segunda amarilla (roja)', kind: 'positional' },
  { key: 'red_card', label: 'Tarjeta roja directa', kind: 'positional' },
  { key: 'lost_balls', label: 'Balón perdido (por pérdida)', kind: 'single' },
]

// Etiquetas en español para los bonus por métrica (claves de `bonuses_per_X`).
export const BONUS_LABELS: Record<string, string> = {
  passes_completed: 'Pase completado',
  forward_passes: 'Pase hacia adelante',
  shots_on_target: 'Tiro a puerta',
  takeons_won: 'Regate completado',
  box_entries: 'Pases al área exitosos',
  ball_recoveries: 'Balón recuperado',
  interceptions_high: 'Interceptación (campo rival)',
  interceptions_med: 'Interceptación (centro)',
  interceptions_low: 'Interceptación (campo propio)',
  clearances: 'Despeje',
  set_pieces_taken: 'Balón parado lanzado',
  successful_crosses: 'Centro bueno',
  long_balls_completed: 'Pase largo bueno',
}



/** Devuelve un número de forma segura desde un objeto de reglas, o 0. */
export function num(obj: unknown, key: string): number {
  if (obj && typeof obj === 'object' && key in obj) {
    const v = (obj as Record<string, unknown>)[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return 0
}

// ============================================================================
// Tarifas resueltas para los DESGLOSES (página Jugador y Partido).
//
// Los componentes de desglose mostraban valores hardcodeados que no reflejaban
// las ediciones del Admin. `resolveRates` extrae las tarifas de las reglas de
// `scoring_config` (con DEFAULT_RATES como fallback), y `useScoringRules` las
// carga en cliente. Así el "× 0.05" junto a cada métrica refleja lo editado.
// ============================================================================

export interface ScoringRates {
  participation: { starter_bonus: number; substitute_bonus: number; minutes_threshold: number }
  goal: Record<Position, number>
  own_goal: number
  assist_goal: number
  assist_no_goal: number
  clean_sheet: Record<Position, number>
  goal_conceded: Record<Position, number>
  penalty_save: Record<Position, number>
  penalty_missed: number
  penalty_won: Record<Position, number>
  penalty_conceded: Record<Position, number>
  yellow_card: number
  second_yellow_card: number
  red_card: number

  per_unit: {
    saves: number
    punches_ok: number
    punches_fail: number
    claims: number
    sweepers: number
    shots_on_target: number
    takeons_won: number
    box_entries: number
    clearances: number
    passes_completed: number
    forward_passes: number
    set_pieces_taken: number
    successful_crosses: number
    ball_recoveries: number
    interceptions_high: number
    interceptions_med: number
    interceptions_low: number
    long_balls_completed: number
  }
  lost_balls: number
  relevo_rules: {
    participation_step_percent: number
    participation_points_per_step: number
    min_passes: number
    pass_accuracy_high: number
    pass_accuracy_excel: number
    pass_accuracy_low: number
    min_opp_half_passes: number
    opp_half_accuracy_high: number
    min_shots: number
    shot_accuracy_high: number
    min_duels: number
    duels_step_percent: number
    duels_points_per_step: number
    duels_won_high: number
    duels_won_low: number
    min_aerials: number
    aerials_won_high: number
    aerials_won_low: number
  }
}

// Valores por defecto (espejo de scoring_rules.json) usados como fallback.
export const DEFAULT_RATES: ScoringRates = {
  participation: { starter_bonus: 2, substitute_bonus: 1, minutes_threshold: 60 },
  goal: { POR: 6, DEF: 6, MED: 5, DEL: 4 },
  own_goal: -2,
  assist_goal: 3,
  assist_no_goal: 1,
  clean_sheet: { POR: 4, DEF: 3, MED: 2, DEL: 1 },
  goal_conceded: { POR: -2, DEF: -2, MED: -1, DEL: -1 },
  penalty_save: { POR: 3, DEF: 3, MED: 3, DEL: 3 },
  penalty_missed: -2,
  penalty_won: { POR: 2, DEF: 2, MED: 2, DEL: 2 },
  penalty_conceded: { POR: -1, DEF: -1, MED: -1, DEL: -1 },
  yellow_card: -1,
  second_yellow_card: -1,
  red_card: -3,
  per_unit: {
    saves: 0.5, punches_ok: 0.2, punches_fail: 0.1, claims: 0.1, sweepers: 0.1,
    shots_on_target: 0.3, takeons_won: 0.5, box_entries: 0.1, clearances: 0.5,
    passes_completed: 0.05, forward_passes: 0.2, set_pieces_taken: 0.2, successful_crosses: 0.3,
    ball_recoveries: 0.2,
    interceptions_high: 0.3, interceptions_med: 0.2, interceptions_low: 0.1,
    long_balls_completed: 0.5,
  },
  lost_balls: -0.1,
  relevo_rules: {
    participation_step_percent: 10,
    participation_points_per_step: 1,
    min_passes: 10,
    pass_accuracy_high: 85,
    pass_accuracy_excel: 92,
    pass_accuracy_low: 65,
    min_opp_half_passes: 10,
    opp_half_accuracy_high: 75,
    min_shots: 2,
    shot_accuracy_high: 50,
    min_duels: 5,
    duels_step_percent: 10,
    duels_points_per_step: 0.2,
    duels_won_high: 60,
    duels_won_low: 30,
    min_aerials: 3,
    aerials_won_high: 60,
    aerials_won_low: 30
  }
}

// Lee un valor de evento por posición (cae a 'all' y luego al fallback).
function eventVal(rules: ScoringRules | null, key: string, pos: Position, fallback: number): number {
  const events = rules?.events as Record<string, Record<string, unknown>> | undefined
  const rule = events?.[key]
  if (rule) {
    const v = rule[pos] ?? rule['all']
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return fallback
}

function bonusVal(rules: ScoringRules | null, key: string, fallback: number): number {
  const bonuses = rules?.bonuses_per_X as Record<string, Record<string, unknown>> | undefined
  const v = bonuses?.[key]?.points
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}



/** Construye las tarifas de desglose desde las reglas de scoring_config. */
export function resolveRates(rules: ScoringRules | null): ScoringRates {
  if (!rules) return DEFAULT_RATES
  const part = rules.participation as Record<string, unknown> | undefined
  const events = (rules.events as Record<string, Record<string, unknown>>) ?? {}
  const pn = (k: string, fb: number) => {
    const v = part?.[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : fb
  }
  const byPos = (key: string, d: Record<Position, number>): Record<Position, number> => ({
    POR: eventVal(rules, key, 'POR', d.POR),
    DEF: eventVal(rules, key, 'DEF', d.DEF),
    MED: eventVal(rules, key, 'MED', d.MED),
    DEL: eventVal(rules, key, 'DEL', d.DEL),
  })
  const d = DEFAULT_RATES
  return {
    participation: {
      starter_bonus: pn('starter_bonus', d.participation.starter_bonus),
      substitute_bonus: pn('substitute_bonus', d.participation.substitute_bonus),
      minutes_threshold: pn('minutes_threshold', d.participation.minutes_threshold),
    },
    goal: byPos('goal', d.goal),
    own_goal: eventVal(rules, 'own_goal', 'MED', d.own_goal),
    assist_goal: eventVal(rules, 'assist_goal', 'MED', d.assist_goal),
    assist_no_goal: eventVal(rules, 'assist_no_goal', 'MED', d.assist_no_goal),
    clean_sheet: byPos('clean_sheet', d.clean_sheet),
    goal_conceded: byPos('goal_conceded', d.goal_conceded),
    penalty_save: byPos('penalty_save', d.penalty_save),
    penalty_missed: eventVal(rules, 'penalty_missed', 'MED', d.penalty_missed),
    penalty_won: byPos('penalty_won', d.penalty_won),
    penalty_conceded: byPos('penalty_conceded', d.penalty_conceded),
    yellow_card: eventVal(rules, 'yellow_card', 'MED', d.yellow_card),
    second_yellow_card: eventVal(rules, 'second_yellow_card', 'MED', d.second_yellow_card),
    red_card: eventVal(rules, 'red_card', 'MED', d.red_card),
    per_unit: {
      saves: eventVal(rules, 'save', 'MED', d.per_unit.saves),
      punches_ok: eventVal(rules, 'punch_ok', 'MED', d.per_unit.punches_ok),
      punches_fail: eventVal(rules, 'punch_fail', 'MED', d.per_unit.punches_fail),
      claims: eventVal(rules, 'claim', 'MED', d.per_unit.claims),
      sweepers: eventVal(rules, 'sweeper', 'MED', d.per_unit.sweepers),
      shots_on_target: bonusVal(rules, 'shots_on_target', d.per_unit.shots_on_target),
      takeons_won: bonusVal(rules, 'takeons_won', d.per_unit.takeons_won),
      box_entries: bonusVal(rules, 'box_entries', d.per_unit.box_entries),
      clearances: bonusVal(rules, 'clearances', d.per_unit.clearances),
      passes_completed: bonusVal(rules, 'passes_completed', d.per_unit.passes_completed),
      forward_passes: bonusVal(rules, 'forward_passes', d.per_unit.forward_passes),
      set_pieces_taken: bonusVal(rules, 'set_pieces_taken', d.per_unit.set_pieces_taken),
      successful_crosses: bonusVal(rules, 'successful_crosses', d.per_unit.successful_crosses),
      ball_recoveries: bonusVal(rules, 'ball_recoveries', d.per_unit.ball_recoveries),
      interceptions_high: bonusVal(rules, 'interceptions_high', d.per_unit.interceptions_high),
      interceptions_med: bonusVal(rules, 'interceptions_med', d.per_unit.interceptions_med),
      interceptions_low: bonusVal(rules, 'interceptions_low', d.per_unit.interceptions_low),
      long_balls_completed: bonusVal(rules, 'long_balls_completed', d.per_unit.long_balls_completed),
    },
    lost_balls: num(events.lost_balls, 'all') || d.lost_balls,
    relevo_rules: (rules.relevo_rules as ScoringRates['relevo_rules']) ?? d.relevo_rules,
  }
}
