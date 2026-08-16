'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Trophy, MapPin, Clock, Calendar, Users, TrendingUp, RefreshCw, X } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import { MetricBreakdown } from '@/components/metric-breakdown'
import { evaluateRelevoBlocks, resolveRates, type Position } from '@/lib/scoring-config'
import { useScoringRules } from '@/hooks/use-scoring-rules'

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
  fantasy_assist?: number
  // Defensa
  tackles_won?: number
  tackles_lost?: number
  interceptions?: number
  interceptions_high?: number
  interceptions_med?: number
  interceptions_low?: number
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
  // Para desglose RELEVO
  passes_attempted?: number
  pass_accuracy?: number
  challenges_lost?: number
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

  const scoringRules = useScoringRules()
  const R = resolveRates(scoringRules)

  const normPos = (p?: string): Position => {
    const s = (p || '').toLowerCase()
    if (s.includes('goalkeeper') || s === 'gk' || s === 'por') return 'POR'
    if (s.includes('defender') || s === 'def') return 'DEF'
    if (s.includes('forward') || s.includes('attacker') || s.includes('striker') || s === 'del' || s === 'fwd') return 'DEL'
    if (s.includes('midfielder') || s === 'med' || s === 'mid') return 'MED'
    return 'MED'
  }



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
          fantasy_assist: score?.intent_assists || score?.fantasy_assist || 0,
          // Defensa
          tackles_won: score?.tackles_won || 0,
          tackles_lost: score?.tackles_lost || 0,
          interceptions: score?.interceptions || 0,
          interceptions_high: score?.interceptions_high || 0,
          interceptions_med: score?.interceptions_med || 0,
          interceptions_low: score?.interceptions_low || 0,
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
          passes_attempted: score?.passes_attempted || 0,
          pass_accuracy: score?.pass_accuracy || 0,
          challenges_lost: score?.challenges_lost || 0,
          yellow_cards: score?.yellow_cards || 0,
          second_yellow_cards: score?.second_yellow_cards || 0,
          red_cards: score?.red_cards || 0,
          // Errores
          errors_leading_to_shot: score?.errors_leading_to_shot || 0,
          errors_leading_to_goal: score?.errors_leading_to_goal || 0,
          // Portería
          clean_sheet: score?.clean_sheet || false,
          goals_conceded: score?.goals_conceded || 0,
          // RELEVO: punto de cada bloque y métricas que los alimentan.
          relevo_block_1_pts: score?.relevo_block_1_pts ?? null,
          relevo_block_2_pts: score?.relevo_block_2_pts ?? null,
          relevo_block_3_pts: score?.relevo_block_3_pts ?? null,
          relevo_block_4_pts: score?.relevo_block_4_pts ?? null,
          calidad_parada: score?.calidad_parada || 0,
          pass_opp_half_attempted: score?.pass_opp_half_attempted || 0,
          pass_opp_half_completed: score?.pass_opp_half_completed || 0,
          ground_duels_won: score?.ground_duels_won || 0,
          ground_duels_total: score?.ground_duels_total || 0,
          def_actions_last_man: score?.def_actions_last_man || 0,
          set_piece_shots: score?.set_piece_shots || 0,
          header_shots: score?.header_shots || 0,
          recoveries_opp_half: score?.recoveries_opp_half || 0,
          shots_total: score?.shots_total || 0,
          takeons_overrun: score?.takeons_overrun || 0,
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

  // Mantener actualizado el jugador seleccionado si los datos se recargan
  useEffect(() => {
    if (selectedPlayer) {
      const updatedPlayer = 
        homePlayers.find(p => p.id === selectedPlayer.id) || 
        awayPlayers.find(p => p.id === selectedPlayer.id)
      
      if (updatedPlayer && JSON.stringify(updatedPlayer) !== JSON.stringify(selectedPlayer)) {
        setSelectedPlayer(updatedPlayer)
      }
    }
  }, [homePlayers, awayPlayers])

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

  const renderPlayerCard = (player: Player) => {
    const playerTeam = player.team_id === homeTeam?.id ? homeTeam : awayTeam

    return (
      <div
        key={player.id}
        onClick={() => setSelectedPlayer(player)}
        className="cursor-pointer"
      >
        <Card className={`hover:shadow-lg transition-all !bg-slate-800 border-slate-700 hover:border-emerald-500 ${
          !player.is_starter ? 'opacity-75' : ''
        }`}>
          <CardContent className="p-1.5 sm:p-2.5 flex items-center justify-between gap-2 min-h-[56px]">
            {/* Izquierda: Foto + Info básica */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              {/* Foto o dorsal */}
              {player.photo ? (
                <img
                  src={player.photo}
                  alt={player.short_name || ''}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-slate-600 shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                    ;(e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden')
                  }}
                />
              ) : null}
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-700 flex items-center justify-center text-[10px] sm:text-xs font-bold text-slate-400 border-2 border-slate-600 shrink-0 ${player.photo ? 'hidden' : ''}`}>
                {player.shirt_number || '?'}
              </div>

              {/* Nombre y demarcación/minutos */}
              <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                <p className="text-[11px] sm:text-xs font-bold text-white truncate leading-tight">
                  {player.short_name || `${player.first_name} ${player.last_name}`}
                </p>
                <div className="flex items-center gap-1">
                  <span className={`inline-flex items-center px-1 rounded text-[8px] font-bold leading-none py-0.5 ${getPositionColor(player.position)}`}>
                    {getPositionLabel(player.position)}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-slate-400 truncate">
                    {player.is_starter ? 'Tit' : 'Sup'} · {player.minutes_played || 0}' · Rec: {player.ball_recoveries || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Derecha: Puntos + Escudo */}
            <div className="flex flex-col items-end justify-center shrink-0 min-w-[36px]">
              <span className="text-sm sm:text-base font-extrabold text-emerald-400 leading-none">
                {player.total_points || 0}
              </span>
              
              {playerTeam?.logo_url ? (
                <img 
                  src={playerTeam.logo_url} 
                  alt={playerTeam.name} 
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 object-contain mt-1 shrink-0" 
                />
              ) : (
                <span className="text-[8px] text-slate-500 mt-1 shrink-0 truncate max-w-[36px]">
                  {playerTeam?.name}
                </span>
              )}

              {Number(player.relevo_points) < 0 && (
                <span className="inline-flex items-center px-1 rounded bg-rose-500/10 text-rose-400 text-[8px] font-bold mt-1 scale-90">
                  {player.relevo_points}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

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
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Equipo Local */}
        <div className="min-w-0">
          <div className="flex items-center gap-1 sm:gap-2 mb-3">
            {homeTeam?.badge_url && (
              <img src={homeTeam.badge_url} alt={homeTeam.name} className="w-4 h-4 sm:w-6 sm:h-6 object-contain" />
            )}
            <h3 className="text-sm sm:text-lg font-bold text-white truncate">{homeTeam?.name || 'Local'}</h3>
            <Badge variant="outline" className="ml-auto shrink-0">
              <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
              <span className="text-xs">{homePlayers.length}</span>
            </Badge>
          </div>

          <div className="space-y-2 sm:space-y-4">
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
        <div className="min-w-0">
          <div className="flex items-center gap-1 sm:gap-2 mb-3">
            {awayTeam?.badge_url && (
              <img src={awayTeam.badge_url} alt={awayTeam.name} className="w-4 h-4 sm:w-6 sm:h-6 object-contain" />
            )}
            <h3 className="text-sm sm:text-lg font-bold text-white truncate">{awayTeam?.name || 'Visitante'}</h3>
            <Badge variant="outline" className="ml-auto shrink-0">
              <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
              <span className="text-xs">{awayPlayers.length}</span>
            </Badge>
          </div>

          <div className="space-y-2 sm:space-y-4">
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
      {/* Modal de detalle de jugador con métricas completas */}
      {selectedPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4"
          onClick={() => setSelectedPlayer(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera compacta con resumen en la misma línea */}
            <div className="bg-white border-b border-slate-100 px-3 py-2 sm:px-4 sm:py-2.5 flex justify-between items-center z-10 shrink-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                {selectedPlayer.photo ? (
                  <img
                    src={selectedPlayer.photo}
                    alt={selectedPlayer.short_name || ''}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-slate-200 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                      ;(e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                ) : null}
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 border-2 border-slate-200 shrink-0 ${selectedPlayer.photo ? 'hidden' : ''}`}>
                  {selectedPlayer.shirt_number || '?'}
                </div>
                
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 truncate max-w-[120px] sm:max-w-[220px] leading-tight">
                      {selectedPlayer.short_name || `${selectedPlayer.first_name} ${selectedPlayer.last_name}`}
                    </h2>
                    <span className={`inline-flex items-center px-1 py-0.2 rounded text-[8px] sm:text-[9px] font-bold leading-none ${getPositionColor(selectedPlayer.position)}`}>
                      {getPositionLabel(selectedPlayer.position)}
                    </span>
                    <span className="text-[9px] sm:text-[10px] text-slate-500 font-medium">
                      ({selectedPlayer.is_starter ? 'Titular' : 'Suplente'})
                    </span>
                  </div>

                  {/* Resumen al lado del nombre en más pequeño para moviles */}
                  <div className="flex items-center gap-1.5 sm:gap-2.5 text-[9px] sm:text-[11px] text-slate-600 mt-0.5 leading-none">
                    <span className="flex items-center gap-0.5">
                      <strong className="text-emerald-600 font-extrabold">{selectedPlayer.total_points || 0}</strong> pts
                    </span>
                    <span className="text-slate-300">•</span>
                    <span><strong>{selectedPlayer.minutes_played || 0}</strong> min</span>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-0.5">
                      ⚽ <strong>{selectedPlayer.goals || 0}</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-0.5">
                      🅰️ <strong>{selectedPlayer.assists || 0}</strong>
                    </span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setSelectedPlayer(null)}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 shrink-0 ml-2 border border-slate-200/50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Cuerpo scrollable internamente y muy compacto */}
            <div className="p-2 sm:p-3 overflow-y-auto space-y-2 flex-1">
              <MetricBreakdown player={selectedPlayer} fixture={fixture || undefined} />

              <button
                onClick={() => {
                  router.push(`/jugadores/${selectedPlayer.id}`)
                  setSelectedPlayer(null)
                }}
                className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-semibold rounded-lg transition-colors mt-2"
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
