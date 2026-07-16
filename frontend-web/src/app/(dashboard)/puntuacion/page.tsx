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

export default function PuntuacionPage() {
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
            { accion: 'Menos de 60 minutos jugados', pts: '+1' },
            { accion: '60 minutos o más jugados', pts: '+2' },
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
            { accion: 'Gol marcado', detalle: 'Portero (POR) / Defensa (DEF)', pts: '+6' },
            { accion: 'Gol marcado', detalle: 'Mediocentro (MED)', pts: '+5' },
            { accion: 'Gol marcado', detalle: 'Delantero (DEL)', pts: '+4' },
            { accion: 'Asistencia de gol', detalle: 'Último pase que acaba en gol (qualifier 210 con valor 16) · todas las posiciones', pts: '+3' },
            {
              accion: 'Asistencia sin gol / Pase clave',
              detalle: 'Pase que asiste un remate sin acabar en gol (qualifier 210 con valores 13, 14 o 15) · todas las posiciones',
              pts: '+1',
            },
            { accion: 'Gol en contra (propia puerta)', detalle: 'Todas las posiciones (con qualifier 28)', pts: '-2' },
            { accion: 'Penalti provocado', detalle: 'Sufre la falta dentro del área (outcome 1 con qualifier 9)', pts: '+1' },
            { accion: 'Penalti cometido', detalle: 'Comete la falta dentro del área (outcome 0 con qualifier 9)', pts: '-1' },
            { accion: 'Penalti fallado', detalle: 'Disparo desviado o atajado (outcome 0 con qualifier 9)', pts: '-2' },
            { accion: 'Penalti parado', detalle: 'Parada directa del portero (con qualifier 187)', pts: '+5' },
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
          Portería a cero (habiendo jugado &gt; 60 minutos con 0 goles recibidos)
        </p>
        <PointsTable
          rows={[
            { accion: 'Portero (POR)', pts: '+4' },
            { accion: 'Defensa (DEF)', pts: '+3' },
            { accion: 'Mediocentro (MED)', pts: '+2' },
            { accion: 'Delantero (DEL)', pts: '+1' },
          ]}
        />
        <p className="mb-2 mt-5 text-sm font-semibold text-slate-700">
          Goles recibidos (mientras el jugador está en el campo)
        </p>
        <PointsTable
          rows={[
            { accion: 'Portero y Defensa', detalle: 'por cada gol encajado', pts: '-2' },
            { accion: 'Mediocentro y Delantero', detalle: 'por cada gol encajado', pts: '-1' },
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
            { accion: 'Tarjeta amarilla', pts: '-1' },
            { accion: 'Doble tarjeta amarilla', pts: '-1' },
            { accion: 'Tarjeta roja directa', pts: '-3' },
          ]}
        />
      </Section>

      {/* 5. Bonos acumulativos */}
      <Section
        icon={Sparkles}
        number={5}
        title="Bonos Acumulativos"
        description="Puntos extra automáticos al alcanzar cierto número de registros durante el partido."
      >
        <PointsTable
          rows={[
            { accion: 'Paradas del portero', detalle: 'por cada 2 paradas', pts: '+1' },
            { accion: 'Remates a puerta', detalle: 'por cada 2 remates a portería', pts: '+1' },
            { accion: 'Regates completados', detalle: 'por cada 2 regates con éxito', pts: '+1' },
            { accion: 'Pases al área exitosos', detalle: 'por cada 2 pases completados en el área rival', pts: '+1' },
            { accion: 'Balones recuperados', detalle: 'por cada 5 recuperaciones', pts: '+1' },
            { accion: 'Despejes', detalle: 'por cada 3 despejes', pts: '+1' },
            { accion: 'Pases completados', detalle: 'por cada 10 pases con éxito', pts: '+1' },
            { accion: 'Pases hacia adelante completados', detalle: 'por cada 10 pases donde la coordenada X final (qualifier 140) es mayor que la inicial', pts: '+1' },
            { accion: 'Lanzamiento de falta o córner', detalle: 'por cada 5 envíos (qualifier 5 o 6)', pts: '+1' },
            { accion: 'Centros buenos', detalle: 'por cada 3 centros con éxito (pase completado con qualifier 2)', pts: '+1' },
            { accion: 'Pase largo completado', detalle: 'por cada pase largo exitoso (typeId 1, outcome 1, qualifier 1 presente)', pts: '+0.5' },
            { accion: 'Balón recuperado (zona alta)', detalle: 'recuperación con x > 66.6', pts: '+0.3' },
            { accion: 'Balón recuperado (zona media)', detalle: 'recuperación con 33.3 ≤ x ≤ 66.6', pts: '+0.2' },
            { accion: 'Balón recuperado (zona baja)', detalle: 'recuperación con x < 33.3', pts: '+0.1' },
          ]}
        />
      </Section>

      {/* 6. Pérdidas de balón */}
      <Section
        icon={Ban}
        number={6}
        title="Penalización por Pérdidas de Balón"
        description="Por regate fallado o mal control, según la responsabilidad defensiva de cada posición."
      >
        <PointsTable
          rows={[
            { accion: 'Portero (POR)', detalle: 'por cada 8 pérdidas', pts: '-1' },
            { accion: 'Defensa (DEF)', detalle: 'por cada 8 pérdidas', pts: '-1' },
            { accion: 'Mediocentro (MED)', detalle: 'por cada 10 pérdidas', pts: '-1' },
            { accion: 'Delantero (DEL)', detalle: 'por cada 12 pérdidas', pts: '-1' },
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
                <Pts value="+1" />
                <span>por cada 5% del total de eventos de su equipo realizados por el jugador.</span>
              </li>
            </ul>
          </li>
          <li>
            <p className="text-sm font-semibold text-slate-800">
              2. Precisión en la distribución <span className="font-normal text-slate-500">(mín. 10 pases intentados)</span>
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2"><Pts value="+2" /><span>efectividad de pase ≥ 92%.</span></li>
              <li className="flex items-start gap-2"><Pts value="+1" /><span>efectividad entre 85% y 91,9%.</span></li>
              <li className="flex items-start gap-2"><Pts value="-1" /><span>efectividad por debajo del 65%.</span></li>
            </ul>
          </li>
          <li>
            <p className="text-sm font-semibold text-slate-800">
              3. Distribución en campo rival <span className="font-normal text-slate-500">(mín. 10 pases en campo contrario)</span>
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2"><Pts value="+1" /><span>acierto en territorio rival ≥ 75%.</span></li>
            </ul>
          </li>
          <li>
            <p className="text-sm font-semibold text-slate-800">
              4. Efectividad de tiro <span className="font-normal text-slate-500">(mín. 2 disparos)</span>
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2"><Pts value="+1" /><span>50% o más de sus tiros (incluidos goles) van a puerta.</span></li>
              <li className="flex items-start gap-2"><Pts value="-1" /><span>dispara pero ninguno va a portería (0%).</span></li>
            </ul>
          </li>
          <li>
            <p className="text-sm font-semibold text-slate-800">
              5. Duelos terrestres <span className="font-normal text-slate-500">(entradas ganadas + regates + faltas recibidas, mín. 5)</span>
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2"><Pts value="+1" /><span>gana el 60% o más de sus duelos.</span></li>
              <li className="flex items-start gap-2"><Pts value="-1" /><span>gana menos del 30%.</span></li>
            </ul>
          </li>
          <li>
            <p className="text-sm font-semibold text-slate-800">
              6. Duelos aéreos <span className="font-normal text-slate-500">(mín. 3 disputados)</span>
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2"><Pts value="+1" /><span>gana el 60% o más por alto.</span></li>
              <li className="flex items-start gap-2"><Pts value="-1" /><span>gana menos del 30%.</span></li>
            </ul>
          </li>
          <li>
            <p className="text-sm font-semibold text-slate-800">
              7. Regates intentados
            </p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              <li className="flex items-start gap-2"><Pts value="+1" /><span>más del 50% de los regates intentados son exitosos.</span></li>
            </ul>
          </li>
        </ol>
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Resultado final</p>
          <p className="mt-1">
            Se suman las valoraciones 1 a 6. Si el total es menor que 0 se asignan{' '}
            <strong>0 puntos</strong>; si supera 4 se asignan <strong>4 puntos</strong>.
          </p>
        </div>
      </Section>
    </div>
  )
}
