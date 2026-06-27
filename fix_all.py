import re

with open('frontend-web/src/app/(dashboard)/jugadores/[id]/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Unplayed fixtures
code = code.replace(
"""      if (scoresData) {
        // Recopilar los ids de equipo de todos los fixtures
        const teamIds = [...new Set(
          scoresData.flatMap(s => [s.fixtures?.home_team_id, s.fixtures?.away_team_id])""",
"""      let allScores = scoresData || []

      if (playerData.team_id) {
        const playedFixtureIds = new Set(allScores.map(s => s.fixture_id))
        const { data: teamFixtures } = await supabase
          .from('fixtures')
          .select('id, start_time, matchday, home_team_id, away_team_id, home_score, away_score, status')
          .lt('start_time', new Date().toISOString())
          .or(`home_team_id.eq.${playerData.team_id},away_team_id.eq.${playerData.team_id}`)

        if (teamFixtures) {
          const unplayedFixtures = teamFixtures.filter(f => !playedFixtureIds.has(f.id))
          const unplayedScores = unplayedFixtures.map(f => ({
            id: `unplayed-${f.id}`,
            fixture_id: f.id,
            match_id: f.id,
            total_points: 0,
            minutes_played: 0,
            is_starter: false,
            position: playerData.position,
            relevo_points: 0,
            goals: 0, goal_header_bonus: 0, goal_freekick_bonus: 0, own_goals: 0, goals_conceded: 0, clean_sheet: false,
            assists: 0, key_passes: 0, second_assists: 0, intent_assists: 0,
            shots_on_target: 0, shots_off_target: 0, shots_hit_woodwork: 0, big_chances_created: 0, big_chances_missed: 0,
            penalties_scored: 0, penalties_missed: 0, penalties_won: 0, penalties_conceded: 0,
            saves: 0, penalty_saves: 0, claims_ok: 0, claims_fail: 0, fumbles: 0, crosses_not_claimed: 0, punches_ok: 0, punches_fail: 0, smothers: 0, sweepers_ok: 0, sweepers_fail: 0, parries_safe: 0, parries_danger: 0,
            clearances: 0, clearances_last_line: 0, blocked_crosses: 0, interceptions: 0, interceptions_high: 0, interceptions_med: 0, interceptions_low: 0, tackles_won: 0, tackles_lost: 0, blocked_shots: 0, blocked_passes: 0, ball_recoveries: 0, recoveries_high: 0, recoveries_med: 0, recoveries_low: 0, offsides_provoked: 0, challenges_lost: 0,
            errors_leading_to_shot: 0, errors_leading_to_goal: 0,
            passes_completed: 0, passes_attempted: 0, progressive_passes: 0, passes_into_final_third: 0, passes_into_box: 0, through_balls: 0, crosses_completed: 0, crosses_attempted: 0, switch_plays: 0, pull_backs: 0, long_balls_completed: 0, lay_offs: 0, forward_passes: 0, set_pieces_taken: 0, successful_crosses: 0, box_entries: 0,
            takeons_won: 0, takeons_lost: 0, takeons_overrun: 0, good_skills: 0, dispossessed: 0, bad_touches: 0,
            aerials_won: 0, aerials_lost: 0,
            fouls_committed: 0, fouls_won: 0,
            yellow_cards: 0, second_yellow_cards: 0, red_cards: 0,
            fixtures: {
              start_time: f.start_time,
              matchday: f.matchday,
              home_team_id: f.home_team_id,
              away_team_id: f.away_team_id,
              home_score: f.home_score,
              away_score: f.away_score
            }
          } as any))
          allScores = [...allScores, ...unplayedScores]
        }
      }

      if (allScores.length > 0) {
        // Recopilar los ids de equipo de todos los fixtures
        const teamIds = [...new Set(
          allScores.flatMap(s => [s.fixtures?.home_team_id, s.fixtures?.away_team_id])"""
)

code = code.replace(
"""        const mapped = scoresData.map(s => ({""",
"""        const mapped = allScores.map(s => ({"""
)

# 2. State 
code = code.replace(
"""  const [activeBar, setActiveBar] = useState<number | null>(null)""",
"""  const [activeBar, setActiveBar] = useState<number | null>(null)
  const [activeRadarAxis, setActiveRadarAxis] = useState<number | null>(null)"""
)

# 3. Sin minutos red
code = code.replace(
"""                  <div className="text-[10px] text-slate-400 italic">
                    {chartData[activeBar].score.minutes_played}' min · {chartData[activeBar].score.is_starter ? 'Titular' : 'Suplente'}
                  </div>""",
"""                  <div className="text-[10px] text-slate-400 italic">
                    {chartData[activeBar].score.minutes_played > 0 
                      ? `${chartData[activeBar].score.minutes_played}' min · ${chartData[activeBar].score.is_starter ? 'Titular' : 'Suplente'}` 
                      : <span className="text-red-500 font-bold">Sin minutos</span>}
                  </div>"""
)

code = code.replace(
"""                <div className="text-right">
                  <p className="text-xl font-bold text-emerald-600">{Math.round((score.total_points || 0) * 10) / 10}</p>
                  <p className="text-xs text-slate-500">{score.minutes_played}' {score.is_starter ? '(T)' : '(S)'}</p>
                </div>""",
"""                <div className="text-right">
                  <p className="text-xl font-bold text-emerald-600">{Math.round((score.total_points || 0) * 10) / 10}</p>
                  <p className="text-xs text-slate-500">
                    {score.minutes_played > 0 ? `${score.minutes_played}' ${score.is_starter ? '(T)' : '(S)'}` : <span className="text-red-500 font-semibold">Sin minutos</span>}
                  </p>
                </div>"""
)

# 4. Calculate Radar Stats
import json

radar_logic_start = """  const calculateRadarStats = (scoresList: PlayerScore[], posCode: string) => {"""
radar_logic_end = """  // Preparar grupos de estadísticas"""

new_radar_logic = """
  type RadarAxis = {
    label: string
    value: number
    metrics: { label: string; value: number | string }[]
  }

  const calculateRadarStats = (scoresList: PlayerScore[], posCode: string): RadarAxis[] => {
    const n = (v: any) => Number(v) || 0
    const matches = scoresList.length
    const isPOR = posCode.toUpperCase().includes('POR') || posCode.toUpperCase() === 'GK' || posCode.toUpperCase() === 'GOALKEEPER'

    const emptyRadar = (isPor: boolean): RadarAxis[] => {
      if (isPor) {
        return [
          { label: 'Portería', value: 0, metrics: [] },
          { label: 'Defensa (Área)', value: 0, metrics: [] },
          { label: 'Distribución', value: 0, metrics: [] },
          { label: 'Importancia', value: 0, metrics: [] },
          { label: 'Concentración', value: 0, metrics: [] }
        ]
      }
      return [
        { label: 'Defensa', value: 0, metrics: [] },
        { label: 'Ataque', value: 0, metrics: [] },
        { label: 'Finalización', value: 0, metrics: [] },
        { label: 'Importancia', value: 0, metrics: [] },
        { label: 'Balón parado', value: 0, metrics: [] }
      ]
    }

    if (matches === 0) return emptyRadar(isPOR)

    let goals = 0, assists = 0, shots_on_target = 0, passes_completed = 0
    let takeons_won = 0, clean_sheets = 0, interceptions = 0, ball_recoveries = 0
    let clearances = 0, saves = 0, penalty_saves = 0, claims_ok = 0, sweepers_ok = 0
    let minutes_played = 0, starter_count = 0, forward_passes = 0, progressive_passes = 0
    let long_balls_completed = 0, box_entries = 0, set_pieces_taken = 0
    let penalties_scored = 0, smothers = 0, aerials_won = 0

    scoresList.forEach(s => {
      goals += n(s.goals)
      assists += n(s.assists)
      shots_on_target += n(s.shots_on_target)
      passes_completed += n(s.passes_completed)
      takeons_won += n(s.takeons_won)
      clean_sheets += s.clean_sheet ? 1 : 0
      interceptions += n(s.interceptions_high) + n(s.interceptions_med) + n(s.interceptions_low) || n(s.interceptions)
      ball_recoveries += n(s.recoveries_high) + n(s.recoveries_med) + n(s.recoveries_low) || n(s.ball_recoveries)
      clearances += n(s.clearances)
      saves += n(s.saves)
      penalty_saves += n(s.penalty_saves)
      claims_ok += n(s.claims_ok)
      sweepers_ok += n(s.sweepers_ok)
      minutes_played += n(s.minutes_played)
      starter_count += s.is_starter ? 1 : 0
      forward_passes += n(s.forward_passes)
      progressive_passes += n(s.progressive_passes)
      long_balls_completed += n(s.long_balls_completed)
      box_entries += n(s.box_entries)
      set_pieces_taken += n(s.set_pieces_taken)
      penalties_scored += n(s.penalties_scored)
      smothers += n(s.smothers)
      aerials_won += n(s.aerials_won)
    })

    const r2 = (v: number) => Math.round(v * 100) / 100
    const norm = (val: number, maxExpected: number) => Math.round(Math.min(100, Math.max(0, (val / maxExpected) * 100)))

    const p_interceptions = interceptions / matches
    const p_recoveries = ball_recoveries / matches
    const p_aerials = aerials_won / matches
    const p_clearances = clearances / matches
    const p_takeons = takeons_won / matches
    const p_forward = (forward_passes + progressive_passes) / matches
    const p_assists = assists / matches
    const p_passes = passes_completed / matches
    const p_long_balls = long_balls_completed / matches
    const p_box_entries = box_entries / matches
    const p_shots = shots_on_target / matches
    const p_goals = goals / matches
    const p_minutes = minutes_played / (matches * 90)
    const p_starter = starter_count / matches
    const p_set_pieces = set_pieces_taken / matches
    const p_pen_scored = penalties_scored / matches
    const p_saves = saves / matches
    const p_clean_sheets = clean_sheets / matches
    const p_sweepers_claims = (sweepers_ok + claims_ok) / matches
    const p_pen_saves = penalty_saves / matches
    const p_smothers = smothers / matches

    if (!isPOR) {
      const defScore = p_interceptions * 10 + p_recoveries * 5 + p_aerials * 5 + p_clearances * 5
      const atkScore = p_takeons * 8 + p_forward * 1.5 + p_assists * 30 + p_passes * 0.5 + p_long_balls * 2
      const finScore = p_box_entries * 4 + p_shots * 15 + p_goals * 40
      const impScore = p_minutes * 70 + p_starter * 30
      const bpScore = p_set_pieces * 25 + p_pen_scored * 50

      return [
        {
          label: 'Defensa',
          value: norm(defScore, 120),
          metrics: [
            { label: 'Intercepciones p.p.', value: r2(p_interceptions) },
            { label: 'Recuperaciones p.p.', value: r2(p_recoveries) },
            { label: 'Duelos aéreos gan. p.p.', value: r2(p_aerials) },
            { label: 'Despejes p.p.', value: r2(p_clearances) }
          ]
        },
        {
          label: 'Ataque',
          value: norm(atkScore, 116.5),
          metrics: [
            { label: 'Regates p.p.', value: r2(p_takeons) },
            { label: 'Pases adelante p.p.', value: r2(p_forward) },
            { label: 'Asistencias p.p.', value: r2(p_assists) },
            { label: 'Pases completados p.p.', value: r2(p_passes) },
            { label: 'Pases largos p.p.', value: r2(p_long_balls) }
          ]
        },
        {
          label: 'Finalización',
          value: norm(finScore, 66),
          metrics: [
            { label: 'Centros/Área p.p.', value: r2(p_box_entries) },
            { label: 'Tiros a puerta p.p.', value: r2(p_shots) },
            { label: 'Goles p.p.', value: r2(p_goals) }
          ]
        },
        {
          label: 'Importancia',
          value: norm(impScore, 100),
          metrics: [
            { label: 'Minutos p.p.', value: r2(minutes_played / matches) },
            { label: '% Titular', value: r2(p_starter * 100) + '%' }
          ]
        },
        {
          label: 'Balón parado',
          value: norm(bpScore, 100),
          metrics: [
            { label: 'Lanzamientos p.p.', value: r2(p_set_pieces) },
            { label: 'Penaltis marcados p.p.', value: r2(p_pen_scored) }
          ]
        }
      ]
    } else {
      const portScore = p_saves * 15 + p_clean_sheets * 50
      const defScore = p_sweepers_claims * 10 + p_clearances * 5
      const distScore = p_long_balls * 4 + p_passes * 2
      const impScore = p_minutes * 70 + p_starter * 30
      const concScore = p_pen_saves * 300 + p_smothers * 20

      return [
        {
          label: 'Portería',
          value: norm(portScore, 80),
          metrics: [
            { label: 'Paradas p.p.', value: r2(p_saves) },
            { label: 'Porterías a cero p.p.', value: r2(p_clean_sheets) }
          ]
        },
        {
          label: 'Defensa (Área)',
          value: norm(defScore, 50),
          metrics: [
            { label: 'Salidas/Blocajes p.p.', value: r2(p_sweepers_claims) },
            { label: 'Despejes p.p.', value: r2(p_clearances) }
          ]
        },
        {
          label: 'Distribución',
          value: norm(distScore, 80),
          metrics: [
            { label: 'Pases completados p.p.', value: r2(p_passes) },
            { label: 'Pases largos p.p.', value: r2(p_long_balls) }
          ]
        },
        {
          label: 'Importancia',
          value: norm(impScore, 100),
          metrics: [
            { label: 'Minutos p.p.', value: r2(minutes_played / matches) },
            { label: '% Titular', value: r2(p_starter * 100) + '%' }
          ]
        },
        {
          label: 'Concentración',
          value: norm(concScore, 50),
          metrics: [
            { label: 'Penaltis parados p.p.', value: r2(p_pen_saves) },
            { label: 'Anticipaciones p.p.', value: r2(p_smothers) }
          ]
        }
      ]
    }
  }

  const playerRadar = calculateRadarStats(scores, player.position)

  let compareRadar: RadarAxis[] = []
  let compareLabel = ''

  if (compareTarget === 'media-pos') {
    const pos = normPos(player.position)
    compareLabel = `Media Liga (${pos})`
    const isPOR = pos === 'POR'
    if (isPOR) {
      compareRadar = [
        { label: 'Portería', value: 70, metrics: [] },
        { label: 'Defensa (Área)', value: 60, metrics: [] },
        { label: 'Distribución', value: 65, metrics: [] },
        { label: 'Importancia', value: 80, metrics: [] },
        { label: 'Concentración', value: 50, metrics: [] }
      ]
    } else if (pos === 'DEF') {
      compareRadar = [
        { label: 'Defensa', value: 75, metrics: [] },
        { label: 'Ataque', value: 40, metrics: [] },
        { label: 'Finalización', value: 20, metrics: [] },
        { label: 'Importancia', value: 75, metrics: [] },
        { label: 'Balón parado', value: 30, metrics: [] }
      ]
    } else if (pos === 'MED') {
      compareRadar = [
        { label: 'Defensa', value: 60, metrics: [] },
        { label: 'Ataque', value: 70, metrics: [] },
        { label: 'Finalización', value: 50, metrics: [] },
        { label: 'Importancia', value: 75, metrics: [] },
        { label: 'Balón parado', value: 50, metrics: [] }
      ]
    } else {
      compareRadar = [
        { label: 'Defensa', value: 30, metrics: [] },
        { label: 'Ataque', value: 75, metrics: [] },
        { label: 'Finalización', value: 80, metrics: [] },
        { label: 'Importancia', value: 75, metrics: [] },
        { label: 'Balón parado', value: 40, metrics: [] }
      ]
    }
  } else if (compareTarget === 'media-gen') {
    compareLabel = 'Media Liga'
    const isPOR = normPos(player.position) === 'POR'
    if (isPOR) {
      compareRadar = [
        { label: 'Portería', value: 65, metrics: [] },
        { label: 'Defensa (Área)', value: 60, metrics: [] },
        { label: 'Distribución', value: 60, metrics: [] },
        { label: 'Importancia', value: 75, metrics: [] },
        { label: 'Concentración', value: 45, metrics: [] }
      ]
    } else {
      compareRadar = [
        { label: 'Defensa', value: 50, metrics: [] },
        { label: 'Ataque', value: 50, metrics: [] },
        { label: 'Finalización', value: 50, metrics: [] },
        { label: 'Importancia', value: 70, metrics: [] },
        { label: 'Balón parado', value: 40, metrics: [] }
      ]
    }
  } else if (comparePlayer) {
    compareLabel = comparePlayer.short_name || `${comparePlayer.first_name} ${comparePlayer.last_name}`
    compareRadar = calculateRadarStats(compareScores, comparePlayer.position)
  } else {
    compareRadar = playerRadar.map(a => ({ ...a, value: 0 }))
  }

  const getPointsStr = (radar: RadarAxis[]) => {
    const cx = 160
    const cy = 135
    const r = 90
    const angles = [-Math.PI/2, -Math.PI/10, Math.PI/3.33, Math.PI * 0.7, Math.PI * 1.1]
    return radar.map((axis, idx) => {
      const d = (axis.value / 100) * r
      const x = cx + d * Math.cos(angles[idx])
      const y = cy + d * Math.sin(angles[idx])
      return `${x},${y}`
    }).join(' ')
  }

  const p1Points = getPointsStr(playerRadar)
  const p2Points = getPointsStr(compareRadar)

  const radarAngles = [-Math.PI/2, -Math.PI/10, Math.PI/3.33, Math.PI * 0.7, Math.PI * 1.1]
  const p1Values = playerRadar.map(a => a.value)
  const p2Values = compareRadar.map(a => a.value)

"""

start_idx = code.find(radar_logic_start)
end_idx = code.find(radar_logic_end)
code = code[:start_idx] + new_radar_logic + code[end_idx:]


# 5. Replace Radar SVG
radar_svg_start = """<CardContent className="p-4 flex flex-col items-center">"""
radar_svg_end = """{/* Leyenda comparativa con números */}"""

new_radar_svg = """<CardContent className="p-4 flex flex-col items-center relative">
              {activeRadarAxis !== null && (
                <div 
                  className="absolute z-10 bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs flex flex-col gap-1 pointer-events-none transition-all duration-150 min-w-[160px]"
                  style={{
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div className="font-bold text-emerald-400 border-b border-slate-700 pb-1 mb-1 text-sm text-center">
                    {playerRadar[activeRadarAxis]?.label}
                  </div>
                  {playerRadar[activeRadarAxis]?.metrics.map((m, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span className="text-slate-400">{m.label}</span>
                      <span className="font-bold text-slate-100">{m.value}</span>
                    </div>
                  ))}
                  <div className="text-[10px] text-slate-500 italic mt-1 text-center border-t border-slate-800 pt-1">
                    Valor eje: {playerRadar[activeRadarAxis]?.value}/100
                  </div>
                </div>
              )}

              <div className="w-full flex justify-center py-2">
                <svg width="320" height="280" viewBox="0 0 320 280" className="overflow-visible">
                  {/* Concentric grids at 25, 50, 75, 100 */}
                  {[25, 50, 75, 100].map((pct) => {
                    const d = (pct / 100) * 90
                    const points = radarAngles.map(angle => {
                      return `${160 + d * Math.cos(angle)},${135 + d * Math.sin(angle)}`
                    }).join(' ')
                    return (
                      <polygon
                        key={pct}
                        points={points}
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="1"
                        strokeDasharray={pct === 100 ? "0" : "2 2"}
                      />
                    )
                  })}

                  {/* Axis lines */}
                  {radarAngles.map((angle, idx) => {
                    const x2 = 160 + 90 * Math.cos(angle)
                    const y2 = 135 + 90 * Math.sin(angle)
                    return (
                      <line
                        key={idx}
                        x1={160}
                        y1={135}
                        x2={x2}
                        y2={y2}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                    )
                  })}

                  {/* Axis Labels */}
                  {radarAngles.map((angle, idx) => {
                    const d = 110
                    let x = 160 + d * Math.cos(angle)
                    let y = 135 + d * Math.sin(angle)
                    let textAnchor = "middle"
                    if (Math.abs(Math.cos(angle)) > 0.1) {
                      textAnchor = Math.cos(angle) > 0 ? "start" : "end"
                    }
                    if (Math.sin(angle) > 0) y += 5
                    
                    return (
                      <text 
                        key={idx} 
                        x={x} 
                        y={y} 
                        textAnchor={textAnchor} 
                        className="text-[10px] font-bold fill-slate-500 cursor-pointer hover:fill-emerald-600 transition-colors"
                        onMouseEnter={() => setActiveRadarAxis(idx)}
                        onMouseLeave={() => setActiveRadarAxis(null)}
                      >
                        {playerRadar[idx]?.label}
                      </text>
                    )
                  })}

                  {/* Target polygon (P2) */}
                  <polygon
                    points={p2Points}
                    fill="rgba(249, 115, 22, 0.15)"
                    stroke="rgba(249, 115, 22, 0.75)"
                    strokeWidth="2"
                    className="transition-all duration-300"
                  />

                  {/* Player polygon (P1) */}
                  <polygon
                    points={p1Points}
                    fill="rgba(16, 185, 129, 0.25)"
                    stroke="rgba(16, 185, 129, 0.85)"
                    strokeWidth="2.5"
                    className="transition-all duration-300 pointer-events-none"
                  />

                  {/* Vertex circles for P2 */}
                  {p2Values.map((val, idx) => {
                    const angle = radarAngles[idx]
                    const d = (val / 100) * 90
                    const x = 160 + d * Math.cos(angle)
                    const y = 135 + d * Math.sin(angle)
                    return (
                      <circle
                        key={`p2-${idx}`}
                        cx={x}
                        cy={y}
                        r="3"
                        className="fill-orange-500 stroke-white stroke-[1.5]"
                      />
                    )
                  })}

                  {/* Vertex circles for P1 (Interactive) */}
                  {p1Values.map((val, idx) => {
                    const angle = radarAngles[idx]
                    const d = (val / 100) * 90
                    const x = 160 + d * Math.cos(angle)
                    const y = 135 + d * Math.sin(angle)
                    return (
                      <circle
                        key={`p1-${idx}`}
                        cx={x}
                        cy={y}
                        r="5"
                        className="fill-emerald-500 stroke-white stroke-[2] cursor-pointer transition-all hover:r-6"
                        onMouseEnter={() => setActiveRadarAxis(idx)}
                        onMouseLeave={() => setActiveRadarAxis(null)}
                      />
                    )
                  })}
                </svg>
              </div>

              """

svg_start_idx = code.find(radar_svg_start)
svg_end_idx = code.find(radar_svg_end)
code = code[:svg_start_idx] + new_radar_svg + code[svg_end_idx:]


# 6. Replace Legend
legend_start = """{/* Leyenda comparativa con números */}"""
legend_end = """            </CardContent>"""

new_legend = """{/* Leyenda comparativa con números */}
              <div className="w-full grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 mt-1 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate max-w-[120px]">{player.short_name || player.first_name}</span>
                  </div>
                  <div className="pl-3.5 text-slate-500 space-y-0.5 font-medium">
                    {playerRadar.map((axis, i) => (
                      <div key={i} className="flex justify-between gap-1">
                        <span className="truncate">{axis.label}:</span> 
                        <span className="font-bold text-slate-700 tabular-nums shrink-0">{axis.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-orange-600">
                    <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                    <span className="truncate max-w-[120px]">{compareLabel}</span>
                  </div>
                  <div className="pl-3.5 text-slate-500 space-y-0.5 font-medium">
                    {compareRadar.map((axis, i) => (
                      <div key={i} className="flex justify-between gap-1">
                        <span className="truncate">{axis.label}:</span> 
                        <span className="font-bold text-slate-700 tabular-nums shrink-0">{axis.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
"""

leg_start_idx = code.find(legend_start)
leg_end_idx = code.find(legend_end, leg_start_idx)
code = code[:leg_start_idx] + new_legend + code[leg_end_idx:]

with open('frontend-web/src/app/(dashboard)/jugadores/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Python rewrite successful")
