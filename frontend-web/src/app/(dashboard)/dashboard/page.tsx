'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { MetricBreakdown } from '@/components/metric-breakdown'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'
import { useLockedTeams, useOpenMatchdays } from '@/lib/locked-teams'
import { useLeagueConfig } from '@/lib/league-config'
import { applySanctionsToTeam } from '@/lib/infractions'
import { isInMarket } from '@/lib/market'
import { Card, CardContent } from '@/components/ui/card'


function formatKamikazeTime(totalMinutes: number): string {
  if (totalMinutes === Infinity || totalMinutes === 999999) return '-'
  const mins = Math.floor(totalMinutes)
  const secs = Math.round((totalMinutes % 1) * 60)
  if (mins === 0) return `${secs} s`
  if (secs === 0) return `${mins} min`
  return `${mins} min ${secs} s`
}

function formatPlayerName(name: string): string {
  if (!name) return ''
  const trimmed = name.trim()
  if (trimmed.length <= 11) return trimmed

  const parts = trimmed.split(/\s+/)
  if (parts.length > 1) {
    const firstName = parts[0]
    const lastName = parts.slice(1).join(' ')
    return `${firstName[0].toUpperCase()}. ${lastName}`
  }
  return trimmed
}
import { Badge } from '@/components/ui/badge'
import { Save, X, Check, Search, Lock, Unlock, UserPlus, Trophy, TrendingUp, Users, AlertTriangle, ChevronDown, Bell, Calendar, ArrowLeftRight, ArrowRight, ArrowLeft } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Dot } from 'recharts'
import { getStandings } from '@/lib/standings'
import { isDivisionId, loadDivisionMembership } from '@/lib/divisions'
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
  created_at?: string
  updated_at?: string
  is_in_biwenger?: boolean
  stats?: any
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
  replacedPlayer,
}: {
  player: Player
  points?: number
  getPositionColor: (pos: string) => string
  getPositionLabel: (pos: string) => string
  hasMatchStarted?: boolean
  isPenalized?: boolean
  sanctionReason?: string
  replacedPlayer?: Player | null
}) {
  const pts = points !== undefined ? (Math.round(points * 10) / 10).toFixed(1) : (hasMatchStarted ? "0.0" : null)

  return (
    <div className="flex flex-col items-center w-[58px] sm:w-[68px] md:w-[74px] lg:w-[80px] text-center relative shrink-0 group transition-all duration-300">
      <div className="relative mb-1 md:mb-1.5 lg:mb-2">
        {/* Sombra 3D en el césped */}
        <div className="absolute -bottom-1 sm:-bottom-1.5 left-1/2 -translate-x-1/2 w-7 h-2 sm:w-9 sm:h-2.5 md:w-10 md:h-3 lg:w-11 lg:h-3.5 bg-black/60 rounded-[100%] blur-[2px] z-0"></div>

        {/* Foto del jugador actual */}
        {player.photo ? (
          <img
            src={player.photo}
            alt={player.short_name || ''}
            className={`relative z-10 w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full object-cover shadow-lg bg-transparent transition-all duration-300 ${isPenalized ? 'border-2 border-red-500 ring-2 ring-red-500 animate-pulse' : ''}`}
          />
        ) : (
          <div className={`relative z-10 w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] sm:text-xs md:text-sm lg:text-base font-bold shadow-lg transition-all duration-300 ${isPenalized ? 'border-2 border-red-500 ring-2 ring-red-500 animate-pulse' : ''}`}>
            {player.shirt_number || '?'}
          </div>
        )}
        
        {/* Escudo del equipo (abajo izquierda) */}
        {player.team?.logo_url && (
          <img
            src={player.team.logo_url}
            alt={player.team?.name || ''}
            className="absolute -bottom-0.5 -left-3 sm:-left-2 md:-bottom-1 md:-left-2.5 lg:-bottom-1 lg:-left-3 w-4.5 h-4.5 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 lg:w-6 lg:h-6 object-contain drop-shadow-md transition-all duration-300"
          />
        )}

        {/* Precio (a la derecha) */}
        <div className="absolute top-1/2 -right-5.5 sm:-right-4 md:-right-4.5 lg:-right-5 -translate-y-1/2 bg-emerald-600 text-white font-black text-[9px] sm:text-[10px] md:text-[11px] lg:text-[12px] flex items-center justify-center rounded-full w-[25px] h-[25px] sm:w-[28px] sm:h-[28px] md:w-[30px] md:h-[30px] lg:w-[32px] lg:h-[32px] shadow-xl transition-all duration-300 z-20">
          {player.precio ? `${player.precio}M` : '-'}
        </div>

        {/* Reemplazado (arriba izquierda) */}
        {replacedPlayer && (
          <div 
            className="absolute -top-3 -left-3 sm:-top-4 sm:-left-4 flex flex-row items-center gap-1 z-30 cursor-help bg-white/95 px-1.5 py-0.5 rounded-full shadow-sm border border-slate-200"
            title={`Reemplaza a: ${replacedPlayer.short_name || replacedPlayer.first_name}`}
          >
            <div className="w-[12px] h-[12px] sm:w-[14px] sm:h-[14px] rounded-full bg-[#EFE9DD] flex flex-col items-center justify-center -space-y-[3px] shrink-0">
              <ArrowLeft className="w-2 h-2 text-[#CD4C4C] stroke-[4]" />
              <ArrowRight className="w-2 h-2 text-[#5D9C44] stroke-[4]" />
            </div>
            {replacedPlayer.team?.logo_url && (
              <img src={replacedPlayer.team.logo_url} className="w-[12px] h-[12px] sm:w-[14px] sm:h-[14px] object-contain shrink-0" alt="" />
            )}
            <span className="text-[8px] sm:text-[9px] font-bold text-[#CD4C4C] whitespace-nowrap leading-none truncate max-w-[50px] sm:max-w-[60px]">
              {formatPlayerName(replacedPlayer.short_name || replacedPlayer.first_name)}
            </span>
          </div>
        )}
      </div>

      {/* Nombre del jugador */}
      <div className="flex flex-col items-center w-[100px] sm:w-[110px] md:w-[125px] lg:w-[130px] -mt-1 md:-mt-1.5 z-30">
        <p className="font-extrabold text-white text-[10.5px] sm:text-[11.5px] md:text-[13px] lg:text-[14px] leading-tight drop-shadow-md relative w-full text-center transition-all duration-300 whitespace-normal break-words"
           style={{ textShadow: '1px 1px 3px rgba(0,0,0,1)' }}>
          {formatPlayerName(player.short_name || player.first_name)}
        </p>

        {/* Puntos (debajo del nombre) */}
        {pts !== null && (
          <div className="mt-0.5 text-yellow-300 font-extrabold text-[21px] sm:text-[22px] md:text-[23px] lg:text-[24px] leading-none transition-all duration-300"
               style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.9)' }}>
            {isPenalized ? '0.0' : pts}
          </div>
        )}
      </div>
      {isPenalized && sanctionReason ? (
        <p className="text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] text-red-300 font-bold leading-tight w-[130%] drop-shadow-md mt-0.5 lg:mt-1 break-words whitespace-normal bg-red-950/80 rounded px-1 py-0.5 transition-all duration-300 z-30" title={sanctionReason}>
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

function splitRowPlayers<T>(arr: T[]): T[][] {
  if (arr.length <= 4) {
    return [arr]
  }
  return [arr.slice(0, 4), arr.slice(4)]
}

function getRowGapClass(len: number, isFwd: boolean = false, isDiv1: boolean = false, isDef: boolean = false): string {
  if (isFwd && isDiv1) {
    // Delanteros de primera división: mantener espaciado original
    if (len === 4) return 'gap-1 sm:gap-3'
    if (len === 3) return 'gap-4 sm:gap-10'
    if (len === 2) return 'gap-8 sm:gap-14'
    return 'gap-1 sm:gap-3'
  }
  
  // Para los demás (o si no es Div 1), aumentar espaciado en móvil
  if (isFwd) {
    if (len === 4) return 'gap-3 sm:gap-3' // un poco más que gap-1
    if (len === 3) return 'gap-6 sm:gap-10' // un poco más que gap-4
    if (len === 2) return 'gap-10 sm:gap-14' // un poco más que gap-8
    return 'gap-3 sm:gap-3'
  }

  // Defensores en primera división (separar un poquito más)
  if (isDef && isDiv1) {
    if (len === 5) return 'gap-3 sm:gap-6'
    if (len === 4) return 'gap-5 sm:gap-10'
    if (len === 3) return 'gap-8 sm:gap-12'
    if (len === 2) return 'gap-12 sm:gap-16'
    return 'gap-4 sm:gap-6'
  }

  // Defensores y mediocampistas (común)
  if (len === 4) return 'gap-4 sm:gap-8' // un poco más que gap-2
  if (len === 3) return 'gap-6 sm:gap-10' // un poco más que gap-4
  if (len === 2) return 'gap-10 sm:gap-14' // un poco más que gap-8
  return 'gap-3 sm:gap-3'
}


export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [savedPlayers, setSavedPlayers] = useState<string[]>([])
  // Alineación de la jornada ANTERIOR: sirve de base para resaltar los cambios
  const [basePlayers, setBasePlayers] = useState<string[]>([])
  // Plantilla base para el límite de cambios (comparada contra la J3 si es adelantada)
  const [changesBasePlayers, setChangesBasePlayers] = useState<string[]>([])
  const [dbReplacedPlayers, setDbReplacedPlayers] = useState<Record<number, string>>({})
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
  const [teamFixtureMap, setTeamFixtureMap] = useState<Map<string, string>>(new Map())
  const [statsModalPlayer, setStatsModalPlayer] = useState<any | null>(null)
  const [statsModalFixture, setStatsModalFixture] = useState<any | null>(null)
  const [usersOnline, setUsersOnline] = useState<Array<{ id: string; full_name: string }>>([])
  const [onlineCount, setOnlineCount] = useState(0)
  const [showOnlineList, setShowOnlineList] = useState(false)
  const [userRanks, setUserRanks] = useState<any>(null)
  const [loadingRanks, setLoadingRanks] = useState(true)
  const [selectedRanking, setSelectedRanking] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'stats' | 'penalties'>('stats')
  const [allPlayerStats, setAllPlayerStats] = useState<Map<string, { total: number, avg: number, history: {md: number, pts: number}[] }>>(new Map())
  const [showWarningsModal, setShowWarningsModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentModalCountdown, setPaymentModalCountdown] = useState(30)
  // Las medias históricas de todos los jugadores se cargan bajo demanda (al
  // abrir el modal de cambio) y una sola vez por sesión.
  const playerStatsLoadedRef = useRef(false)
  const supabase = createClient()
  const router = useRouter()
  const { currentMatchday: activeMatchday } = useMatchdayLock()
  const [selectedMatchday, setSelectedMatchday] = useState<number>(1)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const { openMatchdays, recommendedMatchday, loaded: openMatchdaysLoaded } = useOpenMatchdays()
  const config = useLeagueConfig()

  // Jornadas que se listan en el selector: la activa (siempre, para poder
  // hacer los cambios de mercado) + las que estén "abiertas" (con partidos ya
  // jugados y por jugar), p.ej. la jornada anterior aún sin terminar.
  const selectableMatchdays = useMemo(() => {
    const set = new Set(openMatchdays)
    if (typeof activeMatchday === 'number' && activeMatchday > 0) set.add(activeMatchday)
    return [...set]
      .sort((a, b) => a - b)
      .filter(md => md >= (config?.fantasy_starting_matchday ?? 1))
  }, [openMatchdays, activeMatchday, config?.fantasy_starting_matchday])
  // Al resolver los datos por primera vez, se posiciona en la jornada abierta
  // con el partido más cercano/en juego (si hay alguna); si no, en la activa.
  // Si la jornada activa cambia más adelante en la sesión (rollover), se sigue
  // sincronizando con ella como antes.
  const initialMatchdaySetRef = useRef(false)
  useEffect(() => {
    if (typeof activeMatchday !== 'number' || activeMatchday <= 0) return
    if (!initialMatchdaySetRef.current) {
      // Espera a conocer las jornadas abiertas para no posicionar primero en
      // la activa y "saltar" un instante después a la recomendada.
      if (!openMatchdaysLoaded) return
      setSelectedMatchday(recommendedMatchday ?? activeMatchday)
      initialMatchdaySetRef.current = true
    } else {
      setSelectedMatchday(activeMatchday)
    }
  }, [activeMatchday, recommendedMatchday, openMatchdaysLoaded])
  const { isLocked, isUnlockWindowOpen, timeUntilLock, timeUntilUnlock, unlockTime, lockTime, currentMomento, currentMatchday: resolvedMatchday, previousMatchday, upcomingLocks, isCloseToStart } = useMatchdayLock(selectedMatchday)
  // Equipos bloqueados por partidos fuera de orden de jornada (aplazados/adelantados).
  // Estos jugadores no se pueden cambiar aunque el mercado general esté abierto.
  const lockedTeams = useLockedTeams()

  useEffect(() => {
    // Si isUnlockWindowOpen es FALSE, el mercado está ABIERTO (no hay partidos en juego).
    // En ese caso, ocultamos Rendimiento y forzamos Sanciones.
    if (!isUnlockWindowOpen && activeTab === 'stats') {
      setActiveTab('penalties')
    }
  }, [isUnlockWindowOpen, activeTab])
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
  
  const warnings = useMemo(() => {
    if (!upcomingLocks || upcomingLocks.length === 0 || !lockTime) return []
    return upcomingLocks.filter(l => l.type === 'advanced' && l.from.getTime() <= lockTime.getTime())
  }, [upcomingLocks, lockTime])
  
  useEffect(() => {
    const fetchHistory = async () => {
      if (!userTeamId || typeof selectedMatchday !== 'number') return;

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
      const targetMaxMd = typeof selectedMatchday === 'number' ? selectedMatchday - 1 : maxMd;
      
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
        if (openMatchdays.includes(md)) continue;

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
  }, [userTeamId, activeMatchday, allPenalties, user?.id, supabase, config.fantasy_starting_matchday, openMatchdays]);

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

    // Esto pagina la tabla `player_scores` ENTERA, y lo único que alimenta son
    // los totales y el sparkline del modal de cambio de jugador. Se carga la
    // primera vez que se abre ese modal, no al entrar en la página: hasta
    // entonces competía por el ancho de banda con la carga del once.
    if (isRegistered && playerToSwap && !playerStatsLoadedRef.current) {
      playerStatsLoadedRef.current = true
      fetchAllPlayerStats()
    }
  }, [isRegistered, playerToSwap, supabase])

  const [showAllHistory, setShowAllHistory] = useState(false)
  const lockedTeamIds = new Set(lockedTeams.map(l => l.teamId))
  const isTeamLocked = (teamId?: string | null) => !!teamId && lockedTeamIds.has(teamId)
  const isPlayerLocked = (playerId: string) =>
    isTeamLocked(players.find(p => p.id === playerId)?.team_id)
  // Evita generar/heredar el once dos veces (el efecto puede re-ejecutarse por
  // React Strict Mode o por cambios de activeMatchday mientras el hook resuelve).
  // Guardamos las claves `${teamId}-${matchday}` que ya estamos procesando.
  const creatingTeamRef = useRef<Set<string>>(new Set())
  // Evita que un doble-click/doble-submit en cancelar/deshacer/confirmar cambio
  // dispare dos llamadas a save_team_lineup casi simultáneas con estado obsoleto.
  const lineupSavingRef = useRef(false)

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
    // El catálogo que llega aquí es la tabla entera, e incluye a los que ya no
    // están en el mercado (siguen en la BD porque alguien los tiene fichado).
    // Un equipo generado al azar no puede fichar a esos.
    const fichables = allPlayers.filter(isInMarket);
    const playersByPos = {
      GK: fichables.filter(p => getPositionCode(p.position) === 'GK'),
      DEF: fichables.filter(p => getPositionCode(p.position) === 'DEF'),
      MID: fichables.filter(p => getPositionCode(p.position) === 'MID'),
      FWD: fichables.filter(p => getPositionCode(p.position) === 'FWD')
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
        player_id: playerId,
        is_starter: true,
        is_captain: index === 0,
        order: index,
        replaced_player_id: null,
      }))

      const { error } = await supabase.rpc('save_team_lineup', {
        p_team_id: tid,
        p_matchday: matchdayToSave,
        p_players: teamPlayers,
      })
      if (error) {
        console.error('[AUTO-GUARDAR] Error:', error)
      } else {
        console.log('[AUTO-GUARDAR] Equipo inicial guardado en matchday', matchdayToSave)
      }
    }
  }

  useEffect(() => {
    let isMounted = true

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
        if (isMounted) {
          setIsRegistered(false)
          setLoading(false)
        }
        return
      }

      if (!isMounted) return

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
            // Columnas concretas y no `*`: la tabla tiene el doble de campos
            // (nacionalidad, altura, peso, pie, fechas...) que esta pantalla no
            // usa para nada y que engordan la descarga ~40%.
            .select('id, first_name, last_name, short_name, position, team_id, photo, shirt_number, precio, is_in_biwenger')
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

      // 2. Alineación de la JORNADA ANTERIOR (base para heredar y para resaltar
      // cambios). "Anterior" es la del tramo de juego previo en el CALENDARIO,
      // no la del número de jornada anterior: si un partido adelantado de la J6
      // se juega antes que la J4, la J4 arranca del equipo que jugó ese partido.
      // Cuando el hook aún no ha resuelto el tramo previo se cae a la regla
      // antigua (la última jornada guardada por debajo de esta).
      let baseIds: string[] = []
      let baseSavedAt: string | null = null
      let changesBaseIds: string[] = []
      if (matchday > config.fantasy_starting_matchday) {
        const baseQuery = () => supabase
          .from('team_players')
          .select('player_id, matchday, order, created_at')
          .eq('team_id', teamData.id)
          .eq('is_starter', true)

        // Si no hay once en el tramo previo (no abrió la app en esa ventana de
        // mercado), la base es la última jornada que sí guardó: quien no haga
        // cambios entre el martes y el jueves sigue con su equipo de la J3.
        let prevPlayers = previousMatchday != null
          ? (await baseQuery().eq('matchday', previousMatchday)).data
          : null
        if (!prevPlayers || prevPlayers.length === 0) {
          prevPlayers = (await baseQuery().lt('matchday', matchday).order('matchday', { ascending: false })).data
        }

        if (prevPlayers && prevPlayers.length > 0) {
          const prevMd = prevPlayers[0].matchday
          const prevRows = prevPlayers
            .filter(tp => tp.matchday === prevMd)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          baseIds = [...new Set(prevRows.map(tp => tp.player_id))]
          baseSavedAt = prevRows[0]?.created_at ?? null
        }

        // Si la jornada predecesora cronológicamente es un partido adelantado (> matchday),
        // contamos el límite de cambios acumulados contra la última jornada regular guardada (< matchday).
        if (previousMatchday != null && previousMatchday > matchday) {
          const regularPrevPlayers = (await baseQuery().lt('matchday', matchday).order('matchday', { ascending: false })).data
          if (regularPrevPlayers && regularPrevPlayers.length > 0) {
            const regPrevMd = regularPrevPlayers[0].matchday
            const regRows = regularPrevPlayers
              .filter(tp => tp.matchday === regPrevMd)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            changesBaseIds = [...new Set(regRows.map(tp => tp.player_id))]
          } else {
            changesBaseIds = baseIds
          }
        } else {
          changesBaseIds = baseIds
        }
      }
      if (isMounted) {
        setBasePlayers(baseIds)
        setChangesBasePlayers(changesBaseIds)
      }

      // 3. Alineación de la JORNADA ACTIVA
      const { data: currentPlayers } = await supabase
        .from('team_players')
        .select('player_id, order, replaced_player_id, created_at')
        .eq('team_id', teamData.id)
        .eq('is_starter', true)
        .eq('matchday', matchday)

      // Una jornada con un partido adelantado se comprometió antes de tiempo (el
      // once que jugó ese partido) y vuelve a abrirse semanas después. Si su
      // alineación es ANTERIOR a la del tramo previo, se quedó congelada dos
      // jornadas atrás: hay que retomarla desde el equipo actual. Los jugadores
      // de los equipos bloqueados por el partido adelantado siguen ahí solos,
      // porque el bloqueo impide sacarlos en las jornadas intermedias.
      const isStaleLineup =
        currentPlayers != null && currentPlayers.length > 0 &&
        baseIds.length > 0 && baseSavedAt != null &&
        matchday === activeMatchday && !isUnlockWindowOpen &&
        new Date(currentPlayers[0].created_at).getTime() < new Date(baseSavedAt).getTime()

      if (currentPlayers && currentPlayers.length > 0 && !isStaleLineup) {
        // Ya tiene equipo para esta jornada: usarlo tal cual (NO regenerar)
        const sorted = currentPlayers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        const ids = sorted.map(tp => tp.player_id)
        
        const replacedMap: Record<number, string> = {}
        if (matchday > config.fantasy_starting_matchday) {
          sorted.forEach(tp => {
            if (tp.replaced_player_id) {
              replacedMap[tp.order ?? 0] = tp.replaced_player_id
            }
          })
        }
        if (isMounted) {
          setDbReplacedPlayers(replacedMap)
          setSelectedPlayers(ids)
          setSavedPlayers(ids)
          setLoading(false)
        }
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

      // 4. No tiene equipo para la jornada activa (o el que tiene se quedó de un
      //    tramo anterior) pero SÍ de la jornada previa: heredar esos mismos 11
      //    y persistirlos en la jornada activa.
      if (baseIds.length > 0) {
        const rows = baseIds.map((pid, index) => ({
          player_id: pid,
          is_starter: true,
          is_captain: index === 0,
          order: index,
          replaced_player_id: null,
        }))
        const { error } = await supabase.rpc('save_team_lineup', {
          p_team_id: teamData.id,
          p_matchday: matchday,
          p_players: rows,
        })
        if (error) console.error('[CARGAR] Error heredando alineación:', error)
        if (isMounted) {
          // El once heredado no arrastra sustituciones: si venimos de otra
          // jornada con cambios marcados, hay que limpiar sus badges.
          setDbReplacedPlayers({})
          setChangeHistory([])
          setSelectedPlayers(baseIds)
          setSavedPlayers(baseIds)
          setLoading(false)
        }
        return
      }

      // 5. No tiene NINGÚN equipo guardado: generar uno aleatorio (una sola vez)
      //    y guardarlo en la jornada activa.
      if (playersWithTeam.length > 0) {
        await selectRandomPlayers(playersWithTeam, formation, true, matchday, teamData.id)
        if (isMounted) setBasePlayers([]) // equipo inicial => nada se marca como "cambio"
      }

      if (isMounted) setLoading(false)
    }

    // Esperar a que el hook calcule la jornada seleccionada y cargue la config.
    // `resolvedMatchday === selectedMatchday` garantiza que `previousMatchday`
    // ya corresponde a ESTA jornada: si no, al cambiar de jornada se heredaría
    // un instante de la anterior equivocada, y como heredar persiste, ese once
    // quedaría guardado.
    if (config._isLoaded && typeof selectedMatchday === 'number' && selectedMatchday > 0
        && resolvedMatchday === selectedMatchday) {
      fetchInitialData(selectedMatchday)
    }

    return () => {
      isMounted = false
    }
  }, [user?.id, selectedMatchday, config._isLoaded, resolvedMatchday, previousMatchday, activeMatchday, isUnlockWindowOpen])

  // Cargar puntos de los jugadores cuando la jornada está en curso
  useEffect(() => {
    const fetchPlayerPoints = async () => {
      if (!userTeamId || selectedPlayers.length === 0) {
        setPlayerPoints(new Map())
        return
      }

      const matchdayToLoad = typeof selectedMatchday === 'number' && selectedMatchday > 0 ? selectedMatchday : 1

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
      const fixtureMap = new Map<string, string>()
      fixtures?.forEach(f => {
        const statusLower = (f.status || '').toLowerCase()
        // El script de sincronización pone 'finished' al recibir typeId 37 (Match ended).
        const hasStarted = statusLower !== 'scheduled' && statusLower !== 'postponed' && statusLower !== 'fixture'
        teamStatusMap.set(String(f.home_team_id), hasStarted)
        teamStatusMap.set(String(f.away_team_id), hasStarted)
        fixtureMap.set(String(f.home_team_id), String(f.id))
        fixtureMap.set(String(f.away_team_id), String(f.id))
      })
      setTeamMatchStatus(teamStatusMap)
      setTeamFixtureMap(fixtureMap)

      if (fixtureIds.length === 0) {
        setPlayerPoints(new Map())
        return
      }

      // Para cualquier tipo de jornada, filtramos por los fixtureIds encontrados.
      // player_scores usa fixture_id, y matchday frecuentemente es null.
      const { data } = await supabase
        .from('player_scores')
        .select('player_id, total_points')
        .in('player_id', selectedPlayers)
        .in('fixture_id', fixtureIds)
      
      const scores = data

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
  }, [isUnlockWindowOpen, userTeamId, selectedPlayers, activeMatchday, selectedMatchday, currentMomento])

  // Carga los jugadores vetados por exclusividad: los tenía otro usuario en la
  // jornada previa comprometida y yo no (si yo lo tenía, lo retengo). En J1 no aplica.
  useEffect(() => {
    const fetchOffLimits = async () => {
      const md = typeof activeMatchday === 'number' ? activeMatchday : 1
      // "Jornada previa comprometida" es la del tramo de juego anterior en el
      // calendario, la misma de la que se hereda el once, no md - 1: con un
      // partido adelantado de la J6 jugándose antes que la J4, lo que ata a la
      // J4 es quién tenía a quién en ese partido.
      const prevMd = (selectedMatchday === md && previousMatchday != null) ? previousMatchday : md - 1
      if (!userTeamId || prevMd < 1) {
        setOffLimitPlayerIds(new Set())
        return
      }
      // Solo bloquean los jugadores comprometidos por rivales de MI división:
      // cada división es una liga aparte y no compito contra las otras, así que
      // lo que alinee alguien de otra tabla no me limita.
      const membership = await loadDivisionMembership(supabase)
      const myTeam = membership.teamsByDivision.get(1)?.find(t => t.id === userTeamId)
        ?? membership.teamsByDivision.get(2)?.find(t => t.id === userTeamId)
        ?? membership.teamsByDivision.get(3)?.find(t => t.id === userTeamId)
      const myDiv = myTeam ? membership.divisionByUser.get(myTeam.user_id) : null
      if (!isDivisionId(myDiv)) {
        setOffLimitPlayerIds(new Set())
        return
      }
      const divisionTeamIds = (membership.teamsByDivision.get(myDiv) ?? []).map(t => t.id)

      const { data: rows } = await supabase
        .from('team_players')
        .select('player_id, team_id')
        .eq('matchday', prevMd)
        .in('team_id', divisionTeamIds)
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
  }, [userTeamId, activeMatchday, selectedMatchday, previousMatchday])

  useEffect(() => {
    const fetchAllPenalties = async () => {
      // Solo las sanciones de mi división: el panel general enseña las de mis
      // rivales, y los de otra tabla no lo son.
      if (userDivision == null) {
        setAllPenalties([])
        return
      }
      const { data, error } = await supabase
        .from('penalties')
        .select('id, matchday, description, points, user_id, division, profiles(full_name)')
        .eq('division', userDivision)
        .order('matchday', { ascending: false })
      if (!error && data) {
        setAllPenalties(data)
      }
    }
    fetchAllPenalties()
  }, [userDivision])

  useEffect(() => {
    const fetchLiveInfractions = async () => {
      try {
        const res = await fetch(`/api/penalties/live?matchday=${selectedMatchday}&division=${userDivision}`)
        if (res.ok) {
          const data = await res.json()
          setLiveInfractions(data.infractions || [])
        }
      } catch {}
    }
    fetchLiveInfractions()
  }, [selectedMatchday, userDivision])

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
        // Sin división no se compite en ninguna tabla, así que no hay ranking
        // que enseñar (el admin las asigna antes de la primera jornada).
        if (myDivision == null) {
          setLoadingRanks(false);
          return;
        }
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

  useEffect(() => {
    if (!user?.id) return
    const checkPaymentStatus = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('has_paid')
        .eq('id', user.id)
        .maybeSingle()
      if (data && data.has_paid === false) {
        setShowPaymentModal(true)
        setPaymentModalCountdown(30)
      }
    }
    checkPaymentStatus()
  }, [user?.id, supabase])

  useEffect(() => {
    if (!showPaymentModal) return
    if (paymentModalCountdown <= 0) {
      setShowPaymentModal(false)
      return
    }
    const timer = setTimeout(() => setPaymentModalCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [showPaymentModal, paymentModalCountdown])

  const saveTeam = async () => {
    if (isUnlockWindowOpen) {
      alert('No se pueden realizar cambios durante el tramo de jornada')
      return
    }

    // Garantía dura: nunca se guarda un equipo que no tenga exactamente 11
    // jugadores. Esto es lo que permitió en el pasado que un usuario acabara
    // con 22 jugadores duplicados en una jornada.
    if (selectedPlayers.length !== 11) {
      alert(`Tu equipo tiene ${selectedPlayers.length} jugadores. Debe tener exactamente 11 para poder guardarlo.`)
      return
    }

    // Un jugador que ya no está en Biwenger se conserva en el equipo de quien lo
    // tenía, pero no se puede fichar de nuevo. Se comprueba aquí y no solo al
    // pintar el mercado porque la selección puede venir de una alineación
    // heredada o de un cambio deshecho, no siempre de la lista filtrada.
    const yaEnPlantilla = new Set([...savedPlayers, ...basePlayers])
    const noFichables = selectedPlayers.filter(id => {
      if (yaEnPlantilla.has(id)) return false
      const p = players.find(pl => pl.id === id)
      return p ? !isInMarket(p) : false
    })
    if (noFichables.length > 0) {
      const nombres = noFichables
        .map(id => players.find(p => p.id === id))
        .map(p => p?.short_name || `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Jugador')
      alert(`Estos jugadores ya no están en el mercado y no se pueden fichar: ${nombres.join(', ')}`)
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

    // Guardar mediante la función RPC atómica (DELETE+INSERT en una sola
    // transacción). Un delete+insert hecho como dos llamadas separadas desde
    // el cliente deja una ventana de carrera: si esta función se dispara dos
    // veces casi a la vez (doble clic, dos pestañas, reintento de red), ambas
    // pueden borrar y luego insertar, duplicando toda la alineación. Esto es
    // justo lo que le pasó a un usuario, que acabó con 22 jugadores en una
    // jornada. También preservamos aquí replaced_player_id, que antes se
    // perdía al guardar por este camino.
    const teamPlayers = selectedPlayers.map((playerId, index) => {
      let replacedId: string | null = null
      if (activeMatchday && config && matchdayToSave > config.fantasy_starting_matchday) {
        if (dbReplacedPlayers[index]) replacedId = dbReplacedPlayers[index]
        else {
          const ch = changeHistory.find(c => c.index === index)
          if (ch) replacedId = ch.outId
        }
      }
      if (replacedId === playerId) replacedId = null

      return {
        player_id: playerId,
        is_starter: true,
        is_captain: index === 0,
        order: index,
        replaced_player_id: replacedId,
      }
    })

    console.log(`[GUARDAR] Guardando alineación (RPC atómica) en matchday ${matchdayToSave}`)
    console.log('[GUARDAR] Payload:', JSON.stringify(teamPlayers, null, 2))

    const { error } = await supabase.rpc('save_team_lineup', {
      p_team_id: teamIdToUse,
      p_matchday: matchdayToSave,
      p_players: teamPlayers,
    })

    if (error) {
      console.error('[GUARDAR] Error al guardar:', JSON.stringify(error, null, 2))
      alert('Error al guardar: ' + (error.message || JSON.stringify(error)))
    } else {
      console.log('[GUARDAR] Equipo guardado correctamente:', teamPlayers.length, 'jugadores')
      setSavedPlayers(selectedPlayers)
      setChangeHistory([])
    }
  }

  const cancelChange = async (uniqueKey: string) => {
    if (lineupSavingRef.current) return
    const playerMatch = selectedPlayersData.find(p => p._uniqueKey === uniqueKey)
    if (!playerMatch) return
    const index = playerMatch._originalIndex

    const outPlayer = replacedPlayerByUniqueKey.get(uniqueKey)
    if (!outPlayer) return

    const newSelected = [...selectedPlayers]
    newSelected[index] = outPlayer.id
    setSelectedPlayers(newSelected)

    // Remove ALL changes for this index from the history
    const newChangeHistory = changeHistory.filter(ch => ch.index !== index)
    setChangeHistory(newChangeHistory)
    
    // Remove from dbReplacedPlayers
    const newDbReplaced = { ...dbReplacedPlayers }
    delete newDbReplaced[index]
    setDbReplacedPlayers(newDbReplaced)

    setCancelConfirmUniqueKey(null)

    if (userTeamId) {
      const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
      
      const teamPlayersData = newSelected.map((pid, i) => {
        let replacedId = null
        if (activeMatchday && config && activeMatchday > config.fantasy_starting_matchday) {
          if (newDbReplaced[i]) replacedId = newDbReplaced[i]
          else {
            const ch = newChangeHistory.find(c => c.index === i)
            if (ch) replacedId = ch.outId
          }
        }
        if (replacedId === pid) replacedId = null
        
        return {
          player_id: pid,
          is_starter: true,
          is_captain: i === 0,
          order: i,
          replaced_player_id: replacedId
        }
      })
      
      lineupSavingRef.current = true
      try {
        await supabase.rpc('save_team_lineup', {
          p_team_id: userTeamId,
          p_matchday: matchdayToSave,
          p_players: teamPlayersData
        })
      } finally {
        lineupSavingRef.current = false
      }
    }
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
    if (lineupSavingRef.current) return

    const { outId, inId, index } = pendingSwap
    const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
    const newChangeHistory = (activeMatchday && config && matchdayToSave > config.fantasy_starting_matchday) 
      ? [...changeHistory, { outId, inId, index }]
      : []
    setChangeHistory(newChangeHistory)
    
    const newSelected = [...selectedPlayers]
    newSelected[index] = inId
    setSelectedPlayers(newSelected)

    if (!userTeamId) return

    const teamPlayersData = newSelected.map((playerId, i) => {
      let replacedId = null
      if (activeMatchday && config && activeMatchday > config.fantasy_starting_matchday) {
        if (dbReplacedPlayers[i]) replacedId = dbReplacedPlayers[i]
        else {
          const ch = newChangeHistory.find(c => c.index === i)
          if (ch) replacedId = ch.outId
        }
      }
      if (replacedId === playerId) replacedId = null
      
      return {
        player_id: playerId,
        is_starter: true,
        is_captain: i === 0,
        order: i,
        replaced_player_id: replacedId
      }
    })

    // Use RPC function for atomic operation
    lineupSavingRef.current = true
    let rpcError
    try {
      ;({ error: rpcError } = await supabase.rpc('save_team_lineup', {
        p_team_id: userTeamId,
        p_matchday: matchdayToSave,
        p_players: teamPlayersData
      }))
    } finally {
      lineupSavingRef.current = false
    }

    if (rpcError) {
      console.error('Error al guardar alineación:', rpcError)
      alert('Error guardando la alineación. Por favor, inténtalo de nuevo.')
      return
    }

    setPendingSwap(null)
    setShowSwapConfirm(false)
  }

  const cancelSwap = () => {
    setPendingSwap(null)
    setShowSwapConfirm(false)
  }

  const openPlayerSelector = async (playerId: string, playerIndex: number, playerTeamId?: string) => {
    if (isUnlockWindowOpen) {
      if (playerTeamId) {
        const fixtureId = teamFixtureMap.get(String(playerTeamId))
        if (fixtureId) {
          const [{ data: scoreData }, { data: fixtureData }] = await Promise.all([
            supabase.from('player_scores').select('*').eq('fixture_id', fixtureId).eq('player_id', playerId).maybeSingle(),
            supabase.from('fixtures').select('*').eq('id', fixtureId).maybeSingle()
          ])

          if (scoreData) {
            const playerBase = players.find(p => p.id === playerId)
            if (playerBase) {
              const fullPlayer = {
                ...scoreData,
                ...playerBase,
                calc_position: scoreData.position || playerBase.position,
              }
              setStatsModalPlayer(fullPlayer)
              setStatsModalFixture(fixtureData)
              return
            }
          }
        }
      }
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
    if (lineupSavingRef.current) return

    const lastChange = changeHistory[changeHistory.length - 1]
    
    const newSelected = [...selectedPlayers]
    newSelected[lastChange.index] = lastChange.outId
    setSelectedPlayers(newSelected)
    const newChangeHistory = changeHistory.slice(0, -1)
    setChangeHistory(newChangeHistory)
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
    setTeamFilter('')
    setPriceMinFilter('')
    setPriceMaxFilter('')

    if (userTeamId) {
      const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
      
      const teamPlayersData = newSelected.map((pid, i) => {
        let replacedId = null
        if (activeMatchday && config && activeMatchday > config.fantasy_starting_matchday) {
          if (dbReplacedPlayers[i]) replacedId = dbReplacedPlayers[i]
          else {
            const ch = newChangeHistory.find(c => c.index === i)
            if (ch) replacedId = ch.outId
          }
        }
        if (replacedId === pid) replacedId = null
        
        return {
          player_id: pid,
          is_starter: true,
          is_captain: i === 0,
          order: i,
          replaced_player_id: replacedId
        }
      })
      
      lineupSavingRef.current = true
      try {
        await supabase.rpc('save_team_lineup', {
          p_team_id: userTeamId,
          p_matchday: matchdayToSave,
          p_players: teamPlayersData
        })
      } finally {
        lineupSavingRef.current = false
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
  const { replacedPlayerByUniqueKey, unchangedKeys } = useMemo(() => {
    const result = new Map<string, Player>()
    const unchanged = new Set<string>()

    for (const player of selectedPlayersData) {
      const idx = player._originalIndex
      
      // Only show changed players if we are past the starting matchday
      if (selectedMatchday && config && selectedMatchday > config.fantasy_starting_matchday) {
        // 1. ¿Hay un cambio persistido en la base de datos para este índice?
        const dbReplacedId = dbReplacedPlayers[idx]
        if (dbReplacedId) {
          const outPlayer = players.find(p => p.id === dbReplacedId)
          if (outPlayer) {
            result.set(player._uniqueKey, outPlayer)
          }
          continue
        }

        // 2. ¿Hay un cambio en memoria (sesión actual) para este índice?
        const changeIdx = changeHistory.findIndex(ch => ch.index === idx)
        if (changeIdx !== -1) {
          const outPlayer = players.find(p => p.id === changeHistory[changeIdx].outId)
          if (outPlayer) {
            result.set(player._uniqueKey, outPlayer)
          }
          continue
        }
      }
      
      // 3. Si no hay ni cambio en memoria ni en BD, o es la J1, es un titular base
      unchanged.add(player._uniqueKey)
    }


    return { replacedPlayerByUniqueKey: result, unchangedKeys: unchanged }
  }, [selectedPlayersData, changeHistory, dbReplacedPlayers, players, selectedMatchday, config])

  // Obtener la lista de sustituciones realizadas para la jornada seleccionada (para pintar abajo del todo)
  const substitutionsList = useMemo(() => {
    if (!selectedMatchday || !config || selectedMatchday <= config.fantasy_starting_matchday) {
      return []
    }
    return selectedPlayersData
      .map(player => {
        const outPlayer = replacedPlayerByUniqueKey.get(player._uniqueKey)
        if (outPlayer) {
          return { inPlayer: player, outPlayer }
        }
        return null
      })
      .filter((sub): sub is { inPlayer: Player & { _uniqueKey: string; _originalIndex: number }; outPlayer: Player } => sub !== null)
  }, [selectedPlayersData, replacedPlayerByUniqueKey, selectedMatchday, config])

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
    selectedMatchday === Math.max(1, config.fantasy_starting_matchday)
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

  // Obtener lista única de equipos para el filtro. Solo cuentan los equipos con
  // alguien fichable: si no, el desplegable ofrece equipos que no devuelven ni
  // un jugador.
  const uniqueTeams = Array.from(
    new Map(players.filter(isInMarket).map(p => p.team?.name ? [p.team.name, p.team_id] : null).filter(Boolean) as [string, string][])
  ).map(([name, id]) => ({ name, id })).sort((a, b) => a.name.localeCompare(b.name))

  // Filtrar jugadores disponibles
  const filteredAvailablePlayers = useMemo(() => {
    const normalize = (text: string) => text ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : ''
    const q = normalize(searchFilter)
    
    return availablePlayers.filter(p => {
      // Fuera del mercado: no se puede fichar aunque siga en la BD porque
      // alguien lo tenga en su equipo. Ver src/lib/market.ts.
      if (!isInMarket(p)) return false
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
  const actualChangesCount = selectedPlayers.filter(id => !changesBasePlayers.includes(id)).length

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
      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="absolute top-3 right-3 bg-black/70 text-white text-xs font-bold rounded-full w-8 h-8 flex items-center justify-center z-10">
              {paymentModalCountdown}
            </div>
            <img src="/tebas_paga.png" alt="Pago pendiente" className="w-full h-auto block" />
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-2 pb-2 border-b border-slate-100/50">
        <div className="flex items-center gap-2 flex-wrap">

          {config?.budget_limit > 0 && (
            <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 text-slate-650 px-2.5 py-1 rounded-lg text-xs font-bold shadow-xs">
              Presupuesto: <span className="text-slate-900 font-extrabold">{config.budget_limit}M</span>
            </span>
          )}
          
          {warnings.length > 0 && (
            <button
              onClick={() => setShowWarningsModal(true)}
              className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-red-600 px-2.5 py-1 rounded-lg border border-slate-200 font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 animate-bounce shrink-0" />
              <span>Avisos ({warnings.length})</span>
            </button>
          )}

          {/* Estado de cambios en la misma línea */}
          {isUnlockWindowOpen ? (
            <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-650 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-xs">
              <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-slate-800 font-bold">Cambios Bloqueados</span>
              {timeUntilLock && timeUntilLock !== 'Finalizada' && (
                <span className="text-slate-400 font-normal">
                  (abren en <span className="font-bold text-slate-600 font-mono">{timeUntilLock}</span>)
                </span>
              )}
            </span>
          ) : (
            timeUntilUnlock && (
              isCloseToStart ? (
                <span className="inline-flex items-center gap-2 bg-red-50 border-2 border-red-500 text-red-700 px-4 py-2 rounded-xl text-sm sm:text-base font-extrabold shadow-md animate-pulse">
                  <Unlock className="w-5 h-5 text-red-600 shrink-0 animate-bounce" />
                  <span>
                    ¡Cierre de cambios en: <span className="font-black text-red-600 font-mono text-base sm:text-lg">{timeUntilUnlock}</span>!
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-650 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-xs animate-pulse">
                  <Unlock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 font-bold">Cambios Abiertos</span>
                  <span className="text-slate-400 font-normal">
                    (cierre en <span className="font-bold text-slate-600 font-mono">{timeUntilUnlock}</span>)
                  </span>
                </span>
              )
            )
          )}
        </div>
      </div>

      {/* ================= CONTENEDOR PRINCIPAL ================= */}
      <div className={`flex flex-col ${isUnlockWindowOpen ? 'lg:flex-row' : ''} gap-6 items-stretch w-full mt-0`}>
        {/* Columna Izquierda: Campograma */}
        <div className={`w-full ${isUnlockWindowOpen ? 'lg:w-[50%] xl:w-[55%] 2xl:w-[55%]' : ''} shrink-0 flex flex-col gap-4`}>
          <Card className="border-0 sm:border-2 border-emerald-200 shadow-none sm:shadow-md bg-transparent sm:bg-white mx-[-1rem] sm:mx-0">
          <CardContent className="p-0 sm:p-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 px-3 sm:px-0 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 relative">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jornada:</span>
                {typeof activeMatchday === 'number' && activeMatchday > 0 ? (
                  <div className="relative">
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-extrabold px-3 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Jornada {selectedMatchday} {selectedMatchday === activeMatchday ? '(Activa)' : ''}</span>
                      <ChevronDown className={`w-3 h-3 text-slate-500 shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isDropdownOpen && (
                      <>
                        {/* Overlay invisible para cerrar el menú al hacer clic fuera */}
                        <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                        
                        <div className="absolute left-0 mt-1.5 w-48 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-1.5 max-h-56 overflow-y-auto scrollbar-none animate-in fade-in slide-in-from-top-2 duration-150">
                          {selectableMatchdays.map((md) => {
                            const isCurrent = md === selectedMatchday
                            const isActive = md === activeMatchday
                            return (
                              <button
                                key={md}
                                onClick={() => {
                                  setSelectedMatchday(md)
                                  setIsDropdownOpen(false)
                                }}
                                className={`flex items-center justify-between w-full text-left px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                                  isCurrent
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                                  Jornada {md} {isActive ? '(Activa)' : ''}
                                </span>
                                {isCurrent && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <span className="text-xs font-extrabold text-slate-800">Cargando...</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span>{selectedPlayersData.length}/11 jugadores</span>
              </div>
            </div>

            {isUnlockWindowOpen ? (
              <div className="flex justify-center w-full">
                {/* Pitch */}
                <div className={`relative w-full max-w-full ${userDivision === 1 ? 'sm:max-w-lg' : 'sm:max-w-md'} mx-auto border-y-2 sm:border-2 border-white rounded-none sm:rounded-xl overflow-hidden p-2 sm:p-3 select-none flex flex-col justify-between shadow-2xl aspect-[2/3]`} style={{
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
                    className={`relative z-10 flex flex-col justify-between h-full -translate-x-2 sm:-translate-x-1 md:-translate-x-1 lg:-translate-x-1 ${
                      userDivision === 1 
                        ? 'pt-[23%] pb-[23%] px-0 scale-[0.85] origin-bottom sm:pt-[25%] sm:pb-[20%] sm:scale-[0.83] sm:origin-center' 
                        : 'px-6 pt-24 pb-12 sm:px-2 sm:pt-20 sm:pb-4 md:px-0 md:pt-24 md:pb-6 lg:pt-28 lg:pb-8'
                    }`}
                    style={userDivision === 1 ? { filter: 'drop-shadow(0 25px 20px rgba(0,0,0,0.6))' } : {}}
                  >
                    {/* Delanteros */}
                    <div className="flex flex-col items-center gap-2 w-full sm:translate-y-8">
                      {splitRowPlayers(selectedPlayersData.filter(p => getPositionCode(p.position) === 'FWD')).map((subRow, rowIdx, rowsArr) => {
                        const isSplit = rowsArr.length > 1
                        return (
                          <div 
                            key={rowIdx} 
                            className={`flex justify-center flex-nowrap items-center ${getRowGapClass(subRow.length, true, userDivision === 1)} ${userDivision === 1 && !isSplit ? 'px-[15%]' : ''} ${userDivision === 1 ? 'translate-x-2' : ''}`}
                          >
                            {subRow.map((player, idx) => (
                              <div 
                                key={player._uniqueKey} 
                                className={`transition-transform duration-300 ${isSplit ? '' : getStagger(subRow.length, idx)} z-20 cursor-pointer`}
                                onClick={() => openPlayerSelector(player.id, player._originalIndex, player.team_id)}
                              >
                                <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={!!teamMatchStatus.get(String(player.team_id))} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} replacedPlayer={replacedPlayerByUniqueKey.get(player._uniqueKey)} />
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      {selectedPlayersData.filter(p => getPositionCode(p.position) === 'FWD').length === 0 && (
                        <div className="text-[10px] text-white/30 italic">Sin Delanteros</div>
                      )}
                    </div>

                    {/* Mediocampistas */}
                    <div className="flex flex-col items-center gap-2 w-full">
                      {splitRowPlayers(selectedPlayersData.filter(p => getPositionCode(p.position) === 'MID')).map((subRow, rowIdx, rowsArr) => {
                        const isSplit = rowsArr.length > 1
                        return (
                          <div 
                            key={rowIdx} 
                            className={`flex justify-center flex-nowrap items-center ${getRowGapClass(subRow.length, false, userDivision === 1)} ${userDivision === 1 && !isSplit ? 'px-[4%] -translate-y-1 sm:-translate-y-2' : ''} ${isSplit && rowIdx === 0 ? 'translate-y-2 sm:translate-y-4' : ''} ${userDivision === 1 ? 'translate-x-2' : ''}`}
                          >
                            {subRow.map((player, idx) => (
                              <div 
                                key={player._uniqueKey} 
                                className={`transition-transform duration-300 ${isSplit ? '' : getStagger(subRow.length, idx)} z-20 cursor-pointer`}
                                onClick={() => openPlayerSelector(player.id, player._originalIndex, player.team_id)}
                              >
                                <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={!!teamMatchStatus.get(String(player.team_id))} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} replacedPlayer={replacedPlayerByUniqueKey.get(player._uniqueKey)} />
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      {selectedPlayersData.filter(p => getPositionCode(p.position) === 'MID').length === 0 && (
                        <div className="text-[10px] text-white/30 italic">Sin Centrocampistas</div>
                      )}
                    </div>

                    {/* Defensas */}
                    <div className="flex flex-col items-center gap-2 w-full">
                      {splitRowPlayers(selectedPlayersData.filter(p => getPositionCode(p.position) === 'DEF')).map((subRow, rowIdx, rowsArr) => {
                        const isSplit = rowsArr.length > 1
                        return (
                          <div 
                            key={rowIdx} 
                            className={`flex justify-center flex-nowrap items-center ${getRowGapClass(subRow.length, false, userDivision === 1, true)} ${userDivision === 1 && !isSplit ? 'px-0 -translate-y-1 sm:-translate-y-2' : ''} ${userDivision === 1 ? 'translate-x-2' : ''}`}
                          >
                            {subRow.map((player, idx) => (
                              <div 
                                key={player._uniqueKey} 
                                className={`transition-transform duration-300 ${isSplit ? '' : getStagger(subRow.length, idx)} z-20 cursor-pointer`}
                                onClick={() => openPlayerSelector(player.id, player._originalIndex, player.team_id)}
                              >
                                <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={!!teamMatchStatus.get(String(player.team_id))} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} replacedPlayer={replacedPlayerByUniqueKey.get(player._uniqueKey)} />
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      {selectedPlayersData.filter(p => getPositionCode(p.position) === 'DEF').length === 0 && (
                        <div className="text-[10px] text-white/30 italic">Sin Defensas</div>
                      )}
                    </div>

                    {/* Portero */}
                    <div className={`flex justify-center flex-wrap items-center gap-1 ${userDivision === 1 ? '-translate-y-4 sm:-translate-y-6 translate-x-2' : ''}`}>
                      {selectedPlayersData.filter(p => getPositionCode(p.position) === 'GK').map(player => (
                        <div 
                          key={player._uniqueKey} 
                          className="cursor-pointer" 
                          onClick={() => openPlayerSelector(player.id, player._originalIndex, player.team_id)}
                        >
                          <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={!!teamMatchStatus.get(String(player.team_id))} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} replacedPlayer={replacedPlayerByUniqueKey.get(player._uniqueKey)} />
                        </div>
                      ))}
                      {selectedPlayersData.filter(p => getPositionCode(p.position) === 'GK').length === 0 && (
                        <div className="text-[10px] text-white/30 italic">Sin Portero</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                className="relative grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6 gap-4 sm:gap-6 lg:gap-8 p-6 sm:p-8 md:p-10 rounded-3xl shadow-[inset_0_10px_30px_rgba(0,0,0,0.6)] border-[4px] border-[#064e3b]" 
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, #15803d, #15803d 40px, #14532d 40px, #14532d 80px)',
                }}
              >
                <div className="absolute inset-0 rounded-3xl pointer-events-none shadow-[inset_0_0_60px_rgba(0,0,0,0.7)]" />
                {selectedPlayersData.map((player, idx) => {
                  const isChanged = !unchangedKeys.has(player._uniqueKey)
                  const isLockedPlayer = isTeamLocked(player.team_id)
                  const replacedPlayer = isChanged ? replacedPlayerByUniqueKey.get(player._uniqueKey) : undefined
                  const displayName = formatPlayerName(player.short_name || player.first_name || '')
                  return (
                    <div
                      key={player._uniqueKey}
                      onClick={() => openPlayerSelector(player.id, player._originalIndex, player.team_id)}
                      className={`@container relative z-10 w-full aspect-[5/7] transition-all duration-300 group ${
                        isUnlockWindowOpen || isLockedPlayer
                          ? 'cursor-not-allowed opacity-70'
                          : 'cursor-pointer hover:scale-105 hover:-translate-y-2 hover:z-50'
                      }`}
                      style={{
                        filter: 'drop-shadow(0 25px 25px rgba(0,0,0,0.9)) drop-shadow(0 10px 10px rgba(0,0,0,0.7))'
                      }}
                    >
                      <div className={`absolute inset-0 overflow-hidden rounded-xl border ${
                        isUnlockWindowOpen
                          ? 'bg-slate-900 border-slate-800'
                          : isLockedPlayer
                            ? 'bg-slate-900 border-red-900'
                            : isChanged
                              ? 'bg-gradient-to-br from-emerald-900/90 to-slate-900 border-emerald-500/50'
                              : 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 group-hover:border-amber-500/50'
                      }`}>
                        {player.team?.logo_url && (
                          <img 
                            src={player.team.logo_url} 
                            alt="Fondo" 
                            className="absolute left-1/2 -translate-x-1/2 top-[-25%] w-[110%] h-[110%] object-contain opacity-20 pointer-events-none filter blur-[2px]"
                          />
                        )}

                        <div className="absolute inset-x-0 bottom-0 h-[30%] bg-black z-10 pointer-events-none" />
                        <div className="absolute inset-x-0 bottom-[30%] h-[30%] bg-gradient-to-t from-black via-black/80 to-transparent z-10 pointer-events-none" />

                        <div className="absolute top-[3cqw] left-[3cqw] flex flex-row items-center gap-[1.5cqw] z-20 drop-shadow-md">
                          <div className="bg-black/60 rounded flex items-center justify-center px-[2cqw] py-[1cqw]">
                            <span className="text-[10cqw] font-black text-white leading-none">
                              {idx + 1}
                            </span>
                          </div>
                          <div className={`text-[8cqw] px-[2cqw] py-[1cqw] font-bold text-white rounded-sm drop-shadow-md ${getPositionColor(player.position)}`}>
                            {getPositionLabel(player.position)}
                          </div>
                        </div>

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

                        <div className="absolute inset-x-0 bottom-[2cqw] flex flex-col items-center z-20 px-[2cqw] w-full">
                          <div className="w-full bg-black/95 rounded-lg py-[2cqw] px-[2cqw] flex flex-col items-center shadow-2xl">
                            <p className={`font-black text-amber-50 uppercase text-center w-full leading-tight truncate tracking-tight drop-shadow-lg ${
                                displayName.length > 14
                                  ? 'text-[9cqw]'
                                  : displayName.length > 10
                                  ? 'text-[11cqw]'
                                  : 'text-[13cqw]'
                              }`}
                              style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.9)' }}
                            >
                              {displayName}
                            </p>
                            
                            <div className="w-11/12 h-[1px] bg-amber-500/40 my-[1cqw]" />

                            <div className="w-full flex justify-between items-center px-[1cqw]">
                              <div className="flex-1 flex justify-start">
                                <span className="font-black text-emerald-400 text-[14cqw] drop-shadow-md">
                                  {player.precio ? `${player.precio}M` : '-'}
                                </span>
                              </div>
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

                      {replacedPlayer && (
                        <div className="absolute z-40 flex flex-col items-center pointer-events-none drop-shadow-xl 
                          -top-5 sm:-top-[8cqw] left-1/2 -translate-x-1/2 
                          md:top-[9cqw] md:left-auto md:-right-[4cqw] md:translate-x-0 md:items-center
                        ">
                          <div className="relative">
                            {replacedPlayer.photo ? (
                              <img
                                src={replacedPlayer.photo}
                                className="w-5 h-5 sm:w-7 sm:h-7 md:w-10 md:h-10 rounded-full object-cover border-[1.5px] border-red-400 shadow-xl bg-slate-200 grayscale-[10%]"
                              />
                            ) : (
                              <div className="w-5 h-5 sm:w-7 sm:h-7 md:w-10 md:h-10 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[8px] sm:text-[10px] font-bold border-[1.5px] border-red-400 shadow-xl">
                                {replacedPlayer.shirt_number || '?'}
                              </div>
                            )}
                            {replacedPlayer.team?.logo_url && (
                              <img
                                src={replacedPlayer.team.logo_url}
                                className="absolute -bottom-1 -left-1 w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 object-contain bg-white rounded-full p-[1px] shadow-sm"
                              />
                            )}
                          </div>
                          <div className="mt-0.5 md:mt-1 bg-black/95 rounded px-1.5 md:px-1.5 py-0.5 flex flex-col items-center shadow-xl border border-red-500/30">
                            <p className="font-bold text-red-100 text-[5px] sm:text-[7px] md:text-[7px] leading-tight truncate text-center max-w-[35px] sm:max-w-[45px]">
                              {replacedPlayer.short_name || replacedPlayer.first_name}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {Array.from({ length: Math.max(0, 11 - selectedPlayersData.length) }).map((_, i) => {
                  const emptyIdx = selectedPlayersData.length + i
                  return (
                    <div
                      key={`empty-${emptyIdx}`}
                      onClick={() => openPlayerSelector('', emptyIdx)}
                      className="@container relative z-10 w-full aspect-[5/7] transition-all duration-300 group cursor-pointer hover:scale-105 hover:-translate-y-2 hover:z-50"
                      style={{
                        filter: 'drop-shadow(0 25px 25px rgba(0,0,0,0.9)) drop-shadow(0 10px 10px rgba(0,0,0,0.7))'
                      }}
                    >
                      <div className="absolute inset-0 overflow-hidden rounded-xl border bg-slate-800/50 border-slate-700 border-dashed flex flex-col items-center justify-center gap-[2cqw] group-hover:bg-slate-700/50 group-hover:border-emerald-500/50 transition-colors">
                        <div className="w-[15cqw] h-[15cqw] rounded-full bg-slate-700/60 flex items-center justify-center text-slate-400 group-hover:bg-emerald-500/20 group-hover:text-emerald-400 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="50%" height="50%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                        </div>
                        <span className="text-[9cqw] font-black text-slate-400 group-hover:text-emerald-400 transition-colors uppercase tracking-wider">Fichar</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* INDICADOR DE CAMBIOS GUARDADOS AUTOMÁTICAMENTE */}
        {!isUnlockWindowOpen && (
          <div className="flex items-center gap-2 justify-between mt-2 px-3 sm:px-0 animate-in fade-in duration-200 bg-slate-50 border border-slate-100 rounded-xl p-3 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">
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
                <span className="text-sm text-emerald-600 font-bold">
                  {actualChangesCount} cambio{actualChangesCount !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Columna Derecha: Rendimiento y Sanciones */}
      <div className="w-full lg:flex-1 lg:self-stretch flex flex-col">
        {/* ================= PESTAÑAS SUB-NAVEGACIÓN (RESPONSIVE GRID) ================= */}
        <div className={`grid ${!isUnlockWindowOpen ? 'grid-cols-1' : 'grid-cols-2'} gap-1.5 sm:gap-3 bg-slate-100/90 p-1.5 rounded-xl shadow-inner border border-slate-200/50 mb-6 shrink-0`}>
          {isUnlockWindowOpen && (
            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'stats'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-650 hover:bg-white/55 hover:text-slate-900'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Rendimiento</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('penalties')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'penalties'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-650 hover:bg-white/55 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Sanciones</span>
          </button>
        </div>

        {/* Contenedor de contenido de pestañas con scroll independiente en ordenador */}
        <div className="lg:flex-1 lg:max-h-[640px] xl:max-h-[710px] 2xl:max-h-[720px] lg:overflow-y-auto pr-1 scrollbar-none pb-2">

      {/* VISTA 2: RENDIMIENTO Y RANKINGS */}
      {activeTab === 'stats' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Tarjetas de Estadísticas Principales */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-3 sm:p-4 shadow-sm flex items-center gap-2.5 sm:gap-4 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase tracking-wider truncate">Formación</p>
                <p className="text-base sm:text-xl font-black text-slate-900 mt-0.5 truncate">{teamStats.formacion}</p>
              </div>
            </div>
            
            <div className="bg-white border border-slate-100 rounded-2xl p-3 sm:p-4 shadow-sm flex items-center gap-2.5 sm:gap-4 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase tracking-wider truncate">Valor Plantilla</p>
                <p className="text-base sm:text-xl font-black text-slate-900 mt-0.5 truncate">{teamStats.precioTotal > 0 ? `${teamStats.precioTotal}M` : '-'}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-3 sm:p-4 shadow-sm flex items-center gap-2.5 sm:gap-4 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase tracking-wider truncate">Puntos Totales</p>
                <p className="text-base sm:text-xl font-black text-slate-900 mt-0.5 truncate">{Math.round(teamStats.puntosTotales * 10) / 10}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-3 sm:p-4 shadow-sm flex items-center gap-2.5 sm:gap-4 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs text-slate-500 font-semibold uppercase tracking-wider truncate">Media por Jugador</p>
                <p className="text-base sm:text-xl font-black text-slate-900 mt-0.5 truncate">{Math.round(teamStats.mediaPuntos * 10) / 10} pts</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rankings de la Liga */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Trophy className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Tus Rankings en la Liga</h3>
              </div>

              {loadingRanks ? (
                <div className="text-center text-sm text-slate-400 py-8">Cargando rankings...</div>
              ) : userRanks ? (
                <div className="flex flex-col gap-2">
                  <div 
                    className="bg-slate-50 hover:bg-emerald-50/50 rounded-xl p-3 border border-slate-100 flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] gap-3"
                    onClick={() => setSelectedRanking('avg3')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">Promedio (Últ. 3)</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{Math.round(userRanks.avg3.value * 10) / 10} pts</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-800 text-sm font-extrabold px-2.5 py-1 rounded-lg min-w-[42px]">
                        #{userRanks.avg3.position}
                      </span>
                    </div>
                  </div>

                  <div 
                    className="bg-slate-50 hover:bg-emerald-50/50 rounded-xl p-3 border border-slate-100 flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] gap-3"
                    onClick={() => setSelectedRanking('impact')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">Impacto Cambios</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{userRanks.impact.value > 0 ? '+' : ''}{Math.round(userRanks.impact.value * 10) / 10} pts</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-800 text-sm font-extrabold px-2.5 py-1 rounded-lg min-w-[42px]">
                        #{userRanks.impact.position}
                      </span>
                    </div>
                  </div>

                  <div 
                    className="bg-slate-50 hover:bg-emerald-50/50 rounded-xl p-3 border border-slate-100 flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] gap-3"
                    onClick={() => setSelectedRanking('changes')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">Cambios Totales</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{userRanks.changes.value} cambios</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-800 text-sm font-extrabold px-2.5 py-1 rounded-lg min-w-[42px]">
                        #{userRanks.changes.position}
                      </span>
                    </div>
                  </div>

                  <div 
                    className="bg-slate-50 hover:bg-emerald-50/50 rounded-xl p-3 border border-slate-100 flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] gap-3"
                    onClick={() => setSelectedRanking('kamikaze')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">Premio Kamikaze</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{formatKamikazeTime(userRanks.kamikaze.value)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-800 text-sm font-extrabold px-2.5 py-1 rounded-lg min-w-[42px]">
                        #{userRanks.kamikaze.position}
                      </span>
                    </div>
                  </div>

                  <div 
                    className="bg-slate-50 hover:bg-emerald-50/50 rounded-xl p-3 border border-slate-100 flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] gap-3"
                    onClick={() => setSelectedRanking('appOpens')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">Adictos a la App</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{userRanks.appOpens.value} accesos</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-800 text-sm font-extrabold px-2.5 py-1 rounded-lg min-w-[42px]">
                        #{userRanks.appOpens.position}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-sm text-slate-400 py-4">Sin datos</div>
              )}
            </div>

            {/* Distribución por Equipos */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Users className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-base">Distribución por Equipos</h3>
              </div>
              <p className="text-xs text-slate-500">
                Límite actual: <span className="font-bold">{config.max_players_per_team} jugadores</span> por club real de LaLiga en tu plantilla.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
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

                  if (byTeam.size === 0) {
                    return <p className="text-sm text-slate-400 italic py-2">No tienes jugadores alineados.</p>
                  }

                  return Array.from(byTeam.entries())
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([teamId, info]) => {
                      const overLimit = info.count > config.max_players_per_team
                      return (
                        <div
                          key={teamId}
                          title={info.name}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-semibold transition-all shadow-sm ${
                            overLimit
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          {info.logo_url ? (
                            <img src={info.logo_url} alt={info.name} className="w-5 h-5 object-contain shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0" />
                          )}
                          <span className="text-slate-800 font-bold">{info.name}</span>
                          <span className={`tabular-nums font-black px-1.5 py-0.5 rounded-md text-xs ${overLimit ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
                            {info.count}
                          </span>
                        </div>
                      )
                    })
                })()}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* VISTA 3: SANCIONES Y MULTAS */}
      {activeTab === 'penalties' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Tus Sanciones (Jornada Activa) solo se muestran si el mercado está cerrado (en juego) */}
          {isUnlockWindowOpen && (
            <Card className="border border-red-200 bg-red-50/35 rounded-2xl shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2 pb-2.5 border-b border-red-100">
                  <AlertTriangle className="w-5 h-5 text-red-600 animate-pulse" />
                  <h3 className="text-base font-bold text-red-900">Sanciones Activas en J{activeMatchday}</h3>
                </div>
                
                {allPenalties.filter(p => p.user_id === user?.id && p.matchday === activeMatchday).length === 0 &&
                 liveInfractions.filter(inf => inf.user_id === user?.id && !allPenalties.some(p => p.user_id === user?.id && p.matchday === activeMatchday)).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-center bg-emerald-50/50 rounded-xl border border-emerald-100 p-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
                      <Check className="w-5 h-5 text-emerald-600" />
                    </div>
                    <p className="text-sm text-emerald-800 font-bold">¡Buen trabajo!</p>
                    <p className="text-xs text-emerald-700 mt-0.5">Estás completamente al día y libre de sanciones en esta jornada.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Sanciones consolidadas en BD */}
                    {allPenalties
                      .filter(p => p.user_id === user?.id && p.matchday === activeMatchday)
                      .map((p) => (
                        <div key={p.id} className="flex justify-between items-center text-sm bg-white rounded-xl p-3 border border-red-100 shadow-sm">
                          <div className="flex items-center gap-2.5">
                            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-md text-xs font-bold font-mono">J{p.matchday}</span>
                            <span className="text-slate-800 font-semibold">{p.description}</span>
                          </div>
                          <span className={`font-black text-sm shrink-0 ml-2 ${p.points > 0 ? 'text-red-600' : 'text-amber-600 text-xs uppercase'}`}>
                            {p.points > 0 ? `-${p.points} pts` : 'Pendiente'}
                          </span>
                        </div>
                      ))}

                    {/* Advertencias dinámicas activas (infracciones actuales del usuario) */}
                    {liveInfractions
                      .filter(inf => inf.user_id === user?.id && !allPenalties.some(p => p.user_id === user?.id && p.matchday === activeMatchday))
                      .map((inf) => (
                        <div key={inf.id} className="flex justify-between items-center text-sm bg-white rounded-xl p-3 border border-amber-200 shadow-sm animate-pulse">
                          <div className="flex items-center gap-2.5">
                            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md text-xs font-bold font-mono">J{activeMatchday}</span>
                            <span className="text-slate-800 font-semibold">{inf.description}</span>
                          </div>
                          <span className="font-bold text-amber-600 shrink-0 ml-2 text-xs uppercase">Pendiente</span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Historial de Sanciones (Liga) */}
          <Card className="border border-slate-100 bg-white rounded-2xl shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <AlertTriangle className="w-5 h-5 text-slate-500" />
                <h3 className="text-base font-bold text-slate-900">Historial Completo de Sanciones (Liga)</h3>
              </div>

              {allPenalties.filter(p => p.user_id === user?.id && p.matchday >= (config?.fantasy_starting_matchday ?? 1) && p.matchday < activeMatchday && !openMatchdays.includes(p.matchday)).length === 0 &&
               liveInfractions.filter(inf => inf.user_id === user?.id && inf.matchday >= (config?.fantasy_starting_matchday ?? 1) && inf.matchday < activeMatchday && !openMatchdays.includes(inf.matchday) && !allPenalties.some(p => p.user_id === inf.user_id && p.matchday === inf.matchday)).length === 0 ? (
                <p className="text-sm text-slate-500 italic text-center py-6">No tienes sanciones registradas en tu historial.</p>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                  {/* Sanciones dinámicas activas del usuario */}
                  {liveInfractions
                    .filter(inf => inf.user_id === user?.id && inf.matchday >= (config?.fantasy_starting_matchday ?? 1) && inf.matchday < activeMatchday && !openMatchdays.includes(inf.matchday) && !allPenalties.some(p => p.user_id === inf.user_id && p.matchday === inf.matchday))
                    .map((inf) => (
                    <div key={inf.id} className="flex justify-between items-center text-sm bg-slate-50 rounded-xl p-3 border border-amber-100 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md text-xs font-bold font-mono">J{inf.matchday}</span>
                        <span className="text-slate-800 font-semibold">{inf.description}</span>
                      </div>
                      <span className="font-bold text-amber-600 shrink-0 ml-2 text-xs uppercase">Pendiente</span>
                    </div>
                  ))}

                  {/* Sanciones consolidadas históricas del usuario */}
                  {allPenalties
                    .filter(p => p.user_id === user?.id && p.matchday >= (config?.fantasy_starting_matchday ?? 1) && p.matchday < activeMatchday && !openMatchdays.includes(p.matchday))
                    .map((p) => {
                      const profileObj = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
                      const userName = profileObj?.full_name || 'Tú'
                      return (
                        <div key={p.id} className="flex justify-between items-center text-sm bg-white rounded-xl p-3 border border-slate-100 shadow-sm hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-md text-xs font-bold font-mono">J{p.matchday}</span>
                            <span className="text-slate-800 font-semibold">{p.description}</span>
                          </div>
                          <span className={`font-black text-sm shrink-0 ml-2 ${p.points > 0 ? 'text-red-600' : p.matchday === activeMatchday ? 'text-amber-600 text-xs uppercase' : 'text-slate-400'}`}>
                            {p.points > 0 ? `-${p.points} pts` : p.matchday === activeMatchday ? 'Pendiente' : '0 pts'}
                          </span>
                        </div>
                      )
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      </div>
      </div>
      </div>

      {/* Gráfica de evolución - siempre visible a todo lo ancho */}
      {(historicalPoints.length > 0 || typeof activeMatchday === 'number') && (
        <Card className="w-full mt-6 border border-slate-100 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-300">
          <CardContent className="p-5">
            <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Evolución de Puntos
            </h3>
            <div className="w-full h-[250px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={[
                    ...historicalPoints,
                    (typeof selectedMatchday === 'number' && teamStats?.puntosTotales !== undefined) 
                      ? { matchday: selectedMatchday, name: `J${selectedMatchday}`, points: teamStats.puntosTotales, hasPenalty: sanctionResult?.zeroedPlayers?.size > 0 || liveInfractions.some(i => i.user_id === user?.id) }
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

      {/* Lista de Jugadores Sustituidos y que han entrado */}
      {selectedMatchday > (config?.fantasy_starting_matchday ?? 1) && (
        <Card className="w-full mt-6 border border-slate-100 rounded-2xl shadow-sm overflow-hidden bg-white animate-in fade-in duration-300">
          <CardContent className="p-5">
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800" style={{ fontFamily: 'var(--font-outfit)' }}>
                  Sustituciones de la Jornada {selectedMatchday}
                </h3>
                <p className="text-xs text-slate-500">
                  Jugadores del once inicial que fueron sustituidos respecto a la jornada anterior
                </p>
              </div>
            </div>

            {substitutionsList.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                No se realizaron sustituciones en esta jornada.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {substitutionsList.map(({ inPlayer, outPlayer }, idx) => {
                  const inPts = playerPoints.get(inPlayer.id)
                  const outPts = playerPoints.get(outPlayer.id)

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-3 bg-slate-50/70 border border-slate-100 rounded-xl hover:shadow-sm transition-all"
                    >
                      {/* JUGADOR QUE SALE (Sustituido) */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="text-[9px] font-black text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded shrink-0">
                          SALE
                        </span>
                        <div className="relative shrink-0">
                          {outPlayer.photo ? (
                            <img
                              src={outPlayer.photo}
                              alt={outPlayer.short_name}
                              className="w-10 h-10 rounded-full object-cover border border-slate-200 bg-white grayscale-[40%]"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-450 border border-slate-200">
                              {outPlayer.shirt_number || '?'}
                            </div>
                          )}
                          {outPlayer.team?.logo_url && (
                            <img
                              src={outPlayer.team.logo_url}
                              alt=""
                              className="absolute -bottom-1 -right-1 w-4 h-4 object-contain bg-white rounded-full p-0.5 shadow-xs border border-slate-100"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-650 truncate">
                            {formatPlayerName(outPlayer.short_name || outPlayer.first_name)}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[8px] font-bold text-white px-1 py-0.2 rounded-sm leading-none shrink-0 ${getPositionColor(outPlayer.position)}`}>
                              {getPositionLabel(outPlayer.position)}
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium">
                              {outPlayer.precio ? `${outPlayer.precio}M` : '-'}
                            </span>
                          </div>
                        </div>
                        {outPts !== undefined && (
                          <div className="ml-auto text-slate-400 font-bold text-xs shrink-0 pr-1">
                            {outPts} pts
                          </div>
                        )}
                      </div>

                      {/* FLECHA DE CAMBIO */}
                      <div className="flex items-center justify-center text-slate-400 px-1">
                        <ArrowRight className="w-4 h-4" />
                      </div>

                      {/* JUGADOR QUE ENTRA (Nuevo Starter) */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                          ENTRA
                        </span>
                        <div className="relative shrink-0">
                          {inPlayer.photo ? (
                            <img
                              src={inPlayer.photo}
                              alt={inPlayer.short_name}
                              className="w-10 h-10 rounded-full object-cover border border-slate-200 bg-white"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-200">
                              {inPlayer.shirt_number || '?'}
                            </div>
                          )}
                          {inPlayer.team?.logo_url && (
                            <img
                              src={inPlayer.team.logo_url}
                              alt=""
                              className="absolute -bottom-1 -right-1 w-4 h-4 object-contain bg-white rounded-full p-0.5 shadow-xs border border-slate-100"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">
                            {formatPlayerName(inPlayer.short_name || inPlayer.first_name)}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[8px] font-bold text-white px-1 py-0.2 rounded-sm leading-none shrink-0 ${getPositionColor(inPlayer.position)}`}>
                              {getPositionLabel(inPlayer.position)}
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium">
                              {inPlayer.precio ? `${inPlayer.precio}M` : '-'}
                            </span>
                          </div>
                        </div>
                        {inPts !== undefined && (
                          <div className="ml-auto text-emerald-600 font-black text-xs shrink-0 pr-1">
                            {inPts} pts
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
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

      {showWarningsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setShowWarningsModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-amber-50">
              <div className="flex items-center gap-2 text-amber-900">
                <Bell className="w-5 h-5" />
                <h2 className="font-bold text-lg">Avisos y Bloqueos Especiales</h2>
              </div>
              <button onClick={() => setShowWarningsModal(false)} className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              <p className="text-sm text-slate-600 mb-4">
                Hay equipos con partidos descolocados que sufren bloqueos especiales:
              </p>
              <ul className="space-y-3">
                {warnings.map(w => (
                  <li key={w.fixtureId} className="flex gap-2.5 items-start bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                    <span className="text-sm text-slate-700">
                      <span className="font-bold text-amber-900">{w.teams?.home || 'Local'} vs {w.teams?.away || 'Visitante'}</span>
                      <> (J{w.ownMatchday} adelantado): Sus jugadores se bloquean desde esta jornada hasta el fin de la J{w.ownMatchday}.</>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setShowWarningsModal(false)} className="px-5 py-2 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
      {statsModalPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4"
          onClick={() => setStatsModalPlayer(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera compacta con resumen en la misma línea */}
            <div className="bg-white border-b border-slate-100 px-3 py-3 sm:px-4 sm:py-3.5 flex justify-between items-center z-10 shrink-0">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                {statsModalPlayer.photo ? (
                  <img
                    src={statsModalPlayer.photo}
                    alt={statsModalPlayer.short_name || ''}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-slate-200 shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                      ;(e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                ) : null}
                <DorsalBadge
                  number={statsModalPlayer.shirt_number || '?'}
                  className={`w-14 h-14 sm:w-16 sm:h-16 rounded-md border-2 border-slate-200 shrink-0 ${statsModalPlayer.photo ? 'hidden' : ''}`}
                />
                
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-lg font-black text-slate-800 truncate" style={{ fontFamily: 'var(--font-outfit)' }}>
                      {formatPlayerName(statsModalPlayer.short_name || statsModalPlayer.first_name)}
                    </h2>
                    <span className={`text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded text-white ${getPositionColor(statsModalPlayer.calc_position || statsModalPlayer.position)}`}>
                      {getPositionLabel(statsModalPlayer.calc_position || statsModalPlayer.position)}
                    </span>
                    <span className="text-xs sm:text-sm text-slate-500 font-medium">
                      ({statsModalPlayer.is_starter ? 'Titular' : 'Suplente'})
                    </span>
                  </div>

                  {/* Resumen al lado del nombre en más pequeño para moviles */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs sm:text-sm text-slate-600 leading-none mt-0.5">
                    <span className="flex items-center gap-1">
                      <strong className={`font-extrabold text-sm sm:text-base ${
                        (statsModalPlayer.total_points || 0) < 0 ? 'text-red-600' : (statsModalPlayer.total_points || 0) >= 0 && (statsModalPlayer.total_points || 0) < 6 ? 'text-orange-600' : 'text-emerald-600'
                      }`}>{statsModalPlayer.total_points || 0}</strong> pts
                    </span>
                    <span className="text-slate-300">•</span>
                    <span><strong className="text-slate-800">{statsModalPlayer.minutes_played || 0}</strong> min</span>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1">
                      ⚽ <strong className="text-slate-800">{statsModalPlayer.goals || 0}</strong>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1">
                      🅰️ <strong className="text-slate-800">{statsModalPlayer.assists || 0}</strong>
                    </span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setStatsModalPlayer(null)}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 shrink-0 ml-2 border border-slate-200/50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Cuerpo scrollable internamente y muy compacto */}
            <div className="p-2 sm:p-3 overflow-y-auto space-y-2 flex-1">
              <MetricBreakdown player={statsModalPlayer} fixture={statsModalFixture || undefined} />

              <button
                onClick={() => {
                  router.push(`/jugadores/${statsModalPlayer.id}`)
                  setStatsModalPlayer(null)
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

const DorsalBadge = ({ number, className = '' }: { number: number | string; className?: string }) => {
  const numberStr = String(number)
  const isLong = numberStr.length > 2
  const fontSize = isLong ? '55' : '70'
  const strokeWidthOuter = isLong ? '5' : '7'
  const strokeWidthInner = isLong ? '1.4' : '1.8'

  return (
    <div className={`bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden shrink-0 ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full p-0.5">
        <text
          x="50"
          y="52"
          dominantBaseline="middle"
          textAnchor="middle"
          className="font-black"
          fontSize={fontSize}
          fill="#154734"
          stroke="#154734"
          strokeWidth={strokeWidthOuter}
          strokeLinejoin="round"
        >
          {numberStr}
        </text>
        <text
          x="50"
          y="52"
          dominantBaseline="middle"
          textAnchor="middle"
          className="font-black"
          fontSize={fontSize}
          fill="#154734"
          stroke="white"
          strokeWidth={strokeWidthInner}
          strokeLinejoin="round"
        >
          {numberStr}
        </text>
        <text
          x="50"
          y="52"
          dominantBaseline="middle"
          textAnchor="middle"
          className="font-black"
          fontSize={fontSize}
          fill="#154734"
        >
          {numberStr}
        </text>
      </svg>
    </div>
  )
}
