'use client'

import { RELEVO_BLOCKS, evaluateRelevoBlocks, resolveRates, type Position } from '@/lib/scoring-config'
import { useScoringRules } from '@/hooks/use-scoring-rules'
import { CheckCircle2, XCircle, Target, Award, Sparkles, Activity } from 'lucide-react'

export function MetricBreakdown({ 
  player, 
  fixture 
}: { 
  player: Record<string, any>
  fixture?: Record<string, any>
}) {
  const R = resolveRates(useScoringRules())
  
  const normPos = (p?: string): Position => {
    const s = (p || '').toLowerCase()
    if (s.includes('goalkeeper') || s === 'gk' || s === 'por') return 'POR'
    if (s.includes('defender') || s === 'def') return 'DEF'
    if (s.includes('forward') || s.includes('attacker') || s.includes('striker') || s === 'del' || s === 'fwd') return 'DEL'
    if (s.includes('midfielder') || s === 'med' || s === 'mid') return 'MED'
    return 'MED'
  }

  const fmtPts = (num: number): string => String(parseFloat((Math.round(num * 100) / 100).toFixed(2)))
  const r2 = (v: number) => Math.round(v * 100) / 100
  const n = (v: any) => Number(v) || 0

  const pos = normPos(player.calc_position || player.position)

  const GOAL          = R.goal
  const CLEAN_SHEET   = R.clean_sheet
  const GOAL_CONCEDED = R.goal_conceded

  interface StandardRow {
    block: string
    label: string
    count: string | number
    unit: string | number
    points: number
  }

  const rows: StandardRow[] = []

  // Determinar resultado si fixture está disponible
  let isWin = false
  let isDraw = false
  let isLoss = false
  let hasResult = false

  if (fixture) {
    const playerTeamId = player.team_id
    const homeTeamId = fixture.home_team_id
    const awayTeamId = fixture.away_team_id
    
    if (playerTeamId === homeTeamId || playerTeamId === awayTeamId) {
      hasResult = true
      const homeScore = n(fixture.home_score)
      const awayScore = n(fixture.away_score)
      const isHome = playerTeamId === homeTeamId
      
      if (homeScore > awayScore) {
        isWin = isHome
        isLoss = !isHome
      } else if (awayScore > homeScore) {
        isWin = !isHome
        isLoss = isHome
      } else {
        isDraw = true
      }
    }
  }

  // 1. Participación
  const min = n(player.minutes_played)
  if (min > 0) {
    const isStarter = player.is_starter === true || player.is_starter === 1 || player.is_starter === 'true'
    const hasThreshold = min >= R.participation.minutes_threshold
    rows.push({
      block: 'Participación',
      label: isStarter 
        ? (hasThreshold ? `Titular (${min}')` : `Titular (<${R.participation.minutes_threshold}') (${min}')`) 
        : (hasThreshold ? `Suplente (>=${R.participation.minutes_threshold}') (${min}')` : `Suplente (${min}')`),
      count: '-',
      unit: '-',
      points: hasThreshold ? R.participation.starter_bonus : R.participation.substitute_bonus
    })

    let wb = n(player.win_bonus)
    let db = n(player.draw_bonus)

    if (wb === 0 && db === 0 && hasResult && min >= R.participation.minutes_threshold) {
      if (isWin) {
        wb = R.participation.win_bonus_60
      } else if (isDraw) {
        db = R.participation.draw_bonus_60
      }
    }

    if (wb > 0) {
      rows.push({
        block: 'Participación',
        label: 'Victoria (>=60\')',
        count: '-',
        unit: '-',
        points: wb
      })
    } else if (db > 0) {
      rows.push({
        block: 'Participación',
        label: 'Empate (>=60\')',
        count: '-',
        unit: '-',
        points: db
      })
    } else if (min >= R.participation.minutes_threshold) {
      rows.push({
        block: 'Participación',
        label: isWin ? 'Victoria (>=60\')' : isDraw ? 'Empate (>=60\')' : 'Derrota (>=60\')',
        count: '-',
        unit: '-',
        points: 0
      })
    }
  } else {
    rows.push({
      block: 'Participación',
      label: 'Titular/Suplente (0\')',
      count: '-',
      unit: '-',
      points: 0
    })
  }

  // 2. Goles/Asis
  rows.push({
    block: 'Goles/Asis',
    label: `Gol (${pos})`,
    count: n(player.goals),
    unit: GOAL[pos],
    points: r2(n(player.goals) * GOAL[pos])
  })
  rows.push({
    block: 'Goles/Asis',
    label: 'Gol Propia',
    count: n(player.own_goals),
    unit: R.own_goal,
    points: r2(n(player.own_goals) * R.own_goal)
  })
  rows.push({
    block: 'Goles/Asis',
    label: 'Asistencia de gol',
    count: n(player.assists),
    unit: R.assist_goal,
    points: r2(n(player.assists) * R.assist_goal)
  })
  rows.push({
    block: 'Goles/Asis',
    label: 'Asistencia sin gol',
    count: n(player.fantasy_assist || player.intent_assists),
    unit: R.assist_no_goal,
    points: r2(n(player.fantasy_assist || player.intent_assists) * R.assist_no_goal)
  })

  // 3. Defensa
  const cs = player.clean_sheet === true || player.clean_sheet === 1 || player.clean_sheet === 'true'
  rows.push({
    block: 'Defensa',
    label: `Portería Cero (${pos})`,
    count: '-',
    unit: '-',
    points: cs ? CLEAN_SHEET[pos] : 0
  })
  const gcCount = n(player.goals_conceded)
  rows.push({
    block: 'Defensa',
    label: `Gol Encajado (${pos})`,
    count: gcCount,
    unit: GOAL_CONCEDED[pos],
    points: gcCount > 1 ? r2(gcCount * GOAL_CONCEDED[pos]) : 0
  })

  // 4. Penaltis
  rows.push({
    block: 'Penaltis',
    label: 'Penalti Provocado',
    count: n(player.penalties_won),
    unit: R.penalty_won[pos],
    points: r2(n(player.penalties_won) * R.penalty_won[pos])
  })
  rows.push({
    block: 'Penaltis',
    label: 'Penalti Cometido',
    count: n(player.penalties_conceded),
    unit: R.penalty_conceded[pos],
    points: r2(n(player.penalties_conceded) * R.penalty_conceded[pos])
  })
  rows.push({
    block: 'Penaltis',
    label: 'Penalti Fallado',
    count: n(player.penalties_missed),
    unit: R.penalty_missed,
    points: r2(n(player.penalties_missed) * R.penalty_missed)
  })
  rows.push({
    block: 'Penaltis',
    label: 'Penalti Parado',
    count: n(player.penalty_saves),
    unit: R.penalty_save[pos],
    points: r2(n(player.penalty_saves) * R.penalty_save[pos])
  })

  // 5. Tarjetas
  rows.push({
    block: 'Tarjetas',
    label: 'Amarilla',
    count: n(player.yellow_cards),
    unit: R.yellow_card,
    points: r2(n(player.yellow_cards) * R.yellow_card)
  })
  rows.push({
    block: 'Tarjetas',
    label: 'Doble Amarilla',
    count: n(player.second_yellow_cards),
    unit: R.second_yellow_card,
    points: r2(n(player.second_yellow_cards) * R.second_yellow_card)
  })
  rows.push({
    block: 'Tarjetas',
    label: 'Roja Directa',
    count: n(player.red_cards),
    unit: R.red_card,
    points: r2(n(player.red_cards) * R.red_card)
  })

  // 6. Portero (solo para POR)
  if (pos === 'POR') {
    rows.push({
      block: 'Portero',
      label: 'Paradas',
      count: n(player.saves),
      unit: R.per_unit.saves,
      points: r2(n(player.saves) * R.per_unit.saves)
    })
  }

  // 7. Otras
  rows.push({
    block: 'Otras',
    label: 'Despejes',
    count: n(player.clearances),
    unit: R.per_unit.clearances,
    points: r2(n(player.clearances) * R.per_unit.clearances)
  })
  rows.push({
    block: 'Otras',
    label: 'Tiros a puerta',
    count: n(player.shots_on_target),
    unit: R.per_unit.shots_on_target,
    points: r2(n(player.shots_on_target) * R.per_unit.shots_on_target)
  })
  rows.push({
    block: 'Otras',
    label: 'Regates comp.',
    count: n(player.takeons_won),
    unit: R.per_unit.takeons_won,
    points: r2(n(player.takeons_won) * R.per_unit.takeons_won)
  })
  rows.push({
    block: 'Otras',
    label: 'Balones al área',
    count: n(player.box_entries),
    unit: R.per_unit.box_entries,
    points: r2(n(player.box_entries) * R.per_unit.box_entries)
  })
  rows.push({
    block: 'Otras',
    label: 'Balón recuperado',
    count: n(player.ball_recoveries),
    unit: R.per_unit.ball_recoveries,
    points: r2(n(player.ball_recoveries) * R.per_unit.ball_recoveries)
  })

  // 8. Pérdidas
  const lostBalls = n(player.dispossessed) + n(player.bad_touches) + n(player.takeons_lost)
  rows.push({
    block: 'Pérdidas',
    label: 'Pérdida de balón',
    count: lostBalls,
    unit: R.lost_balls,
    points: r2(lostBalls * R.lost_balls)
  })

  // Filtrar eventos directos con puntuación/interacción
  const filteredStandardRows = rows.filter(row => {
    if (row.block === 'Participación') {
      if (row.label.includes('Titular') || row.label.includes('Suplente')) {
        return min > 0
      }
      return row.points > 0
    }
    if (row.label.includes('Portería Cero')) {
      return cs
    }
    if (row.count !== '-') {
      return n(row.count) > 0
    }
    return row.points !== 0
  })

  // RELEVO Blocks evaluation
  const relevoEvaluated = evaluateRelevoBlocks(player as any, pos, R.relevo_limits)
  const blockSpecs = RELEVO_BLOCKS[pos] || []
  const lim = R.relevo_limits?.[pos] || {}

  const relevoCardRows = blockSpecs.map((specBlock, idx) => {
    const evalBlock = relevoEvaluated[idx] || { points: 0, metrics: [] }
    
    let metricCounter = 0
    const options = specBlock.options.map((optSpec) => {
      const metrics = optSpec.metrics.map((mSpec) => {
        const result = evalBlock.metrics[metricCounter] || {
          label: mSpec.label,
          unit: mSpec.unit,
          value: 0,
          target: 0,
          met: false
        }
        metricCounter++

        const val = result.value
        const tgt = pos === 'POR' && specBlock.id === 2
          ? (lim?.calidad_parada_multiplier ?? 0.5) * n(player.saves)
          : result.target

        const valPerMin = min > 0 ? (val / min).toFixed(3) : '0.000'
        const tgtPerMin = min > 0 ? (tgt / min).toFixed(3) : '0.000'

        return {
          label: mSpec.label,
          unit: mSpec.unit,
          value: val,
          valPerMin,
          target: tgt,
          tgtPerMin,
          met: result.met,
          cmp: mSpec.cmp,
          detail: result.detail
        }
      })

      return {
        requireAll: optSpec.requireAll,
        metrics
      }
    })

    return {
      id: specBlock.id,
      title: specBlock.title,
      note: specBlock.note,
      points: evalBlock.points,
      options
    }
  })

  const total = n(player.total_points)
  const maxAbsPoints = Math.max(
    ...filteredStandardRows.map(r => Math.abs(r.points)),
    ...relevoCardRows.map(r => Math.abs(r.points)),
    1
  )

  const renderStandardTable = (tableRows: StandardRow[]) => (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs">
      <div className="bg-slate-50/90 px-3 py-2 border-b border-slate-200/80 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Eventos Directos</span>
        </div>
        <span className="text-[10px] font-semibold text-slate-400">{tableRows.length} registros</span>
      </div>
      <table className="w-full border-collapse text-left text-xs">
        <thead className="bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
          <tr>
            <th scope="col" className="px-3 py-2 w-[105px]">Bloque</th>
            <th scope="col" className="px-3 py-2">Métrica</th>
            <th scope="col" className="px-3 py-2 text-right w-[85px]">Puntos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tableRows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-6 text-center text-xs text-slate-400 italic">
                Sin eventos directos registrados en este partido.
              </td>
            </tr>
          ) : (
            tableRows.map((row, idx) => {
              const isPositive = row.points > 0
              const isNegative = row.points < 0
              const pct = Math.min((Math.abs(row.points) / maxAbsPoints) * 100, 100)
              
              let ptsColor = 'text-slate-500 font-bold'
              let barColor = 'bg-slate-300'
              if (isPositive) {
                ptsColor = 'text-emerald-600 font-black text-xs sm:text-sm'
                barColor = 'bg-emerald-500'
              } else if (isNegative) {
                ptsColor = 'text-rose-600 font-black text-xs sm:text-sm'
                barColor = 'bg-rose-500'
              }

              const blockBadgeStyle = 
                row.block === 'Participación' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                row.block === 'Goles/Asis' ? 'bg-rose-50 text-rose-700 border-rose-200/80' :
                row.block === 'Defensa' ? 'bg-indigo-50 text-indigo-700 border-indigo-200/80' :
                row.block === 'Penaltis' ? 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/80' :
                row.block === 'Tarjetas' ? 'bg-amber-50 text-amber-800 border-amber-200/80' :
                row.block === 'Portero' ? 'bg-cyan-50 text-cyan-800 border-cyan-200/80' :
                row.block === 'Otras' ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80' :
                row.block === 'Pérdidas' ? 'bg-rose-50 text-rose-800 border-rose-200/80' :
                'bg-violet-50 text-violet-700 border-violet-200'

              const hasCountOrUnit = row.count !== '-' && n(row.count) > 0

              return (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-3 py-2 font-bold text-[10px]">
                    <span className={`px-2 py-0.5 rounded-md border font-extrabold uppercase tracking-wider ${blockBadgeStyle}`}>
                      {row.block}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900 text-xs leading-snug">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-slate-800">{row.label}</span>
                      {hasCountOrUnit && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200/60">
                            Cant: {row.count}
                          </span>
                          {row.unit !== '-' && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium border border-slate-200/60">
                              Val. U: {Number(row.unit) > 0 ? `+${row.unit}` : row.unit} pts
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`tabular-nums leading-none ${ptsColor}`}>
                        {isPositive ? `+${fmtPts(row.points)}` : fmtPts(row.points)}
                      </span>
                      {Math.abs(row.points) > 0 && (
                        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`} 
                            style={{ width: `${pct}%` }} 
                          />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )

  const renderRelevoMetric = (m: any) => {
    const isPct = m.unit === 'pct'
    const cmpSymbol = m.cmp === 'gte' ? '≥' : '>'

    const playerValStr = isPct
      ? `${m.value.toFixed(0)}%`
      : `${m.value} (${m.valPerMin}/m)`

    const targetValStr = isPct
      ? `${cmpSymbol} ${m.target.toFixed(0)}%`
      : `${cmpSymbol} ${m.tgtPerMin}/m`

    return (
      <div 
        key={m.label} 
        className="flex flex-wrap items-center justify-between gap-1.5 py-1.5 px-2.5 rounded-lg bg-white border border-slate-200/70 shadow-2xs"
      >
        <span className="text-[11px] font-semibold text-slate-700 min-w-[110px]">
          {m.label}
        </span>

        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          {/* Métrica del Jugador */}
          <div 
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] border transition-all ${
              m.met
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
            title="Métrica del Jugador"
          >
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Jugador:</span>
            <span>{playerValStr}</span>
            {m.met ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
          </div>

          {/* Separador */}
          <span className="text-[10px] font-bold text-slate-300">vs</span>

          {/* Meta a Sobrepasar */}
          <div 
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] bg-amber-50/80 text-amber-900 border border-amber-200/80"
            title="Meta a sobrepasar para puntuar"
          >
            <Target className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-700/80">Meta:</span>
            <span>{targetValStr}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Container Grid Dual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Columna Izquierda: Eventos Directos */}
        {renderStandardTable(filteredStandardRows)}

        {/* Columna Derecha: Bloques RELEVO */}
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs flex flex-col">
          <div className="bg-violet-50/70 px-3 py-2 border-b border-violet-100 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-violet-900">Bloques RELEVO</span>
            </div>
            <span className="text-[10px] font-semibold text-violet-500">Rendimiento por min</span>
          </div>

          <div className="p-2.5 space-y-2 flex-1">
            {min === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                El jugador no disputó minutos (0 min). No hay bloques RELEVO evaluados.
              </div>
            ) : (
              relevoCardRows.map((block) => {
                const isPositive = block.points > 0
                const isNegative = block.points < 0

                return (
                  <div 
                    key={block.id}
                    className={`rounded-xl border p-2.5 transition-all shadow-2xs ${
                      isPositive 
                        ? 'bg-gradient-to-r from-emerald-50/30 to-white border-emerald-200/80' 
                        : isNegative 
                        ? 'bg-gradient-to-r from-rose-50/30 to-white border-rose-200/80'
                        : 'bg-slate-50/40 border-slate-200/70'
                    }`}
                  >
                    {/* Header del bloque */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-violet-100 text-violet-800 border border-violet-200">
                          Bloque {block.id}
                        </span>
                        <h4 className="text-xs font-bold text-slate-800">
                          {block.title}
                        </h4>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-black tabular-nums shadow-2xs ${
                        isPositive
                          ? 'bg-emerald-500 text-white'
                          : isNegative
                          ? 'bg-rose-500 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isPositive ? `+${block.points}` : block.points} pts
                      </span>
                    </div>

                    {/* Opciones y Métricas */}
                    <div className="space-y-1.5">
                      {block.options.map((opt: any, optIdx: number) => (
                        <div key={optIdx} className="space-y-1">
                          {optIdx > 0 && (
                            <div className="flex items-center justify-center my-1">
                              <span className="px-2 py-0.2 rounded-full text-[9px] font-black uppercase tracking-widest bg-violet-100 text-violet-700 border border-violet-200">
                                O
                              </span>
                            </div>
                          )}

                          {opt.requireAll && opt.metrics.length > 1 && (
                            <div className="text-[10px] font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-100 mb-1 inline-block">
                              Exige cumplir TODAS las métricas (Y):
                            </div>
                          )}

                          {opt.metrics.map((m: any) => renderRelevoMetric(m))}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Tarjeta de Puntuación Total */}
      <div className="rounded-xl bg-slate-900 text-white p-3 sm:p-4 flex items-center justify-between shadow-md border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Puntuación Total</p>
            <p className="text-xs font-semibold text-slate-300">Sumatorio de eventos y bloques RELEVO</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-400 tabular-nums">
            {fmtPts(total)}
          </span>
          <span className="text-xs font-bold text-emerald-500/80 ml-1">pts</span>
        </div>
      </div>
    </div>
  )
}
