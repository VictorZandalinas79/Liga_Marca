'use client'

import { TrendingUp } from 'lucide-react'

// Acepta cualquier objeto con campos de player_scores (los lee con Number(v)||0)
export function MetricBreakdown({ player }: { player: Record<string, any> }) {
  const normPos = (p?: string): 'POR' | 'DEF' | 'MED' | 'DEL' => {
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

  const GOAL           = { POR: 6,    DEF: 6,    MED: 5,    DEL: 4    } as const
  const CLEAN_SHEET    = { POR: 4,    DEF: 3,    MED: 2,    DEL: 1    } as const
  const GOAL_CONCEDED  = { POR: -2,   DEF: -2,   MED: -1,   DEL: -1   } as const
  const BALL_RECOVERY  = { POR: 0.1,  DEF: 0.2,  MED: 0.2,  DEL: 0.1  } as const

  interface Row  { label: string; count: number; unit: number; points: number; flat?: boolean }
  interface Block { id: string; emoji: string; title: string; accent: string; chip: string; rows: Row[] }

  const u = (count: number, unit: number, label: string): Row =>
    ({ label, count, unit, points: r2(count * unit) })

  // B1: Participación
  const min = n(player.minutes_played)
  const b1: Row[] = []
  if (min > 0) {
    const titular = min > 60
    b1.push({ label: titular ? `Participación · +60 min (${min}′)` : `Participación · suplente (${min}′)`, count: 0, unit: 0, points: titular ? 2 : 1, flat: true })
  }

  // B2: Goles y Asistencias
  const b2: Row[] = []
  if (n(player.goals) > 0)         b2.push(u(n(player.goals), GOAL[pos], `Gol (${pos})`))
  if (n(player.own_goals) > 0)     b2.push(u(n(player.own_goals), -2, 'Gol en propia'))
  if (n(player.assists) > 0)       b2.push(u(n(player.assists), 3, 'Asistencia de gol'))
  if (n(player.intent_assists) > 0) b2.push(u(n(player.intent_assists), 1, 'Asistencia sin gol'))

  // B3: Defensa y Portería a Cero
  const b3: Row[] = []
  const cs = player.clean_sheet === true || player.clean_sheet === 1 || player.clean_sheet === 'true'
  if (cs) b3.push({ label: `Portería a cero · +60 min (${pos})`, count: 0, unit: 0, points: CLEAN_SHEET[pos], flat: true })
  if (n(player.goals_conceded) > 0) b3.push(u(n(player.goals_conceded), GOAL_CONCEDED[pos], `Gol encajado (${pos})`))

  // B4: Penaltis
  const b4: Row[] = []
  if (n(player.penalties_won) > 0)      b4.push(u(n(player.penalties_won), 2, 'Penalti provocado'))
  if (n(player.penalties_conceded) > 0) b4.push(u(n(player.penalties_conceded), -2, 'Penalti cometido'))
  if (n(player.penalties_missed) > 0)   b4.push(u(n(player.penalties_missed), -2, 'Penalti fallado'))
  if (n(player.penalty_saves) > 0)      b4.push(u(n(player.penalty_saves), 5, 'Penalti parado'))

  // B5: Tarjetas
  const b5: Row[] = []
  if (n(player.yellow_cards) > 0)        b5.push(u(n(player.yellow_cards), -1, 'Amarilla'))
  if (n(player.second_yellow_cards) > 0) b5.push(u(n(player.second_yellow_cards), -1, 'Doble amarilla'))
  if (n(player.red_cards) > 0)           b5.push(u(n(player.red_cards), -3, 'Roja directa'))

  // B6: Portero
  const b6: Row[] = []
  if (n(player.saves) > 0)       b6.push(u(n(player.saves), 0.5, 'Parada'))
  if (n(player.punches_ok) > 0)  b6.push(u(n(player.punches_ok), 0.2, 'Despeje de puños'))
  if (n(player.punches_fail) > 0) b6.push(u(n(player.punches_fail), 0.1, 'Despeje de puños fallido'))
  if (n(player.claims_ok) > 0)   b6.push(u(n(player.claims_ok), 0.1, 'Blocaje'))
  if (n(player.sweepers_ok) > 0) b6.push(u(n(player.sweepers_ok), 0.1, 'Salida del área'))

  // B7: Bonus en Juego
  const b7: Row[] = []
  if (n(player.passes_completed) > 0)   b7.push(u(n(player.passes_completed), 0.05, 'Pases completados'))
  if (n(player.forward_passes) > 0)     b7.push(u(n(player.forward_passes), 0.2, 'Pases hacia adelante'))
  if (n(player.box_entries) > 0)        b7.push(u(n(player.box_entries), 0.1, 'Entradas al área'))
  if (n(player.successful_crosses) > 0) b7.push(u(n(player.successful_crosses), 0.3, 'Centros exitosos'))
  if (n(player.set_pieces_taken) > 0)   b7.push(u(n(player.set_pieces_taken), 0.2, 'Balón parado'))
  if (n(player.takeons_won) > 0)        b7.push(u(n(player.takeons_won), 0.5, 'Regates ganados'))
  if (n(player.long_balls_completed) > 0) b7.push(u(n(player.long_balls_completed), 0.5, 'Pases largos completados'))
  if (n(player.shots_on_target) > 0)    b7.push(u(n(player.shots_on_target), 0.3, 'Tiros a puerta'))
  if (n(player.interceptions_high) > 0) b7.push(u(n(player.interceptions_high), 0.3, 'Interceptación zona alta'))
  if (n(player.interceptions_med) > 0)  b7.push(u(n(player.interceptions_med), 0.2, 'Interceptación zona media'))
  if (n(player.interceptions_low) > 0)  b7.push(u(n(player.interceptions_low), 0.1, 'Interceptación zona baja'))
  const hasZoneRecoveries = n(player.recoveries_high) + n(player.recoveries_med) + n(player.recoveries_low) > 0
  if (hasZoneRecoveries) {
    if (n(player.recoveries_high) > 0)  b7.push(u(n(player.recoveries_high), 0.3, 'Recuperación zona alta'))
    if (n(player.recoveries_med) > 0)   b7.push(u(n(player.recoveries_med), 0.2, 'Recuperación zona media'))
    if (n(player.recoveries_low) > 0)   b7.push(u(n(player.recoveries_low), 0.1, 'Recuperación zona baja'))
  } else if (n(player.ball_recoveries) > 0) {
    b7.push(u(n(player.ball_recoveries), BALL_RECOVERY[pos], `Recuperaciones (${pos})`))
  }
  if (n(player.clearances) > 0)         b7.push(u(n(player.clearances), 0.5, 'Despejes'))

  // B8: Penalizaciones
  const b8: Row[] = []
  const lostBalls = n(player.dispossessed) + n(player.bad_touches)
  if (lostBalls > 0) b8.push(u(lostBalls, -0.1, 'Balón perdido'))

  // B9: Puntos RELEVO
  const totalRelevo = n(player.relevo_points)
  const b9: Row[] = []
  if (totalRelevo > 0) {
    let knownSum = 0

    const passesAtt = n(player.passes_attempted)
    const passAcc   = n(player.pass_accuracy)
    if (passesAtt >= 10) {
      let pts = 0
      if (passAcc >= 92) pts = 2
      else if (passAcc >= 85) pts = 1
      else if (passAcc < 65) pts = -1
      const suffix = passAcc >= 92 ? ' ≥92%' : passAcc >= 85 ? ' ≥85%' : passAcc < 65 ? ' <65%' : ''
      b9.push({ label: `Precisión pase ${passAcc.toFixed(0)}%${suffix} (${passesAtt} int.)`, count: 0, unit: 0, points: pts, flat: true })
      knownSum += pts
    }

    const shotsTotal = n(player.goals) + n(player.shots_on_target) + n(player.shots_off_target) + n(player.shots_hit_woodwork)
    if (shotsTotal >= 2) {
      const onTarget = n(player.shots_on_target) + n(player.goals)
      const shotAcc  = Math.round((onTarget / shotsTotal) * 100)
      let pts = 0
      if (shotAcc >= 50) pts = 1
      else if (shotAcc === 0) pts = -1
      b9.push({ label: `Eficacia tiro ${shotAcc}% (${onTarget}/${shotsTotal})`, count: 0, unit: 0, points: pts, flat: true })
      knownSum += pts
    }

    const duelsWon   = n(player.tackles_won) + n(player.takeons_won) + n(player.fouls_won)
    const duelsLost  = n(player.tackles_lost) + n(player.takeons_lost) + n(player.fouls_committed) + n(player.dispossessed) + n(player.challenges_lost)
    const totalDuels = duelsWon + duelsLost
    if (totalDuels >= 5) {
      const duelAcc = Math.round((duelsWon / totalDuels) * 100)
      let pts = 0
      if (duelAcc >= 60) pts = 1
      else if (duelAcc < 30) pts = -1
      b9.push({ label: `Duelos ${duelAcc}% (${duelsWon}/${totalDuels})`, count: 0, unit: 0, points: pts, flat: true })
      knownSum += pts
    }

    const aerialsTotal = n(player.aerials_won) + n(player.aerials_lost)
    if (aerialsTotal >= 3) {
      const aerAcc = Math.round((n(player.aerials_won) / aerialsTotal) * 100)
      let pts = 0
      if (aerAcc >= 60) pts = 1
      else if (aerAcc < 30) pts = -1
      b9.push({ label: `Aéreos ${aerAcc}% (${n(player.aerials_won)}/${aerialsTotal})`, count: 0, unit: 0, points: pts, flat: true })
      knownSum += pts
    }

    const takeonTotal = n(player.takeons_won) + n(player.takeons_lost)
    if (takeonTotal > 0) {
      const takeonAcc = Math.round((n(player.takeons_won) / takeonTotal) * 100)
      if (takeonAcc > 50) {
        b9.push({ label: `Regates ${takeonAcc}% éxito (${n(player.takeons_won)}/${takeonTotal})`, count: 0, unit: 0, points: 1, flat: true })
        knownSum += 1
      }
    }

    const residuo = r2(totalRelevo - Math.max(0, knownSum))
    if (residuo > 0) {
      b9.push({ label: 'Participación y pases campo rival', count: 0, unit: 0, points: residuo, flat: true })
    }
  }

  const blocks: Block[] = [
    { id: 'b1', emoji: '⏱️', title: 'Participación',             accent: 'text-slate-600',   chip: 'bg-slate-100 text-slate-700',   rows: b1 },
    { id: 'b2', emoji: '⚽', title: 'Goles y Asistencias',       accent: 'text-red-600',     chip: 'bg-red-50 text-red-700',        rows: b2 },
    { id: 'b3', emoji: '🛡️', title: 'Defensa y Portería a Cero', accent: 'text-indigo-600',  chip: 'bg-indigo-50 text-indigo-700',  rows: b3 },
    { id: 'b4', emoji: '🎯', title: 'Penaltis',                  accent: 'text-fuchsia-600', chip: 'bg-fuchsia-50 text-fuchsia-700', rows: b4 },
    { id: 'b5', emoji: '🟨', title: 'Tarjetas',                  accent: 'text-amber-600',   chip: 'bg-amber-50 text-amber-700',    rows: b5 },
    { id: 'b6', emoji: '🧤', title: 'Acciones de Portero',       accent: 'text-cyan-600',    chip: 'bg-cyan-50 text-cyan-700',      rows: b6 },
    { id: 'b7', emoji: '📈', title: 'Bonus en Juego',            accent: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700', rows: b7 },
    { id: 'b8', emoji: '📉', title: 'Penalizaciones',            accent: 'text-rose-600',    chip: 'bg-rose-50 text-rose-700',      rows: b8 },
    { id: 'b9', emoji: '⭐', title: 'Puntos RELEVO',             accent: 'text-violet-600',  chip: 'bg-violet-50 text-violet-700',  rows: b9 },
  ]

  const total = n(player.total_points)
  const visibleBlocks = blocks.filter(b => b.rows.length > 0)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-emerald-600" />
        Puntos por bloques
      </h3>

      {visibleBlocks.length === 0 && (
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

      <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-4 flex items-center justify-between shadow-md">
        <span className="text-white font-bold text-lg">Puntos totales</span>
        <span className="text-white font-extrabold text-3xl tabular-nums">{fmtPts(total)}</span>
      </div>
    </div>
  )
}
