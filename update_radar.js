const fs = require('fs')

let content = fs.readFileSync('frontend-web/src/app/(dashboard)/jugadores/[id]/page.tsx', 'utf-8')

// We replace from `const calculateRadarStats =` up to `// Preparar grupos de estadísticas`

const startTag = '  const calculateRadarStats ='
const endTag = '  // Preparar grupos de estadísticas'

const startIndex = content.indexOf(startTag)
const endIndex = content.indexOf(endTag)

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find boundaries")
  process.exit(1)
}

const newCode = `
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
    compareLabel = \`Media Liga (\${pos})\`
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
    compareLabel = comparePlayer.short_name || \`\${comparePlayer.first_name} \${comparePlayer.last_name}\`
    compareRadar = calculateRadarStats(compareScores, comparePlayer.position)
  } else {
    // Fallback if empty (e.g. init)
    compareRadar = playerRadar.map(a => ({ ...a, value: 0 }))
  }

  const getPointsStr = (radar: RadarAxis[]) => {
    const cx = 160
    const cy = 135
    const r = 90
    // Pentagon angles (start at top, go clockwise)
    const angles = [-Math.PI/2, -Math.PI/10, Math.PI/3.33, Math.PI * 0.7, Math.PI * 1.1]
    return radar.map((axis, idx) => {
      const d = (axis.value / 100) * r
      const x = cx + d * Math.cos(angles[idx])
      const y = cy + d * Math.sin(angles[idx])
      return \`\${x},\${y}\`
    }).join(' ')
  }

  const p1Points = getPointsStr(playerRadar)
  const p2Points = getPointsStr(compareRadar)

  const radarAngles = [-Math.PI/2, -Math.PI/10, Math.PI/3.33, Math.PI * 0.7, Math.PI * 1.1]
  const p1Values = playerRadar.map(a => a.value)
  const p2Values = compareRadar.map(a => a.value)

`

const newContent = content.substring(0, startIndex) + newCode + content.substring(endIndex)

fs.writeFileSync('frontend-web/src/app/(dashboard)/jugadores/[id]/page.tsx', newContent)
console.log("Replaced JS successfully")
