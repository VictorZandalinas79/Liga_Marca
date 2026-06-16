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
  { key: 'yellow_card', label: 'Tarjeta amarilla', kind: 'single' },
  { key: 'second_yellow_card', label: 'Segunda amarilla', kind: 'single' },
  { key: 'red_card', label: 'Tarjeta roja', kind: 'single' },
]

// Etiquetas en español para los bonus por métrica (claves de `bonuses_per_X`).
export const BONUS_LABELS: Record<string, string> = {
  passes_completed: 'Pase completado',
  forward_passes: 'Pase hacia adelante',
  shots_on_target: 'Tiro a puerta',
  takeons_won: 'Regate completado',
  box_entries: 'Pase al área',
  recoveries_high: 'Recuperación (campo rival)',
  recoveries_med: 'Recuperación (centro)',
  recoveries_low: 'Recuperación (campo propio)',
  interceptions_high: 'Interceptación (campo rival)',
  interceptions_med: 'Interceptación (centro)',
  interceptions_low: 'Interceptación (campo propio)',
  clearances: 'Despeje',
  set_pieces_taken: 'Balón parado lanzado',
  successful_crosses: 'Centro bueno',
  long_balls_completed: 'Pase largo bueno',
}

// Etiqueta para cada penalización por métrica (claves de `penalties_per_X`).
export const PENALTY_LABELS: Record<string, string> = {
  lost_balls: 'Balón perdido (por pérdida)',
}

/** Devuelve un número de forma segura desde un objeto de reglas, o 0. */
export function num(obj: unknown, key: string): number {
  if (obj && typeof obj === 'object' && key in obj) {
    const v = (obj as Record<string, unknown>)[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return 0
}
