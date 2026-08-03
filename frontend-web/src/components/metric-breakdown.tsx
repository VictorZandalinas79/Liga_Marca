'use client'

import { TrendingUp, Check, X } from 'lucide-react'
import { evaluateRelevoBlocks, resolveRates, type Position, type RelevoLimits } from '@/lib/scoring-config'
import { useScoringRules } from '@/hooks/use-scoring-rules'

// Acepta cualquier objeto con campos de player_scores (los lee con Number(v)||0)
export function MetricBreakdown({ player }: { player: Record<string, any> }) {
  // Tarifas desde scoring_config (editables en Admin); fallback a los defaults.
  const R = resolveRates(useScoringRules())
  const normPos = (p?: string): Position => {
    const s = (p || '').toLowerCase()
    if (s.includes('goalkeeper') || s === 'gk' || s === 'por') return 'POR'
    if (s.includes('defender') || s === 'def') return 'DEF'
    if (s.includes('forward') || s.includes('attacker') || s.includes('striker') || s === 'del' || s === 'fwd') return 'DEL'
    if (s.includes('midfielder') || s === 'med' || s === 'mid') return 'MED'
    return 'MED'
  }

  const fmtPts = (n: number): string => String(parseFloat((Math.round(n * 100) / 100).toFixed(2)))
  const r2 = (v: number) => Math.round(v * 100) / 100
  const n = (v: any) => Number(v) || 0

  const pos = normPos(player.calc_position || player.position)

  const GOAL          = R.goal
  const CLEAN_SHEET   = R.clean_sheet
  const GOAL_CONCEDED = R.goal_conceded

  interface Row  { label: string; count: number; unit: number; points: number; flat?: boolean }
  interface Block { id: string; emoji: string; title: string; accent: string; chip: string; rows: Row[] }

  const u = (count: number, unit: number, label: string): Row =>
    ({ label, count, unit, points: r2(count * unit) })

  // B1: Participación
  const min = n(player.minutes_played)
  const b1: Row[] = []
  if (min > 0) {
    const titular = min > R.participation.minutes_threshold
    b1.push({ label: titular ? `Participación · +60 min (${min}′)` : `Participación · suplente (${min}′)`, count: 0, unit: 0, points: titular ? R.participation.starter_bonus : R.participation.substitute_bonus, flat: true })
  }

  // B2: Goles y Asistencias
  const b2: Row[] = []
  if (n(player.goals) > 0)         b2.push(u(n(player.goals), GOAL[pos], `Gol (${pos})`))
  if (n(player.own_goals) > 0)     b2.push(u(n(player.own_goals), R.own_goal, 'Gol en propia'))
  if (n(player.assists) > 0)       b2.push(u(n(player.assists), R.assist_goal, 'Asistencia de gol'))
  if (n(player.intent_assists) > 0) b2.push(u(n(player.intent_assists), R.assist_no_goal, 'Asistencia sin gol'))

  // B3: Defensa y Portería a Cero
  const b3: Row[] = []
  const cs = player.clean_sheet === true || player.clean_sheet === 1 || player.clean_sheet === 'true'
  if (cs) b3.push({ label: `Portería a cero · +60 min (${pos})`, count: 0, unit: 0, points: CLEAN_SHEET[pos], flat: true })
  if (n(player.goals_conceded) > 1) b3.push(u(n(player.goals_conceded), GOAL_CONCEDED[pos], `Gol encajado (${pos})`))

  // B4: Penaltis
  const b4: Row[] = []
  if (n(player.penalties_won) > 0)      b4.push(u(n(player.penalties_won), R.penalty_won[pos], 'Penalti provocado'))
  if (n(player.penalties_conceded) > 0) b4.push(u(n(player.penalties_conceded), R.penalty_conceded[pos], 'Penalti cometido'))
  if (n(player.penalties_missed) > 0)   b4.push(u(n(player.penalties_missed), R.penalty_missed, 'Penalti fallado'))
  if (n(player.penalty_saves) > 0)      b4.push(u(n(player.penalty_saves), R.penalty_save[pos], 'Penalti parado'))

  // B5: Tarjetas
  const b5: Row[] = []
  if (n(player.yellow_cards) > 0)        b5.push(u(n(player.yellow_cards), R.yellow_card, 'Amarilla'))
  if (n(player.second_yellow_cards) > 0) b5.push(u(n(player.second_yellow_cards), R.second_yellow_card, 'Doble amarilla'))
  if (n(player.red_cards) > 0)           b5.push(u(n(player.red_cards), R.red_card, 'Roja directa'))

  // B6: Portero. Desde el sistema v4 sólo la parada puntúa por unidad; blocajes,
  // despejes de puños y salidas ya sólo cuentan dentro del bloque 4 de RELEVO.
  const b6: Row[] = []
  if (n(player.saves) > 0) b6.push(u(n(player.saves), R.per_unit.saves, 'Parada'))

  // B7: las cuatro métricas que puntúan por unidad en el sistema v4.
  const b7: Row[] = []
  if (n(player.clearances) > 0)      b7.push(u(n(player.clearances), R.per_unit.clearances, 'Despejes'))
  if (n(player.shots_on_target) > 0) b7.push(u(n(player.shots_on_target), R.per_unit.shots_on_target, 'Tiros a puerta'))
  if (n(player.takeons_won) > 0)     b7.push(u(n(player.takeons_won), R.per_unit.takeons_won, 'Regates completados'))
  if (n(player.box_entries) > 0)     b7.push(u(n(player.box_entries), R.per_unit.box_entries, 'Balones al área'))

  // B8: Penalizaciones
  const b8: Row[] = []
  const lostBalls = n(player.dispossessed) + n(player.bad_touches)
  if (lostBalls > 0) b8.push(u(lostBalls, R.lost_balls, `Pérdida de balón (${pos})`))

  const blocks: Block[] = [
    { id: 'b1', emoji: '⏱️', title: 'Participación',             accent: 'text-slate-600',   chip: 'bg-slate-100 text-slate-700',   rows: b1 },
    { id: 'b2', emoji: '⚽', title: 'Goles y Asistencias',       accent: 'text-red-600',     chip: 'bg-red-50 text-red-700',        rows: b2 },
    { id: 'b3', emoji: '🛡️', title: 'Defensa y Portería a Cero', accent: 'text-indigo-600',  chip: 'bg-indigo-50 text-indigo-700',  rows: b3 },
    { id: 'b4', emoji: '🎯', title: 'Penaltis',                  accent: 'text-fuchsia-600', chip: 'bg-fuchsia-50 text-fuchsia-700', rows: b4 },
    { id: 'b5', emoji: '🟨', title: 'Tarjetas',                  accent: 'text-amber-600',   chip: 'bg-amber-50 text-amber-700',    rows: b5 },
    { id: 'b6', emoji: '🧤', title: 'Acciones de Portero',       accent: 'text-cyan-600',    chip: 'bg-cyan-50 text-cyan-700',      rows: b6 },
    { id: 'b7', emoji: '📈', title: 'Bonus en Juego',            accent: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700', rows: b7 },
    { id: 'b8', emoji: '📉', title: 'Penalizaciones',            accent: 'text-rose-600',    chip: 'bg-rose-50 text-rose-700',      rows: b8 },
  ]

  const total = n(player.total_points)
  const visibleBlocks = blocks.filter(b => b.rows.length > 0)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-emerald-600" />
        Puntos por bloques
      </h3>

      {visibleBlocks.length === 0 && min === 0 && (
        <p className="text-slate-500 text-center py-4">Sin métricas puntuables en este partido.</p>
      )}

      {visibleBlocks.map((blk) => {
        const subtotal = r2(blk.rows.reduce((s, row) => s + row.points, 0))
        return (
          <div key={blk.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">{blk.emoji}</span>
                <h4 className={`font-bold text-sm ${blk.accent}`}>{blk.title}</h4>
              </div>
              <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${subtotal >= 0 ? blk.chip : 'bg-red-50 text-red-700'}`}>
                {subtotal >= 0 ? '+' : ''}{fmtPts(subtotal)}
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {blk.rows.map((row, idx) => (
                <div key={idx} className="flex items-center justify-between px-4 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{row.label}</p>
                    {!row.flat && (
                      <p className="text-xs text-slate-400">
                        {row.count} × {row.unit >= 0 ? '+' : ''}{fmtPts(row.unit)}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 text-sm font-bold tabular-nums ${row.points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {row.points >= 0 ? '+' : ''}{fmtPts(row.points)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {min > 0 && <RelevoBreakdown player={player} pos={pos} limits={R.relevo_limits} />}

      <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-4 flex items-center justify-between shadow-md">
        <span className="text-white font-bold text-lg">Puntos totales</span>
        <span className="text-white font-extrabold text-3xl tabular-nums">{fmtPts(total)}</span>
      </div>
    </div>
  )
}

/**
 * Puntos RELEVO: los 4 bloques de la posición del jugador y, dentro de cada uno,
 * qué lleva de cada métrica frente al mínimo exigido (ajustado a sus minutos).
 * Basta con superar una métrica del bloque para llevarse su punto; si no supera
 * ninguno de los 4, RELEVO resta 1.
 */
function RelevoBreakdown({
  player,
  pos,
  limits,
}: {
  player: Record<string, any>
  pos: Position
  limits: RelevoLimits
}) {
  const results = evaluateRelevoBlocks(player, pos, limits)
  const totalRelevo = Number(player.relevo_points) || 0
  const blocksWon = results.filter((b) => b.points > 0).length

  const fmt = (v: number, unit: 'count' | 'pct') =>
    unit === 'pct' ? `${v.toFixed(0)}%` : String(parseFloat(v.toFixed(2)))

  return (
    <div className="rounded-2xl border border-violet-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-violet-100 bg-violet-50/50">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">⭐</span>
          <div>
            <h4 className="font-bold text-sm text-violet-700">Puntos RELEVO</h4>
            <p className="text-[11px] text-violet-500">
              {blocksWon === 0 ? 'Ningún bloque superado · −1' : `${blocksWon} de 4 bloques superados`}
            </p>
          </div>
        </div>
        <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${totalRelevo >= 0 ? 'bg-violet-50 text-violet-700' : 'bg-red-50 text-red-700'}`}>
          {totalRelevo >= 0 ? '+' : ''}{parseFloat(totalRelevo.toFixed(2))}
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {results.map((block) => (
          <div key={block.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold text-slate-800">
                Bloque {block.id} · {block.title}
              </p>
              <span
                className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                  block.points > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {block.points > 0 ? '+1' : '0'}
              </span>
            </div>

            {block.note && <p className="text-[11px] text-slate-400 mb-2">{block.note}</p>}

            <div className="space-y-1">
              {block.metrics.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {m.met ? (
                      <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <X className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                    )}
                    <span className={`truncate ${m.met ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
                      {m.label}
                    </span>
                  </div>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    <span className={m.met ? 'text-emerald-600 font-bold' : 'text-slate-700 font-semibold'}>
                      {fmt(m.value, m.unit)}
                    </span>
                    {m.detail && <span className="text-slate-400"> ({m.detail})</span>}
                    <span className="text-slate-400"> · mín. {fmt(m.target, m.unit)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
