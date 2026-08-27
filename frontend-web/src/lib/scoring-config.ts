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
  { key: 'clean_sheet', label: 'Portería a cero (≥59 min)', kind: 'positional' },
  { key: 'goal_conceded', label: 'Gol encajado (penaliza si recibe 2 o más)', kind: 'positional' },
  { key: 'assist_goal', label: 'Asistencia de gol', kind: 'single' },
  { key: 'assist_no_goal', label: 'Asistencia (sin gol)', kind: 'single' },
  { key: 'own_goal', label: 'Gol en propia', kind: 'single' },
  { key: 'penalty_won', label: 'Penalti provocado', kind: 'single' },
  { key: 'penalty_conceded', label: 'Penalti cometido', kind: 'single' },
  { key: 'penalty_save', label: 'Penalti parado', kind: 'single' },
  { key: 'penalty_missed', label: 'Penalti fallado', kind: 'single' },
  { key: 'save', label: 'Parada', kind: 'single' },
  { key: 'yellow_card', label: 'Tarjeta amarilla', kind: 'positional' },
  { key: 'second_yellow_card', label: 'Segunda amarilla (roja)', kind: 'positional' },
  { key: 'red_card', label: 'Tarjeta roja directa', kind: 'positional' },
  { key: 'lost_balls', label: 'Balón perdido (por pérdida)', kind: 'single' },
  { key: 'clearances', label: 'Despeje', kind: 'single' },
  { key: 'shots_on_target', label: 'Tiro a puerta', kind: 'single' },
  { key: 'takeons_won', label: 'Regate completado', kind: 'single' },
  { key: 'box_entries', label: 'Balones al área', kind: 'single' },
  { key: 'ball_recoveries', label: 'Balón recuperado', kind: 'single' },
]


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

// ---------------------------------------------------------------------------
// Puntos RELEVO: 4 bloques por posición, 1 punto por bloque superado y -1 si no
// se supera ninguno. Los umbrales viven en `relevo_limits` (editables en Admin)
// y el motor es trigger_descarga_eventos.py::calculate_relevo_points.
// ---------------------------------------------------------------------------

/** Umbrales por posición. Claves `*_per_min` se escalan por minutos jugados; `*_pct` son porcentajes. */
export type RelevoLimits = Record<Position, Record<string, number>>

export const DEFAULT_RELEVO_LIMITS: RelevoLimits = {
  POR: {
    pass_completed_per_min: 0.18,
    saves_per_min: 0.01,
    calidad_parada_divisor: 3.0,
    long_passes_per_min_b2: 0.04,
    long_passes_flat: 6,
    block_punch_per_min: 0.02,
    sweeper_cover_per_min: 0.02,
    saves_gte_07_count: 2,
    saves_per_min_b4: 0.03,
  },
  DEF: {
    def_actions_per_min: 0.07,
    pass_pct: 70,
    long_passes_per_min: 0.03,
    forward_passes_per_min: 0.03,
    ground_duels_pct: 55,
    aerials_pct: 75,
    recoveries_per_min: 0.10,
    abp_remates_per_min: 0.01,
    crosses_per_min: 0.02,
    off_actions_3_4_per_min: 0.20,
    total_duels_pct: 90,
  },
  MED: {
    def_actions_opp_per_min: 0.01,
    pass_pct: 66,
    aerials_pct: 45,
    recoveries_opp_per_min: 0.03,
    fwd_long_pct: 10,
    shots_on_pct: 66,
    off_actions_opp_per_min: 0.85,
    intercept_recup_3_4_per_min: 0.02,
    assists_total: 3,
    takeons_pct: 75,
  },
  DEL: {
    final_third_events_per_min: 0.09,
    recoveries_opp_per_min: 0.009,
    aerials_pct: 40,
    shots_on_target_count: 1,
    shots_on_pct: 70,
    takeons_pct: 75,
    assists_total: 3,
    off_actions_opp_per_min: 0.40,
  },
}

/** Fila de player_scores (o cualquier objeto con esas columnas). */
type ScoreRow = Record<string, unknown>

export interface RelevoMetricSpec {
  label: string
  /** 'count' → unidades por minuto ; 'pct' → porcentaje ; 'flat' → cantidad fija absoluta */
  unit: 'count' | 'pct' | 'flat'
  /** Valor logrado por el jugador. */
  value: (s: ScoreRow) => number
  /** Mínimo exigido, dados los umbrales de su posición, los minutos jugados y la fila del jugador. */
  target: (lim: Record<string, number>, mins: number, s: ScoreRow) => number
  /** El motor usa `>=` en los acumulados y `>` estricto en los porcentajes. */
  cmp: 'gte' | 'gt'
  /** Detalle opcional para el desglose, p. ej. "8/14". */
  detail?: (s: ScoreRow) => string
  /** Descripción del umbral para la página de Puntuación. */
  describe: (lim: Record<string, number>) => string
  /** Función opcional para forzar el fallo si no se cumple un mínimo absoluto. */
  forceFail?: (s: ScoreRow) => boolean
}

export interface RelevoOptionSpec {
  /** Si es true hay que cumplir TODAS las métricas; si no, basta con una. */
  requireAll?: boolean
  metrics: RelevoMetricSpec[]
}

export interface RelevoBlockSpec {
  id: 1 | 2 | 3 | 4
  title: string
  note?: string
  /** Basta con superar UNA de las opciones para llevarse el punto. */
  options: RelevoOptionSpec[]
}

const n = (s: ScoreRow, k: string): number => Number(s?.[k]) || 0
const pct = (won: number, total: number): number => (total > 0 ? (won / total) * 100 : 0)

/** Mínimo de una métrica acumulativa: la tasa por minuto escalada a los minutos jugados. */
const perMin = (key: string, fallback: number) => (lim: Record<string, number>, mins: number) =>
  (lim?.[key] ?? fallback) * mins

const flat = (key: string, fallback: number) => (lim: Record<string, number>, _mins?: number) => lim?.[key] ?? fallback

/** % con mínimo de muestra: si no se alcanza el mínimo, el valor es 0 (no cumple). */
const pctMin = (label: string, wonKey: string, totalFn: (s: ScoreRow) => number, limKey: string, fallback: number, min: number, cmp: 'gte' | 'gt' = 'gt'): RelevoMetricSpec => ({
  label: `${label} (mín. ${min})`,
  unit: 'pct',
  value: (s) => {
    const total = totalFn(s)
    return total >= min ? pct(n(s, wonKey), total) : 0
  },
  target: flat(limKey, fallback),
  cmp,
  detail: (s) => `${n(s, wonKey)}/${totalFn(s)} (mín. ${min})`,
  describe: (lim) => `${cmp === 'gt' ? 'más del' : 'al menos el'} ${lim?.[limKey] ?? fallback}% de "${label}" (mín. ${min})`,
})

const aerialsTotal = (s: ScoreRow) => n(s, 'aerials_won') + n(s, 'aerials_lost')
const groundDuelsTotal = (s: ScoreRow) => n(s, 'ground_duels_total')
const takeonsTotal = (s: ScoreRow) => n(s, 'takeons_won') + n(s, 'takeons_lost')

const aerialsPct = (fallback: number, min = 3, cmp: 'gte' | 'gt' = 'gt') =>
  pctMin('Duelos aéreos ganados', 'aerials_won', aerialsTotal, 'aerials_pct', fallback, min, cmp)

const groundDuelsPct = (fallback: number, min = 3, cmp: 'gte' | 'gt' = 'gt') =>
  pctMin('Duelos por el suelo ganados', 'ground_duels_won', groundDuelsTotal, 'ground_duels_pct', fallback, min, cmp)

const shotsOnPct = (fallback: number, min: number, cmp: 'gte' | 'gt' = 'gt') =>
  pctMin('Remates a puerta', 'shots_on_target', (s) => n(s, 'shots_total'), 'shots_on_pct', fallback, min, cmp)

const takeonsPct = (fallback: number, min = 2, cmp: 'gte' | 'gt' = 'gt') =>
  pctMin('Regates completados', 'takeons_won', takeonsTotal, 'takeons_pct', fallback, min, cmp)

const perMinMetric = (label: string, valueKey: string, limKey: string, fallback: number, cmp: 'gte' | 'gt' = 'gte'): RelevoMetricSpec => ({
  label,
  unit: 'count',
  value: (s) => n(s, valueKey),
  target: perMin(limKey, fallback),
  cmp,
  describe: (lim) => `${lim?.[limKey] ?? fallback} ${label.toLowerCase()} por minuto jugado`,
})

const perMinMetricMinCount = (label: string, valueKey: string, limKey: string, fallback: number, minCount: number, cmp: 'gte' | 'gt' = 'gte'): RelevoMetricSpec => ({
  label: `${label} (mín. ${minCount})`,
  unit: 'count',
  value: (s) => n(s, valueKey),
  target: perMin(limKey, fallback),
  cmp,
  detail: (s) => `${n(s, valueKey)} (mín. ${minCount})`,
  describe: (lim) => `${lim?.[limKey] ?? fallback} ${label.toLowerCase()} por minuto jugado (mín. ${minCount})`,
  forceFail: (s) => n(s, valueKey) < minCount,
})

const goalsAtLeast1: RelevoMetricSpec = {
  label: 'Goles',
  unit: 'count',
  value: (s) => n(s, 'goals'),
  target: () => 1,
  cmp: 'gte',
  describe: () => 'al menos 1 gol',
}

const assistsTotal = (fallback: number): RelevoMetricSpec => ({
  label: 'Asistencias totales',
  unit: 'count',
  value: (s) => n(s, 'assists') + n(s, 'fantasy_assist') + n(s, 'intent_assists'),
  target: flat('assists_total', fallback),
  cmp: 'gte',
  describe: (lim) => `${lim?.assists_total ?? fallback} o más asistencias totales`,
})

/** Espejo exacto de calculate_relevo_points en trigger_descarga_eventos.py (v4). */
export const RELEVO_BLOCKS: Record<Position, RelevoBlockSpec[]> = {
  POR: [
    {
      id: 1,
      title: 'Volumen de juego',
      options: [{ metrics: [
        perMinMetric('Pases completados', 'passes_completed', 'pass_completed_per_min', 0.18),
        perMinMetric('Paradas', 'saves', 'saves_per_min', 0.01),
      ] }],
    },
    {
      id: 2,
      title: 'Calidad de parada',
      note: 'Cada parada suma un valor según la zona desde la que se remató; el valor acumulado debe superar un tercio del número de paradas realizadas.',
      options: [{ metrics: [
        {
          label: 'Valor de calidad acumulado',
          unit: 'count',
          value: (s) => n(s, 'calidad_parada'),
          target: (lim, _mins, s) => n(s, 'saves') / (lim?.calidad_parada_divisor ?? 3.0),
          cmp: 'gt',
          detail: (s) => `${n(s, 'calidad_parada')} / (${n(s, 'saves')} paradas ÷ ${DEFAULT_RELEVO_LIMITS.POR.calidad_parada_divisor ?? 3.0})`,
          describe: (lim) => `El valor acumulado de calidad de las paradas debe ser estrictamente mayor a (Total de Paradas ÷ ${lim?.calidad_parada_divisor ?? 3.0})`,
        },
      ] }],
    },
    {
      id: 3,
      title: 'Distribución y salidas',
      options: [{ metrics: [
        {
          label: 'Pases largos completados (por partido)',
          unit: 'flat',
          value: (s) => n(s, 'long_balls_completed'),
          target: flat('long_passes_flat', 6),
          cmp: 'gte',
          describe: (lim) => `${lim?.long_passes_flat ?? 6} o más pases largos completados en el partido`,
        },
        {
          label: 'Blocajes + puños',
          unit: 'count',
          value: (s) => n(s, 'claims_ok') + n(s, 'punches_ok') + n(s, 'punches_fail'),
          target: perMin('block_punch_per_min', 0.02),
          cmp: 'gte',
          describe: (lim) => `(blocajes + puños) por minuto jugado ≥ ${lim?.block_punch_per_min ?? 0.02}`,
        },
        {
          label: 'Salidas + cubrir y blocar',
          unit: 'count',
          value: (s) => n(s, 'sweepers_ok') + n(s, 'cubrir_balon_blocar'),
          target: perMin('sweeper_cover_per_min', 0.02),
          cmp: 'gte',
          describe: (lim) => `(salidas fuera del área + cubrir balón y blocar) por minuto jugado ≥ ${lim?.sweeper_cover_per_min ?? 0.02}`,
        },
      ] }],
    },
    {
      id: 4,
      title: 'Paradas decisivas',
      options: [{ metrics: [
        {
          label: 'Paradas de calidad ≥ 0.7',
          unit: 'count',
          value: (s) => n(s, 'saves_gte_07'),
          target: flat('saves_gte_07_count', 2),
          cmp: 'gte',
          describe: (lim) => `${lim?.saves_gte_07_count ?? 2} o más paradas de calidad ≥ 0.7`,
        },
        {
          label: 'Paradas/min + portería a cero (mín. 2 paradas)',
          unit: 'count',
          value: (s) => (n(s, 'goals_conceded') === 0 && n(s, 'saves') >= 2 ? n(s, 'saves') / 90 : 0),
          target: flat('saves_per_min_b4', 0.03),
          cmp: 'gt',
          detail: (s) => `${n(s, 'saves')} paradas, ${n(s, 'goals_conceded')} encajados`,
          describe: (lim) => `paradas/min > ${lim?.saves_per_min_b4 ?? 0.03}, portería a cero y mín. 2 paradas`,
        },
      ] }],
    },
  ],
  DEF: [
    {
      id: 1,
      title: 'Presencia defensiva',
      options: [{ metrics: [
        perMinMetric('Acciones defensivas', 'def_actions_12_8_49_42_7', 'def_actions_per_min', 0.07),
        {
          label: 'Acierto en el pase (total)',
          unit: 'pct',
          value: (s) => pct(n(s, 'passes_completed'), n(s, 'passes_attempted')),
          target: flat('pass_pct', 70),
          cmp: 'gt',
          detail: (s) => `${n(s, 'passes_completed')}/${n(s, 'passes_attempted')}`,
          describe: (lim) => `más del ${lim?.pass_pct ?? 70}% de acierto en el pase`,
        },
      ] }],
    },
    {
      id: 2,
      title: 'Salida de balón',
      options: [{ metrics: [
        perMinMetricMinCount('Pases largos completados', 'long_balls_completed', 'long_passes_per_min', 0.03, 3),
        perMinMetricMinCount('Pases hacia adelante', 'forward_passes', 'forward_passes_per_min', 0.03, 3),
        groundDuelsPct(55, 3, 'gt'),
        aerialsPct(75, 3, 'gte'),
      ] }],
    },
    {
      id: 3,
      title: 'Duelos y recuperaciones',
      options: [{ metrics: [
        perMinMetric('Recuperaciones', 'recoveries_49', 'recoveries_per_min', 0.10),
        perMinMetric('Remates a balón parado', 'set_piece_shots', 'abp_remates_per_min', 0.01),
        perMinMetricMinCount('Centros buenos', 'successful_crosses', 'crosses_per_min', 0.02, 2),
      ] }],
    },
    {
      id: 4,
      title: 'Aportación ofensiva',
      options: [{ metrics: [
        perMinMetric('Acciones ofensivas en 3/4', 'off_actions_3_4_outcome_1', 'off_actions_3_4_per_min', 0.20),
        {
          label: 'Duelos totales ganados (mín. 5)',
          unit: 'pct',
          value: (s) => {
            const total = aerialsTotal(s) + groundDuelsTotal(s)
            return total >= 10 ? pct(n(s, 'aerials_won') + n(s, 'ground_duels_won'), total) : 0
          },
          target: flat('total_duels_pct', 90),
          cmp: 'gt',
          detail: (s) => `${n(s, 'aerials_won') + n(s, 'ground_duels_won')}/${aerialsTotal(s) + groundDuelsTotal(s)} (mín. 10)`,
          describe: (lim) => `más del ${lim?.total_duels_pct ?? 90}% de duelos totales (aéreo + suelo) ganados (mín. 10 duelos)`,
        },
      ] }],
    },
  ],
  MED: [
    {
      id: 1,
      title: 'Presencia defensiva y pase',
      options: [{ metrics: [
        perMinMetric('Acciones defensivas en campo rival', 'def_actions_opp_half_12_8_49_42_7', 'def_actions_opp_per_min', 0.01),
        {
          label: 'Acierto en el pase (total)',
          unit: 'pct',
          value: (s) => pct(n(s, 'passes_completed'), n(s, 'passes_attempted')),
          target: flat('pass_pct', 66),
          cmp: 'gte',
          detail: (s) => `${n(s, 'passes_completed')}/${n(s, 'passes_attempted')}`,
          describe: (lim) => `al menos el ${lim?.pass_pct ?? 66}% de acierto en el pase`,
        },
      ] }],
    },
    {
      id: 2,
      title: 'Duelos y recuperaciones',
      options: [{ metrics: [
        aerialsPct(45, 3, 'gte'),
        perMinMetric('Recuperaciones en campo rival', 'recoveries_opp_half', 'recoveries_opp_per_min', 0.03),
        {
          label: 'Pases adelante + largos (% sobre intentados)',
          unit: 'pct',
          value: (s) => pct(n(s, 'forward_passes') + n(s, 'long_balls_completed'), n(s, 'passes_attempted')),
          target: flat('fwd_long_pct', 10),
          cmp: 'gt',
          describe: (lim) => `más del ${lim?.fwd_long_pct ?? 10}% de pases adelante + largos sobre los intentados`,
        },
      ] }],
    },
    {
      id: 3,
      title: 'Desequilibrio',
      options: [{ metrics: [
        shotsOnPct(66, 2, 'gt'),
        perMinMetric('Acciones ofensivas en campo rival', 'off_actions_opp_half_outcome_1', 'off_actions_opp_per_min', 0.85),
        perMinMetric('Interceptaciones + recuperaciones en 3/4', 'intercept_recup_3_4', 'intercept_recup_3_4_per_min', 0.02),
      ] }],
    },
    {
      id: 4,
      title: 'Generación de juego',
      options: [{ metrics: [goalsAtLeast1, assistsTotal(3), takeonsPct(75, 2, 'gt')] }],
    },
  ],
  DEL: [
    {
      id: 1,
      title: 'Participación en 3/4 de campo',
      options: [{ metrics: [
        perMinMetric('Participaciones en 3/4 de campo', 'final_third_events', 'final_third_events_per_min', 0.09),
        perMinMetric('Recuperaciones en campo rival', 'recoveries_opp_half', 'recoveries_opp_per_min', 0.009),
      ] }],
    },
    {
      id: 2,
      title: 'Presión y juego aéreo',
      options: [{ metrics: [
        aerialsPct(40, 3, 'gt'),
        {
          label: 'Tiros a puerta',
          unit: 'flat',
          value: (s) => n(s, 'shots_on_target'),
          target: flat('shots_on_target_count', 1),
          cmp: 'gte',
          describe: (lim) => `${lim?.shots_on_target_count ?? 1} o más tiros a puerta`,
        },
      ] }],
    },
    {
      id: 3,
      title: 'Definición',
      options: [{ metrics: [shotsOnPct(70, 3, 'gt'), takeonsPct(75, 2, 'gt')] }],
    },
    {
      id: 4,
      title: 'Aportación al ataque',
      options: [{ metrics: [
        goalsAtLeast1,
        assistsTotal(3),
        perMinMetric('Acciones ofensivas en campo rival', 'off_actions_opp_half_outcome_1', 'off_actions_opp_per_min', 0.40),
      ] }],
    },
  ],
}

export interface RelevoMetricResult {
  label: string
  unit: 'count' | 'pct' | 'flat'
  value: number
  target: number
  met: boolean
  detail?: string
}

export interface RelevoBlockResult {
  id: number
  title: string
  note?: string
  points: number
  metrics: RelevoMetricResult[]
}

/**
 * Evalúa los 4 bloques de un jugador en un partido. Reproduce el motor Python
 * para poder mostrar CADA métrica (logrado vs. exigido) junto al punto del
 * bloque, que se toma de la BD (`relevo_block_N_pts`) cuando está disponible.
 */
export function evaluateRelevoBlocks(
  score: ScoreRow,
  pos: Position,
  limits: RelevoLimits,
): RelevoBlockResult[] {
  const lim = limits?.[pos] ?? DEFAULT_RELEVO_LIMITS[pos]
  const mins = Number(score?.minutes_played) || 0

  return RELEVO_BLOCKS[pos].map((block) => {
    const metrics: RelevoMetricResult[] = []
    let met = false

    for (const option of block.options) {
      const results = option.metrics.map((m) => {
        const target = m.target(lim, mins, score)
        const value = m.value(score)
        const forced = m.forceFail?.(score) ?? false
        const passes = !forced && (m.cmp === 'gte' ? value >= target : value > target)
        return {
          label: m.label,
          unit: m.unit,
          value,
          target,
          met: passes,
          detail: m.detail?.(score),
        }
      })
      metrics.push(...results)
      const optionMet = option.requireAll ? results.every((r) => r.met) : results.some((r) => r.met)
      if (optionMet) met = true
    }

    // El punto real lo manda la BD si el partido ya se sincronizó con el motor v4.
    const stored = score?.[`relevo_block_${block.id}_pts`]
    const points = stored === undefined || stored === null ? (met ? 1 : 0) : Number(stored) || 0

    return { id: block.id, title: block.title, note: block.note, points, metrics }
  })
}

export interface ScoringRates {
  participation: { starter_bonus: number; substitute_bonus: number; minutes_threshold: number; win_bonus_60: number; draw_bonus_60: number }
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

  // Métricas que puntúan por unidad. Desde el sistema v4 sólo son estas cinco:
  // el resto (pases, recuperaciones, interceptaciones, centros…) dejó de dar
  // puntos sueltos y ahora sólo influye a través de los bloques RELEVO.
  per_unit: {
    saves: number
    clearances: number
    shots_on_target: number
    takeons_won: number
    box_entries: number
    passes_completed: number
    forward_passes: number
    recoveries_high: number
    recoveries_med: number
    recoveries_low: number
    interceptions_high: number
    interceptions_med: number
    interceptions_low: number
    set_pieces_taken: number
    successful_crosses: number
    long_balls_completed: number
    ball_recoveries: number
  }
  lost_balls: number
  relevo_limits: RelevoLimits
}

// Valores por defecto (espejo de scoring_rules.json) usados como fallback.
export const DEFAULT_RATES: ScoringRates = {
  participation: { starter_bonus: 2, substitute_bonus: 1, minutes_threshold: 59, win_bonus_60: 1, draw_bonus_60: 0.5 },
  goal: { POR: 6, DEF: 6, MED: 5, DEL: 4 },
  own_goal: -2,
  assist_goal: 3,
  assist_no_goal: 1,
  clean_sheet: { POR: 4, DEF: 3, MED: 2, DEL: 1 },
  goal_conceded: { POR: -1, DEF: -1, MED: -0.5, DEL: -0.5 },
  penalty_save: { POR: 3, DEF: 3, MED: 3, DEL: 3 },
  penalty_missed: -2,
  penalty_won: { POR: 2, DEF: 2, MED: 2, DEL: 2 },
  penalty_conceded: { POR: -1, DEF: -1, MED: -1, DEL: -1 },
  yellow_card: -1,
  second_yellow_card: -1,
  red_card: -3,
  per_unit: {
    saves: 0.5, clearances: 0.5, shots_on_target: 0.3, takeons_won: 0.5, box_entries: 0.1,
    passes_completed: 0.05, forward_passes: 0.2, recoveries_high: 0.3, recoveries_med: 0.2,
    recoveries_low: 0.1, interceptions_high: 0.3, interceptions_med: 0.2, interceptions_low: 0.1,
    set_pieces_taken: 0.2, successful_crosses: 0.3, long_balls_completed: 0.5, ball_recoveries: 0.1,
  },
  lost_balls: -0.1,
  relevo_limits: DEFAULT_RELEVO_LIMITS,
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

/** Umbrales RELEVO desde las reglas, completando con los defaults lo que falte. */
function resolveRelevoLimits(rules: ScoringRules | null): RelevoLimits {
  const stored = rules?.relevo_limits as Record<string, unknown> | undefined
  const out = {} as RelevoLimits
  for (const pos of POSITIONS) {
    const posLimits = stored?.[pos]
    const merged: Record<string, number> = { ...DEFAULT_RELEVO_LIMITS[pos] }
    if (posLimits && typeof posLimits === 'object') {
      for (const [k, v] of Object.entries(posLimits as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) merged[k] = v
      }
    }
    out[pos] = merged
  }
  return out
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
      win_bonus_60: pn('win_bonus_60', d.participation.win_bonus_60),
      draw_bonus_60: pn('draw_bonus_60', d.participation.draw_bonus_60),
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
      clearances: num(rules?.bonuses_per_X as any, 'clearances') || num(events.clearances, 'all') || d.per_unit.clearances,
      shots_on_target: num(rules?.bonuses_per_X as any, 'shots_on_target') || num(events.shots_on_target, 'all') || d.per_unit.shots_on_target,
      takeons_won: num(rules?.bonuses_per_X as any, 'takeons_won') || num(events.takeons_won, 'all') || d.per_unit.takeons_won,
      box_entries: num(rules?.bonuses_per_X as any, 'box_entries') || num(events.box_entries, 'all') || d.per_unit.box_entries,
      passes_completed: num(rules?.bonuses_per_X as any, 'passes_completed') || d.per_unit.passes_completed,
      forward_passes: num(rules?.bonuses_per_X as any, 'forward_passes') || d.per_unit.forward_passes,
      recoveries_high: num(rules?.bonuses_per_X as any, 'recoveries_high') || d.per_unit.recoveries_high,
      recoveries_med: num(rules?.bonuses_per_X as any, 'recoveries_med') || d.per_unit.recoveries_med,
      recoveries_low: num(rules?.bonuses_per_X as any, 'recoveries_low') || d.per_unit.recoveries_low,
      interceptions_high: num(rules?.bonuses_per_X as any, 'interceptions_high') || d.per_unit.interceptions_high,
      interceptions_med: num(rules?.bonuses_per_X as any, 'interceptions_med') || d.per_unit.interceptions_med,
      interceptions_low: num(rules?.bonuses_per_X as any, 'interceptions_low') || d.per_unit.interceptions_low,
      set_pieces_taken: num(rules?.bonuses_per_X as any, 'set_pieces_taken') || d.per_unit.set_pieces_taken,
      successful_crosses: num(rules?.bonuses_per_X as any, 'successful_crosses') || d.per_unit.successful_crosses,
      long_balls_completed: num(rules?.bonuses_per_X as any, 'long_balls_completed') || d.per_unit.long_balls_completed,
      ball_recoveries: num(rules?.bonuses_per_X as any, 'ball_recoveries') || num(events.ball_recoveries, 'all') || d.per_unit.ball_recoveries,
    },
    lost_balls: num(events.lost_balls, 'all') || d.lost_balls,
    relevo_limits: resolveRelevoLimits(rules),
  }
}

