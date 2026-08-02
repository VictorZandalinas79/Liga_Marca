'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'
import { useLockedTeams } from '@/lib/locked-teams'
import { useLeagueConfig } from '@/lib/league-config'
import { applySanctionsToTeam } from '@/lib/infractions'
import { Card, CardContent } from '@/components/ui/card'


function formatKamikazeTime(totalMinutes: number): string {
  if (totalMinutes === Infinity || totalMinutes === 999999) return '-'
  const mins = Math.floor(totalMinutes)
  const secs = Math.round((totalMinutes % 1) * 60)
  if (mins === 0) return `${secs} s`
  if (secs === 0) return `${mins} min`
  return `${mins} min ${secs} s`
}
import { Badge } from '@/components/ui/badge'
import { Save, X, Check, Search, Lock, Unlock, UserPlus, Trophy, TrendingUp, Users, AlertTriangle, ChevronDown } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Dot } from 'recharts'
import { getStandings } from '@/lib/standings'
interface Player {
  id: string
  first_name: string
  last_name: string
  short_name: string
  position: string
  team_id: string
  photo?: string
  shirt_number?: number
  precio?: number
  team?: { name: string; logo_url?: string }
}

interface Formation {
  defenders: number
  midfielders: number
  forwards: number
}

const FORMATIONS: Formation[] = [
  { defenders: 3, midfielders: 4, forwards: 3 },
  { defenders: 4, midfielders: 3, forwards: 3 },
  { defenders: 4, midfielders: 4, forwards: 2 },
  { defenders: 5, midfielders: 3, forwards: 2 },
]

function PitchPlayerCard({
  player,
  points,
  getPositionColor,
  getPositionLabel,
  hasMatchStarted,
  isPenalized,
  sanctionReason,
}: {
  player: Player
  points?: number
  getPositionColor: (pos: string) => string
  getPositionLabel: (pos: string) => string
  hasMatchStarted?: boolean
  isPenalized?: boolean
  sanctionReason?: string
}) {
  const pts = points !== undefined ? (Math.round(points * 10) / 10).toFixed(1) : (hasMatchStarted ? "0.0" : null)

  return (
    <div className="flex flex-col items-center w-[56px] sm:w-[72px] md:w-[80px] lg:w-[84px] text-center relative shrink-0 group transition-all duration-300">
      <div className="relative mb-1 md:mb-2 lg:mb-3">
        {/* Foto del jugador actual */}
        {player.photo ? (
          <img
            src={player.photo}
            alt={player.short_name || ''}
            className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full object-cover border-2 sm:border-[3px] shadow-lg bg-slate-200 transition-all duration-300 ${isPenalized ? 'border-red-500 ring-2 ring-red-500 animate-pulse' : 'border-white'}`}
          />
        ) : (
          <div className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs sm:text-sm md:text-sm lg:text-base font-bold border-2 sm:border-[3px] shadow-lg transition-all duration-300 ${isPenalized ? 'border-red-500 ring-2 ring-red-500 animate-pulse' : 'border-white'}`}>
            {player.shirt_number || '?'}
          </div>
        )}
        
        {/* Escudo del equipo (abajo izquierda) */}
        {player.team?.logo_url && (
          <img
            src={player.team.logo_url}
            alt={player.team?.name || ''}
            className="absolute -bottom-1 -left-2 sm:-left-3 md:-bottom-1 md:-left-4 lg:-bottom-1 lg:-left-4 w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 object-contain drop-shadow-md transition-all duration-300"
          />
        )}

        {/* Puntos (arriba de la foto) */}
        {pts !== null && (
          <div className="absolute -top-3 md:-top-4 lg:-top-4 left-1/2 -translate-x-1/2 bg-amber-500/95 backdrop-blur-sm text-white font-extrabold text-[10px] sm:text-[11px] md:text-[11px] lg:text-[12px] leading-none rounded-sm px-1 py-[2px] md:px-1 md:py-0.5 lg:px-1 lg:py-1 flex items-center justify-center shadow-md border border-amber-400 transition-all duration-300">
            {isPenalized ? '0.0' : pts}
          </div>
        )}

        {/* Precio (a la derecha) */}
        <div className="absolute top-1/2 -right-3 sm:-right-4 md:-right-5 lg:-right-5 -translate-y-1/2 bg-emerald-600 text-white font-black text-[10px] sm:text-[11px] md:text-[12px] lg:text-[13px] flex items-center justify-center rounded-full w-[24px] h-[24px] sm:w-[28px] sm:h-[28px] md:w-[32px] md:h-[32px] lg:w-[36px] lg:h-[36px] shadow-xl border-2 border-white transition-all duration-300 z-20">
          {player.precio ? `${player.precio}M` : '-'}
        </div>
      </div>

      {/* Nombre del jugador */}
      <div className="flex flex-col items-center w-[150%] -mt-1 md:-mt-1.5 z-30">
        <p className="font-extrabold text-white text-[9.5px] sm:text-[11px] md:text-[12px] lg:text-[13px] leading-[1.1] drop-shadow-md relative w-full text-center transition-all duration-300 line-clamp-2 break-words"
           style={{ textShadow: '1px 1px 3px rgba(0,0,0,1)' }}>
          {player.short_name || player.first_name}
        </p>
      </div>
      {isPenalized && sanctionReason ? (
        <p className="text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] text-red-300 font-bold leading-tight w-[130%] drop-shadow-md mt-0.5 lg:mt-1 truncate bg-red-950/80 rounded px-1 py-0.5 transition-all duration-300 z-30" title={sanctionReason}>
          {sanctionReason}
        </p>
      ) : null}
    </div>
  )
}

function getStagger(len: number, idx: number) {
  if (len >= 5) {
    return idx % 2 === 0 ? '-translate-y-3 sm:-translate-y-5 lg:-translate-y-7' : 'translate-y-3 sm:translate-y-5 lg:translate-y-7'
  }
  if (len === 4) {
    return (idx === 1 || idx === 2) ? 'translate-y-2 sm:translate-y-4 lg:translate-y-5' : '-translate-y-2 sm:-translate-y-4 lg:-translate-y-5'
  }
  return ''
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [savedPlayers, setSavedPlayers] = useState<string[]>([])
  // Alineación de la jornada ANTERIOR: sirve de base para resaltar los cambios
  const [basePlayers, setBasePlayers] = useState<string[]>([])
  const [changeHistory, setChangeHistory] = useState<Array<{outId: string, inId: string, index: number}>>([])
  const [formation, setFormation] = useState<Formation>(FORMATIONS[1])
  const [userDivision, setUserDivision] = useState<number | null>(null)
  const [cancelConfirmUniqueKey, setCancelConfirmUniqueKey] = useState<string | null>(null)
  const [userTeamId, setUserTeamId] = useState<string | null>(null)
  const [isRegistered, setIsRegistered] = useState<boolean>(false)
  const [showSwapConfirm, setShowSwapConfirm] = useState(false)
  const [pendingSwap, setPendingSwap] = useState<{ outId: string; inId: string; index: number } | null>(null)
  const [currentMatchday, setCurrentMatchday] = useState<number>(1)
  const [playerToSwap, setPlayerToSwap] = useState<{ id: string; index: number } | null>(null)
  const [searchFilter, setSearchFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState<string>('ALL')
  const [teamFilter, setTeamFilter] = useState<string>('')
  const [priceMinFilter, setPriceMinFilter] = useState<number | ''>('')
  const [priceMaxFilter, setPriceMaxFilter] = useState<number | ''>('')
  const [playerPoints, setPlayerPoints] = useState<Map<string, number>>(new Map())
  const [teamMatchStatus, setTeamMatchStatus] = useState<Map<string, boolean>>(new Map())
  const [usersOnline, setUsersOnline] = useState<Array<{ id: string; full_name: string }>>([])
  const [onlineCount, setOnlineCount] = useState(0)
  const [showOnlineList, setShowOnlineList] = useState(false)
  const [userRanks, setUserRanks] = useState<any>(null)
  const [loadingRanks, setLoadingRanks] = useState(true)
  const [selectedRanking, setSelectedRanking] = useState<string | null>(null)
  const [allPlayerStats, setAllPlayerStats] = useState<Map<string, { total: number, avg: number, history: {md: number, pts: number}[] }>>(new Map())
  const supabase = createClient()
  const { isUnlockWindowOpen, timeUntilLock, timeUntilUnlock, unlockTime, lockTime, currentMatchday: activeMatchday, currentMomento } = useMatchdayLock()
  // Equipos bloqueados por partidos fuera de orden de jornada (aplazados/adelantados).
  // Estos jugadores no se pueden cambiar aunque el mercado general esté abierto.
  const lockedTeams = useLockedTeams()
  const config = useLeagueConfig()
  // Jugadores vetados por exclusividad: los tiene otro usuario en la jornada
  // previa comprometida y yo no (modelo de retención; en J1 no aplica).
  const [offLimitPlayerIds, setOffLimitPlayerIds] = useState<Set<string>>(new Set())
  interface Penalty {
    id: string
    matchday: number
    description: string
    points: number
    user_id: string
    profiles?: { full_name: string } | { full_name: string }[]
  }
  const [allPenalties, setAllPenalties] = useState<Penalty[]>([])
  interface LiveInfraction {
    id: string
    user_id: string
    full_name: string
    matchday: number
    description: string
    is_pending: boolean
  }
  const [liveInfractions, setLiveInfractions] = useState<LiveInfraction[]>([])
  const [historicalPoints, setHistoricalPoints] = useState<{ matchday: number, name: string, points: number, avgPoints: number, hasPenalty: boolean }[]>([])
  
  useEffect(() => {
    const fetchHistory = async () => {
      if (!userTeamId || typeof activeMatchday !== 'number') return;

      // Jornada en la que arranca el juego: antes de ella los equipos de los
      // usuarios no contabilizan, aunque los jugadores ya estén puntuando.
      const fantasyStart = Math.max(1, config.fantasy_starting_matchday);

      const { data: allTpData } = await supabase
        .from('team_players')
        .select('team_id, player_id, matchday, is_starter')
        .eq('is_starter', true)
        .order('matchday', { ascending: true });

      if (!allTpData || allTpData.length === 0) return;

      const { data: fixturesData } = await supabase.from('fixtures').select('id, matchday');
      const fixtureToMatchday = new Map<string, number>();
      fixturesData?.forEach(f => {
        if (f.matchday) fixtureToMatchday.set(f.id, f.matchday);
      });

      const { data: allTeamsData } = await supabase.from('teams').select('id, user_id');
      const teamToUserId = new Map<string, string>();
      allTeamsData?.forEach(t => teamToUserId.set(t.id, t.user_id));

      const maxMd = Math.max(...allTpData.map(t => t.matchday || 1));
      const targetMaxMd = typeof activeMatchday === 'number' ? activeMatchday - 1 : maxMd;
      
      const tpByTeamAndMatchday = new Map<string, Map<number, typeof allTpData>>();
      allTpData.forEach(t => {
        const md = t.matchday || 1;
        if (!tpByTeamAndMatchday.has(t.team_id)) tpByTeamAndMatchday.set(t.team_id, new Map());
        if (!tpByTeamAndMatchday.get(t.team_id)!.has(md)) tpByTeamAndMatchday.get(t.team_id)!.set(md, []);
        tpByTeamAndMatchday.get(t.team_id)!.get(md)!.push(t);
      });

      const computedLineupsByTeam = new Map<string, Map<number, typeof allTpData>>();
      const allUsedPlayerIds = new Set<string>();

      for (const [teamId, mdMap] of tpByTeamAndMatchday.entries()) {
        const computedMap = new Map<number, typeof allTpData>();
        let lastValidLineup: typeof allTpData = [];

        // Se recorre desde la J1 para poder arrastrar el último once válido,
        // pero solo se contabiliza a partir de la jornada de inicio del juego.
        for (let md = 1; md <= targetMaxMd; md++) {
          if (mdMap.has(md) && mdMap.get(md)!.length > 0) {
            lastValidLineup = mdMap.get(md)!;
          }
          if (md >= fantasyStart && lastValidLineup.length > 0) {
            computedMap.set(md, lastValidLineup);
            lastValidLineup.forEach(t => allUsedPlayerIds.add(t.player_id));
          }
        }
        computedLineupsByTeam.set(teamId, computedMap);
      }

      if (allUsedPlayerIds.size === 0) return;

      const { data: scoresData } = await supabase
        .from('player_scores')
        .select('player_id, matchday, fixture_id, total_points')
        .in('player_id', Array.from(allUsedPlayerIds));

      const teamPointsByMatchday = new Map<string, Map<number, number>>();
      
      for (const [teamId, mdMap] of computedLineupsByTeam.entries()) {
        const uid = teamToUserId.get(teamId);
        const userPenalties = uid ? allPenalties.filter(p => p.user_id === uid) : [];
        const ptsMap = new Map<number, number>();

        for (const [md, starters] of mdMap.entries()) {
          let rawPoints = 0;
          starters.forEach(s => {
             const score = scoresData?.find(ps => {
               let psMd = ps.matchday;
               if (!psMd && ps.fixture_id) psMd = fixtureToMatchday.get(ps.fixture_id);
               return ps.player_id === s.player_id && psMd === md;
             });
             rawPoints += (score?.total_points || 0);
          });

          const mdPenalties = userPenalties.filter(p => p.matchday === md);
          let totalDeduction = 0;
          mdPenalties.forEach(p => {
             totalDeduction += (typeof p.points === 'string' ? parseFloat(p.points) : p.points);
          });

          const netPoints = Math.max(0, rawPoints - totalDeduction);
          ptsMap.set(md, netPoints);
        }
        teamPointsByMatchday.set(teamId, ptsMap);
      }

      const history = [];
      for (let md = fantasyStart; md <= targetMaxMd; md++) {
        const myMap = computedLineupsByTeam.get(userTeamId);
        let myPoints = 0;
        let myHasPenalty = false;
        if (myMap && myMap.has(md)) {
          myPoints = teamPointsByMatchday.get(userTeamId)?.get(md) || 0;
          const userPenalties = allPenalties.filter(p => p.user_id === user?.id && p.matchday === md);
          myHasPenalty = userPenalties.length > 0;
        }

        let sum = 0;
        let count = 0;
        for (const [teamId, ptsMap] of teamPointsByMatchday.entries()) {
          if (ptsMap.has(md)) {
            sum += ptsMap.get(md)!;
            count++;
          }
        }
        const avg = count > 0 ? (sum / count) : 0;

        history.push({
           matchday: md,
           name: `J${md}`,
           points: Math.round(myPoints * 10) / 10,
           avgPoints: Math.round(avg * 10) / 10,
           hasPenalty: myHasPenalty
        });
      }

      setHistoricalPoints(history);
    }
    
    // Solo disparar cuando allPenalties esté cargado
    if (allPenalties.length >= 0) {
      fetchHistory();
    }
  }, [userTeamId, activeMatchday, allPenalties, user?.id, supabase, config.fantasy_starting_matchday]);

  useEffect(() => {
    const fetchAllPlayerStats = async () => {
      let allScores: any[] = []
      const pageSize = 1000
      let from = 0
      while (true) {
        const { data: page, error } = await supabase
          .from('player_scores')
          .select('player_id, matchday, total_points, created_at')
          .range(from, from + pageSize - 1)
        if (error || !page || page.length === 0) break
        allScores.push(...page)
        if (page.length < pageSize) break
        from += pageSize
      }

      const stats = new Map<string, { total: number, avg: number, history: {md: number, pts: number, created_at?: string}[] }>()
      
      allScores.forEach(score => {
        if (!stats.has(score.player_id)) {
          stats.set(score.player_id, { total: 0, avg: 0, history: [] })
        }
        const s = stats.get(score.player_id)!
        s.total += (score.total_points || 0)
        s.history.push({ 
          md: score.matchday || 0, 
          pts: score.total_points || 0,
          created_at: score.created_at
        })
      })

      stats.forEach(s => {
        s.history.sort((a, b) => {
          if (a.md && b.md) return a.md - b.md
          if (a.created_at && b.created_at) return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          return 0
        })
        
        // Ensure md has a valid value for recharts x-axis if it was 0/null
        s.history.forEach((h, i) => {
          if (!h.md) h.md = i + 1
        })
        
        s.avg = s.history.length > 0 ? s.total / s.history.length : 0
      })

      setAllPlayerStats(stats)
    }

    if (isRegistered) {
      fetchAllPlayerStats()
    }
  }, [isRegistered, supabase])

  const [showAllHistory, setShowAllHistory] = useState(false)
  const lockedTeamIds = new Set(lockedTeams.map(l => l.teamId))
  const isTeamLocked = (teamId?: string | null) => !!teamId && lockedTeamIds.has(teamId)
  const isPlayerLocked = (playerId: string) =>
    isTeamLocked(players.find(p => p.id === playerId)?.team_id)
  // Evita generar/heredar el once dos veces (el efecto puede re-ejecutarse por
  // React Strict Mode o por cambios de activeMatchday mientras el hook resuelve).
  // Guardamos las claves `${teamId}-${matchday}` que ya estamos procesando.
  const creatingTeamRef = useRef<Set<string>>(new Set())

  const getPositionCode = (position: string): string => {
    const posLower = position.toLowerCase()
    if (posLower.includes('goalkeeper') || posLower === 'gk') return 'GK'
    if (posLower.includes('defender') || posLower === 'def') return 'DEF'
    if (posLower.includes('midfielder') || posLower === 'mid') return 'MID'
    if (posLower.includes('forward') || posLower === 'fwd') return 'FWD'
    return 'MID'
  }

  const getPositionLabel = (position: string) => {
    const code = getPositionCode(position)
    const labels: Record<string, string> = { GK: 'POR', DEF: 'DEF', MID: 'MED', FWD: 'DEL' }
    return labels[code] || position
  }

  const getPositionColor = (position: string) => {
    const code = getPositionCode(position)
    const colors: Record<string, string> = {
      GK: 'bg-amber-500 text-white',
      DEF: 'bg-blue-500 text-white',
      MID: 'bg-emerald-500 text-white',
      FWD: 'bg-red-500 text-white',
    }
    return colors[code] || 'bg-slate-500 text-white'
  }

  const getPositionBgColorClass = (position: string) => {
    const code = getPositionCode(position)
    const bgColors: Record<string, string> = {
      GK: 'bg-amber-500',
      DEF: 'bg-blue-500',
      MID: 'bg-emerald-500',
      FWD: 'bg-red-500',
    }
    return bgColors[code] || 'bg-slate-500'
  }

  const getPositionBgValue = (position: string) => {
    const code = getPositionCode(position)
    const colorValues: Record<string, string> = {
      GK: '#f59e0b',
      DEF: '#3b82f6',
      MID: '#10b981',
      FWD: '#ef4444',
    }
    return colorValues[code] || '#64748b'
  }

  const selectRandomPlayers = async (allPlayers: Player[], formation: Formation, autoSave: boolean = false, matchdayToSave: number = 0, teamIdParam: string | null = null) => {
    const playersByPos = {
      GK: allPlayers.filter(p => getPositionCode(p.position) === 'GK'),
      DEF: allPlayers.filter(p => getPositionCode(p.position) === 'DEF'),
      MID: allPlayers.filter(p => getPositionCode(p.position) === 'MID'),
      FWD: allPlayers.filter(p => getPositionCode(p.position) === 'FWD')
    };

    const reqs = [
      { pos: 'GK', count: 1 },
      { pos: 'DEF', count: formation.defenders },
      { pos: 'MID', count: formation.midfielders },
      { pos: 'FWD', count: formation.forwards },
    ];

    let bestSquad: string[] = [];
    let bestValid = false;

    // Intentamos generar equipos al azar
    for (let attempt = 0; attempt < 500; attempt++) {
      let currentSquad: Player[] = [];
      let currentPrice = 0;
      let teamCounts: Record<string, number> = {};
      let valid = true;

      for (const req of reqs) {
        const availablePos = [...playersByPos[req.pos as keyof typeof playersByPos]].sort(() => Math.random() - 0.5);
        let picked = 0;
        
        for (const p of availablePos) {
          if (picked === req.count) break;
          const pTeam = p.team_id || 'unknown';
          const pPrice = p.precio || 0;
          if ((teamCounts[pTeam] || 0) < config.max_players_per_team) {
             currentSquad.push(p);
             currentPrice += pPrice;
             teamCounts[pTeam] = (teamCounts[pTeam] || 0) + 1;
             picked++;
          }
        }
        if (picked < req.count) {
          valid = false;
          break;
        }
      }
      
      if (valid && currentPrice <= config.budget_limit) {
        bestSquad = currentSquad.map(p => p.id);
        bestValid = true;
        break;
      }
    }

    // Si no se pudo (muy raro), fallback a lo más barato
    if (!bestValid) {
      console.warn("No se encontró squad aleatorio válido tras 500 intentos. Usando fallback...");
      let currentSquad: Player[] = [];
      let teamCounts: Record<string, number> = {};
      for (const req of reqs) {
        const availablePos = [...playersByPos[req.pos as keyof typeof playersByPos]].sort((a,b) => (a.precio||0) - (b.precio||0));
        let picked = 0;
        for (const p of availablePos) {
          if (picked === req.count) break;
          const pTeam = p.team_id || 'unknown';
          if ((teamCounts[pTeam] || 0) < config.max_players_per_team) {
             currentSquad.push(p);
             teamCounts[pTeam] = (teamCounts[pTeam] || 0) + 1;
             picked++;
          }
        }
      }
      bestSquad = currentSquad.map(p => p.id);
    }

    const selected = bestSquad;

    setSelectedPlayers(selected)
    setSavedPlayers(selected)

    // Si es autoSave, guardar automáticamente en la base de datos.
    // Usamos el teamId explícito porque el estado userTeamId puede no estar
    // actualizado todavía en esta misma pasada.
    const tid = teamIdParam ?? userTeamId
    if (autoSave && tid) {
      console.log('[AUTO-GUARDAR] Guardando equipo inicial en matchday', matchdayToSave)
      const teamPlayers = selected.map((playerId, index) => ({
        team_id: tid,
        player_id: playerId,
        is_starter: true,
        is_captain: index === 0,
        order: index,
        matchday: matchdayToSave,
      }))

      const { error } = await supabase.from('team_players').insert(teamPlayers)
      if (error) {
        console.error('[AUTO-GUARDAR] Error:', error)
      } else {
        console.log('[AUTO-GUARDAR] Equipo inicial guardado en matchday', matchdayToSave)
      }
    }
  }

  useEffect(() => {
    const fetchInitialData = async (matchday: number) => {
      // Esperar a que la autenticación esté lista
      if (authLoading) return

      // Si no hay usuario, no continuar
      if (!user?.id) {
        setLoading(false)
        return
      }

      // Obtener equipo del usuario (NO crear automáticamente)
      let { data: teamData } = await supabase
        .from('user_teams')
        .select('id')
        .eq('user_id', user.id)
        .single()

      // Si no existe equipo, el usuario NO está registrado
      if (!teamData) {
        console.log('[CARGAR] Usuario no tiene equipo - no está registrado')
        setIsRegistered(false)
        setLoading(false)
        return
      }

      // El usuario SÍ está registrado
      setIsRegistered(true)
      setUserTeamId(teamData.id)
      console.log('[CARGAR] teamId:', teamData.id)

      // 1. Cargar el catálogo COMPLETO de jugadores (para pintar el equipo).
      //    Supabase devuelve como máximo 1000 filas por petición, así que
      //    paginamos: con >1000 jugadores, si no lo hacemos, algunos del once
      //    quedarían fuera del catálogo y NO se mostrarían (se verían <11).
      const playersData: any[] = []
      {
        const pageSize = 1000
        let from = 0
        while (true) {
          const { data: page, error } = await supabase
            .from('players')
            .select('*')
            .order('short_name', { ascending: true })
            .range(from, from + pageSize - 1)
          if (error) {
            console.error('[CARGAR] Error cargando jugadores:', error)
            break
          }
          if (!page || page.length === 0) break
          playersData.push(...page)
          if (page.length < pageSize) break
          from += pageSize
        }
      }

      let playersWithTeam: Player[] = []
      if (playersData.length > 0) {
        const teamIds = [...new Set(playersData.map(p => p.team_id).filter(Boolean))]
        const { data: teamsData } = await supabase
          .from('real_teams')
          .select('id, name, logo_url')
          .in('id', teamIds)
        const teamsMap = new Map(teamsData?.map(t => [t.id, t]) || [])
        playersWithTeam = playersData.map(p => ({ ...p, team: teamsMap.get(p.team_id) || null }))
        setPlayers(playersWithTeam)
      }

      // 2. Alineación de la JORNADA ANTERIOR (base para resaltar cambios)
      const { data: prevPlayers } = await supabase
        .from('team_players')
        .select('player_id, matchday, order')
        .eq('team_id', teamData.id)
        .eq('is_starter', true)
        .lt('matchday', matchday)
        .order('matchday', { ascending: false })

      let baseIds: string[] = []
      if (prevPlayers && prevPlayers.length > 0) {
        const prevMd = prevPlayers[0].matchday
        baseIds = prevPlayers
          .filter(tp => tp.matchday === prevMd)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map(tp => tp.player_id)
        // Descartar IDs duplicados (filas repetidas en BD) para no inflar la
        // lista de salientes y que un mismo jugador aparezca varias veces.
        baseIds = [...new Set(baseIds)]
      }
      setBasePlayers(baseIds)

      // 3. Alineación de la JORNADA ACTIVA
      const { data: currentPlayers } = await supabase
        .from('team_players')
        .select('player_id, order')
        .eq('team_id', teamData.id)
        .eq('is_starter', true)
        .eq('matchday', matchday)

      if (currentPlayers && currentPlayers.length > 0) {
        // Ya tiene equipo para esta jornada: usarlo tal cual (NO regenerar)
        const ids = currentPlayers
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map(tp => tp.player_id)
        setSelectedPlayers(ids)
        setSavedPlayers(ids)
        setLoading(false)
        return
      }

      // A partir de aquí vamos a CREAR alineación para la jornada activa
      // (heredándola de la anterior o generándola). Tomamos un cerrojo por
      // (equipo, jornada) para que dos ejecuciones simultáneas del efecto no
      // dupliquen el once.
      const lockKey = `${teamData.id}-${matchday}`
      if (creatingTeamRef.current.has(lockKey)) {
        return
      }
      creatingTeamRef.current.add(lockKey)

      // 4. No tiene equipo para la jornada activa pero SÍ de una anterior:
      //    heredar esos mismos 11 y persistirlos en la jornada activa.
      if (baseIds.length > 0) {
        const rows = baseIds.map((pid, index) => ({
          team_id: teamData.id,
          player_id: pid,
          is_starter: true,
          is_captain: index === 0,
          order: index,
          matchday,
        }))
        const { error } = await supabase.from('team_players').insert(rows)
        if (error) console.error('[CARGAR] Error heredando alineación:', error)
        setSelectedPlayers(baseIds)
        setSavedPlayers(baseIds)
        setLoading(false)
        return
      }

      // 5. No tiene NINGÚN equipo guardado: generar uno aleatorio (una sola vez)
      //    y guardarlo en la jornada activa.
      if (playersWithTeam.length > 0) {
        await selectRandomPlayers(playersWithTeam, formation, true, matchday, teamData.id)
        setBasePlayers([]) // equipo inicial => nada se marca como "cambio"
      }

      setLoading(false)
    }

    // Esperar a que el hook calcule la jornada activa (0 = aún no resuelto)
    if (typeof activeMatchday === 'number' && activeMatchday > 0) {
      fetchInitialData(activeMatchday)
    }
  }, [user?.id, activeMatchday])

  // Cargar puntos de los jugadores cuando la jornada está en curso
  useEffect(() => {
    const fetchPlayerPoints = async () => {
      if (!userTeamId || selectedPlayers.length === 0) {
        setPlayerPoints(new Map())
        return
      }

      const matchdayToLoad = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1

      // Buscar fixtures: primero por matchday (jornadas numéricas). Si no hay resultados
      // y es una jornada de tipo "momento" (matchday=null en BD), buscar por momento.
      const { data: fixturesByMatchday } = await supabase
        .from('fixtures')
        .select('id, home_team_id, away_team_id, status')
        .eq('matchday', matchdayToLoad)

      let fixtures = fixturesByMatchday
      if ((!fixtures || fixtures.length === 0) && currentMomento) {
        const { data: fixturesByMomento } = await supabase
          .from('fixtures')
          .select('id, home_team_id, away_team_id, status')
          .eq('momento', currentMomento)
        fixtures = fixturesByMomento
      }

      const fixtureIds = fixtures?.map(f => f.id) || []
      const teamStatusMap = new Map<string, boolean>()
      fixtures?.forEach(f => {
        const statusLower = (f.status || '').toLowerCase()
        // El script de sincronización pone 'finished' al recibir typeId 37 (Match ended).
        const hasStarted = statusLower !== 'scheduled' && statusLower !== 'postponed' && statusLower !== 'fixture'
        teamStatusMap.set(String(f.home_team_id), hasStarted)
        teamStatusMap.set(String(f.away_team_id), hasStarted)
      })
      setTeamMatchStatus(teamStatusMap)

      if (fixtureIds.length === 0) {
        setPlayerPoints(new Map())
        return
      }

      // Para jornadas numéricas: filtrar por matchday directamente (más preciso, evita acumulados).
      // Para jornadas "momento" (matchday=null en BD): filtrar por fixture_id.
      let scores: { player_id: string; total_points: number }[] | null = null
      if (currentMomento) {
        const { data } = await supabase
          .from('player_scores')
          .select('player_id, total_points')
          .in('player_id', selectedPlayers)
          .in('fixture_id', fixtureIds)
        scores = data
      } else {
        const { data } = await supabase
          .from('player_scores')
          .select('player_id, total_points')
          .in('player_id', selectedPlayers)
          .eq('matchday', matchdayToLoad)
        scores = data
      }

      const pointsMap = new Map<string, number>()
      scores?.forEach(s => {
        pointsMap.set(s.player_id, (pointsMap.get(s.player_id) || 0) + (s.total_points || 0))
      })

      setPlayerPoints(pointsMap)
    }

    fetchPlayerPoints()

    // Polling cada 45 segundos cuando la jornada está en curso
    const interval = setInterval(() => {
      if (isUnlockWindowOpen) {
        fetchPlayerPoints()
      }
    }, 45000)

    return () => clearInterval(interval)
  }, [isUnlockWindowOpen, userTeamId, selectedPlayers, activeMatchday, currentMomento])

  // Carga los jugadores vetados por exclusividad: los tenía otro usuario en la
  // jornada previa comprometida y yo no (si yo lo tenía, lo retengo). En J1 no aplica.
  useEffect(() => {
    const fetchOffLimits = async () => {
      const md = typeof activeMatchday === 'number' ? activeMatchday : 1
      const prevMd = md - 1
      if (!userTeamId || prevMd < 1) {
        setOffLimitPlayerIds(new Set())
        return
      }
      const { data: rows } = await supabase
        .from('team_players')
        .select('player_id, team_id')
        .eq('matchday', prevMd)
      const heldByMe = new Set<string>()
      const heldByOthers = new Set<string>()
      for (const r of rows || []) {
        if (r.team_id === userTeamId) heldByMe.add(r.player_id)
        else heldByOthers.add(r.player_id)
      }
      const offLimits = new Set<string>()
      for (const pid of heldByOthers) if (!heldByMe.has(pid)) offLimits.add(pid)
      setOffLimitPlayerIds(offLimits)
    }
    fetchOffLimits()
  }, [userTeamId, activeMatchday])

  useEffect(() => {
    const fetchAllPenalties = async () => {
      const { data, error } = await supabase
        .from('penalties')
        .select('id, matchday, description, points, user_id, profiles(full_name)')
        .order('matchday', { ascending: false })
      if (!error && data) {
        setAllPenalties(data)
      }
    }
    fetchAllPenalties()
  }, [])

  useEffect(() => {
    const fetchLiveInfractions = async () => {
      try {
        const res = await fetch('/api/penalties/live')
        if (res.ok) {
          const data = await res.json()
          setLiveInfractions(data.infractions || [])
        }
      } catch {}
    }
    fetchLiveInfractions()
  }, [activeMatchday])

  useEffect(() => {
    const fetchOnlineUsers = async () => {
      try {
        const { data: sessions, error: sessionsError } = await supabase
          .from('user_sessions')
          .select('user_id, last_activity_at')
          .order('last_activity_at', { ascending: false })

        console.log('[FETCH SESSIONS]', { sessions, sessionsError })

        if (sessionsError) {
          console.error('[FETCH SESSIONS] Error:', sessionsError)
          return
        }

        if (sessions && sessions.length > 0) {
          const now = Date.now()
          const fiveMinutesAgo = now - (5 * 60 * 1000)

          const sessionIds = sessions
            .filter((s: any) => {
              if (!s.last_activity_at) return false
              const lastActivity = new Date(s.last_activity_at).getTime()
              return lastActivity > fiveMinutesAgo
            })
            .map((s: any) => s.user_id)

          console.log('[ACTIVE SESSIONS]', { sessionIds, count: sessionIds.length })

          if (sessionIds.length > 0) {
            const { data: profiles, error: profilesError } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', sessionIds)

            console.log('[PROFILES]', { profiles, profilesError })

            if (profilesError) {
              console.error('[PROFILES] Error:', profilesError)
              return
            }

            setUsersOnline(profiles || [])
            setOnlineCount(profiles?.length || 0)
          } else {
            setOnlineCount(0)
            setUsersOnline([])
          }
        } else {
          setOnlineCount(0)
          setUsersOnline([])
        }
      } catch (err) {
        console.error('[USUARIOS EN LÍNEA] Error:', err)
        setOnlineCount(0)
        setUsersOnline([])
      }
    }

    if (isRegistered) {
      fetchOnlineUsers()
      const interval = setInterval(fetchOnlineUsers, 15000)
      return () => clearInterval(interval)
    }
  }, [isRegistered, supabase])

  useEffect(() => {
    const fetchRanks = async () => {
      if (!user?.id) return;
      try {
        // Rankings dentro de la propia división del usuario (independientes por división)
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('division')
          .eq('id', user.id)
          .maybeSingle();
        const myDivision = (myProfile?.division as number | null) ?? null;
        setUserDivision(myDivision);
        const { standings } = await getStandings(supabase, myDivision);
        if (!standings || standings.length === 0) {
          setLoadingRanks(false);
          return;
        }
        
        const getRank = (field: string, asc: boolean = false) => {
          // Filtrar valores nulos o Infinity
          const sorted = [...standings].sort((a: any, b: any) => {
            const valA = a[field] ?? (asc ? Infinity : -Infinity);
            const valB = b[field] ?? (asc ? Infinity : -Infinity);
            return asc ? valA - valB : valB - valA;
          });
          const index = sorted.findIndex(s => s.user_id === user.id);
          const value = index !== -1 ? sorted[index][field as keyof typeof sorted[0]] : null;
          return { position: index + 1, total: sorted.length, value, list: sorted };
        };

        setUserRanks({
          avg3: getRank('last_3_jornadas_avg'),
          impact: getRank('change_impact_points'),
          changes: getRank('total_changes'),
          kamikaze: getRank('kamikaze_score', true),
          appOpens: getRank('app_opens')
        });
      } catch (err) {
        console.error('[RANKINGS] Error:', err);
      } finally {
        setLoadingRanks(false);
      }
    };
    
    if (isRegistered) {
      fetchRanks();
    }
  }, [user?.id, isRegistered, supabase])

  const saveTeam = async () => {
    if (isUnlockWindowOpen) {
      alert('No se pueden realizar cambios durante el tramo de jornada')
      return
    }

    console.log('[GUARDAR] Iniciando guardado...')
    console.log('[GUARDAR] user:', user)
    console.log('[GUARDAR] userTeamId:', userTeamId)
    console.log('[GUARDAR] selectedPlayers:', selectedPlayers)
    console.log('[GUARDAR] currentMatchday:', currentMatchday)

    // Comprobar que el usuario está autenticado
    if (!user?.id) {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) {
        console.error('[GUARDAR] Usuario no autenticado')
        alert('Error: Usuario no autenticado. Por favor, inicia sesión de nuevo.')
        window.location.href = '/'
        return
      }
      console.log('[GUARDAR] Usuario obtenido desde auth:', currentUser.id)
    }

    let teamIdToUse = userTeamId

    if (!teamIdToUse) {
      console.log('[GUARDAR] Creando nuevo equipo...')
      const userId = user?.id || (await supabase.auth.getUser()).data.user?.id
      const { data: newTeam, error: teamError } = await supabase
        .from('user_teams')
        .insert({ user_id: userId, name: 'Mi Equipo' })
        .select('id')
        .single()

      if (teamError) {
        console.error('[GUARDAR] Error creando equipo:', JSON.stringify(teamError, null, 2))
        console.error('[GUARDAR] Error details:', teamError)
        alert('Error creando equipo: ' + (teamError.message || JSON.stringify(teamError)))
        return
      }

      if (newTeam) {
        teamIdToUse = newTeam.id
        setUserTeamId(newTeam.id)
        console.log('[GUARDAR] Equipo creado:', newTeam.id)
      } else {
        console.error('[GUARDAR] No se pudo crear el equipo')
        return
      }
    }

    const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1

    // Eliminar equipo anterior de la jornada actual para poder sobreescribirlo
    console.log(`[GUARDAR] Eliminando equipo anterior en matchday ${matchdayToSave}`)
    const { error: deleteError } = await supabase
      .from('team_players')
      .delete()
      .eq('team_id', teamIdToUse)
      .eq('matchday', matchdayToSave)
    if (deleteError) {
      console.error('[GUARDAR] Error eliminando:', deleteError)
    }

    if (selectedPlayers.length > 0) {
      // Guardar el equipo en la jornada activa correspondiente
      const teamPlayers = selectedPlayers.map((playerId, index) => ({
        team_id: teamIdToUse,
        player_id: playerId,
        is_starter: true,
        is_captain: index === 0,
        order: index,
        matchday: matchdayToSave, 
      }))

      console.log(`[GUARDAR] Insertando jugadores en matchday ${matchdayToSave}`)
      console.log('[GUARDAR] Payload:', JSON.stringify(teamPlayers, null, 2))

      const { data, error } = await supabase.from('team_players').insert(teamPlayers).select()

      if (error) {
        console.error('[GUARDAR] Error al insertar:', JSON.stringify(error, null, 2))
        console.error('[GUARDAR] Error details:', error)
        alert('Error al guardar: ' + (error.message || JSON.stringify(error)))
      } else {
        console.log('[GUARDAR] Equipo guardado correctamente:', data?.length, 'jugadores')
        setSavedPlayers(selectedPlayers)
        setChangeHistory([])
      }
    }
  }

  const cancelChange = async (uniqueKey: string) => {
    const playerMatch = selectedPlayersData.find(p => p._uniqueKey === uniqueKey)
    if (!playerMatch) return
    const index = playerMatch._originalIndex

    const changeIdx = changeHistory.findIndex(ch => ch.index === index)
    if (changeIdx !== -1) {
      const change = changeHistory[changeIdx]
      let newSelected: string[] = []
      setSelectedPlayers(prev => {
        newSelected = [...prev]
        newSelected[index] = change.outId
        return newSelected
      })
      setChangeHistory(prev => {
        const next = [...prev]
        next.splice(changeIdx, 1)
        return next
      })
      setCancelConfirmUniqueKey(null)

      if (userTeamId) {
        const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
        await supabase.from('team_players').delete().eq('team_id', userTeamId).eq('matchday', matchdayToSave)
        const teamPlayers = newSelected.map((pid, i) => ({
          team_id: userTeamId,
          player_id: pid,
          is_starter: true,
          is_captain: i === 0,
          order: i,
          matchday: matchdayToSave,
        }))
        await supabase.from('team_players').insert(teamPlayers)
      }
      return
    }

    const outPlayer = replacedPlayerByUniqueKey.get(uniqueKey)
    if (outPlayer) {
      let newSelected: string[] = []
      setSelectedPlayers(prev => {
        newSelected = [...prev]
        newSelected[index] = outPlayer.id
        return newSelected
      })

      if (userTeamId) {
        const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
        await supabase.from('team_players').delete().eq('team_id', userTeamId).eq('matchday', matchdayToSave)
        const teamPlayers = newSelected.map((pid, i) => ({
          team_id: userTeamId,
          player_id: pid,
          is_starter: true,
          is_captain: i === 0,
          order: i,
          matchday: matchdayToSave,
        }))
        await supabase.from('team_players').insert(teamPlayers)
      }
    }
    setCancelConfirmUniqueKey(null)
  }

  const swapPlayer = (newPlayerId: string) => {
    if (isUnlockWindowOpen) {
      alert('No se pueden realizar cambios durante el tramo de jornada')
      return
    }
    if (isPlayerLocked(newPlayerId)) {
      alert('Este jugador está bloqueado: su equipo tiene un partido fuera de la jornada y no puede ficharse hasta que se resuelva.')
      return
    }
    if (playerToSwap) {
      // Modelo "permitir + sancionar": no se bloquea el cambio aquí; el exceso
      // sobre el límite se avisa como ruleWarning y se sanciona al cerrar la jornada.
      setPendingSwap({ outId: playerToSwap.id, inId: newPlayerId, index: playerToSwap.index })
      setShowSwapConfirm(true)
      closePlayerSelector()
    }
  }

  const confirmSwap = async () => {
    if (!pendingSwap) return

    const { outId, inId, index } = pendingSwap
    setChangeHistory(prev => [...prev, { outId, inId, index }])
    
    let newSelected: string[] = []
    setSelectedPlayers(prev => {
      newSelected = [...prev]
      newSelected[index] = inId
      return newSelected
    })

    if (!userTeamId) return

    const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1

    const { error: deleteError } = await supabase
      .from('team_players')
      .delete()
      .eq('team_id', userTeamId)
      .eq('matchday', matchdayToSave)

    if (!deleteError && newSelected.length > 0) {
      const teamPlayers = newSelected.map((playerId, i) => ({
        team_id: userTeamId,
        player_id: playerId,
        is_starter: true,
        is_captain: i === 0,
        order: i,
        matchday: matchdayToSave,
      }))
      await supabase.from('team_players').insert(teamPlayers)
    }

    setPendingSwap(null)
    setShowSwapConfirm(false)
  }

  const cancelSwap = () => {
    setPendingSwap(null)
    setShowSwapConfirm(false)
  }

  const openPlayerSelector = (playerId: string, playerIndex: number) => {
    if (isUnlockWindowOpen) {
      alert('No se pueden realizar cambios durante el tramo de jornada')
      return
    }
    if (isPlayerLocked(playerId)) {
      alert('Este jugador está bloqueado: su equipo tiene un partido fuera de la jornada y no puede cambiarse hasta que se resuelva.')
      return
    }
    setPlayerToSwap({ id: playerId, index: playerIndex })
    setSearchFilter('')
    setPositionFilter('ALL')
    setTeamFilter('')
  }

  const closePlayerSelector = () => {
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
    setTeamFilter('')
  }

  const undoLastChange = async () => {
    if (changeHistory.length === 0) return

    const lastChange = changeHistory[changeHistory.length - 1]
    
    let newSelected: string[] = []
    setSelectedPlayers(prev => {
      newSelected = [...prev]
      newSelected[lastChange.index] = lastChange.outId
      return newSelected
    })
    setChangeHistory(prev => prev.slice(0, -1))
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
    setTeamFilter('')
    setPriceMinFilter('')
    setPriceMaxFilter('')

    if (userTeamId) {
      const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
      const { error: deleteError } = await supabase
        .from('team_players')
        .delete()
        .eq('team_id', userTeamId)
        .eq('matchday', matchdayToSave)

      if (!deleteError && newSelected.length > 0) {
        const teamPlayers = newSelected.map((pid, i) => ({
          team_id: userTeamId,
          player_id: pid,
          is_starter: true,
          is_captain: i === 0,
          order: i,
          matchday: matchdayToSave,
        }))
        await supabase.from('team_players').insert(teamPlayers)
      }
    }
  }

  const selectedPlayersData = selectedPlayers
    .map((id, idx) => {
      const p = players.find(p => p.id === id)
      return p ? { ...p, _uniqueKey: `${id}-${idx}`, _originalIndex: idx } : null
    })
    .filter((p): p is Player & { _uniqueKey: string; _originalIndex: number } => p !== null)
    .sort((a, b) => {
      // Ordenar por posición: GK → DEF → MID → FWD
      const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 }
      const posA = getPositionCode(a.position) as keyof typeof order
      const posB = getPositionCode(b.position) as keyof typeof order
      if (order[posA] !== order[posB]) {
        return (order[posA] ?? 4) - (order[posB] ?? 4)
      }
      // Dentro de cada posición, mantener orden original basado en idx
      return a._originalIndex - b._originalIndex
    })

  // Mapa entrante (por uniqueKey) -> jugador reemplazado (saliente).
  // Cada saliente se asigna a UN SOLO entrante.
  const { replacedPlayerByUniqueKey, unchangedKeys } = useMemo(() => {
    const result = new Map<string, Player>()
    const unchanged = new Set<string>()
    const usedOutIds = new Set<string>()

    // 1) Encontrar jugadores no cambiados cruzando con basePlayers
    const baseUnmatched = [...basePlayers]
    for (const player of selectedPlayersData) {
      const bIdx = baseUnmatched.indexOf(player.id)
      if (bIdx !== -1) {
        unchanged.add(player._uniqueKey)
        baseUnmatched.splice(bIdx, 1)
      }
    }

    const availableChanges = [...changeHistory].reverse()

    // 2) Emparejar cambios de la sesión actual
    for (const player of selectedPlayersData) {
      if (unchanged.has(player._uniqueKey)) continue

      const changeIdx = availableChanges.findIndex(ch => ch.inId === player.id && !usedOutIds.has(ch.outId))
      if (changeIdx !== -1) {
        const change = availableChanges[changeIdx]
        const out = players.find(p => p.id === change.outId)
        if (out) {
          result.set(player._uniqueKey, out)
          usedOutIds.add(change.outId)
          availableChanges.splice(changeIdx, 1)
          
          const buIdx = baseUnmatched.indexOf(change.outId)
          if (buIdx !== -1) baseUnmatched.splice(buIdx, 1)
        }
      }
    }

    // 3) Emparejar cambios cross-session por posición
    const outgoingPlayers = baseUnmatched
      .filter(id => !usedOutIds.has(id))
      .map(id => players.find(p => p.id === id))
      .filter(Boolean) as Player[]

    for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
      const outPos = outgoingPlayers.filter(p => getPositionCode(p.position) === pos && !usedOutIds.has(p.id))
      let oi = 0
      for (const player of selectedPlayersData) {
        if (oi >= outPos.length) break
        if (unchanged.has(player._uniqueKey)) continue
        if (result.has(player._uniqueKey)) continue
        if (getPositionCode(player.position) !== pos) continue

        const out = outPos[oi++]
        result.set(player._uniqueKey, out)
        usedOutIds.add(out.id)
      }
    }

    return { replacedPlayerByUniqueKey: result, unchangedKeys: unchanged }
  }, [selectedPlayersData, changeHistory, basePlayers, players])

  // Calcular sanciones dinámicas para la visualización del campo
  const startersForSanctions = selectedPlayersData.map(p => ({
    id: p.id,
    puntos: playerPoints.get(p.id) || 0,
    position: p.position,
    team_id: p.team_id,
    valor: p.precio,
    short_name: p.short_name,
    first_name: p.first_name,
  }))

  const prevMine = new Set(basePlayers)
  
  const heldByOthersPrevMap = new Map<string, string[]>()
  for (const pid of offLimitPlayerIds) {
    heldByOthersPrevMap.set(pid, ['otro usuario'])
  }

  const lineupPrevSet = new Set(basePlayers)
  const zeroedPrevSet = new Set<string>()
  
  const prevMatchdayForSanctions = typeof activeMatchday === 'number' ? activeMatchday - 1 : 1
  const prevPenaltiesForSanctions = allPenalties.filter(p => p.user_id === user?.id && p.matchday === prevMatchdayForSanctions)

  prevPenaltiesForSanctions.forEach(p => {
    const desc = p.description
    if (desc.startsWith("Jugador de ")) {
      const parts = desc.split(":")
      if (parts.length >= 2) {
        const playerName = parts[parts.length - 1].trim().toLowerCase()
        basePlayers.forEach(pid => {
          const bp = players.find(x => x.id === pid)
          const name = bp ? (bp.short_name || bp.first_name || '') : ''
          if (name.toLowerCase() === playerName) {
            zeroedPrevSet.add(pid)
          }
        })
      }
    }
  })

  const sanctionResult = applySanctionsToTeam(
    startersForSanctions,
    prevMine,
    heldByOthersPrevMap,
    config,
    isUnlockWindowOpen,
    prevPenaltiesForSanctions,
    lineupPrevSet,
    zeroedPrevSet,
    activeMatchday === Math.max(1, config.fantasy_starting_matchday)
  )

  // Calcular estadísticas del equipo (solo visibles durante el tramo de jornada)
  const teamStats = {
    precioTotal: selectedPlayersData.reduce((sum, p) => sum + (p.precio || 0), 0),
    formacion: (() => {
      const starters = selectedPlayersData
      const gk = starters.filter(p => getPositionCode(p.position) === 'GK').length
      const def = starters.filter(p => getPositionCode(p.position) === 'DEF').length
      const mid = starters.filter(p => getPositionCode(p.position) === 'MID').length
      const fwd = starters.filter(p => getPositionCode(p.position) === 'FWD').length
      if (gk + def + mid + fwd === 0) return '-'
      return `${gk}-${def}-${mid}-${fwd}`
    })(),
    puntosTotales: sanctionResult.netPoints,
    mediaPuntos: (() => {
      const total = sanctionResult.netPoints
      const startersCount = selectedPlayersData.length
      return startersCount > 0 ? total / startersCount : 0
    })(),
  }

  const availablePlayers = players

  // Obtener lista única de equipos para el filtro
  const uniqueTeams = Array.from(
    new Map(players.map(p => p.team?.name ? [p.team.name, p.team_id] : null).filter(Boolean) as [string, string][])
  ).map(([name, id]) => ({ name, id })).sort((a, b) => a.name.localeCompare(b.name))

  // Filtrar jugadores disponibles
  const filteredAvailablePlayers = useMemo(() => {
    const normalize = (text: string) => text ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : ''
    const q = normalize(searchFilter)
    
    return availablePlayers.filter(p => {
      const matchesPosition = positionFilter === 'ALL' || getPositionCode(p.position) === positionFilter
      if (!matchesPosition) return false
      const matchesTeam = teamFilter === '' || p.team_id === teamFilter
      if (!matchesTeam) return false
      const matchesPriceMin = priceMinFilter === '' || (p.precio ?? 0) >= priceMinFilter
      if (!matchesPriceMin) return false
      const matchesPriceMax = priceMaxFilter === '' || (p.precio ?? 0) <= priceMaxFilter
      if (!matchesPriceMax) return false

      if (q) {
        // Cached normalized names to avoid recalculating on every filter run
        const displayName = (p as any)._normalizedName || ((p as any)._normalizedName = normalize(p.short_name || `${p.first_name || ''} ${p.last_name || ''}`))
        const teamName = (p as any)._normalizedTeam || ((p as any)._normalizedTeam = normalize(p.team?.name || ''))
        return displayName.includes(q) || teamName.includes(q)
      }
      return true
    }).sort((a, b) => {
      if (q) {
        const aName = (a as any)._normalizedName
        const bName = (b as any)._normalizedName
        const aExact = aName === q
        const bExact = bName === q
        if (aExact && !bExact) return -1
        if (bExact && !aExact) return 1
      }
      return (b.precio || 0) - (a.precio || 0)
    })
  }, [availablePlayers, searchFilter, positionFilter, teamFilter, priceMinFilter, priceMaxFilter])

  const changedCount = changeHistory.length
  const actualChangesCount = selectedPlayers.filter(id => !basePlayers.includes(id)).length
  const changesLimit = (activeMatchday && activeMatchday >= config.fantasy_starting_matchday) 
        ? config.max_changes_per_matchday 
        : Infinity;

  // Avisos permanentes de equipos bloqueados, agrupados por partido fuera de orden.
  const teamNameById = new Map<string, string>()
  for (const p of players) {
    if (p.team_id && p.team?.name) teamNameById.set(p.team_id, p.team.name)
  }
  const lockGroups = new Map<string, { teams: string[]; type: string; ownMatchday: number; until: Date }>()
  for (const lt of lockedTeams) {
    if (!lockGroups.has(lt.fixtureId)) {
      lockGroups.set(lt.fixtureId, { teams: [], type: lt.type, ownMatchday: lt.ownMatchday, until: lt.until })
    }
    lockGroups.get(lt.fixtureId)!.teams.push(teamNameById.get(lt.teamId) || 'Equipo')
  }
  const lockBanners = Array.from(lockGroups.values()).map(g => {
    const teams = g.teams.join(' y ')
    const until = new Date(g.until).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    const motivo = g.type === 'delayed'
      ? `partido de la J${g.ownMatchday} aplazado`
      : `partido de la J${g.ownMatchday} adelantado`
    return `Jugadores de ${teams} bloqueados (${motivo}) hasta el ${until}.`
  })

  // Avisos de reglas (modelo permitir + sancionar): no bloquean el guardado,
  // pero avisan de lo que será sancionado al empezar la jornada.
  const ruleWarnings: string[] = []
  const teamCounts = new Map<string, number>()
  for (const p of selectedPlayersData) {
    if (p.team_id) teamCounts.set(p.team_id, (teamCounts.get(p.team_id) || 0) + 1)
  }
  const gkCount = selectedPlayersData.filter(p => getPositionCode(p.position) === 'GK').length
  const defCount = selectedPlayersData.filter(p => getPositionCode(p.position) === 'DEF').length
  const midCount = selectedPlayersData.filter(p => getPositionCode(p.position) === 'MID').length
  const fwdCount = selectedPlayersData.filter(p => getPositionCode(p.position) === 'FWD').length
  const formationStr = `${defCount}-${midCount}-${fwdCount}`

  // Verificar sanciones pendientes de la jornada anterior y límite de cambios
  const prevMatchday = activeMatchday - 1
  const prevPenalties = allPenalties.filter(p => p.user_id === user?.id && p.matchday === prevMatchday)

  // Encontrar qué jugadores de basePlayers fueron penalizados
  const penalizedPrevNames = new Set<string>()
  prevPenalties.forEach(p => {
    const desc = p.description
    if (desc.startsWith("Jugador de ")) {
      const parts = desc.split(":")
      if (parts.length >= 2) {
        penalizedPrevNames.add(parts[parts.length - 1].trim().toLowerCase())
      }
    }
  })

  // Contar cuántos jugadores penalizados por Dolly han sido reemplazados
  let replacedPenalizedCount = 0
  basePlayers.forEach(bpId => {
    const bp = players.find(p => p.id === bpId)
    const bpName = bp ? (bp.short_name || bp.first_name || '').toLowerCase() : ''
    if (penalizedPrevNames.has(bpName)) {
      if (!selectedPlayers.includes(bpId)) {
        replacedPenalizedCount++
      }
    }
  })

  // Límite de cambios: en la primera jornada del juego no hay límite ni sanción.
  // A partir de la siguiente, el exceso no se avisa en el dashboard (solo se
  // sanciona al procesar la jornada), para que el usuario no lo vea venir.

  // Avisos específicos para penalizaciones anteriores no resueltas
  if (prevPenalties.length > 0) {
    prevPenalties.forEach(p => {
      const desc = p.description
      if (desc.startsWith("Jugador de ")) {
        const parts = desc.split(":")
        if (parts.length >= 2) {
          const playerName = parts[parts.length - 1].trim().toLowerCase()
          const isStillHere = selectedPlayersData.some(sp => (sp.short_name || sp.first_name || '').toLowerCase() === playerName)
          if (isStillHere) {
            ruleWarnings.push(`${parts[parts.length - 1].trim()} fue sancionado en la J${prevMatchday} y DEBE ser cambiado, o no sumará puntos y se repetirá la multa.`)
          }
        }
      } else if (desc.includes("Presupuesto superado")) {
        if (teamStats.precioTotal > config.budget_limit) {
          ruleWarnings.push(`La multa por presupuesto superado de la J${prevMatchday} sigue activa. Debes ajustar el presupuesto.`)
        }
      } else if (desc.includes("Más de") && desc.includes("jugadores de un mismo equipo")) {
        let hasExcess = false
        for (const [tid, count] of teamCounts) {
          if (count > config.max_players_per_team) {
            hasExcess = true
            break
          }
        }
        if (hasExcess) {
          ruleWarnings.push(`La multa por exceso de jugadores de la J${prevMatchday} sigue activa. Debes reducir los jugadores del mismo equipo real.`)
        }
      } else if (desc.includes("Táctica incorrecta")) {
        if (selectedPlayersData.length === 11 && !(gkCount === 1 && config.formations.includes(formationStr))) {
          ruleWarnings.push(`La multa por táctica incorrecta de la J${prevMatchday} sigue activa. Debes corregir la formación.`)
        }
      }
    })
  }

  if (selectedPlayersData.length !== 11) {
    ruleWarnings.push(`Tienes ${selectedPlayersData.length}/11 jugadores.`)
  }
  if (teamStats.precioTotal > config.budget_limit) {
    ruleWarnings.push(`Presupuesto superado: ${teamStats.precioTotal}M de ${config.budget_limit}M permitidos.`)
  }
  for (const [tid, count] of teamCounts) {
    if (count > config.max_players_per_team) {
      ruleWarnings.push(`${count} jugadores de ${teamNameById.get(tid) || 'un mismo equipo'} (máx. ${config.max_players_per_team}).`)
    }
  }
  if (selectedPlayersData.length === 11 && !(gkCount === 1 && config.formations.includes(formationStr))) {
    ruleWarnings.push(`Táctica ${gkCount === 1 ? formationStr : `${gkCount} porteros`} no permitida.`)
  }
  for (const p of selectedPlayersData) {
    if (offLimitPlayerIds.has(p.id)) {
      ruleWarnings.push(`${p.short_name || p.first_name} pertenece a otro usuario (será sancionado).`)
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando...</div>
  }

  // Si el usuario no está registrado (no tiene equipo en user_teams)
  if (!isRegistered) {
    return (
      <Card className="border-2 border-red-200 bg-red-50">
        <CardContent className="py-12 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-red-900 mb-2">
            No estás registrado
          </h3>
          <p className="text-red-700 mb-6 max-w-md mx-auto">
            Aún no tienes un equipo en la liga. Debes registrarte para poder participar.
          </p>
          <button
            onClick={() => window.location.href = '/registro'}
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
          >
            <UserPlus className="w-5 h-5" />
            Registrarme ahora
          </button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2 pb-4 max-w-screen-2xl mx-auto">
      {/* Encabezado con usuarios en línea */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 w-full">
          <h1 className="text-3xl font-bold text-slate-900">Inicio</h1>
          
          {/* Mensaje de estado de cambios */}
          <div className="flex-1">
            {isUnlockWindowOpen ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm">
                <Lock className="w-5 h-5 text-amber-600 animate-pulse shrink-0" />
                <p className="text-sm font-semibold text-amber-900 hidden lg:block">
                  Los cambios están bloqueados
                </p>
                {timeUntilLock && timeUntilLock !== 'Finalizada' && (
                  <div className="bg-amber-100 px-3 py-1 rounded-lg ml-auto">
                    <p className="text-sm font-bold text-amber-900">
                      Finaliza en: <span className="text-base">{timeUntilLock}</span>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              timeUntilUnlock && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm">
                  <Unlock className="w-5 h-5 text-emerald-600 shrink-0" />
                  <p className="text-sm font-semibold text-emerald-955 hidden lg:block">
                    Se bloquean los cambios en...
                  </p>
                  <div className="bg-emerald-100 px-3 py-1 rounded-lg ml-auto">
                    <p className="text-sm font-bold text-emerald-900">
                      <span className="text-base font-mono">{timeUntilUnlock}</span>
                    </p>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>


      {/* ================= CONTENEDOR PRINCIPAL ================= */}
      <div className="w-full space-y-4 mt-2">
      {/* Once inicial - Grid responsive ordenado por posiciones */}
      <Card className="border-2 border-emerald-200">
        <CardContent className="p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-slate-900">{currentMomento ? `${currentMomento} · J${activeMatchday}` : `Jornada ${activeMatchday}`}</span>
            <span className="text-xs text-slate-500">{selectedPlayersData.length}/11</span>
          </div>

          {isUnlockWindowOpen ? (
            <div className="flex flex-col lg:flex-row gap-4 items-start">
              {/* Pitch */}
              <div className="relative w-full lg:flex-1 max-w-md mx-auto border-2 border-white rounded-xl overflow-hidden p-2 sm:p-3 select-none flex flex-col justify-between shadow-2xl aspect-[2/3]" style={{
                backgroundImage: userDivision === 1 ? 'url(/pitches/pitch_div1.png)' : userDivision === 2 ? 'url(/pitches/pitch_div2.png)' : userDivision === 3 ? 'url(/pitches/pitch_div3_large.png)' : 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.05) 10%, rgba(0,0,0,0.05) 20%)',
                backgroundSize: userDivision === 1 || userDivision === 2 || userDivision === 3 ? '100% 100%' : 'auto',
                backgroundColor: userDivision === 1 ? 'transparent' : userDivision === 2 ? '#dfd6a7' : userDivision === 3 ? '#8B5A2B' : '#43a047',
                backgroundBlendMode: userDivision === 2 ? 'multiply' : 'normal',
              }}>
              {/* Soccer field markings */}
              <div className={`absolute inset-0 border-2 border-white/40 m-4 pointer-events-none rounded-sm ${userDivision === 1 || userDivision === 2 || userDivision === 3 ? 'hidden' : ''}`}>
                {/* Center Line */}
                <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-white/40 -translate-y-1/2"></div>
                {/* Center Circle */}
                <div className="absolute top-1/2 left-1/2 w-24 h-24 sm:w-32 sm:h-32 border-2 border-white/40 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
                {/* Center dot */}
                <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-white/60 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
                
                {/* Top Penalty Area */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-44 h-16 sm:w-56 sm:h-20 border-b-2 border-x-2 border-white/40 z-10"></div>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-6 sm:w-24 sm:h-8 border-b-2 border-x-2 border-white/40"></div>
                {/* Top Penalty Arc */}
                <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 w-16 h-8 sm:w-20 sm:h-10 border-b-2 border-x-2 border-white/40 rounded-b-full"></div>
                
                {/* Bottom Penalty Area */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-44 h-16 sm:w-56 sm:h-20 border-t-2 border-x-2 border-white/40 z-10"></div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-6 sm:w-24 sm:h-8 border-t-2 border-x-2 border-white/40"></div>
                {/* Bottom Penalty Arc */}
                <div className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 w-16 h-8 sm:w-20 sm:h-10 border-t-2 border-x-2 border-white/40 rounded-t-full"></div>
              </div>

              {/* Player rows (top-down: Delanteros -> Mediocampistas -> Defensas -> Porteros) */}
              <div 
                className={`relative z-10 flex flex-col justify-between h-full -translate-x-2 sm:-translate-x-3 md:-translate-x-4 lg:-translate-x-5 ${
                  userDivision === 1 
                    ? 'pt-[18%] pb-[18%] px-0 scale-[0.85] origin-bottom' 
                    : 'px-6 pt-24 pb-12 sm:px-2 sm:pt-20 sm:pb-4 md:px-0 md:pt-24 md:pb-6 lg:pt-28 lg:pb-8'
                }`}
                style={userDivision === 1 ? { filter: 'drop-shadow(0 25px 20px rgba(0,0,0,0.6))' } : {}}
              >
                {/* Delanteros */}
                <div className={`flex justify-around items-center gap-1 ${userDivision === 1 ? 'px-[15%]' : ''}`}>
                  {selectedPlayersData.filter(p => getPositionCode(p.position) === 'FWD').map((player, idx, arr) => (
                    <div key={player._uniqueKey} className={`transition-transform duration-300 ${getStagger(arr.length, idx)} z-20`}>
                      <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={teamMatchStatus.get(String(player.team_id)) || isTeamLocked(player.team_id)} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} />
                    </div>
                  ))}
                  {selectedPlayersData.filter(p => getPositionCode(p.position) === 'FWD').length === 0 && (
                    <div className="text-[10px] text-white/30 italic">Sin Delanteros</div>
                  )}
                </div>

                {/* Mediocampistas */}
                <div className={`flex justify-around items-center gap-1 ${userDivision === 1 ? 'px-[4%]' : ''}`}>
                  {selectedPlayersData.filter(p => getPositionCode(p.position) === 'MID').map((player, idx, arr) => (
                    <div key={player._uniqueKey} className={`transition-transform duration-300 ${getStagger(arr.length, idx)} z-20`}>
                      <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={teamMatchStatus.get(String(player.team_id)) || isTeamLocked(player.team_id)} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} />
                    </div>
                  ))}
                  {selectedPlayersData.filter(p => getPositionCode(p.position) === 'MID').length === 0 && (
                    <div className="text-[10px] text-white/30 italic">Sin Centrocampistas</div>
                  )}
                </div>

                {/* Defensas */}
                <div className={`flex justify-around items-center gap-1 ${userDivision === 1 ? 'px-0' : ''}`}>
                  {selectedPlayersData.filter(p => getPositionCode(p.position) === 'DEF').map((player, idx, arr) => (
                    <div key={player._uniqueKey} className={`transition-transform duration-300 ${getStagger(arr.length, idx)} z-20`}>
                      <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={teamMatchStatus.get(String(player.team_id)) || isTeamLocked(player.team_id)} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} />
                    </div>
                  ))}
                  {selectedPlayersData.filter(p => getPositionCode(p.position) === 'DEF').length === 0 && (
                    <div className="text-[10px] text-white/30 italic">Sin Defensas</div>
                  )}
                </div>

                {/* Portero */}
                <div className="flex justify-around items-center gap-1">
                  {selectedPlayersData.filter(p => getPositionCode(p.position) === 'GK').map(player => (
                    <PitchPlayerCard key={player._uniqueKey} player={player} points={playerPoints.get(player.id)} hasMatchStarted={teamMatchStatus.get(String(player.team_id)) || isTeamLocked(player.team_id)} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} />
                  ))}
                  {selectedPlayersData.filter(p => getPositionCode(p.position) === 'GK').length === 0 && (
                    <div className="text-[10px] text-white/30 italic">Sin Portero</div>
                  )}
                </div>
              </div>
            </div>

            {/* Estadísticas del equipo (Columna 2 en PC, debajo en móvil) */}
          <div className="w-full lg:w-64 shrink-0">
            <Card className="!bg-emerald-50 border-emerald-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-emerald-900">Estadísticas de tu Equipo</h3>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                    <div className="bg-white rounded-lg p-3 border border-emerald-100">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-500 font-medium">Sistema</span>
                      </div>
                      <p className="text-lg font-bold text-slate-900">{teamStats.formacion}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-emerald-100">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-500 font-medium">Valor Equipo</span>
                      </div>
                      <p className="text-lg font-bold text-slate-900">{teamStats.precioTotal > 0 ? `${teamStats.precioTotal}M` : '-'}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-emerald-100">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Trophy className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-500 font-medium">Puntos Totales</span>
                      </div>
                      <p className="text-lg font-bold text-emerald-600">{Math.round(teamStats.puntosTotales * 10) / 10}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-emerald-100">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-500 font-medium">Media por Jugador</span>
                      </div>
                      <p className="text-lg font-bold text-emerald-600">{Math.round(teamStats.mediaPuntos * 10) / 10}</p>
                    </div>

                    {/* Jugadores por Equipo */}
                    <div className="col-span-2 lg:col-span-1 bg-white rounded-lg p-3 border border-emerald-100">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-500 font-medium">Jugadores por Equipo</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(() => {
                          const byTeam = new Map<string, { name: string; logo_url?: string; count: number }>()
                          selectedPlayersData.forEach(p => {
                            if (!p.team_id) return
                            const entry = byTeam.get(p.team_id)
                            if (entry) {
                              entry.count++
                            } else {
                              byTeam.set(p.team_id, {
                                name: p.team?.name || '',
                                logo_url: p.team?.logo_url,
                                count: 1,
                              })
                            }
                          })
                          return Array.from(byTeam.entries())
                            .sort((a, b) => b[1].count - a[1].count)
                            .map(([teamId, info]) => {
                              const overLimit = info.count > config.max_players_per_team
                              return (
                                <div
                                  key={teamId}
                                  title={info.name}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-semibold transition-colors ${
                                    overLimit
                                      ? 'bg-red-50 border-red-300 text-red-700'
                                      : 'bg-slate-50 border-slate-200 text-slate-700'
                                  }`}
                                >
                                  {info.logo_url ? (
                                    <img src={info.logo_url} alt={info.name} className="w-4 h-4 object-contain shrink-0" />
                                  ) : (
                                    <div className="w-4 h-4 rounded-full bg-slate-200 shrink-0" />
                                  )}
                                  <span className={`tabular-nums font-bold ${overLimit ? 'text-red-600' : 'text-slate-800'}`}>
                                    {info.count}
                                  </span>
                                </div>
                              )
                            })
                        })()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tus Rankings (Columna 3 en PC, debajo en móvil) */}
            <div className="w-full lg:w-64 shrink-0">
              <Card className="!bg-indigo-50 border-indigo-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-indigo-900">Tus Rankings</h3>
                  </div>
                  {loadingRanks ? (
                    <div className="text-center text-xs text-indigo-500 py-4">Cargando rankings...</div>
                  ) : userRanks ? (
                    <div className="space-y-2">
                      <div 
                        className="bg-white rounded-lg p-2 border border-indigo-100 flex justify-between items-center cursor-pointer hover:bg-indigo-50 transition-colors"
                        onClick={() => setSelectedRanking('avg3')}
                      >
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Promedio (Últ. 3)</p>
                          <p className="text-xs font-semibold text-slate-800">{Math.round(userRanks.avg3.value * 10) / 10} pts</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-indigo-600">#{userRanks.avg3.position}</p>
                        </div>
                      </div>
                      <div 
                        className="bg-white rounded-lg p-2 border border-indigo-100 flex justify-between items-center cursor-pointer hover:bg-indigo-50 transition-colors"
                        onClick={() => setSelectedRanking('impact')}
                      >
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Impacto Cambios</p>
                          <p className="text-xs font-semibold text-slate-800">{userRanks.impact.value > 0 ? '+' : ''}{Math.round(userRanks.impact.value * 10) / 10} pts</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-indigo-600">#{userRanks.impact.position}</p>
                        </div>
                      </div>
                      <div 
                        className="bg-white rounded-lg p-2 border border-indigo-100 flex justify-between items-center cursor-pointer hover:bg-indigo-50 transition-colors"
                        onClick={() => setSelectedRanking('changes')}
                      >
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Cambios Totales</p>
                          <p className="text-xs font-semibold text-slate-800">{userRanks.changes.value}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-indigo-600">#{userRanks.changes.position}</p>
                        </div>
                      </div>
                      <div 
                        className="bg-white rounded-lg p-2 border border-indigo-100 flex justify-between items-center cursor-pointer hover:bg-indigo-50 transition-colors"
                        onClick={() => setSelectedRanking('kamikaze')}
                      >
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Premio Kamikaze</p>
                          <p className="text-xs font-semibold text-slate-800">{formatKamikazeTime(userRanks.kamikaze.value)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-indigo-600">#{userRanks.kamikaze.position}</p>
                        </div>
                      </div>
                      <div 
                        className="bg-white rounded-lg p-2 border border-indigo-100 flex justify-between items-center cursor-pointer hover:bg-indigo-50 transition-colors"
                        onClick={() => setSelectedRanking('appOpens')}
                      >
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase">Adictos a la App</p>
                          <p className="text-xs font-semibold text-slate-800">{userRanks.appOpens.value} accesos</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-indigo-600">#{userRanks.appOpens.position}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-xs text-indigo-500 py-4">Sin datos</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-5">
              {selectedPlayersData.map((player, idx) => {
                const isChanged = !unchangedKeys.has(player._uniqueKey)
                const isLockedPlayer = isTeamLocked(player.team_id)
                const replacedPlayer = isChanged ? replacedPlayerByUniqueKey.get(player._uniqueKey) : undefined
                return (
                  <div
                    key={player._uniqueKey}
                    onClick={() => openPlayerSelector(player.id, player._originalIndex)}
                    className={`@container relative w-full aspect-[5/7] transition-all group ${
                      isUnlockWindowOpen || isLockedPlayer
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-pointer hover:scale-[1.03] md:hover:scale-105 hover:z-50 drop-shadow-xl'
                    }`}
                  >
                    {/* === CONTENIDO INTERNO DE LA TARJETA (Recortado) === */}
                    <div className={`absolute inset-0 overflow-hidden rounded-xl border ${
                      isUnlockWindowOpen
                        ? 'bg-slate-900 border-slate-800'
                        : isLockedPlayer
                          ? 'bg-slate-900 border-red-900'
                          : isChanged
                            ? 'bg-gradient-to-br from-emerald-900/90 to-slate-900 border-emerald-500/50'
                            : 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 group-hover:border-amber-500/50'
                    }`}>
                      {/* Fondo de escudo del equipo (Watermark) */}
                      {player.team?.logo_url && (
                        <img 
                          src={player.team.logo_url} 
                          alt="Fondo" 
                          className="absolute inset-0 m-auto w-[140%] h-[140%] object-contain opacity-10 pointer-events-none filter blur-[2px]"
                        />
                      )}

                      {/* Gradiente y fondo sólido inferior para legibilidad del texto */}
                      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-black z-10 pointer-events-none" />
                      <div className="absolute inset-x-0 bottom-[30%] h-[30%] bg-gradient-to-t from-black via-black/80 to-transparent z-10 pointer-events-none" />

                      {/* Columna Izquierda (Stats estilo FUT) */}
                      <div className="absolute top-[3cqw] left-[3cqw] flex flex-col items-center z-20 drop-shadow-md w-[15cqw]">
                        {/* Índice */}
                        <div className="bg-black/60 rounded flex items-center justify-center px-[2cqw] py-[0.5cqw] mb-[0.5cqw]">
                          <span className="text-[14cqw] font-black text-white leading-none">
                            {idx + 1}
                          </span>
                        </div>
                        {/* Posición */}
                        <div className={`mt-[1cqw] text-[8cqw] px-[2cqw] py-[1cqw] w-[130%] text-center font-bold text-white rounded-sm drop-shadow-md ${getPositionColor(player.position)}`}>
                          {getPositionLabel(player.position)}
                        </div>
                      </div>

                      {/* Foto del jugador */}
                      <div className="absolute inset-x-0 bottom-[20%] top-[10%] px-1 flex justify-center items-end z-10 pointer-events-none">
                        {player.photo ? (
                          <img
                            src={player.photo}
                            alt={player.short_name || ''}
                            className="w-full h-full object-contain object-bottom drop-shadow-2xl"
                          />
                        ) : (
                          <div className="h-[50%] aspect-square rounded-full bg-slate-800/80 text-slate-300 flex items-center justify-center text-[25cqw] font-bold shadow-2xl border-2 border-slate-600">
                            {player.shirt_number || '?'}
                          </div>
                        )}
                      </div>

                      {/* Nombre, Valor, Dorsal, Escudo (Zona inferior) */}
                      <div className="absolute inset-x-0 bottom-[2cqw] flex flex-col items-center z-20 px-[2cqw] w-full">
                        <div className="w-full bg-black/95 rounded-lg py-[2cqw] px-[2cqw] flex flex-col items-center shadow-2xl">
                          <p className={`font-black text-amber-50 uppercase text-center w-full leading-tight line-clamp-2 tracking-tight drop-shadow-lg ${
                              (player.short_name || player.first_name || '').length > 14
                                ? 'text-[9cqw]'
                                : (player.short_name || player.first_name || '').length > 10
                                ? 'text-[11cqw]'
                                : 'text-[13cqw]'
                            }`}
                            style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.9)' }}
                          >
                            {player.short_name || player.first_name}
                          </p>
                          
                          <div className="w-11/12 h-[1px] bg-amber-500/40 my-[1cqw]" />

                          <div className="w-full flex justify-between items-center px-[1cqw]">
                            {/* Valor */}
                            <div className="flex-1 flex justify-start">
                              <span className="font-black text-emerald-400 text-[10cqw] drop-shadow-md">
                                {player.precio ? `${player.precio}M` : '-'}
                              </span>
                            </div>
                            {/* Escudo */}
                            <div className="flex-1 flex justify-end">
                              {player.team?.logo_url ? (
                                <img
                                  src={player.team.logo_url}
                                  alt={player.team?.name || ''}
                                  className="w-[14cqw] h-[14cqw] object-contain drop-shadow-lg"
                                />
                              ) : <div className="w-[14cqw] h-[14cqw]" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* === FIN CONTENIDO INTERNO === */}

                    {/* === CONTROLES FLOTANTES EXTERNOS (Sobresalen de la tarjeta) === */}
                    <div className="absolute -top-[4cqw] -right-[4cqw] z-40 flex items-center gap-[1cqw]">
                      {isLockedPlayer && (
                        <div className="w-[12cqw] h-[12cqw] bg-red-500 rounded-full flex items-center justify-center shadow-lg border-[1.5px] border-white/20" title="Jugador bloqueado: partido fuera de jornada">
                          <Lock className="w-[6cqw] h-[6cqw] text-white" />
                        </div>
                      )}
                      {isChanged && (
                        <button
                          onClick={e => { e.stopPropagation(); setCancelConfirmUniqueKey(player._uniqueKey) }}
                          className="w-[12cqw] h-[12cqw] bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg border-[1.5px] border-white/20 transition-colors"
                          title="Cancelar cambio"
                        >
                          <X className="w-[6cqw] h-[6cqw] text-white" />
                        </button>
                      )}
                    </div>

                    {/* Jugador reemplazado (mini tarjeta) */}
                    {replacedPlayer && (
                      <div className="absolute z-40 flex flex-col items-center pointer-events-none drop-shadow-xl 
                        -top-6 sm:-top-[8cqw] left-1/2 -translate-x-1/2 
                        md:top-[9cqw] md:left-auto md:-right-[4cqw] md:translate-x-0 md:items-center
                      ">
                        <div className="relative">
                          {replacedPlayer.photo ? (
                            <img
                              src={replacedPlayer.photo}
                              className="w-7 h-7 md:w-10 md:h-10 rounded-full object-cover border-[1.5px] border-red-400 shadow-xl bg-slate-200 grayscale-[10%]"
                            />
                          ) : (
                            <div className="w-7 h-7 md:w-10 md:h-10 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold border-[1.5px] border-red-400 shadow-xl">
                              {replacedPlayer.shirt_number || '?'}
                            </div>
                          )}
                          {replacedPlayer.team?.logo_url && (
                            <img
                              src={replacedPlayer.team.logo_url}
                              className="absolute -bottom-1 -left-1 w-3.5 h-3.5 md:w-4 md:h-4 object-contain bg-white rounded-full p-[1px] shadow-sm"
                            />
                          )}
                        </div>
                        <div className="mt-0.5 md:mt-1 bg-black/95 rounded px-1.5 md:px-1.5 py-0.5 flex flex-col items-center shadow-xl border border-red-500/30">
                          <p className="font-bold text-red-100 text-[7px] md:text-[7px] leading-tight truncate text-center max-w-[45px]">
                            {replacedPlayer.short_name || replacedPlayer.first_name}
                          </p>
                        </div>
                      </div>
                    )}
                    {/* === FIN CONTROLES EXTERNOS === */}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Indicador de cambios guardados automáticamente */}
      {!isUnlockWindowOpen && (
        <div className={`flex items-center gap-2 justify-between ${isUnlockWindowOpen ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="text-xs text-slate-500">
            Los cambios se guardan automáticamente
          </div>
          {actualChangesCount > 0 && (
            <div className="flex items-center gap-2">
              {changedCount > 0 && (
                <button
                  onClick={undoLastChange}
                  className="flex items-center gap-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Deshacer ({changedCount})</span>
                </button>
              )}
              <span className="text-sm text-emerald-600 font-medium">
                {actualChangesCount} cambio{actualChangesCount !== 1 ? 's' : ''} {changesLimit !== Infinity ? `/ ${changesLimit}` : ''}
              </span>
            </div>
          )}
        </div>
      )}

        </div>

        {/* ================= SANCIONES (ABAJO) ================= */}
        <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-4 mt-8 mb-8">
      {/* Tus Sanciones (Jornada Activa) - Solo visible en jornada activa */}
      {isUnlockWindowOpen && (
        <Card className="!bg-red-50 border-red-200 mt-2 shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 pb-1.5 border-b border-red-100">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <h3 className="text-sm font-bold text-red-900">Tus Sanciones (Jornada Activa J{activeMatchday})</h3>
            </div>
            {allPenalties.filter(p => p.user_id === user?.id && p.matchday === activeMatchday).length === 0 &&
             liveInfractions.filter(inf => inf.user_id === user?.id && !allPenalties.some(p => p.user_id === user?.id && p.matchday === activeMatchday)).length === 0 ? (
              <p className="text-xs text-emerald-800 font-medium bg-emerald-50 border border-emerald-100 p-2 rounded">
                ¡Estás libre de sanciones en esta jornada!
              </p>
            ) : (
              <div className="space-y-2">
                {/* Sanciones consolidadas en BD */}
                {allPenalties
                  .filter(p => p.user_id === user?.id && p.matchday === activeMatchday)
                  .map((p) => (
                    <div key={p.id} className="flex justify-between items-start text-xs bg-red-100 rounded p-2 border border-red-200">
                      <div>
                        <span className="font-bold text-red-900 mr-2">J{p.matchday}:</span>
                        <span className="text-red-955 font-semibold">{p.description}</span>
                      </div>
                      <span className={`font-bold shrink-0 ml-2 ${p.points > 0 ? 'text-red-600' : 'text-amber-600 text-[10px] uppercase'}`}>
                        {p.points > 0 ? `-${p.points} pts` : 'Pendiente'}
                      </span>
                    </div>
                  ))}

                {/* Advertencias dinámicas activas (infracciones actuales del usuario) */}
                {liveInfractions
                  .filter(inf => inf.user_id === user?.id && !allPenalties.some(p => p.user_id === user?.id && p.matchday === activeMatchday))
                  .map((inf) => (
                    <div key={inf.id} className="flex justify-between items-start text-xs bg-amber-100 rounded p-2 border border-amber-200">
                      <div>
                        <span className="font-bold text-amber-900 mr-2">J{activeMatchday}:</span>
                        <span className="text-amber-955 font-semibold">{inf.description}</span>
                      </div>
                      <span className="font-bold text-amber-600 shrink-0 ml-2 text-[10px] uppercase">Pendiente</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Historial de Sanciones (Liga) - Colapsable (Ahora debajo de los jugadores) */}
      <Card className="!bg-slate-50 border-slate-200 mt-2 shadow-sm">
        <CardContent className="p-4">
          <button
            onClick={() => setShowAllHistory(!showAllHistory)}
            className="w-full flex items-center justify-between font-bold text-slate-800 hover:text-slate-900 focus:outline-none cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-slate-500" />
              <span className="text-sm">Historial de Sanciones (Liga)</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${showAllHistory ? 'rotate-180' : ''}`} />
          </button>

          {showAllHistory && (
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase">Todas las Sanciones de la Liga</p>
              {allPenalties.length === 0 && liveInfractions.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No hay sanciones registradas en la liga.</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {/* Sanciones dinámicas activas de todos los usuarios */}
                  {liveInfractions
                    .filter(inf => !allPenalties.some(p => p.user_id === inf.user_id && p.matchday === inf.matchday))
                    .map((inf) => (
                    <div key={inf.id} className="flex justify-between items-start text-xs bg-amber-50 rounded p-2 border border-amber-200 shadow-sm animate-pulse">
                      <div>
                        <span className="font-bold text-amber-900 mr-1">[{inf.full_name}]</span>
                        <span className="font-semibold text-amber-955 mr-2">J{inf.matchday}:</span>
                        <span className="text-amber-800 font-medium">{inf.description}</span>
                      </div>
                      <span className="font-bold text-amber-600 shrink-0 ml-2 text-[10px] uppercase">Pendiente</span>
                    </div>
                  ))}

                  {/* Sanciones consolidadas históricas */}
                  {allPenalties.map((p) => {
                    const profileObj = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
                    const userName = profileObj?.full_name || 'Usuario'
                    return (
                      <div key={p.id} className="flex justify-between items-start text-xs bg-white rounded p-2 border border-slate-100 shadow-sm">
                        <div>
                          <span className="font-bold text-slate-800 mr-1">[{userName}]</span>
                          <span className="font-semibold text-red-955 mr-2">J{p.matchday}:</span>
                          <span className="text-slate-700 font-medium">{p.description}</span>
                        </div>
                        <span className={`font-bold shrink-0 ml-2 ${p.points > 0 ? 'text-red-600' : p.matchday === activeMatchday ? 'text-amber-600 text-[10px] uppercase' : 'text-slate-500'}`}>
                          {p.points > 0 ? `-${p.points} pts` : p.matchday === activeMatchday ? 'Pendiente' : '0 pts'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

        </div>
      {/* ================= FIN SANCIONES ================= */}

      {/* Modal de selector de jugador con filtros */}
      {playerToSwap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold">Cambiar jugador</h3>
              <button onClick={closePlayerSelector} className="p-2 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filtros */}
            <div className="p-4 border-b space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o equipo..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map(pos => (
                  <button
                    key={pos}
                    onClick={() => setPositionFilter(pos)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      positionFilter === pos
                        ? getPositionColor(pos)
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {pos === 'ALL' ? 'Todos' : getPositionLabel(pos)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <select
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Todos los equipos</option>
                  {uniqueTeams.map(team => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-slate-500 font-medium">Precio:</span>
                <input
                  type="number"
                  placeholder="Min"
                  value={priceMinFilter}
                  onChange={(e) => setPriceMinFilter(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-20 px-2 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                  min="0"
                  step="0.1"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={priceMaxFilter}
                  onChange={(e) => setPriceMaxFilter(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-20 px-2 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                  min="0"
                  step="0.1"
                />
                <span className="text-xs text-slate-500">M</span>
                {(priceMinFilter !== '' || priceMaxFilter !== '') && (
                  <button
                    onClick={() => { setPriceMinFilter(''); setPriceMaxFilter('') }}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {filteredAvailablePlayers.length} jugadores disponibles
              </p>
            </div>

            {/* Lista de jugadores */}
            <div className="p-4">
              {filteredAvailablePlayers.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No hay jugadores disponibles</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredAvailablePlayers.map((player) => {
                    const lockedPlayer = isTeamLocked(player.team_id)
                    return (
                    <div
                      key={player.id}
                      onClick={() => swapPlayer(player.id)}
                      className={`p-3 rounded-xl transition-colors ${
                        lockedPlayer
                          ? 'bg-red-50 border border-red-200 opacity-60 cursor-not-allowed'
                          : 'bg-slate-50 hover:bg-emerald-50 cursor-pointer'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative">
                          {lockedPlayer && (
                            <div className="absolute -top-1 -left-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-md z-10" title="Jugador bloqueado: partido fuera de jornada">
                              <Lock className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                          {player.photo ? (
                            <img
                              src={player.photo}
                              alt={player.short_name || ''}
                              className="w-16 h-16 rounded-full object-cover shadow-md"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-lg font-bold shadow-md">
                              {player.shirt_number || '?'}
                            </div>
                          )}
                          {player.team?.logo_url && (
                            <img
                              src={player.team.logo_url}
                              alt={player.team?.name || ''}
                              className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white border-2 border-black shadow-md"
                            />
                          )}
                        </div>
                        <Badge className={`${getPositionColor(player.position)} !text-black text-sm px-3 py-1 w-full text-center font-semibold`}>
                          {getPositionLabel(player.position)}
                        </Badge>
                        <p className="text-sm font-bold text-slate-900 truncate w-full text-center">
                          {player.short_name || player.first_name}
                        </p>
                        <p className="text-xs text-slate-500 truncate w-full text-center">
                          {player.team?.name}
                        </p>
                        <p className="text-lg font-bold text-emerald-600">
                          {player.precio ? `${player.precio}M` : '-'}
                        </p>
                        {(() => {
                          const stats = allPlayerStats.get(player.id)
                          if (!stats) return null
                          
                          return (
                            <div className="w-full mt-2 flex flex-col gap-2 bg-white rounded-lg p-2 border border-slate-100 shadow-sm">
                              <div className="flex justify-between items-center text-xs">
                                <div className="flex flex-col items-center flex-1 border-r border-slate-100">
                                  <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider">Total</span>
                                  <span className="font-black text-slate-800">{Math.round(stats.total * 10) / 10}</span>
                                </div>
                                <div className="flex flex-col items-center flex-1">
                                  <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider">Media</span>
                                  <span className="font-black text-slate-800">{Math.round(stats.avg * 10) / 10}</span>
                                </div>
                              </div>
                              {stats.history.length > 0 && (
                                <div className="h-8 w-full mt-1">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={stats.history}>
                                      <YAxis domain={['dataMin', 'dataMax']} hide />
                                      <Line 
                                        type="monotone" 
                                        dataKey="pts" 
                                        stroke="#10b981" 
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={false}
                                      />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                    )
                  })}
                </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Gráfica de evolución */}
      {(historicalPoints.length > 0 || typeof activeMatchday === 'number') && (
        <Card className="mt-6 border-slate-200">
          <CardContent className="p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Evolución de Puntos
            </h3>
            <div className="w-full h-[250px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={[
                    ...historicalPoints,
                    // Incluir la jornada actual si ya ha empezado (tiene puntos o datos en el store)
                    (typeof activeMatchday === 'number' && teamStats?.puntosTotales !== undefined) 
                      ? { matchday: activeMatchday, name: `J${activeMatchday}`, points: teamStats.puntosTotales, hasPenalty: sanctionResult?.zeroedPlayers?.size > 0 || liveInfractions.some(i => i.user_id === user?.id) }
                      : null
                  ].filter(Boolean)}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12, fill: '#64748b' }} 
                    axisLine={false} 
                    tickLine={false} 
                    dy={10}
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: '#64748b' }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any, name: any) => {
                      if (name === 'avgPoints') return [`${value} pts`, 'Media Liga']
                      return [`${value} pts`, 'Mis Puntos']
                    }}
                    labelStyle={{ color: '#64748b', fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="avgPoints" 
                    stroke="#94a3b8" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 4, stroke: '#94a3b8', strokeWidth: 2, fill: 'white' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="points" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (!cx || !cy) return null;
                      if (payload.hasPenalty) {
                        return <circle key={`dot-${payload.name}`} cx={cx} cy={cy} r={6} stroke="#ef4444" strokeWidth={2} fill="#ef4444" className="animate-pulse" />;
                      }
                      return <circle key={`dot-${payload.name}`} cx={cx} cy={cy} r={4} stroke="#10b981" strokeWidth={2} fill="white" />;
                    }}
                    activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2, fill: 'white' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center items-center gap-4 mt-4 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full border-2 border-emerald-500 bg-white"></div>
                <span>Mis puntos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 border-t-2 border-dashed border-slate-400"></div>
                <span>Media liga</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-red-500"></div>
                <span>Multa en jornada</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de confirmación de cambio de jugador */}
      {showSwapConfirm && pendingSwap && (() => {
        const outPlayer = players.find(p => p.id === pendingSwap.outId)
        const inPlayer = players.find(p => p.id === pendingSwap.inId)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-4 text-center">Confirmar cambio</h3>

              <div className="space-y-4 mb-6">
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-xs text-red-600 font-medium uppercase mb-2">Sale del 11</p>
                  <div className="flex items-center gap-3">
                    {outPlayer?.photo ? (
                      <img src={outPlayer.photo} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold">{outPlayer?.shirt_number || '?'}</div>
                    )}
                    <div>
                      <p className="font-semibold text-slate-900">{outPlayer?.short_name || outPlayer?.first_name}</p>
                      <p className="text-xs text-slate-500">{outPlayer?.team?.name}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <div className="text-emerald-600 text-2xl">⇅</div>
                </div>

                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-xs text-emerald-600 font-medium uppercase mb-2">Entra al 11</p>
                  <div className="flex items-center gap-3">
                    {inPlayer?.photo ? (
                      <img src={inPlayer.photo} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold">{inPlayer?.shirt_number || '?'}</div>
                    )}
                    <div>
                      <p className="font-semibold text-slate-900">{inPlayer?.short_name || inPlayer?.first_name}</p>
                      <p className="text-xs text-slate-500">{inPlayer?.team?.name}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={cancelSwap}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmSwap}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal de confirmación: cancelar cambio de un jugador */}
      {cancelConfirmUniqueKey && (() => {
        const player = selectedPlayersData.find(p => p._uniqueKey === cancelConfirmUniqueKey)
        const outPlayer = replacedPlayerByUniqueKey.get(cancelConfirmUniqueKey)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">¿Cancelar cambio?</h3>
              <p className="text-slate-600 text-sm mb-5">
                Saldrá <strong>{player?.short_name || player?.first_name}</strong>
                {outPlayer && <> y volverá <strong>{outPlayer.short_name || outPlayer.first_name}</strong></>}.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setCancelConfirmUniqueKey(null)}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors text-sm"
                >
                  Mantener
                </button>
                <button
                  onClick={() => cancelChange(cancelConfirmUniqueKey)}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  Cancelar cambio
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {selectedRanking && userRanks && userRanks[selectedRanking] && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-4 bg-indigo-600 text-white flex justify-between items-center shrink-0">
              <h2 className="font-bold text-lg">
                {selectedRanking === 'avg3' && 'Promedio (Últ. 3)'}
                {selectedRanking === 'impact' && 'Impacto Cambios'}
                {selectedRanking === 'changes' && 'Cambios Totales'}
                {selectedRanking === 'kamikaze' && 'Premio Kamikaze'}
                {selectedRanking === 'appOpens' && 'Adictos a la App'}
              </h2>
              <button onClick={() => setSelectedRanking(null)} className="p-1 hover:bg-indigo-500 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {userRanks[selectedRanking].list.map((u: any, i: number) => (
                <div key={u.user_id} className={`flex justify-between items-center py-3 border-b border-slate-100 last:border-0 ${u.user_id === user?.id ? 'bg-indigo-50/50 -mx-4 px-4 font-bold' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold w-6 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-500'}`}>
                      {i + 1}
                    </span>
                    <span className="text-sm text-slate-700 uppercase">{u.user_name}</span>
                  </div>
                  <span className="text-sm font-semibold text-indigo-600">
                    {selectedRanking === 'avg3' && `${Math.round((u.last_3_jornadas_avg ?? 0) * 10) / 10} pts`}
                    {selectedRanking === 'impact' && `${(u.change_impact_points ?? 0) > 0 ? '+' : ''}${Math.round((u.change_impact_points ?? 0) * 10) / 10} pts`}
                    {selectedRanking === 'changes' && u.total_changes}
                    {selectedRanking === 'kamikaze' && formatKamikazeTime(u.kamikaze_score ?? 0)}
                    {selectedRanking === 'appOpens' && `${u.app_opens ?? 0} accesos`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
