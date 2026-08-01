import {
  Clock,
  Trophy,
  ShieldCheck,
  CreditCard,
  Sparkles,
  Ban,
  Gauge,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveRates, type ScoringRules } from '@/lib/scoring-config'
import { DEFAULT_LEAGUE_CONFIG } from '@/lib/league-config-types'
import { Coins } from 'lucide-react'

export const metadata = {
  title: 'Sistema de Puntuación',
}

// Pequeña etiqueta de puntos: verde para positivos, rojo para negativos.
function Pts({ value }: { value: string }) {
  const negative = value.trim().startsWith('-')
  return (
    <span
      className={`inline-block min-w-[3.25rem] text-center rounded-md px-2 py-0.5 text-sm font-bold ${
        negative ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
      }`}
    >
      {value}
    </span>
  )
}

type Row = { accion: string; detalle?: string; pts: string }

function PointsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{r.accion}</p>
            {r.detalle && <p className="text-xs text-slate-500">{r.detalle}</p>}
          </div>
          <Pts value={r.pts} />
        </div>
      ))}
    </div>
  )
}

function Section({
  icon: Icon,
  number,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  number: number
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-slate-50 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
            Apartado {number}
          </p>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </Card>
  )
}

function formatPts(val: number): string {
  if (val === 0) return '0'
  return val > 0 ? `+${val}` : `${val}`
}

export default async function PuntuacionPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('scoring_config').select('rules').eq('id', 1).maybeSingle()
  const rules = (data?.rules as ScoringRules) || null
  const rates = resolveRates(rules)
  
  const { data: configData } = await supabase.from('league_config').select('*').eq('id', 1).maybeSingle()
  const leagueConfig = { ...DEFAULT_LEAGUE_CONFIG, ...(configData || {}) }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Cabecera */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Sistema de Puntuación</h1>
        <p className="mt-1 text-slate-600">
          Cómo se calculan los puntos de cada jugador en cada jornada.
        </p>
      </div>

      {/* 1. Participación */}
      <Section
        icon={Clock}
        number={1}
        title="Participación Básica (Fija)"
        description="Puntos iniciales según los minutos disputados en el encuentro."
      >
        <PointsTable
          rows={[
            { accion: `Menos de ${rates.participation.minutes_threshold} minutos jugados`, pts: formatPts(rates.participation.substitute_bonus) },
            { accion: `${rates.participation.minutes_threshold} minutos o más jugados`, pts: formatPts(rates.participation.starter_bonus) },
          ]}
        />
      </Section>

      {/* 2. Goles, asistencias y penaltis */}
      <Section
        icon={Trophy}
        number={2}
        title="Goles, Asistencias y Penaltis"
        description="Puntos por acciones directas de ataque y penaltis."
      >
        <PointsTable
          rows={[
            { accion: 'Gol marcado', detalle: 'Portero (POR)', pts: formatPts(rates.goal.POR) },
            { accion: 'Gol marcado', detalle: 'Defensa (DEF)', pts: formatPts(rates.goal.DEF) },
            { accion: 'Gol marcado', detalle: 'Mediocentro (MED)', pts: formatPts(rates.goal.MED) },
            { accion: 'Gol marcado', detalle: 'Delantero (DEL)', pts: formatPts(rates.goal.DEL) },
            { accion: 'Asistencia de gol', detalle: 'Último pase que acaba en gol', pts: formatPts(rates.assist_goal) },
            {
              accion: 'Asistencia sin gol / Pase clave',
              detalle: 'Pase que asiste un remate sin acabar en gol',
              pts: formatPts(rates.assist_no_goal),
            },
            { accion: 'Gol en contra (propia puerta)', detalle: 'Todas las posiciones', pts: formatPts(rates.own_goal) },
            { accion: 'Penalti provocado', detalle: 'Sufre la falta dentro del área', pts: formatPts(rates.penalty_won) },
            { accion: 'Penalti cometido', detalle: 'Comete la falta dentro del área', pts: formatPts(rates.penalty_conceded) },
            { accion: 'Penalti fallado', detalle: 'Disparo desviado o atajado', pts: formatPts(rates.penalty_missed) },
            { accion: 'Penalti parado', detalle: 'Parada directa del portero', pts: formatPts(rates.penalty_save) },
          ]}
        />
      </Section>

      {/* 3. Portería y defensa */}
      <Section
        icon={ShieldCheck}
        number={3}
        title="Portería y Defensa"
        description="Acciones defensivas y colectivas para la contención del rival."
      >
        <p className="mb-2 text-sm font-semibold text-slate-700">
          Portería a cero (habiendo jugado &gt; {rates.participation.minutes_threshold} minutos con 0 goles recibidos)
        </p>
        <PointsTable
          rows={[
            { accion: 'Portero (POR)', pts: formatPts(rates.clean_sheet.POR) },
            { accion: 'Defensa (DEF)', pts: formatPts(rates.clean_sheet.DEF) },
            { accion: 'Mediocentro (MED)', pts: formatPts(rates.clean_sheet.MED) },
            { accion: 'Delantero (DEL)', pts: formatPts(rates.clean_sheet.DEL) },
          ]}
        />
        <p className="mb-2 mt-5 text-sm font-semibold text-slate-700">
          Goles recibidos (mientras el jugador está en el campo)
        </p>
        <PointsTable
          rows={[
            { accion: 'Portero (POR)', detalle: 'por cada gol encajado', pts: formatPts(rates.goal_conceded.POR) },
            { accion: 'Defensa (DEF)', detalle: 'por cada gol encajado', pts: formatPts(rates.goal_conceded.DEF) },
            { accion: 'Mediocentro (MED)', detalle: 'por cada gol encajado', pts: formatPts(rates.goal_conceded.MED) },
            { accion: 'Delantero (DEL)', detalle: 'por cada gol encajado', pts: formatPts(rates.goal_conceded.DEL) },
          ]}
        />
      </Section>

      {/* 4. Tarjetas */}
      <Section
        icon={CreditCard}
        number={4}
        title="Tarjetas y Disciplina"
      >
        <PointsTable
          rows={[
            { accion: 'Tarjeta amarilla', pts: formatPts(rates.yellow_card) },
            { accion: 'Doble tarjeta amarilla', pts: formatPts(rates.second_yellow_card) },
            { accion: 'Tarjeta roja directa', pts: formatPts(rates.red_card) },
          ]}
        />
      </Section>

      {/* 5. Bonos acumulativos */}
      <Section
        icon={Sparkles}
        number={5}
        title="Bonos Acumulativos"
        description="Puntos extra automáticos por cada acción individual."
      >
        <PointsTable
          rows={[
            { accion: 'Paradas del portero', detalle: 'por parada', pts: formatPts(rates.per_unit.saves) },
            { accion: 'Remates a puerta', detalle: 'por remate a portería', pts: formatPts(rates.per_unit.shots_on_target) },
            { accion: 'Regates completados', detalle: 'por regate con éxito', pts: formatPts(rates.per_unit.takeons_won) },
            { accion: 'Pases al área exitosos', detalle: 'por pase completado en el área rival', pts: formatPts(rates.per_unit.box_entries) },
            { accion: 'Balón recuperado (zona alta)', detalle: 'campo rival', pts: formatPts(rates.per_unit.recoveries_high) },
            { accion: 'Balón recuperado (zona media)', detalle: 'centro', pts: formatPts(rates.per_unit.recoveries_med) },
            { accion: 'Balón recuperado (zona baja)', detalle: 'campo propio', pts: formatPts(rates.per_unit.recoveries_low) },
            { accion: 'Interceptación (zona alta)', detalle: 'campo rival', pts: formatPts(rates.per_unit.interceptions_high) },
            { accion: 'Interceptación (zona media)', detalle: 'centro', pts: formatPts(rates.per_unit.interceptions_med) },
            { accion: 'Interceptación (zona baja)', detalle: 'campo propio', pts: formatPts(rates.per_unit.interceptions_low) },
            { accion: 'Despejes', detalle: 'por despeje', pts: formatPts(rates.per_unit.clearances) },
            { accion: 'Pases completados', detalle: 'por pase con éxito', pts: formatPts(rates.per_unit.passes_completed) },
            { accion: 'Pases hacia adelante completados', detalle: 'por pase', pts: formatPts(rates.per_unit.forward_passes) },
            { accion: 'Pase largo completado', detalle: 'por pase', pts: formatPts(rates.per_unit.long_balls_completed) },
            { accion: 'Lanzamiento de falta o córner', detalle: 'por envío', pts: formatPts(rates.per_unit.set_pieces_taken) },
            { accion: 'Centros buenos', detalle: 'por centro con éxito', pts: formatPts(rates.per_unit.successful_crosses) },
          ]}
        />
      </Section>

      {/* 6. Pérdidas de balón */}
      <Section
        icon={Ban}
        number={6}
        title="Penalización por Pérdidas de Balón"
        description="Por pérdida de balón, según la responsabilidad defensiva de cada posición."
      >
        <PointsTable
          rows={[
            { accion: 'Portero (POR)', detalle: 'por cada pérdida', pts: formatPts(rates.lost_balls.POR) },
            { accion: 'Defensa (DEF)', detalle: 'por cada pérdida', pts: formatPts(rates.lost_balls.DEF) },
            { accion: 'Mediocentro (MED)', detalle: 'por cada pérdida', pts: formatPts(rates.lost_balls.MED) },
            { accion: 'Delantero (DEL)', detalle: 'por cada pérdida', pts: formatPts(rates.lost_balls.DEL) },
          ]}
        />
      </Section>

      {/* 7. Puntos RELEVO */}
      <Section
        icon={Gauge}
        number={7}
        title="Puntos RELEVO (Algoritmo de Influencia)"
        description="Indicador puramente estadístico. Evalúa el rendimiento en 6 categorías; el resultado se acota entre 0 y 4 puntos de bonificación."
      >
        <ol className="space-y-4">
          <li>
            <p className="text-sm font-semibold text-slate-800">1. Participación en el juego</p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <Pts value={formatPts(rates.relevo_rules.participation_points_per_step)} />
                <span>por cada {rates.relevo_rules.participation_step_percent}% del total de eventos de su equipo realizados por el jugador.</span>
              </li>
            </ul>
          </li>
          <li>
            <p className="text-sm font-semibold text-slate-800">
              2. Precisión en la distribución <span className="font-normal text-slate-500">(mín. {rates.relevo_rules.min_passes} pases intentados)</span>
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2"><Pts value="+2" /><span>efectividad de pase ≥ {rates.relevo_rules.pass_accuracy_excel}%.</span></li>
              <li className="flex items-start gap-2"><Pts value="+1" /><span>efectividad entre {rates.relevo_rules.pass_accuracy_high}% y {(rates.relevo_rules.pass_accuracy_excel - 0.1).toFixed(1)}%.</span></li>
              <li className="flex items-start gap-2"><Pts value="-1" /><span>efectividad por debajo del {rates.relevo_rules.pass_accuracy_low}%.</span></li>
            </ul>
          </li>
          <li>
            <p className="text-sm font-semibold text-slate-800">
              3. Distribución en campo rival <span className="font-normal text-slate-500">(mín. {rates.relevo_rules.min_opp_half_passes} pases en campo contrario)</span>
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2"><Pts value="+1" /><span>acierto en territorio rival ≥ {rates.relevo_rules.opp_half_accuracy_high}%.</span></li>
            </ul>
          </li>
          <li>
            <p className="text-sm font-semibold text-slate-800">
              4. Efectividad de tiro <span className="font-normal text-slate-500">(mín. {rates.relevo_rules.min_shots} disparos)</span>
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2"><Pts value="+1" /><span>{rates.relevo_rules.shot_accuracy_high}% o más de sus tiros (incluidos goles) van a puerta.</span></li>
              <li className="flex items-start gap-2"><Pts value="-1" /><span>dispara pero ninguno va a portería (0%).</span></li>
            </ul>
          </li>
          <li>
            <p className="text-sm font-semibold text-slate-800">
              5. Duelos <span className="font-normal text-slate-500">(mín. {rates.relevo_rules.min_duels})</span>
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2"><Pts value={formatPts(rates.relevo_rules.duels_points_per_step)} /><span>por cada {rates.relevo_rules.duels_step_percent}% de duelos ganados.</span></li>
            </ul>
          </li>
        </ol>
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Resultado final</p>
          <p className="mt-1">
            Se suman las valoraciones. Si el total es menor que 0 se asignan{' '}
            <strong>0 puntos</strong>; si supera 4 se asignan <strong>4 puntos</strong>.
          </p>
        </div>
      </Section>

      {/* 8. Reglas Económicas */}
      <Section
        icon={Coins}
        number={8}
        title="Reglas Económicas y Premios"
        description="Cuotas de la liga, multas, pagos por jornada y premios a final de temporada."
      >
        <p className="mb-2 text-sm font-semibold text-slate-700">Cuotas y Sanciones</p>
        <PointsTable
          rows={[
            { accion: 'Cuota inicial (Deuda base)', detalle: 'A pagar para la próxima temporada', pts: `-${leagueConfig.starting_balance}€` },
            { accion: 'Multa por infracción', detalle: 'Alineación indebida, no respetar tácticas...', pts: `-${leagueConfig.infraction_penalty_cost}€` },
          ]}
        />
        
        <p className="mb-2 mt-5 text-sm font-semibold text-slate-700">Pagos de Jornada</p>
        <PointsTable
          rows={[
            { accion: 'Ganador de la Jornada', pts: leagueConfig.pay_winner > 0 ? `+${leagueConfig.pay_winner}€` : `${leagueConfig.pay_winner}€` },
            { accion: 'Resto de participantes', pts: `-${leagueConfig.pay_rest}€` },
            { accion: 'Perdedor de la Jornada (Colista)', pts: `-${leagueConfig.pay_loser}€` },
          ]}
        />

        <p className="mb-2 mt-5 text-sm font-semibold text-slate-700">Premios Finales - 1ª División</p>
        <PointsTable
          rows={[
            { accion: '1º Clasificado', pts: `+${leagueConfig.prize_div1_1st}€` },
            { accion: '2º Clasificado', pts: `+${leagueConfig.prize_div1_2nd}€` },
            { accion: '3º Clasificado', pts: `+${leagueConfig.prize_div1_3rd}€` },
          ]}
        />

        <p className="mb-2 mt-5 text-sm font-semibold text-slate-700">Premios Finales - 2ª División</p>
        <PointsTable
          rows={[
            { accion: '1º Clasificado', pts: `+${leagueConfig.prize_div2_1st}€` },
            { accion: '2º Clasificado', pts: `+${leagueConfig.prize_div2_2nd}€` },
            { accion: '3º Clasificado', pts: `+${leagueConfig.prize_div2_3rd}€` },
          ]}
        />

        <p className="mb-2 mt-5 text-sm font-semibold text-slate-700">Premios Finales - 3ª División</p>
        <PointsTable
          rows={[
            { accion: '1º Clasificado', pts: `+${leagueConfig.prize_div3_1st}€` },
            { accion: '2º Clasificado', pts: `+${leagueConfig.prize_div3_2nd}€` },
            { accion: '3º Clasificado', pts: `+${leagueConfig.prize_div3_3rd}€` },
          ]}
        />
      </Section>
    </div>
  )
}
