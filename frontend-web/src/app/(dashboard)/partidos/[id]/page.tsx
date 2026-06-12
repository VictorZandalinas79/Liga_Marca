'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Trophy, MapPin, Clock, Calendar, Users, TrendingUp, RefreshCw } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'

interface Player {
  id: string
  first_name: string
  last_name: string
  short_name: string
  position: string
  photo?: string
  shirt_number?: number
  team_id: string
  is_starter?: boolean
  minutes_played?: number
  total_points?: number
  goals?: number
  assists?: number
  // Goles y remates
  shots_on_target?: number
  shots_off_target?: number
  shots_hit_woodwork?: number
  big_chances_created?: number
  big_chances_missed?: number
  penalties_scored?: number
  penalties_missed?: number
  // Asistencias
  key_passes?: number
  second_assists?: number
  intent_assists?: number
  // Defensa
  tackles_won?: number
  tackles_lost?: number
  interceptions?: number
  clearances?: number
  clearances_last_line?: number
  blocked_shots?: number
  blocked_passes?: number
  ball_recoveries?: number
  offsides_provoked?: number
  // Portero
  saves?: number
  penalty_saves?: number
  claims_ok?: number
  claims_fail?: number
  punches_ok?: number
  punches_fail?: number
  smothers?: number
  sweepers_ok?: number
  fumbles?: number
  // Pases
  passes_completed?: number
  progressive_passes?: number
  passes_into_final_third?: number
  passes_into_box?: number
  through_balls?: number
  crosses_completed?: number
  crosses_attempted?: number
  switch_plays?: number
  long_balls_completed?: number
  forward_passes?: number
  set_pieces_taken?: number
  successful_crosses?: number
  // Regates
  takeons_won?: number
  takeons_lost?: number
  good_skills?: number
  dispossessed?: number
  bad_touches?: number
  aerials_won?: number
  aerials_lost?: number
  // Recuperaciones por zona
  recoveries_high?: number
  recoveries_med?: number
  recoveries_low?: number
  // Faltas y tarjetas
  fouls_won?: number
  fouls_committed?: number
  yellow_cards?: number
  red_cards?: number
  // Errores
  errors_leading_to_shot?: number
  errors_leading_to_goal?: number
}

interface Team {
  id: string
  name: string
  logo_url?: string
  badge_url?: string
}

interface Fixture {
  id: string
  matchday: number
  home_team_id: string
  away_team_id: string
  start_time: string
  venue?: string
  status?: string
  home_score?: number
  away_score?: number
  match_id?: string
  current_minute?: number
}

interface PlayerScore {
  player_id: string
  total_points: number
  minutes_played: number
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  is_starter: boolean
}

// Componente que muestra el desglose de puntos por BLOQUES (orden oficial RELEVO).
// Espejo exacto de scoring_rules.json + trigger_descarga_eventos.py: cada métrica
// aporta los puntos exactos que suma al total oficial.
function MetricBreakdown({ player }: { player: Player & Record<string, any> }) {
  // Normaliza la posición (acepta código POR/DEF/MED/DEL o nombre en inglés)
  const normPos = (p?: string): 'POR' | 'DEF' | 'MED' | 'DEL' => {
    const s = (p || '').toLowerCase()
    if (s.includes('goalkeeper') || s === 'gk' || s === 'por') return 'POR'
    if (s.includes('defender') || s === 'def') return 'DEF'
    if (s.includes('forward') || s.includes('attacker') || s.includes('striker') || s === 'del' || s === 'fwd') return 'DEL'
    if (s.includes('midfielder') || s === 'med' || s === 'mid') return 'MED'
    return 'MED'
  }

  // Redondea a 2 decimales y quita ceros sobrantes (0.30 -> 0.3, 1.00 -> 1)
  const fmtPts = (n: number): string => String(parseFloat((Math.round(n * 100) / 100).toFixed(2)))
  const r2 = (v: number) => Math.round(v * 100) / 100
  const n = (v: any) => Number(v) || 0

  const pos = normPos(player.calc_position || player.position)

  // Tabla de puntos posicionales (espejo de scoring_rules.json)
  const GOAL = { POR: 6, DEF: 6, MED: 5, DEL: 4 } as const
  const CLEAN_SHEET = { POR: 4, DEF: 3, MED: 2, DEL: 1 } as const
  const GOAL_CONCEDED = { POR: -2, DEF: -2, MED: -1, DEL: -1 } as const

  // Fila del desglose
  interface Row {
    label: string
    count: number    // nº de eventos (0 = no mostrar contador)
    unit: number     // puntos por unidad (para "x × +u")
    points: number   // puntos aportados
    flat?: boolean   // true => puntos fijos sin contador (participación, RELEVO, portería a cero)
  }
  interface Block {
    id: string
    emoji: string
    title: string
    accent: string       // color de texto del acento
    chip: string         // fondo del chip de subtotal
    rows: Row[]
  }

  const u = (count: number, unit: number, label: string): Row =>
    ({ label, count, unit, points: r2(count * unit) })

  // ---- BLOQUE 1: Participación ----
  const min = n(player.minutes_played)
  const b1: Row[] = []
  if (min > 0) {
    const titular = min > 60
    b1.push({
      label: titular ? `Participación · +60 min (${min}′)` : `Participación · suplente (${min}′)`,
      count: 0, unit: 0, points: titular ? 2 : 1, flat: true,
    })
  }

  // ---- BLOQUE 2: Goles y Asistencias ----
  const b2: Row[] = []
  if (n(player.goals) > 0) b2.push(u(n(player.goals), GOAL[pos], `Gol (${pos})`))
  if (n(player.own_goals) > 0) b2.push(u(n(player.own_goals), -2, 'Gol en propia'))
  if (n(player.assists) > 0) b2.push(u(n(player.assists), 3, 'Asistencia de gol'))
  if (n(player.intent_assists) > 0) b2.push(u(n(player.intent_assists), 1, 'Asistencia sin gol'))

  // ---- BLOQUE 3: Defensa y Portería a Cero ----
  const b3: Row[] = []
  const cs = player.clean_sheet === true || player.clean_sheet === 1 || player.clean_sheet === 'true'
  if (cs) b3.push({ label: `Portería a cero · +60 min (${pos})`, count: 0, unit: 0, points: CLEAN_SHEET[pos], flat: true })
  if (n(player.goals_conceded) > 0) b3.push(u(n(player.goals_conceded), GOAL_CONCEDED[pos], `Gol encajado (${pos})`))

  // ---- BLOQUE 4: Penaltis ----
  const b4: Row[] = []
  if (n(player.penalties_won) > 0) b4.push(u(n(player.penalties_won), 2, 'Penalti provocado'))
  if (n(player.penalties_conceded) > 0) b4.push(u(n(player.penalties_conceded), -2, 'Penalti cometido'))
  if (n(player.penalties_missed) > 0) b4.push(u(n(player.penalties_missed), -2, 'Penalti fallado'))
  if (n(player.penalty_saves) > 0) b4.push(u(n(player.penalty_saves), 5, 'Penalti parado'))

  // ---- BLOQUE 5: Tarjetas ----
  const b5: Row[] = []
  if (n(player.yellow_cards) > 0) b5.push(u(n(player.yellow_cards), -1, 'Amarilla'))
  if (n(player.second_yellow_cards) > 0) b5.push(u(n(player.second_yellow_cards), -1, 'Doble amarilla'))
  if (n(player.red_cards) > 0) b5.push(u(n(player.red_cards), -3, 'Roja directa'))

  // ---- BLOQUE 6: Acciones de Portero ----
  const b6: Row[] = []
  if (n(player.saves) > 0) b6.push(u(n(player.saves), 0.5, 'Parada'))
  if (n(player.punches_ok) > 0) b6.push(u(n(player.punches_ok), 0.2, 'Despeje de puños'))
  if (n(player.punches_fail) > 0) b6.push(u(n(player.punches_fail), 0.1, 'Despeje de puños fallido'))
  if (n(player.claims_ok) > 0) b6.push(u(n(player.claims_ok), 0.1, 'Blocaje'))
  if (n(player.sweepers_ok) > 0) b6.push(u(n(player.sweepers_ok), 0.1, 'Salida del área'))

  // ---- BLOQUE 7: Bonus en Juego ----
  const b7: Row[] = []
  if (n(player.passes_completed) > 0) b7.push(u(n(player.passes_completed), 0.05, 'Pases completados'))
  if (n(player.forward_passes) > 0) b7.push(u(n(player.forward_passes), 0.2, 'Pases hacia adelante'))
  if (n(player.box_entries) > 0) b7.push(u(n(player.box_entries), 0.1, 'Entradas al área'))
  if (n(player.successful_crosses) > 0) b7.push(u(n(player.successful_crosses), 0.3, 'Centros exitosos'))
  if (n(player.set_pieces_taken) > 0) b7.push(u(n(player.set_pieces_taken), 0.2, 'Balón parado'))
  if (n(player.takeons_won) > 0) b7.push(u(n(player.takeons_won), 0.5, 'Regates ganados'))
  if (n(player.shots_on_target) > 0) b7.push(u(n(player.shots_on_target), 0.3, 'Tiros a puerta'))
  if (n(player.recoveries_high) > 0) b7.push(u(n(player.recoveries_high), 0.3, 'Recuperación alta'))
  if (n(player.recoveries_med) > 0) b7.push(u(n(player.recoveries_med), 0.2, 'Recuperación media'))
  if (n(player.recoveries_low) > 0) b7.push(u(n(player.recoveries_low), 0.1, 'Recuperación baja'))
  if (n(player.clearances) > 0) b7.push(u(n(player.clearances), 0.5, 'Despejes'))

  // ---- BLOQUE 8: Penalizaciones ----
  const b8: Row[] = []
  const lostBalls = n(player.dispossessed) + n(player.bad_touches)
  if (lostBalls > 0) b8.push(u(lostBalls, -0.1, 'Balón perdido'))

  // ---- BLOQUE 9: Puntos RELEVO ----
  const b9: Row[] = []
  if (n(player.relevo_points) > 0) b9.push({ label: 'Bonus RELEVO (rendimiento global)', count: 0, unit: 0, points: n(player.relevo_points), flat: true })

  const blocks: Block[] = [
    { id: 'b1', emoji: '⏱️', title: 'Participación', accent: 'text-slate-600', chip: 'bg-slate-100 text-slate-700', rows: b1 },
    { id: 'b2', emoji: '⚽', title: 'Goles y Asistencias', accent: 'text-red-600', chip: 'bg-red-50 text-red-700', rows: b2 },
    { id: 'b3', emoji: '🛡️', title: 'Defensa y Portería a Cero', accent: 'text-indigo-600', chip: 'bg-indigo-50 text-indigo-700', rows: b3 },
    { id: 'b4', emoji: '🎯', title: 'Penaltis', accent: 'text-fuchsia-600', chip: 'bg-fuchsia-50 text-fuchsia-700', rows: b4 },
    { id: 'b5', emoji: '🟨', title: 'Tarjetas', accent: 'text-amber-600', chip: 'bg-amber-50 text-amber-700', rows: b5 },
    { id: 'b6', emoji: '🧤', title: 'Acciones de Portero', accent: 'text-cyan-600', chip: 'bg-cyan-50 text-cyan-700', rows: b6 },
    { id: 'b7', emoji: '📈', title: 'Bonus en Juego', accent: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700', rows: b7 },
    { id: 'b8', emoji: '📉', title: 'Penalizaciones', accent: 'text-rose-600', chip: 'bg-rose-50 text-rose-700', rows: b8 },
    { id: 'b9', emoji: '⭐', title: 'Puntos RELEVO', accent: 'text-violet-600', chip: 'bg-violet-50 text-violet-700', rows: b9 },
  ]

  const sum = blocks.reduce((a, blk) => a + blk.rows.reduce((s, row) => s + row.points, 0), 0)
  const total = n(player.total_points)
  const ajuste = r2(total - sum)
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
            {/* Cabecera del bloque */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">{blk.emoji}</span>
                <h4 className={`font-bold text-sm ${blk.accent}`}>{blk.title}</h4>
              </div>
              <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${subtotal >= 0 ? blk.chip : 'bg-red-50 text-red-700'}`}>
                {subtotal >= 0 ? '+' : ''}{fmtPts(subtotal)}
              </span>
            </div>
            {/* Filas */}
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

      {/* Ajuste de redondeo (debería ser ~0 si el desglose cuadra) */}
      {ajuste !== 0 && (
        <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-sm text-slate-500">Ajuste / redondeo</span>
          <span className={`text-sm font-semibold ${ajuste >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {ajuste >= 0 ? '+' : ''}{fmtPts(ajuste)}
          </span>
        </div>
      )}

      {/* Total oficial */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-4 flex items-center justify-between shadow-md">
        <span className="text-white font-bold text-lg">Puntos totales</span>
        <span className="text-white font-extrabold text-3xl tabular-nums">{fmtPts(total)}</span>
      </div>
    </div>
  )
}

export default function PartidoDetallePage() {
  const [loading, setLoading] = useState(true)
  const [fixture, setFixture] = useState<Fixture | null>(null)
  const [homeTeam, setHomeTeam] = useState<Team | null>(null)
  const [awayTeam, setAwayTeam] = useState<Team | null>(null)
  const [homePlayers, setHomePlayers] = useState<Player[]>([])
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [matchMinute, setMatchMinute] = useState<number>(0)
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()

  const fetchPartido = async () => {
    const fixtureId = params.id as string

    // 1. Obtener fixture actualizado
    const { data: fixtureData } = await supabase
      .from('fixtures')
      .select('*')
      .eq('id', fixtureId)
      .single()

    if (!fixtureData) {
      setLoading(false)
      return
    }

    setFixture(fixtureData)

    // 2. Obtener equipos con escudos
    const { data: teamsData } = await supabase
      .from('real_teams')
      .select('id, name, logo_url')
      .in('id', [fixtureData.home_team_id, fixtureData.away_team_id])

    const homeTeamData = teamsData?.find(t => t.id === fixtureData.home_team_id)
    const awayTeamData = teamsData?.find(t => t.id === fixtureData.away_team_id)

    setHomeTeam(homeTeamData || null)
    setAwayTeam(awayTeamData || null)

    // 4. Obtener jugadores de ambos equipos con sus stats
    const loadTeamPlayers = async (teamId: string) => {
      // Obtener jugadores del equipo
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('team_id', teamId)
        .order('short_name', { ascending: true })

      if (!playersData) return []

      // Obtener player_scores para este partido específico
      const playerIds = playersData.map(p => p.id)

      // Primero obtener todos los player_scores del fixture
      const { data: allScoresData } = await supabase
        .from('player_scores')
        .select('*')
        .eq('fixture_id', fixtureId)

      console.log('player_scores encontrados:', allScoresData?.length || 0)
      console.log('fixture_id:', fixtureId)
      console.log('IDs de jugadores en players:', playerIds.slice(0, 5))
      console.log('IDs en player_scores:', allScoresData?.map(s => s.player_id).slice(0, 5))

      // Filtrar solo los de este equipo
      const scoresData = allScoresData?.filter(s => playerIds.includes(s.player_id)) || []

      const scoresMap = new Map(scoresData.map(s => [s.player_id, s]))

      // Combinar jugadores con TODAS las stats del partido
      const playersWithStats = playersData.map(player => {
        const score = scoresMap.get(player.id)
        return {
          ...player,
          is_starter: score?.is_starter || false,
          minutes_played: score?.minutes_played || 0,
          total_points: score?.total_points || 0,
          relevo_points: score?.relevo_points || 0,
          // Posición con la que el motor puntuó (POR/DEF/MED/DEL); si falta, la de players
          calc_position: score?.position || player.position,
          bad_touches: score?.bad_touches || 0,
          // Goles y remates
          goals: score?.goals || 0,
          own_goals: score?.own_goals || 0,
          shots_on_target: score?.shots_on_target || 0,
          shots_off_target: score?.shots_off_target || 0,
          shots_hit_woodwork: score?.shots_hit_woodwork || 0,
          big_chances_created: score?.big_chances_created || 0,
          big_chances_missed: score?.big_chances_missed || 0,
          penalties_scored: score?.penalties_scored || 0,
          penalties_missed: score?.penalties_missed || 0,
          penalties_won: score?.penalties_won || 0,
          penalties_conceded: score?.penalties_conceded || 0,
          // Asistencias
          assists: score?.assists || 0,
          key_passes: score?.key_passes || 0,
          second_assists: score?.second_assists || 0,
          intent_assists: score?.intent_assists || 0,
          // Defensa
          tackles_won: score?.tackles_won || 0,
          tackles_lost: score?.tackles_lost || 0,
          interceptions: score?.interceptions || 0,
          clearances: score?.clearances || 0,
          clearances_last_line: score?.clearances_last_line || 0,
          blocked_shots: score?.blocked_shots || 0,
          blocked_passes: score?.blocked_passes || 0,
          ball_recoveries: score?.ball_recoveries || 0,
          offsides_provoked: score?.offsides_provoked || 0,
          // Portero
          saves: score?.saves || 0,
          penalty_saves: score?.penalty_saves || 0,
          claims_ok: score?.claims_ok || 0,
          claims_fail: score?.claims_fail || 0,
          punches_ok: score?.punches_ok || 0,
          punches_fail: score?.punches_fail || 0,
          smothers: score?.smothers || 0,
          sweepers_ok: score?.sweepers_ok || 0,
          fumbles: score?.fumbles || 0,
          // Pases
          passes_completed: score?.passes_completed || 0,
          progressive_passes: score?.progressive_passes || 0,
          passes_into_final_third: score?.passes_into_final_third || 0,
          passes_into_box: score?.passes_into_box || 0,
          through_balls: score?.through_balls || 0,
          crosses_completed: score?.crosses_completed || 0,
          crosses_attempted: score?.crosses_attempted || 0,
          switch_plays: score?.switch_plays || 0,
          long_balls_completed: score?.long_balls_completed || 0,
          // Nuevos bonus v3.0
          forward_passes: score?.forward_passes || 0,
          set_pieces_taken: score?.set_pieces_taken || 0,
          successful_crosses: score?.successful_crosses || 0,
          // Bonus ataque
          box_entries: score?.box_entries || 0,  // Llegadas al área
          // Regates
          takeons_won: score?.takeons_won || 0,
          takeons_lost: score?.takeons_lost || 0,
          good_skills: score?.good_skills || 0,
          dispossessed: score?.dispossessed || 0,
          aerials_won: score?.aerials_won || 0,
          aerials_lost: score?.aerials_lost || 0,
          // Recuperaciones por zona
          recoveries_high: score?.recoveries_high || 0,
          recoveries_med: score?.recoveries_med || 0,
          recoveries_low: score?.recoveries_low || 0,
          // Faltas y tarjetas
          fouls_won: score?.fouls_won || 0,
          fouls_committed: score?.fouls_committed || 0,
          yellow_cards: score?.yellow_cards || 0,
          second_yellow_cards: score?.second_yellow_cards || 0,
          red_cards: score?.red_cards || 0,
          // Errores
          errors_leading_to_shot: score?.errors_leading_to_shot || 0,
          errors_leading_to_goal: score?.errors_leading_to_goal || 0,
          // Portería
          clean_sheet: score?.clean_sheet || false,
          goals_conceded: score?.goals_conceded || 0,
        }
      })

      // Si hay datos en player_scores, mostrar solo jugadores con puntos
      // Si no, mostrar todos los jugadores del equipo
      const hasScoreData = scoresData && scoresData.length > 0

      if (hasScoreData) {
        // Mostrar solo jugadores que tienen datos de partido
        return playersWithStats.filter(p =>
          (p.total_points && p.total_points > 0) ||
          (p.goals && p.goals > 0) ||
          (p.assists && p.assists > 0) ||
          (p.minutes_played && p.minutes_played > 0) ||
          (p.is_starter !== undefined && p.is_starter)
        )
      }

      return playersWithStats
    }

    const [home, away] = await Promise.all([
      loadTeamPlayers(fixtureData.home_team_id),
      loadTeamPlayers(fixtureData.away_team_id)
    ])

    setHomePlayers(home)
    setAwayPlayers(away)
    setLoading(false)
    setLastUpdated(new Date())
  }

  const handleSyncMatch = async () => {
    if (!fixture) return

    setSyncing(true)
    setSyncStatus(null)

    try {
      const matchId = fixture.match_id || fixture.id

      const response = await fetch('/api/sync-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_id: fixture.id,
          match_id: matchId
        })
      })

      const result = await response.json()

      if (response.ok) {
        setSyncStatus({
          type: 'success',
          message: result.message || 'Sincronización lanzada. Los puntos aparecerán en 1-2 min; refresca.'
        })
        // Recargar datos del partido (los nuevos datos llegan en segundo plano)
        await fetchPartido()
      } else {
        setSyncStatus({
          type: 'error',
          message: result.error || 'Error al sincronizar'
        })
      }
    } catch (error) {
      setSyncStatus({
        type: 'error',
        message: 'Error de conexión al sincronizar'
      })
    } finally {
      setSyncing(false)
      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setSyncStatus(null), 5000)
    }
  }

  // Efecto para cargar datos inicialmente
  useEffect(() => {
    fetchPartido()
  }, [params.id])

  // Efecto para polling cuando el partido está en vivo o cerca de empezar
  useEffect(() => {
    if (!fixture) return

    const now = new Date()
    const matchTime = fixture.start_time ? new Date(fixture.start_time) : null

    if (!matchTime) return

    const diffMs = matchTime.getTime() - now.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    // Hacer polling si:
    // - El partido empezó (diffMins <= 0)
    // - O falta <= 5 minutos para empezar
    const matchStarted = diffMins <= 0
    const matchStartingSoon = diffMins > 0 && diffMins <= 5
    const matchFinished = fixture.status === 'finished'

    if ((matchStarted || matchStartingSoon) && !matchFinished) {
      const interval = setInterval(() => {
        fetchPartido()
      }, 30000) // 30 segundos

      return () => clearInterval(interval)
    }
  }, [fixture?.status, fixture?.start_time])

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return {
      date: date.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }),
      time: date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  const calculateMatchMinute = () => {
    if (fixture?.status !== 'live') return 0
    // Preferimos el último minuto de los datos sincronizados (lo guarda el motor
    // en fixtures.current_minute). Así el minuto coincide con los eventos subidos
    // en vez de adelantarse con el reloj del navegador.
    if (typeof fixture?.current_minute === 'number' && fixture.current_minute > 0) {
      return fixture.current_minute
    }
    // Fallback (aún no se ha sincronizado ningún evento): reloj real.
    if (!fixture?.start_time) return 0
    const now = new Date()
    const kickOff = new Date(fixture.start_time)
    const diffMs = now.getTime() - kickOff.getTime()
    const minutes = Math.floor(diffMs / 60000)
    return Math.min(minutes, 90) // Máximo 90 minutos
  }

  // Actualizar minuto del partido cada 30 segundos si está en vivo
  useEffect(() => {
    if (fixture?.status === 'live') {
      setMatchMinute(calculateMatchMinute())
      const interval = setInterval(() => {
        setMatchMinute(calculateMatchMinute())
      }, 30000)
      return () => clearInterval(interval)
    }
  }, [fixture?.status, fixture?.start_time, fixture?.current_minute])

  const getPositionOrder = (position: string): number => {
    const posLower = position.toLowerCase()
    if (posLower.includes('goalkeeper') || posLower === 'gk') return 0 // Porteros primero
    if (posLower.includes('defender') || posLower === 'def') return 1 // Defensas segundo
    if (posLower.includes('midfielder') || posLower === 'mid') return 2 // Medios tercero
    if (posLower.includes('forward') || posLower === 'fwd') return 3 // Delanteros cuarto
    return 2 // Por defecto, medios
  }

  const getPositionLabel = (position: string) => {
    const posLower = position.toLowerCase()
    if (posLower.includes('goalkeeper') || posLower === 'gk') return 'POR'
    if (posLower.includes('defender') || posLower === 'def') return 'DEF'
    if (posLower.includes('midfielder') || posLower === 'mid') return 'MED'
    if (posLower.includes('forward') || posLower === 'fwd') return 'DEL'
    return 'MED'
  }

  const getPositionColor = (position: string) => {
    const code = getPositionLabel(position)
    const colors: Record<string, string> = {
      POR: 'bg-amber-500 text-white',
      DEF: 'bg-blue-500 text-white',
      MED: 'bg-emerald-500 text-white',
      DEL: 'bg-red-500 text-white',
    }
    return colors[code] || 'bg-slate-500 text-white'
  }

  const renderPlayerCard = (player: Player) => (
    <div
      key={player.id}
      onClick={() => setSelectedPlayer(player)}
      className="cursor-pointer"
    >
      <Card className={`hover:shadow-lg transition-all !bg-slate-800 border-slate-700 hover:border-emerald-500 ${
        !player.is_starter ? 'opacity-75' : ''
      }`}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {player.photo ? (
                <img
                  src={player.photo}
                  alt={player.short_name || ''}
                  className="w-12 h-12 rounded-full object-cover border-2 border-slate-600"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                    ;(e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden')
                  }}
                />
              ) : null}
              <div className={`w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-400 border-2 border-slate-600 ${player.photo ? 'hidden' : ''}`}>
                {player.shirt_number || '?'}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h4 className="font-semibold text-white text-sm">{player.short_name || `${player.first_name} ${player.last_name}`}</h4>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPositionColor(player.position)}`}>
                    {getPositionLabel(player.position)}
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                  <span>{player.is_starter ? 'Titular' : 'Suplente'}</span>
                  <span>{player.minutes_played || 0}'</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center space-x-1 text-emerald-400">
                <span className="text-xl font-bold">{player.total_points || 0}</span>
              </div>
              <p className="text-xs text-slate-400">puntos</p>
              {(player.goals || 0) > 0 && (
                <p className="text-xs text-green-400">⚽ {player.goals}</p>
              )}
              {(player.assists || 0) > 0 && (
                <p className="text-xs text-blue-400">🅰️ {player.assists}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando partido...</div>
  }

  const dateTime = fixture?.start_time ? formatDateTime(fixture.start_time) : null

  return (
    <div className="space-y-6">
      {/* Botón volver */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver
      </button>

      {/* Cabecera del partido */}
      <Card className="!bg-slate-800 border-slate-700">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div className="flex items-center gap-3">
              {fixture?.status === 'live' ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-500 text-white animate-pulse">
                    En Juego
                  </Badge>
                  <span className="text-red-500 font-bold text-sm">{matchMinute}&apos;</span>
                </div>
              ) : (
                <Badge className={fixture?.status === 'finished' ? 'bg-emerald-500' : 'bg-slate-500'}>
                  {fixture?.status === 'finished' ? 'Finalizado' : 'Programado'}
                </Badge>
              )}
              {/* Botón de sincronizar */}
              <button
                onClick={handleSyncMatch}
                disabled={syncing}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white text-xs font-medium rounded-md transition-colors"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3" />
                    Sincronizar
                  </>
                )}
              </button>
            </div>
            {dateTime && (
              <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-slate-300 flex-wrap">
                <div className="flex items-center gap-1 capitalize">
                  <Calendar className="w-4 h-4 shrink-0" />
                  {dateTime.date}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4 shrink-0" />
                  {dateTime.time}
                </div>
              </div>
            )}
          </div>

          {/* Mensaje de estado de sincronización */}
          {syncStatus && (
            <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
              syncStatus.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {syncStatus.message}
            </div>
          )}

          {/* Marcador arriba del todo */}
          <div className="flex items-center justify-between mb-6">
            {/* Equipo Local */}
            <div className="flex-1 flex flex-col items-center">
              {homeTeam?.logo_url ? (
                <img src={homeTeam.logo_url} alt={homeTeam.name} className="w-16 h-16 sm:w-20 sm:h-20 object-contain mb-3" />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-700 flex items-center justify-center mb-3">
                  <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-slate-400" />
                </div>
              )}
              <h2 className="text-base sm:text-xl font-bold text-white text-center">{homeTeam?.name || 'Local'}</h2>
            </div>

            {/* Marcador Central */}
            <div className="px-3 sm:px-8 flex flex-col items-center">
              <div className="flex items-center gap-2 sm:gap-4 text-3xl sm:text-4xl font-bold text-white">
                <span>{fixture?.home_score ?? 0}</span>
                <span className="text-slate-500">-</span>
                <span>{fixture?.away_score ?? 0}</span>
              </div>
              {fixture?.status === 'live' && (
                <Badge className="mt-2 bg-red-500 text-white animate-pulse">
                  En Juego
                </Badge>
              )}
              {fixture?.status === 'finished' && (
                <Badge className="mt-2 bg-emerald-500 text-white">
                  Finalizado
                </Badge>
              )}
            </div>

            {/* Equipo Visitante */}
            <div className="flex-1 flex flex-col items-center">
              {awayTeam?.logo_url ? (
                <img src={awayTeam.logo_url} alt={awayTeam.name} className="w-16 h-16 sm:w-20 sm:h-20 object-contain mb-3" />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-700 flex items-center justify-center mb-3">
                  <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-slate-400" />
                </div>
              )}
              <h2 className="text-base sm:text-xl font-bold text-white text-center">{awayTeam?.name || 'Visitante'}</h2>
            </div>
          </div>

          {fixture?.venue && (
            <div className="mt-6 pt-4 border-t border-slate-700 text-center">
              <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                <MapPin className="w-4 h-4" />
                {fixture.venue}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Jugadores de ambos equipos */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Equipo Local */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            {homeTeam?.badge_url && (
              <img src={homeTeam.badge_url} alt={homeTeam.name} className="w-6 h-6 object-contain" />
            )}
            <h3 className="text-lg font-bold text-white">{homeTeam?.name || 'Local'}</h3>
            <Badge variant="outline" className="ml-auto">
              <Users className="w-3 h-3 mr-1" />
              {homePlayers.length}
            </Badge>
          </div>

          <div className="space-y-4">
            {/* Porteros */}
            {homePlayers.filter(p => getPositionLabel(p.position) === 'POR').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-amber-600 uppercase mb-2">Porteros</h4>
                <div className="space-y-2">
                  {homePlayers
                    .filter(p => getPositionLabel(p.position) === 'POR')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Defensas */}
            {homePlayers.filter(p => getPositionLabel(p.position) === 'DEF').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-blue-600 uppercase mb-2">Defensas</h4>
                <div className="space-y-2">
                  {homePlayers
                    .filter(p => getPositionLabel(p.position) === 'DEF')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Medios */}
            {homePlayers.filter(p => getPositionLabel(p.position) === 'MED').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-emerald-600 uppercase mb-2">Mediocampistas</h4>
                <div className="space-y-2">
                  {homePlayers
                    .filter(p => getPositionLabel(p.position) === 'MED')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Delanteros */}
            {homePlayers.filter(p => getPositionLabel(p.position) === 'DEL').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-red-600 uppercase mb-2">Delanteros</h4>
                <div className="space-y-2">
                  {homePlayers
                    .filter(p => getPositionLabel(p.position) === 'DEL')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Equipo Visitante */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            {awayTeam?.badge_url && (
              <img src={awayTeam.badge_url} alt={awayTeam.name} className="w-6 h-6 object-contain" />
            )}
            <h3 className="text-lg font-bold text-white">{awayTeam?.name || 'Visitante'}</h3>
            <Badge variant="outline" className="ml-auto">
              <Users className="w-3 h-3 mr-1" />
              {awayPlayers.length}
            </Badge>
          </div>

          <div className="space-y-4">
            {/* Porteros */}
            {awayPlayers.filter(p => getPositionLabel(p.position) === 'POR').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-amber-600 uppercase mb-2">Porteros</h4>
                <div className="space-y-2">
                  {awayPlayers
                    .filter(p => getPositionLabel(p.position) === 'POR')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Defensas */}
            {awayPlayers.filter(p => getPositionLabel(p.position) === 'DEF').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-blue-600 uppercase mb-2">Defensas</h4>
                <div className="space-y-2">
                  {awayPlayers
                    .filter(p => getPositionLabel(p.position) === 'DEF')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Medios */}
            {awayPlayers.filter(p => getPositionLabel(p.position) === 'MED').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-emerald-600 uppercase mb-2">Mediocampistas</h4>
                <div className="space-y-2">
                  {awayPlayers
                    .filter(p => getPositionLabel(p.position) === 'MED')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
            {/* Delanteros */}
            {awayPlayers.filter(p => getPositionLabel(p.position) === 'DEL').length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-red-600 uppercase mb-2">Delanteros</h4>
                <div className="space-y-2">
                  {awayPlayers
                    .filter(p => getPositionLabel(p.position) === 'DEL')
                    .sort((a, b) => Number(b.is_starter) - Number(a.is_starter))
                    .map(renderPlayerCard)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de detalle de jugador con métricas completas */}
      {selectedPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedPlayer(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 p-6 flex justify-between items-start z-10">
              <div className="flex items-center space-x-4">
                {selectedPlayer.photo ? (
                  <img
                    src={selectedPlayer.photo}
                    alt={selectedPlayer.short_name || ''}
                    className="w-20 h-20 rounded-full object-cover border-4 border-white"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                      ;(e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                ) : null}
                <div className={`w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 border-4 border-white ${selectedPlayer.photo ? 'hidden' : ''}`}>
                  {selectedPlayer.shirt_number || '?'}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {selectedPlayer.first_name} {selectedPlayer.last_name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPositionColor(selectedPlayer.position)}`}>
                      {getPositionLabel(selectedPlayer.position)}
                    </span>
                    <span className="text-sm text-slate-600">
                      {selectedPlayer.is_starter ? 'Titular' : 'Suplente'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500"
              >
                <ArrowLeft className="w-5 h-5 rotate-180" />
              </button>
            </div>

            {/* Cuerpo con métricas */}
            <div className="p-4 sm:p-6 space-y-6">
              {/* Resumen principal */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-emerald-50 p-4 rounded-xl text-center">
                  <p className="text-emerald-800 text-sm font-semibold">Puntos</p>
                  <p className="text-3xl font-bold text-emerald-600">{selectedPlayer.total_points || 0}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl text-center">
                  <p className="text-slate-600 text-sm font-semibold">Minutos</p>
                  <p className="text-3xl font-bold text-slate-800">{selectedPlayer.minutes_played || 0}'</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl text-center">
                  <p className="text-slate-600 text-sm font-semibold">Goles</p>
                  <p className="text-3xl font-bold text-slate-800">{selectedPlayer.goals || 0}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl text-center">
                  <p className="text-slate-600 text-sm font-semibold">Asistencias</p>
                  <p className="text-3xl font-bold text-slate-800">{selectedPlayer.assists || 0}</p>
                </div>
              </div>

              {/* Métricas por categoría */}
              <MetricBreakdown player={selectedPlayer} />

              {/* Botón para ver perfil completo */}
              <button
                onClick={() => {
                  router.push(`/jugadores/${selectedPlayer.id}`)
                  setSelectedPlayer(null)
                }}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-colors"
              >
                Ver perfil completo con historial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
