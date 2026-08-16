'use client'

import { RELEVO_BLOCKS, evaluateRelevoBlocks, resolveRates, type Position } from '@/lib/scoring-config'
import { useScoringRules } from '@/hooks/use-scoring-rules'

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

  interface Row {
    block: string
    label: string
    count: string | number
    unit: string | number
    points: number
  }

  const rows: Row[] = []

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
    rows.push({
      block: 'Participación',
      label: isStarter ? `Titular (${min}')` : `Suplente (${min}')`,
      count: '-',
      unit: '-',
      points: isStarter ? R.participation.starter_bonus : R.participation.substitute_bonus
    })

    let wb = n(player.win_bonus)
    let db = n(player.draw_bonus)

    // Si los bonus no se recuperaron de la BD, inferir del resultado
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
  const lostBalls = n(player.dispossessed) + n(player.bad_touches)
  rows.push({
    block: 'Pérdidas',
    label: 'Pérdida de balón',
    count: lostBalls,
    unit: R.lost_balls,
    points: r2(lostBalls * R.lost_balls)
  })

  // 9. RELEVO
  if (min > 0) {
    const lim = R.relevo_limits?.[pos]
    const relevoBlocks = evaluateRelevoBlocks(player as any, pos, R.relevo_limits)

    const shortLabels: Record<string, string> = {
      'Paradas': 'Paradas',
      'Valor de calidad acumulado': 'Calidad P.',
      'Acierto en el pase': 'Pases',
      'Pases intentados': 'int.',
      'Blocajes': 'Blocaje',
      'Despejes de puños': 'Puños',
      'Acciones de último hombre': 'Últ. hombre',
      'Pases hacia adelante': 'Pases adelante',
      'Duelos aéreos': 'Aéreos',
      'Duelos por el suelo': 'Terrestres',
      'Remates a balón parado': 'ABP Remates',
      'Centros intentados': 'Centros',
      'Acierto en campo rival': 'Pases campo rival',
      'Acierto en tiros a puerta': 'Tiros a puerta %',
      'Acierto en regates': 'Regates %',
      'Asistencias por minuto': 'Asistencias',
      'Recuperaciones en campo rival': 'Recup. campo rival',
      'Remates de cabeza': 'Remates cabeza',
      'Pases largos': 'Pases largos',
    }

    relevoBlocks.forEach((blk, idx) => {
      const blockSpec = RELEVO_BLOCKS[pos]?.[idx]
      if (!blockSpec) return

      const optionStrings = blockSpec.options.map((opt) => {
        const metricStrings = opt.metrics.map((m) => {
          const value = m.value(player)
          const target = m.label === 'Valor de calidad acumulado' && pos === 'POR'
            ? (lim?.calidad_parada_multiplier ?? 0.5) * n(player.saves)
            : m.target(lim, min)

          const labelText = shortLabels[m.label] ?? m.label
          const cmpSymbol = m.cmp === 'gte' ? '>=' : m.cmp === 'gt' ? '>' : m.cmp

          if (m.unit === 'pct') {
            return `${labelText ? `${labelText}: ` : ''}${value.toFixed(0)}% (${cmpSymbol} ${target.toFixed(0)}%)`
          } else {
            const valPerMin = min > 0 ? (value / min).toFixed(3) : '0.000'
            const tgtPerMin = min > 0 ? (target / min).toFixed(3) : '0.000'

            if (m.label === 'Pases largos' && pos === 'POR') {
              return `${value} (${valPerMin}/m ${cmpSymbol} ${tgtPerMin}/m)`
            } else if (m.label === 'Valor de calidad acumulado' && pos === 'POR') {
              return `${labelText}: ${valPerMin}/m (${cmpSymbol} ${tgtPerMin}/m)`
            } else if (m.label === 'Pases intentados') {
              return `${value} ${labelText} (${valPerMin}/m ${cmpSymbol} ${tgtPerMin}/m)`
            } else {
              return `${labelText ? `${labelText}: ` : ''}${value} (${valPerMin}/m ${cmpSymbol} ${tgtPerMin}/m)`
            }
          }
        })
        return metricStrings.join(opt.requireAll ? ' y ' : ' o ')
      })

      const desc = optionStrings.join(' OR ')

      rows.push({
        block: 'RELEVO',
        label: `Bloque ${blk.id}: ${desc}`,
        count: '-',
        unit: '-',
        points: blk.points
      })
    })

    const allZero = relevoBlocks.every((blk) => blk.points <= 0)
    if (allZero) {
      rows.push({
        block: 'RELEVO',
        label: 'Ningún bloque superado',
        count: '-',
        unit: '-',
        points: -1
      })
    }
  } else {
    for (let i = 1; i <= 4; i++) {
      rows.push({
        block: 'RELEVO',
        label: `Bloque ${i}`,
        count: '-',
        unit: '-',
        points: 0
      })
    }
  }

  const total = n(player.total_points)
  const maxAbsPoints = Math.max(...rows.map(r => Math.abs(r.points)), 1)

  // Filtrar las filas: RELEVO siempre visible; las demás solo si tienen al menos un evento (count > 0 o cs o wb/db > 0)
  const filteredRows = rows.filter(row => {
    if (row.block === 'RELEVO') return true
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

  // Separar bloques en columna izquierda y derecha para el diseño dual en desktop
  const leftBlocks = ['Participación', 'Goles/Asis', 'Defensa', 'Penaltis', 'Tarjetas', 'Portero']
  const leftRows = filteredRows.filter(r => leftBlocks.includes(r.block))
  const rightRows = filteredRows.filter(r => !leftBlocks.includes(r.block))

  const renderTable = (tableRows: Row[]) => (
    <table className="w-full border-collapse text-left text-[11px] sm:text-xs text-slate-700">
      <thead className="bg-slate-50 text-[10px] sm:text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
        <tr>
          <th scope="col" className="px-2 py-1.5 w-[90px]">Bloque</th>
          <th scope="col" className="px-2 py-1.5">Métrica</th>
          <th scope="col" className="px-2 py-1.5 text-center w-[45px]">Cant.</th>
          <th scope="col" className="px-2 py-1.5 text-center w-[50px]">Val U.</th>
          <th scope="col" className="px-2 py-1.5 text-right w-[95px]">Puntos</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {tableRows.map((row, idx) => {
          const isPositive = row.points > 0
          const isNegative = row.points < 0
          const pct = Math.min((Math.abs(row.points) / maxAbsPoints) * 100, 100)
          
          let ptsColor = 'text-slate-500 font-bold'
          let barColor = 'bg-slate-300'
          if (isPositive) {
            ptsColor = 'text-emerald-700 font-extrabold text-xs sm:text-sm'
            barColor = 'bg-emerald-500'
          } else if (isNegative) {
            ptsColor = 'text-rose-700 font-extrabold text-xs sm:text-sm'
            barColor = 'bg-rose-500'
          }

          const isRelevo = row.block === 'RELEVO'

          return (
            <tr 
              key={idx} 
              className={`hover:bg-slate-50/50 transition-colors ${
                isRelevo ? 'bg-violet-50/10' : ''
              }`}
            >
              <td className="px-2 py-1 font-bold text-slate-600 text-[10px] sm:text-[11px]">
                <span className={`px-1.5 py-0.5 rounded ${
                  row.block === 'Participación' ? 'bg-slate-100 text-slate-700' :
                  row.block === 'Goles/Asis' ? 'bg-red-50 text-red-700' :
                  row.block === 'Defensa' ? 'bg-indigo-50 text-indigo-700' :
                  row.block === 'Penaltis' ? 'bg-fuchsia-50 text-fuchsia-700' :
                  row.block === 'Tarjetas' ? 'bg-amber-50 text-amber-700' :
                  row.block === 'Portero' ? 'bg-cyan-50 text-cyan-700' :
                  row.block === 'Otras' ? 'bg-emerald-50 text-emerald-700' :
                  row.block === 'Pérdidas' ? 'bg-rose-50 text-rose-700' :
                  'bg-violet-50 text-violet-700'
                }`}>
                  {row.block}
                </span>
              </td>
              <td className={`px-2 py-1 font-bold text-slate-900 text-xs sm:text-sm leading-snug ${isRelevo ? 'text-violet-950 font-bold' : ''}`}>
                {row.label}
              </td>
              <td className="px-2 py-1 text-center font-bold tabular-nums text-slate-800 text-xs sm:text-sm">
                {row.count === '-' ? <span className="text-slate-300 font-normal">-</span> : row.count}
              </td>
              <td className="px-2 py-1 text-center font-bold tabular-nums text-xs sm:text-sm">
                {row.unit === '-' ? (
                  <span className="text-slate-300 font-normal">-</span>
                ) : (
                  <span className={Number(row.unit) > 0 ? 'text-emerald-700' : Number(row.unit) < 0 ? 'text-rose-700' : 'text-slate-700'}>
                    {Number(row.unit) > 0 ? `+${row.unit}` : row.unit}
                  </span>
                )}
              </td>
              <td className="px-2 py-1 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <span className={`tabular-nums leading-none ${ptsColor}`}>
                    {isPositive ? `+${fmtPts(row.points)}` : fmtPts(row.points)}
                  </span>
                  {Math.abs(row.points) > 0 && (
                    <div className="w-[45px] h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
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
        })}
      </tbody>
    </table>
  )

  return (
    <div className="space-y-2">
      {/* Grid de dos columnas para pantallas de tableta/escritorio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
          {renderTable(leftRows)}
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
          {renderTable(rightRows)}
        </div>
      </div>

      {/* Puntos totales ultra compactos */}
      <div className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 flex items-center justify-between shadow-sm">
        <span className="text-white font-bold text-xs">Puntos totales</span>
        <span className="text-white font-extrabold text-base tabular-nums">{fmtPts(total)}</span>
      </div>
    </div>
  )
}
