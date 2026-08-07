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
import { Coins, Activity, Info } from 'lucide-react'
import { num } from '@/lib/scoring-config'

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
  const porteroMultiplier = num((rules?.relevo_limits as any)?.POR, 'calidad_parada_multiplier') || 0.33

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
        description="Puntos iniciales y bonos por resultado según los minutos disputados."
      >
        <PointsTable
          rows={[
            { accion: `Menos de ${rates.participation.minutes_threshold} minutos jugados`, pts: formatPts(rates.participation.substitute_bonus) },
            { accion: `${rates.participation.minutes_threshold} minutos o más jugados`, pts: formatPts(rates.participation.starter_bonus) },
            { accion: `Victoria (jugando ${rates.participation.minutes_threshold} minutos o más)`, pts: formatPts(rates.participation.win_bonus_60) },
            { accion: `Empate (jugando ${rates.participation.minutes_threshold} minutos o más)`, pts: formatPts(rates.participation.draw_bonus_60) },
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
            { accion: 'Penalti provocado', detalle: 'Sufre la falta dentro del área', pts: formatPts(rates.penalty_won.MED) },
            { accion: 'Penalti cometido', detalle: 'Comete la falta dentro del área', pts: formatPts(rates.penalty_conceded.MED) },
            { accion: 'Penalti fallado', detalle: 'Disparo desviado o atajado', pts: formatPts(rates.penalty_missed) },
            { accion: 'Penalti parado', detalle: 'Parada directa del portero', pts: formatPts(rates.penalty_save.POR) },
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
        <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex gap-3 text-sm text-blue-800 items-start mb-3">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
          <div>
            <strong>Nota:</strong> El primer gol encajado no penaliza. Pero si el equipo recibe <strong>2 o más goles</strong>, se multiplica la totalidad de goles encajados por esta penalización.
          </div>
        </div>
        <PointsTable
          rows={[
            { accion: 'Portero (POR)', detalle: 'por gol (si recibe 2+)', pts: formatPts(rates.goal_conceded.POR) },
            { accion: 'Defensa (DEF)', detalle: 'por gol (si recibe 2+)', pts: formatPts(rates.goal_conceded.DEF) },
            { accion: 'Mediocentro (MED)', detalle: 'por gol (si recibe 2+)', pts: formatPts(rates.goal_conceded.MED) },
            { accion: 'Delantero (DEL)', detalle: 'por gol (si recibe 2+)', pts: formatPts(rates.goal_conceded.DEL) },
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

      {/* 5. Acciones de Campo Adicionales */}
      <Section
        icon={Activity}
        number={5}
        title="Otras Acciones de Campo"
        description="Métricas adicionales configurables por el administrador."
      >
        <PointsTable
          rows={[
            { accion: 'Parada', detalle: 'Por cada parada del portero', pts: formatPts(rates.per_unit.saves) },
            { accion: 'Tiro a puerta', pts: formatPts(rates.per_unit.shots_on_target) },
            { accion: 'Regate completado', pts: formatPts(rates.per_unit.takeons_won) },
            { accion: 'Balón al área', pts: formatPts(rates.per_unit.box_entries) },
            { accion: 'Despeje', pts: formatPts(rates.per_unit.clearances) },
          ]}
        />
      </Section>

      {/* 6. Pérdidas de balón */}
      <Section
        icon={Ban}
        number={6}
        title="Penalización por Pérdidas de Balón"
        description="Por pérdida de balón, afecta por igual a todas las posiciones."
      >
        <PointsTable
          rows={[
            { accion: 'Por pérdida de balón', detalle: 'Aplica a cualquier jugador', pts: formatPts(rates.lost_balls) },
          ]}
        />
      </Section>

      {/* 7. Puntos RELEVO */}
      <Section
        icon={Gauge}
        number={7}
        title="Puntos RELEVO (Bloques por Posición)"
        description="Sistema avanzado de 4 bloques específicos para cada posición (POR, DEF, MED, DEL)."
      >
        <p className="mb-4 text-sm text-slate-600">
          En lugar de métricas globales, el algoritmo evalúa a cada jugador según su rol. Cada posición tiene <strong>4 bloques estadísticos</strong> adaptados a su posición.
        </p>
        <ul className="space-y-2 text-sm text-slate-600 mb-6 list-disc pl-5">
          <li>Por cada bloque superado, el jugador suma <strong>1 punto</strong>.</li>
          <li>Si no supera <strong>ningún bloque</strong>, su puntuación de Relevo será <strong>-1 punto</strong>.</li>
          <li>La puntuación final oscila entre <strong>-1 y 4 puntos</strong>.</li>
        </ul>

        {/* PORTERO */}
        <div className="mb-6">
          <h3 className="font-bold text-slate-800 text-sm mb-2 bg-slate-100 p-2 rounded">Portero (POR)</h3>
          <ul className="text-sm text-slate-600 space-y-4 pl-2">
            <li><span className="font-semibold">Bloque 1:</span> ≥ {num((rules?.relevo_limits as any)?.POR, 'saves_per_min') || 0.06} paradas por min. jugado.</li>
            <li className="space-y-3">
              <div>
                <span className="font-semibold text-slate-900">Bloque 2:</span> Ratio de Calidad de Parada supera el multiplicador de {porteroMultiplier} respecto a sus paradas/min.
                <p className="mt-1 text-slate-500 text-xs leading-relaxed">
                  Se busca un tiro rival en los 5 segundos previos a cada parada. Ese tiro recibe un <strong>Valor de Importancia</strong> según su zona (ver mapa). Se suman todos los valores y se dividen por los minutos jugados. Si este ratio supera una fracción (multiplicador) de las paradas por minuto, gana 1 punto.
                </p>
              </div>

              <div className="flex flex-col md:flex-row gap-4 items-start bg-slate-50 border border-slate-200 p-4 rounded-xl mt-2">
                {/* Mapa Calidad Parada */}
                <div className="w-full md:w-1/2 max-w-xs border border-slate-200 rounded-lg overflow-hidden bg-white shrink-0 shadow-sm">
                  <img src="/calidad_parada.png" alt="Mapa de puntos por Calidad de Parada" className="w-full h-auto object-cover" />
                </div>

                <div className="w-full md:w-1/2 space-y-3">
                  {/* Multiplicador Badge / Info */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Multiplicador Configurado</span>
                    <span className="text-2xl font-black text-amber-600">
                      {porteroMultiplier}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">({porteroMultiplier === 0.5 ? 'la mitad' : porteroMultiplier === 0.33 ? 'una tercera parte' : `fracción de ${porteroMultiplier}`})</span>
                  </div>

                  {/* Ejemplo de la regla */}
                  <div className="text-xs text-slate-600 p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                    <strong className="text-slate-800 font-bold">Ejemplo de la regla:</strong>
                    <div className="mt-1.5 space-y-1">
                      <p>• El portero promedia <strong className="text-slate-800">0,06 paradas</strong> por minuto jugado.</p>
                      <p>• En sus paradas acumula un "valor de calidad" que equivale a <strong className="text-slate-800">0,04 por minuto jugado</strong>.</p>
                      <p>• Como la calidad (0,04) es mayor que la fracción de sus paradas (0,06 x {porteroMultiplier} = {(0.06 * porteroMultiplier).toFixed(3)}), entonces <strong className="text-emerald-600 font-bold">supera la métrica y suma 1 punto</strong>.</p>
                    </div>
                  </div>
                </div>
              </div>
            </li>
            <li>
              <span className="font-semibold">Bloque 3:</span> ≥ {num((rules?.relevo_limits as any)?.POR, 'long_passes_per_min') || 0.05} pases largos/min, O BIEN (≥ {num((rules?.relevo_limits as any)?.POR, 'pass_pct') || 65}% acierto de pase Y ≥ {num((rules?.relevo_limits as any)?.POR, 'pass_att_per_min') || 0.3} pases/min).
            </li>
            <li><span className="font-semibold">Bloque 4:</span> ≥ {num((rules?.relevo_limits as any)?.POR, 'claims_per_min') || 0.02} blocajes/min, O BIEN ≥ {num((rules?.relevo_limits as any)?.POR, 'punches_per_min') || 0.03} despejes puños/min.</li>
          </ul>
        </div>

        {/* DEFENSA */}
        <div className="mb-6">
          <h3 className="font-bold text-slate-800 text-sm mb-2 bg-slate-100 p-2 rounded">Defensa (DEF)</h3>
          <ul className="text-sm text-slate-600 space-y-2 pl-2">
            <li><span className="font-semibold">Bloque 1:</span> ≥ {num((rules?.relevo_limits as any)?.DEF, 'last_man_per_min') || 0.02} acciones de último hombre/min.</li>
            <li><span className="font-semibold">Bloque 2:</span> ≥ {num((rules?.relevo_limits as any)?.DEF, 'long_passes_per_min') || 0.05} pases largos/min, O BIEN ≥ {num((rules?.relevo_limits as any)?.DEF, 'forward_passes_per_min') || 0.05} pases hacia adelante/min.</li>
            <li><span className="font-semibold">Bloque 3:</span> &gt; {num((rules?.relevo_limits as any)?.DEF, 'aerials_pct') || 60}% duelos aéreos ganados, O BIEN &gt; {num((rules?.relevo_limits as any)?.DEF, 'ground_duels_pct') || 60}% duelos suelo ganados.</li>
            <li><span className="font-semibold">Bloque 4:</span> ≥ {num((rules?.relevo_limits as any)?.DEF, 'abp_remates_per_min') || 0.01} remates a balón parado/min, O BIEN ≥ {num((rules?.relevo_limits as any)?.DEF, 'crosses_per_min') || 0.02} centros buenos/min.</li>
          </ul>
        </div>

        {/* MEDIO */}
        <div className="mb-6">
          <h3 className="font-bold text-slate-800 text-sm mb-2 bg-slate-100 p-2 rounded">Medio (MED)</h3>
          <ul className="text-sm text-slate-600 space-y-2 pl-2">
            <li><span className="font-semibold">Bloque 1:</span> &gt; {num((rules?.relevo_limits as any)?.MED, 'pass_opp_pct') || 50}% pases en campo rival.</li>
            <li><span className="font-semibold">Bloque 2:</span> &gt; {num((rules?.relevo_limits as any)?.MED, 'aerials_pct') || 60}% duelos aéreos ganados, O BIEN &gt; {num((rules?.relevo_limits as any)?.MED, 'ground_duels_pct') || 60}% duelos suelo ganados.</li>
            <li><span className="font-semibold">Bloque 3:</span> &gt; {num((rules?.relevo_limits as any)?.MED, 'shots_on_pct') || 50}% remates a puerta, O BIEN &gt; {num((rules?.relevo_limits as any)?.MED, 'takeons_pct') || 35}% regates completados.</li>
            <li><span className="font-semibold">Bloque 4:</span> ≥ {num((rules?.relevo_limits as any)?.MED, 'assists_per_min') || 0.03} asistencias/min, O BIEN ≥ {num((rules?.relevo_limits as any)?.MED, 'crosses_per_min') || 0.02} centros buenos/min.</li>
          </ul>
        </div>

        {/* DELANTERO */}
        <div>
          <h3 className="font-bold text-slate-800 text-sm mb-2 bg-slate-100 p-2 rounded">Delantero (DEL)</h3>
          <ul className="text-sm text-slate-600 space-y-2 pl-2">
            <li><span className="font-semibold">Bloque 1:</span> &gt; {num((rules?.relevo_limits as any)?.DEL, 'pass_opp_pct') || 50}% pases en campo rival.</li>
            <li><span className="font-semibold">Bloque 2:</span> &gt; {num((rules?.relevo_limits as any)?.DEL, 'aerials_pct') || 40}% duelos aéreos ganados, O BIEN ≥ {num((rules?.relevo_limits as any)?.DEL, 'recup_opp_per_min') || 0.3} recuperaciones campo rival/min.</li>
            <li><span className="font-semibold">Bloque 3:</span> &gt; {num((rules?.relevo_limits as any)?.DEL, 'shots_on_pct') || 60}% remates a puerta, O BIEN ≥ {num((rules?.relevo_limits as any)?.DEL, 'head_shots_per_min') || 0.02} remates de cabeza/min.</li>
            <li><span className="font-semibold">Bloque 4:</span> ≥ {num((rules?.relevo_limits as any)?.DEL, 'assists_per_min') || 0.03} asistencias/min, O BIEN &gt; {num((rules?.relevo_limits as any)?.DEL, 'takeons_pct') || 35}% regates completados.</li>
          </ul>
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
            { accion: '1º Clasificado', pts: `+${leagueConfig.prize_div1_1st}%` },
            { accion: '2º Clasificado', pts: `+${leagueConfig.prize_div1_2nd}%` },
            { accion: '3º Clasificado', pts: `+${leagueConfig.prize_div1_3rd}%` },
          ]}
        />

        <p className="mb-2 mt-5 text-sm font-semibold text-slate-700">Premios Finales - 2ª División</p>
        <PointsTable
          rows={[
            { accion: '1º Clasificado', pts: `+${leagueConfig.prize_div2_1st}%` },
            { accion: '2º Clasificado', pts: `+${leagueConfig.prize_div2_2nd}%` },
            { accion: '3º Clasificado', pts: `+${leagueConfig.prize_div2_3rd}%` },
          ]}
        />

        <p className="mb-2 mt-5 text-sm font-semibold text-slate-700">Premios Finales - 3ª División</p>
        <PointsTable
          rows={[
            { accion: '1º Clasificado', pts: `+${leagueConfig.prize_div3_1st}%` },
            { accion: '2º Clasificado', pts: `+${leagueConfig.prize_div3_2nd}%` },
            { accion: '3º Clasificado', pts: `+${leagueConfig.prize_div3_3rd}%` },
          ]}
        />
      </Section>
    </div>
  )
}
