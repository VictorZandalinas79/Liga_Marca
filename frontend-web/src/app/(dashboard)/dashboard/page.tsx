'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { MetricBreakdown } from '@/components/metric-breakdown'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'
import { useLockedTeams, useOpenMatchdays } from '@/lib/locked-teams'
import { useLeagueConfig } from '@/lib/league-config'
import { loadCalendar } from '@/lib/calendar-store'
import { applySanctionsToTeam } from '@/lib/infractions'
import { isInMarket } from '@/lib/market'
import { getTeamColors } from '@/lib/team-colors'
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
import { Save, X, Check, Search, Lock, Unlock, UserPlus, Trophy, TrendingUp, Users, AlertTriangle, ChevronDown, Bell, Calendar, ArrowLeftRight, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Dot } from 'recharts'
import { getStandings } from '@/lib/standings'
import { isDivisionId, loadDivisionMembership } from '@/lib/divisions'
import { fetchLivePenalties } from '@/lib/live-penalties-client'
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

function getStagger(len: number, idx: number, pos?: string, fwdCount?: number) {
  if (pos === 'MID' && len === 4 && fwdCount === 3) {
    return ''
  }
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
  const [animatingCardKey, setAnimatingCardKey] = useState<string | null>(null)
  const [playerToSwap, setPlayerToSwap] = useState<{ id: string; index: number } | null>(null)
  const [searchFilter, setSearchFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState<string>('ALL')
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [priceMinFilter, setPriceMinFilter] = useState<number | ''>('')
  const [priceMaxFilter, setPriceMaxFilter] = useState<number | ''>('')
  const [marketRenderLimit, setMarketRenderLimit] = useState<number>(40)
  const [playerPoints, setPlayerPoints] = useState<Map<string, number>>(new Map())
  const [teamMatchStatus, setTeamMatchStatus] = useState<Map<string, boolean>>(new Map())
  const [teamFixtureMap, setTeamFixtureMap] = useState<Map<string, string>>(new Map())
  const [statsModalPlayer, setStatsModalPlayer] = useState<any | null>(null)
  const [statsModalFixture, setStatsModalFixture] = useState<any | null>(null)
  const [userRanks, setUserRanks] = useState<any>(null)
  const [loadingRanks, setLoadingRanks] = useState(true)
  const [selectedRanking, setSelectedRanking] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'substitutions' | 'stats' | 'penalties'>('substitutions')
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
  const [allFixturesLite, setAllFixturesLite] = useState<{ matchday: number | null; status: string | null }[]>([])

  useEffect(() => {
    loadCalendar().then(({ fixtures }) => {
      if (fixtures) {
        setAllFixturesLite(fixtures)
      }
    })
  }, [])

  const postponedMatchdays = useMemo(() => {
    const set = new Set<number>()
    if (allFixturesLite && allFixturesLite.length > 0) {
      allFixturesLite.forEach(f => {
        const s = (f.status || '').toLowerCase()
        if ((s === 'postponed' || s === 'suspended') && f.matchday && f.matchday > 0) {
          set.add(f.matchday)
        }
      })
    }
    return set
  }, [allFixturesLite])

  // Jornadas que se listan en el selector: la activa (siempre, para poder
  // hacer los cambios de mercado) + las que estén "abiertas" + con partidos aplazados.
  const selectableMatchdays = useMemo(() => {
    const set = new Set(openMatchdays)
    if (typeof activeMatchday === 'number' && activeMatchday > 0) set.add(activeMatchday)
    postponedMatchdays.forEach(md => set.add(md))
    return [...set]
      .sort((a, b) => a - b)
      .filter(md => md >= (config?.fantasy_starting_matchday ?? 1))
  }, [openMatchdays, activeMatchday, config?.fantasy_starting_matchday, postponedMatchdays])
  // Al resolver los datos por primera vez, se posiciona en la jornada más próxima
  // a disputarse (recommendedMatchday) si la hay; si no, en la activa.
  const initialMatchdaySetRef = useRef(false)
  useEffect(() => {
    if (typeof activeMatchday !== 'number' || activeMatchday <= 0) return
    if (!initialMatchdaySetRef.current) {
      // Espera a conocer las jornadas abiertas para no posicionar primero en
      // la activa y "saltar" un instante después a la recomendada.
      if (!openMatchdaysLoaded) return
      setSelectedMatchday(recommendedMatchday ?? activeMatchday)
      initialMatchdaySetRef.current = true
    }
  }, [activeMatchday, recommendedMatchday, openMatchdaysLoaded])
  const { isLocked: rawIsLocked, isUnlockWindowOpen: rawIsUnlockWindowOpen, timeUntilLock, timeUntilUnlock, unlockTime, lockTime, currentMomento, currentMatchday: resolvedMatchday, previousMatchday, upcomingLocks, isCloseToStart } = useMatchdayLock(selectedMatchday)
  // Equipos bloqueados por partidos fuera de orden de jornada (aplazados/adelantados).
  // Estos jugadores no se pueden cambiar aunque el mercado general esté abierto.
  const lockedTeams = useLockedTeams()
  // Una jornada suspendida que ya no es la activa (p.ej. J6 suspendida mientras
  // la activa es J7) se trata como bloqueada: el partido está a punto de acabar
  // y no deben poder hacerse cambios, aunque al excluir el fixture suspendido
  // del cálculo de bloqueos (use-matchday-lock) nunca generaría ventana de cierre.
  const isSuspendedNonActiveMatchday = postponedMatchdays.has(selectedMatchday) && selectedMatchday !== activeMatchday
  const isUnlockWindowOpen = rawIsUnlockWindowOpen || isSuspendedNonActiveMatchday
  const isLocked = rawIsLocked || isSuspendedNonActiveMatchday

  useEffect(() => {
    // Si isUnlockWindowOpen es FALSE, el mercado está ABIERTO (no hay partidos en juego).
    // En ese caso, ocultamos Rendimiento.
    if (!isUnlockWindowOpen && activeTab === 'stats') {
      setActiveTab('substitutions')
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
      if (!user?.id) return;

      const fantasyStart = Math.max(1, config.fantasy_starting_matchday);

      // Usar el motor oficial de clasificación (getStandings) para obtener exactamente
      // las mismas puntuaciones por jornada calculadas para la liga y división.
      const { standings: standingsData, lastPlayedMatchday } = await getStandings(supabase, userDivision, null);

      if (!standingsData || standingsData.length === 0) return;

      const myStanding = standingsData.find(s => s.user_id === user.id);
      const myMatchdayPoints = myStanding?.matchday_points || {};

      // Obtener las sanciones registradas por jornada para marcar los puntos rojos
      const { data: penaltiesData } = await supabase
        .from('penalties')
        .select('matchday, points')
        .eq('user_id', user.id);

      const penaltyMatchdays = new Set<number>();
      (penaltiesData || []).forEach(p => {
        const md = typeof p.matchday === 'string' ? parseInt(p.matchday, 10) : p.matchday;
        if (md) penaltyMatchdays.add(md);
      });

      const history = [];
      const maxMd = lastPlayedMatchday || 1;

      for (let md = fantasyStart; md <= maxMd; md++) {
        if (openMatchdays.includes(md)) continue;

        // Mis puntos en esta jornada exactamente como los calcula Clasificación / Jornada
        const myPoints = myMatchdayPoints[md] ?? 0;

        // Calcular la media de la liga/división en esa jornada
        let sum = 0;
        let count = 0;
        for (const s of standingsData) {
          if (s.matchday_points && s.matchday_points[md] !== undefined) {
            sum += s.matchday_points[md];
            count++;
          }
        }
        const avg = count > 0 ? sum / count : 0;

        history.push({
          matchday: md,
          name: `J${md}`,
          points: Math.round(myPoints * 10) / 10,
          avgPoints: Math.round(avg * 10) / 10,
          hasPenalty: penaltyMatchdays.has(md)
        });
      }

      setHistoricalPoints(history);
    }
    
    fetchHistory();
  }, [user?.id, supabase, config.fantasy_starting_matchday, openMatchdays, userDivision]);

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
  // Antes de tener el estado `isSavingLineup` espejado abajo, esta ref por sí
  // sola hacía que un segundo clic mientras el primero seguía en vuelo se
  // descartara EN SILENCIO (el guard hacía `return` antes de tocar ningún
  // estado): el usuario veía "guardado" el primero y creía que los demás
  // cambios también se habían guardado, cuando en realidad se habían perdido.
  const lineupSavingRef = useRef(false)
  const [isSavingLineup, setIsSavingLineup] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const saveMutexRef = useRef<Promise<any>>(Promise.resolve())

  // Función unificada y segura para persistir alineaciones en Supabase
  const executeLineupSave = async (
    targetSelected: string[],
    targetChangeHistory: Array<{ outId: string; inId: string; index: number }>,
    targetDbReplaced: Record<number, string>
  ) => {
    saveMutexRef.current = saveMutexRef.current.then(async () => {
      if (!userTeamId) return

      if (targetSelected.length !== 11) {
        console.warn('[SAVE LINEUP] Cancelado: La alineación debe tener 11 jugadores.')
        return
      }

      setIsSavingLineup(true)
      setSaveStatus('saving')

      const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1

      const teamPlayersData = targetSelected.map((pid, i) => {
        let replacedId: string | null = null
        if (activeMatchday && config && matchdayToSave > config.fantasy_starting_matchday) {
          if (targetDbReplaced[i]) replacedId = targetDbReplaced[i]
          else {
            const ch = targetChangeHistory.find(c => c.index === i)
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

      let attempts = 0
      let success = false
      let lastError: any = null

      while (attempts < 3 && !success) {
        attempts++
        try {
          const { error } = await supabase.rpc('save_team_lineup', {
            p_team_id: userTeamId,
            p_matchday: matchdayToSave,
            p_players: teamPlayersData
          })
          if (!error) {
            success = true
          } else {
            lastError = error
            console.warn(`[SAVE LINEUP] Intento ${attempts} falló:`, error.message)
            if (attempts < 3) await new Promise(r => setTimeout(r, 500 * attempts))
          }
        } catch (err) {
          lastError = err
          if (attempts < 3) await new Promise(r => setTimeout(r, 500 * attempts))
        }
      }

      setIsSavingLineup(false)

      if (success) {
        setSavedPlayers(targetSelected)
        setSaveStatus('saved')
      } else {
        console.error('[SAVE LINEUP] Error definitivo guardando alineación:', lastError)
        setSaveStatus('error')
        alert('⚠️ No se pudo guardar el cambio en el servidor debido a un problema de conexión. Por favor, inténtalo de nuevo.')
      }
    })

    return saveMutexRef.current
  }

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
          const { data: latestSaved } = await baseQuery().order('created_at', { ascending: false }).limit(20)
          if (latestSaved && latestSaved.length > 0) {
            const newestCreatedAt = latestSaved[0].created_at
            prevPlayers = latestSaved.filter(tp => tp.created_at === newestCreatedAt)
          } else {
            prevPlayers = (await baseQuery().lt('matchday', matchday).order('matchday', { ascending: false })).data
          }
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
      // Sin división aún resuelta la API no puede responder nada útil: evitamos
      // la petición inicial desperdiciada de cada carga de página.
      if (userDivision == null || selectedMatchday == null) {
        setLiveInfractions([])
        return
      }
      setLiveInfractions(await fetchLivePenalties(selectedMatchday, userDivision) as any[])
    }
    fetchLiveInfractions()
  }, [selectedMatchday, userDivision])

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

    if (selectedPlayers.length !== 11) {
      alert(`Tu equipo tiene ${selectedPlayers.length} jugadores. Debe tener exactamente 11 para poder guardarlo.`)
      return
    }

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

    if (!user?.id) {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) {
        alert('Error: Usuario no autenticado. Por favor, inicia sesión de nuevo.')
        window.location.href = '/'
        return
      }
    }

    let teamIdToUse = userTeamId
    if (!teamIdToUse) {
      const userId = user?.id || (await supabase.auth.getUser()).data.user?.id
      const { data: newTeam, error: teamError } = await supabase
        .from('user_teams')
        .insert({ user_id: userId, name: 'Mi Equipo' })
        .select('id')
        .single()

      if (teamError || !newTeam) {
        alert('Error creando equipo: ' + (teamError?.message || 'Error desconocido'))
        return
      }
      teamIdToUse = newTeam.id
      setUserTeamId(newTeam.id)
    }

    await executeLineupSave(selectedPlayers, changeHistory, dbReplacedPlayers)
  }

  const cancelChange = async (uniqueKey: string) => {
    const playerMatch = selectedPlayersData.find(p => p._uniqueKey === uniqueKey)
    if (!playerMatch) return
    const index = playerMatch._originalIndex

    const outPlayer = replacedPlayerByUniqueKey.get(uniqueKey)
    if (!outPlayer) return

    if (isPlayerLocked(playerMatch.id) || isPlayerLocked(outPlayer.id)) {
      alert('Este cambio no se puede cancelar: uno de los jugadores implicados está bloqueado por un partido fuera de jornada.')
      setCancelConfirmUniqueKey(null)
      return
    }

    const newSelected = [...selectedPlayers]
    newSelected[index] = outPlayer.id

    const newChangeHistory = changeHistory.filter(ch => ch.index !== index)
    const newDbReplaced = { ...dbReplacedPlayers }
    delete newDbReplaced[index]

    setSelectedPlayers(newSelected)
    setChangeHistory(newChangeHistory)
    setDbReplacedPlayers(newDbReplaced)
    setCancelConfirmUniqueKey(null)

    await executeLineupSave(newSelected, newChangeHistory, newDbReplaced)
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
      setPendingSwap({ outId: playerToSwap.id, inId: newPlayerId, index: playerToSwap.index })
      setShowSwapConfirm(true)
      closePlayerSelector()
    }
  }

  const confirmSwap = async () => {
    if (!pendingSwap) return

    const { outId, inId, index } = pendingSwap
    const matchdayToSave = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1

    const newChangeHistory = (activeMatchday && config && matchdayToSave > config.fantasy_starting_matchday) 
      ? [...changeHistory, { outId, inId, index }]
      : []

    const newSelected = [...selectedPlayers]
    newSelected[index] = inId

    setChangeHistory(newChangeHistory)
    setSelectedPlayers(newSelected)
    setPendingSwap(null)
    setShowSwapConfirm(false)

    await executeLineupSave(newSelected, newChangeHistory, dbReplacedPlayers)
  }

  const cancelSwap = () => {
    setPendingSwap(null)
    setShowSwapConfirm(false)
  }

  const openPlayerSelector = async (playerId: string, playerIndex: number, playerTeamId?: string, uniqueKey?: string) => {
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
    if (uniqueKey) {
      setAnimatingCardKey(uniqueKey)
    }
    setTimeout(() => {
      setPlayerToSwap({ id: playerId, index: playerIndex })
      setSearchFilter('')
      setPositionFilter('ALL')
      setSelectedTeamIds([])
      setPriceMinFilter('')
      setPriceMaxFilter('')
      setMarketRenderLimit(40)
    }, 320)
  }

  const toggleTeamFilter = (teamId: string) => {
    setSelectedTeamIds(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    )
  }

  const clearTeamFilter = () => {
    setSelectedTeamIds([])
  }

  const closePlayerSelector = () => {
    setAnimatingCardKey(null)
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
    setSelectedTeamIds([])
    setMarketRenderLimit(40)
  }

  const handleMarketScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 500) {
      setMarketRenderLimit(prev => {
        if (prev >= filteredAvailablePlayers.length) return prev
        return Math.min(prev + 40, filteredAvailablePlayers.length)
      })
    }
  }

  const undoLastChange = async () => {
    if (changeHistory.length === 0) return

    const lastChange = changeHistory[changeHistory.length - 1]
    
    const newSelected = [...selectedPlayers]
    newSelected[lastChange.index] = lastChange.outId

    const newChangeHistory = changeHistory.slice(0, -1)
    setSelectedPlayers(newSelected)
    setChangeHistory(newChangeHistory)
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
    setSelectedTeamIds([])
    setPriceMinFilter('')
    setPriceMaxFilter('')

    await executeLineupSave(newSelected, newChangeHistory, dbReplacedPlayers)
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

  // Se muestran siempre los 11 jugadores; el bloqueo por partido adelantado
  // se refleja jugador a jugador con isTeamLocked (candado + no editable),
  // no ocultando el resto del once heredado.
  const displayedPlayersData = selectedPlayersData

  const pitchPlayersData = displayedPlayersData
  const fwdCountOnPitch = pitchPlayersData.filter(p => getPositionCode(p.position) === 'FWD').length

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

  // Obtener lista única de equipos para el filtro con sus logos oficiales
  const uniqueTeams = useMemo(() => {
    const map = new Map<string, { id: string; name: string; logo_url?: string }>()
    for (const p of players) {
      if (p.team?.name && p.team_id) {
        if (!map.has(p.team_id)) {
          map.set(p.team_id, {
            id: p.team_id,
            name: p.team.name,
            logo_url: p.team.logo_url,
          })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [players])

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
      const matchesTeam = selectedTeamIds.length === 0 || selectedTeamIds.includes(p.team_id)
      if (!matchesTeam) return false
      const matchesPriceMin = priceMinFilter === '' || (p.precio ?? 0) >= priceMinFilter
      if (!matchesPriceMin) return false
      const matchesPriceMax = priceMaxFilter === '' || (p.precio ?? 0) <= priceMaxFilter
      if (!matchesPriceMax) return false

      if (q) {
        // Cached normalized names to avoid recalculating on every filter run
        const displayName = (p as any)._normalizedName || ((p as any)._normalizedName = normalize(`${p.short_name || ''} ${p.first_name || ''} ${p.last_name || ''}`))
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
  }, [availablePlayers, searchFilter, positionFilter, selectedTeamIds, priceMinFilter, priceMaxFilter])

  useEffect(() => {
    setMarketRenderLimit(40)
  }, [searchFilter, positionFilter, selectedTeamIds, priceMinFilter, priceMaxFilter, playerToSwap])

  const visibleAvailablePlayers = useMemo(() => {
    return filteredAvailablePlayers.slice(0, marketRenderLimit)
  }, [filteredAvailablePlayers, marketRenderLimit])

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

  // Avisar de jugadores duplicados ÚNICAMENTE cuando la jornada ya está en juego (isUnlockWindowOpen)
  // y ya no se pueden realizar cambios. No se avisa antes del cierre para no incitar a rectificar el error.
  if (isUnlockWindowOpen) {
    const playerCountsInTeam = new Map<string, number>()
    for (const p of selectedPlayersData) {
      playerCountsInTeam.set(p.id, (playerCountsInTeam.get(p.id) || 0) + 1)
    }
    for (const [pid, count] of playerCountsInTeam.entries()) {
      if (count > 1) {
        const p = selectedPlayersData.find(x => x.id === pid)
        const name = p ? (p.short_name || `${p.first_name || ''} ${p.last_name || ''}`.trim()) : 'Jugador'
        ruleWarnings.push(`${name} está repetido ${count} veces en la alineación (sancionado).`)
      }
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
                      <span>
                        Jornada {selectedMatchday}{' '}
                        {selectedMatchday === activeMatchday
                          ? '(Activa)'
                          : postponedMatchdays.has(selectedMatchday)
                          ? '(Partido Suspendido)'
                          : ''}
                      </span>
                      <ChevronDown className={`w-3 h-3 text-slate-500 shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isDropdownOpen && (
                      <>
                        {/* Overlay invisible para cerrar el menú al hacer clic fuera */}
                        <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                        
                        <div className="absolute left-0 mt-1.5 w-56 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-1.5 max-h-56 overflow-y-auto scrollbar-none animate-in fade-in slide-in-from-top-2 duration-150">
                          {selectableMatchdays.map((md) => {
                            const isCurrent = md === selectedMatchday
                            const isActive = md === activeMatchday
                            const isPostponed = postponedMatchdays.has(md)
                            const label = isActive ? '(Activa)' : isPostponed ? '(Partido Suspendido)' : ''
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
                                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : isPostponed ? 'bg-amber-500' : 'bg-slate-300'}`} />
                                  Jornada {md} {label}
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
                {saveStatus === 'saving' && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-bold text-[11px] animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" /> Guardando...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md font-bold text-[11px]">
                    <Check className="w-3 h-3 text-emerald-600" /> Guardado
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md font-bold text-[11px]">
                    ⚠️ Error al guardar
                  </span>
                )}
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
                      {splitRowPlayers(pitchPlayersData.filter(p => getPositionCode(p.position) === 'FWD')).map((subRow, rowIdx, rowsArr) => {
                        const isSplit = rowsArr.length > 1
                        return (
                          <div 
                            key={rowIdx} 
                            className={`flex justify-center flex-nowrap items-center ${getRowGapClass(subRow.length, true, userDivision === 1)} ${userDivision === 1 && !isSplit ? 'px-[15%]' : ''} ${userDivision === 1 ? 'translate-x-2' : ''}`}
                          >
                            {subRow.map((player, idx) => (
                              <div 
                                key={player._uniqueKey} 
                                className={`transition-transform duration-300 ${isSplit ? '' : getStagger(subRow.length, idx, 'FWD', fwdCountOnPitch)} z-20 cursor-pointer ${animatingCardKey === player._uniqueKey ? 'animate-card-magic-pop' : ''}`}
                                onClick={() => openPlayerSelector(player.id, player._originalIndex, player.team_id, player._uniqueKey)}
                              >
                                <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={!!teamMatchStatus.get(String(player.team_id))} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} replacedPlayer={replacedPlayerByUniqueKey.get(player._uniqueKey)} />
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      {pitchPlayersData.filter(p => getPositionCode(p.position) === 'FWD').length === 0 && (
                        <div className="text-[10px] text-white/30 italic">Sin Delanteros</div>
                      )}
                    </div>

                    {/* Mediocampistas */}
                    <div className="flex flex-col items-center gap-2 w-full">
                      {splitRowPlayers(pitchPlayersData.filter(p => getPositionCode(p.position) === 'MID')).map((subRow, rowIdx, rowsArr) => {
                        const isSplit = rowsArr.length > 1
                        return (
                          <div 
                            key={rowIdx} 
                            className={`flex justify-center flex-nowrap items-center ${getRowGapClass(subRow.length, false, userDivision === 1)} ${userDivision === 1 && !isSplit ? 'px-[4%] -translate-y-1 sm:-translate-y-2' : ''} ${isSplit && rowIdx === 0 ? 'translate-y-2 sm:translate-y-4' : ''} ${userDivision === 1 ? 'translate-x-2' : ''}`}
                          >
                            {subRow.map((player, idx) => (
                              <div 
                                key={player._uniqueKey} 
                                className={`transition-transform duration-300 ${isSplit ? '' : getStagger(subRow.length, idx, 'MID', fwdCountOnPitch)} z-20 cursor-pointer ${animatingCardKey === player._uniqueKey ? 'animate-card-magic-pop' : ''}`}
                                onClick={() => openPlayerSelector(player.id, player._originalIndex, player.team_id, player._uniqueKey)}
                              >
                                <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={!!teamMatchStatus.get(String(player.team_id))} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} replacedPlayer={replacedPlayerByUniqueKey.get(player._uniqueKey)} />
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      {pitchPlayersData.filter(p => getPositionCode(p.position) === 'MID').length === 0 && (
                        <div className="text-[10px] text-white/30 italic">Sin Centrocampistas</div>
                      )}
                    </div>

                    {/* Defensas */}
                    <div className="flex flex-col items-center gap-2 w-full">
                      {splitRowPlayers(pitchPlayersData.filter(p => getPositionCode(p.position) === 'DEF')).map((subRow, rowIdx, rowsArr) => {
                        const isSplit = rowsArr.length > 1
                        return (
                          <div 
                            key={rowIdx} 
                            className={`flex justify-center flex-nowrap items-center ${getRowGapClass(subRow.length, false, userDivision === 1, true)} ${userDivision === 1 && !isSplit ? 'px-0 -translate-y-1 sm:-translate-y-2' : ''} ${userDivision === 1 ? 'translate-x-2' : ''}`}
                          >
                            {subRow.map((player, idx) => (
                              <div 
                                key={player._uniqueKey} 
                                className={`transition-transform duration-300 ${isSplit ? '' : getStagger(subRow.length, idx, 'DEF', fwdCountOnPitch)} z-20 cursor-pointer ${animatingCardKey === player._uniqueKey ? 'animate-card-magic-pop' : ''}`}
                                onClick={() => openPlayerSelector(player.id, player._originalIndex, player.team_id, player._uniqueKey)}
                              >
                                <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={!!teamMatchStatus.get(String(player.team_id))} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} replacedPlayer={replacedPlayerByUniqueKey.get(player._uniqueKey)} />
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      {pitchPlayersData.filter(p => getPositionCode(p.position) === 'DEF').length === 0 && (
                        <div className="text-[10px] text-white/30 italic">Sin Defensas</div>
                      )}
                    </div>

                    {/* Portero */}
                    <div className={`flex justify-center flex-wrap items-center gap-1 ${userDivision === 1 ? '-translate-y-4 sm:-translate-y-6 translate-x-2' : ''}`}>
                      {pitchPlayersData.filter(p => getPositionCode(p.position) === 'GK').map(player => (
                        <div 
                          key={player._uniqueKey} 
                          className={`cursor-pointer ${animatingCardKey === player._uniqueKey ? 'animate-card-magic-pop' : ''}`} 
                          onClick={() => openPlayerSelector(player.id, player._originalIndex, player.team_id, player._uniqueKey)}
                        >
                          <PitchPlayerCard player={player} points={playerPoints.get(player.id)} hasMatchStarted={!!teamMatchStatus.get(String(player.team_id))} getPositionColor={getPositionColor} getPositionLabel={getPositionLabel} isPenalized={sanctionResult.zeroedPlayers.has(player.id)} sanctionReason={sanctionResult.zeroedPlayers.get(player.id)} replacedPlayer={replacedPlayerByUniqueKey.get(player._uniqueKey)} />
                        </div>
                      ))}
                      {pitchPlayersData.filter(p => getPositionCode(p.position) === 'GK').length === 0 && (
                        <div className="text-[10px] text-white/30 italic">Sin Portero</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                className="relative overflow-hidden rounded-3xl ring-1 ring-white/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] bg-[#0d2814]"
                style={{
                  backgroundImage: `url('/pitches/grass_turf_3d.jpg')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {/* Iluminación 3D: relieve, focos de estadio nocturno y viñeta perimetral */}
                <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(255,255,255,0.22),transparent_70%),radial-gradient(ellipse_60%_50%_at_50%_100%,rgba(0,0,0,0.4),transparent_80%)]" />
                <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_90px_rgba(0,0,0,0.85)]" />
                
                {/* Líneas de cal del terreno de juego con relieve sutil */}
                <div className="absolute inset-3 sm:inset-5 rounded-2xl border-2 border-white/30 pointer-events-none shadow-[0_0_6px_rgba(255,255,255,0.2)]" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 sm:w-72 sm:h-72 rounded-full border-2 border-white/30 pointer-events-none shadow-[0_0_6px_rgba(255,255,255,0.2)]" />
                <div className="absolute left-1/2 inset-y-0 w-[2px] bg-white/30 pointer-events-none shadow-[0_0_6px_rgba(255,255,255,0.2)]" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white/50 pointer-events-none shadow-[0_0_4px_rgba(255,255,255,0.4)]" />

                <div className="relative grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-5 lg:gap-6 p-4 sm:p-6 md:p-8">
                {displayedPlayersData.map((player, idx) => {
                  const isChanged = !unchangedKeys.has(player._uniqueKey)
                  const isLockedPlayer = isTeamLocked(player.team_id)
                  const isPopping = animatingCardKey === player._uniqueKey
                  const displayName = formatPlayerName(player.short_name || player.first_name || '')
                  const posLabel = getPositionLabel(player.position)
                  const posDot = ({ POR: 'bg-amber-400', DEF: 'bg-blue-400', MED: 'bg-emerald-400', DEL: 'bg-rose-400' } as Record<string, string>)[posLabel] ?? 'bg-slate-400'
                  // Colores del club para teñir la ficha
                  const tc = getTeamColors(player.team?.name)

                  return (
                    <div
                      key={player._uniqueKey}
                      onClick={() => openPlayerSelector(player.id, player._originalIndex, player.team_id, player._uniqueKey)}
                      className={`@container relative z-10 w-full aspect-[5/7] transition-all duration-300 ease-out group ${
                        isUnlockWindowOpen || isLockedPlayer
                          ? 'cursor-not-allowed'
                          : 'cursor-pointer hover:-translate-y-2 hover:z-50'
                      } ${
                        isPopping ? 'animate-card-magic-pop' : ''
                      }`}
                      style={{ '--tc': tc.primary } as React.CSSProperties}
                    >
                      {/* Aura resplandeciente mágica al pulsar */}
                      {isPopping && (
                        <div className="absolute -inset-2.5 sm:-inset-3 rounded-3xl bg-emerald-400/30 border-2 border-emerald-300 shadow-[0_0_35px_rgba(16,185,129,0.9)] animate-magic-aura pointer-events-none z-40" />
                      )}

                      {/* Sombra 3D de apoyo y contacto físico sobre el césped */}
                      <div className={`absolute -bottom-[9%] inset-x-[5%] h-[18%] bg-black/85 rounded-[100%] blur-[4px] pointer-events-none transition-all duration-300 ${isPopping ? 'scale-125 opacity-30 blur-[10px]' : 'group-hover:scale-90 group-hover:opacity-40 group-hover:blur-[8px]'}`} />
                      <div className={`absolute -bottom-[4%] inset-x-[12%] h-[10%] bg-black/95 rounded-[100%] blur-[2px] pointer-events-none transition-all duration-300 ${isPopping ? 'opacity-10' : 'group-hover:opacity-25'}`} />

                      <div className={`absolute inset-0 overflow-hidden rounded-2xl bg-white border-b-2 border-slate-300/80 ring-1 transition-all duration-300 shadow-[0_14px_30px_-6px_rgba(0,0,0,0.8),0_6px_12px_-4px_rgba(0,0,0,0.6)] group-hover:shadow-[0_26px_45px_-8px_rgba(0,0,0,0.9)] ${
                        isLockedPlayer
                          ? 'ring-red-500/60'
                          : isChanged
                            ? 'ring-[3px] ring-emerald-400'
                            : `ring-white/40 ${isUnlockWindowOpen ? '' : 'group-hover:ring-[var(--tc)]'}`
                      }`}>
                        {/* Halo con los colores del club */}
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(120% 65% at 30% 0%, ${tc.primary}66, transparent 70%), radial-gradient(90% 55% at 100% 40%, ${tc.secondary}33, transparent 70%), linear-gradient(to bottom, ${tc.primary}1f, #f8fafc 80%)` }} />
                        <div className="absolute top-0 inset-x-0 h-[2cqw]" style={{ backgroundImage: `linear-gradient(90deg, ${tc.primary} 0 60%, ${tc.secondary} 60% 100%)` }} />

                        {/* Escudo de fondo como marca de agua */}
                        {player.team?.logo_url && (
                          <img
                            src={player.team.logo_url}
                            alt=""
                            className="absolute -right-[18%] top-[6%] w-[85%] h-[85%] object-contain opacity-[0.25] pointer-events-none"
                          />
                        )}

                        {/* Dorsal de alineación (grande, tenue) */}
                        <span className="absolute top-[4cqw] right-[5cqw] z-20 font-black text-[22cqw] leading-none text-slate-900/10 tabular-nums select-none">
                          {idx + 1}
                        </span>

                        {/* Posición */}
                        <div className="absolute top-[6cqw] left-[5cqw] z-20 flex items-center gap-[2cqw] rounded-full bg-white/80 backdrop-blur-sm ring-1 ring-slate-900/10 shadow-sm pl-[2.5cqw] pr-[3.5cqw] py-[1.2cqw]">
                          <span className={`w-[3.5cqw] h-[3.5cqw] rounded-full ${posDot}`} />
                          <span className="text-[8cqw] font-extrabold tracking-wider leading-none text-slate-800">{posLabel}</span>
                        </div>

                        {/* Foto */}
                        <div className="absolute inset-x-0 bottom-[24%] top-[14%] flex justify-center items-end z-10 pointer-events-none">
                          {player.photo ? (
                            <img
                              src={player.photo}
                              alt={player.short_name || ''}
                              className={`h-full w-full object-contain object-bottom drop-shadow-[0_6px_10px_rgba(15,23,42,0.25)] transition-transform duration-500 ${isLockedPlayer ? 'grayscale opacity-60' : 'group-hover:scale-[1.06]'}`}
                            />
                          ) : (
                            <div className="mb-[8cqw] h-[55%] aspect-square rounded-full bg-slate-100 ring-1 ring-slate-200 text-slate-500 flex items-center justify-center text-[22cqw] font-black">
                              {player.shirt_number || '?'}
                            </div>
                          )}
                        </div>

                        {/* Pie: nombre, precio y club */}
                        <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-white via-white/95 to-transparent z-10 pointer-events-none" />
                        <div className="absolute inset-x-0 bottom-0 z-20 px-[5cqw] pb-[5cqw] flex flex-col gap-[2.5cqw]">
                          <p className={`font-black text-slate-900 uppercase tracking-tight leading-none truncate text-center ${
                              displayName.length > 14 ? 'text-[9cqw]' : displayName.length > 10 ? 'text-[10.5cqw]' : 'text-[12cqw]'
                            }`}
                          >
                            {displayName}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-baseline gap-[0.5cqw] rounded-md bg-emerald-50 ring-1 ring-emerald-500/30 px-[2.5cqw] py-[1cqw] font-black text-emerald-700 text-[10cqw] leading-none tabular-nums">
                              {player.precio ?? '-'}
                              {player.precio ? <span className="text-[7cqw] font-bold text-emerald-600/80">M</span> : null}
                            </span>
                            {player.team?.logo_url ? (
                              <img
                                src={player.team.logo_url}
                                alt={player.team?.name || ''}
                                title={player.team?.name || ''}
                                className="w-[13cqw] h-[13cqw] object-contain drop-shadow"
                              />
                            ) : <div className="w-[13cqw] h-[13cqw]" />}
                          </div>
                        </div>

                        {/* Brillo al pasar el ratón */}
                        {!isUnlockWindowOpen && !isLockedPlayer && (
                          <div className="absolute inset-0 z-30 pointer-events-none bg-gradient-to-tr from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                        )}
                      </div>

                      {isChanged && !isLockedPlayer && (
                        <span className="absolute -top-[4cqw] left-1/2 -translate-x-1/2 z-40 rounded-full bg-emerald-500 px-[3cqw] py-[1cqw] text-[6.5cqw] font-black tracking-wider text-white shadow-lg shadow-emerald-900/50 ring-2 ring-slate-950">
                          NUEVO
                        </span>
                      )}

                      <div className="absolute -top-[5cqw] -right-[5cqw] z-40 flex items-center gap-[1cqw]">
                        {isLockedPlayer && (
                          <div className="w-[16cqw] h-[16cqw] bg-gradient-to-br from-red-600 to-rose-700 rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(225,29,72,0.6)] ring-2 ring-slate-950" title="Jugador bloqueado: partido fuera de jornada">
                            <Lock className="w-[8cqw] h-[8cqw] text-white stroke-[2.5]" />
                          </div>
                        )}
                        {isChanged && !isLockedPlayer && (
                          <button
                            onClick={e => { e.stopPropagation(); setCancelConfirmUniqueKey(player._uniqueKey) }}
                            className="w-[16cqw] h-[16cqw] bg-slate-950/90 hover:bg-rose-600 ring-1 ring-white/20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 hover:rotate-90 active:scale-95"
                            title="Cancelar cambio"
                          >
                            <X className="w-[9cqw] h-[9cqw] text-white stroke-[3]" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {Array.from({ length: Math.max(0, 11 - selectedPlayersData.length) }).map((_, i) => {
                  const emptyIdx = selectedPlayersData.length + i
                  const isPopping = animatingCardKey === `empty-${emptyIdx}`
                  return (
                    <div
                      key={`empty-${emptyIdx}`}
                      onClick={() => openPlayerSelector('', emptyIdx, undefined, `empty-${emptyIdx}`)}
                      className={`@container relative z-10 w-full aspect-[5/7] transition-all duration-300 group cursor-pointer hover:-translate-y-2 hover:z-50 ${
                        isPopping
                          ? '!scale-110 !-translate-y-6 !z-50 ring-4 ring-emerald-400 shadow-[0_30px_60px_rgba(16,185,129,0.75)]'
                          : ''
                      }`}
                    >
                      {/* Sombra 3D de apoyo para slot vacío */}
                      <div className="absolute -bottom-[7%] inset-x-[8%] h-[14%] bg-black/70 rounded-[100%] blur-[4px] pointer-events-none" />
                      <div className="absolute inset-0 overflow-hidden rounded-2xl border-2 border-dashed border-white/30 bg-black/35 backdrop-blur-xs flex flex-col items-center justify-center gap-[4cqw] shadow-[inset_0_4px_12px_rgba(0,0,0,0.5)] group-hover:border-emerald-300/80 group-hover:bg-emerald-950/40 transition-colors">
                        <span className="absolute top-[4cqw] right-[5cqw] font-black text-[22cqw] leading-none text-white/20 tabular-nums">{emptyIdx + 1}</span>
                        <div className="w-[22cqw] h-[22cqw] rounded-full bg-white/10 ring-1 ring-white/20 flex items-center justify-center text-white/70 group-hover:bg-emerald-400/20 group-hover:text-emerald-300 group-hover:ring-emerald-400/40 transition-colors">
                          <UserPlus className="w-1/2 h-1/2" />
                        </div>
                        <span className="text-[8.5cqw] font-black text-white/70 group-hover:text-emerald-300 transition-colors uppercase tracking-[0.2em]">Fichar</span>
                      </div>
                    </div>
                  )
                })}
                </div>
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

      {/* Columna Derecha: Rendimiento, Sustituciones y Sanciones */}
      <div className="w-full lg:flex-1 lg:self-stretch flex flex-col">
        {/* ================= PESTAÑAS SUB-NAVEGACIÓN (RESPONSIVE GRID) ================= */}
        <div className={`grid ${!isUnlockWindowOpen ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5 sm:gap-2 bg-slate-100/90 p-1.5 rounded-xl shadow-inner border border-slate-200/50 mb-6 shrink-0`}>
          <button
            onClick={() => setActiveTab('substitutions')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'substitutions'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-650 hover:bg-white/55 hover:text-slate-900'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Sustituciones</span>
          </button>
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

      {/* VISTA 1: SUSTITUCIONES DE LA JORNADA */}
      {activeTab === 'substitutions' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {selectedMatchday > (config?.fantasy_starting_matchday ?? 1) ? (
            <Card className="w-full border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden bg-white/95 backdrop-blur-sm transition-all duration-300">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                      <ArrowLeftRight className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-slate-900 tracking-tight" style={{ fontFamily: 'var(--font-outfit)' }}>
                          Sustituciones de la Jornada {selectedMatchday}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Jugadores del once inicial sustituidos respecto a la jornada anterior
                      </p>
                    </div>
                  </div>
                  
                  {substitutionsList.length > 0 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                      {substitutionsList.length} cambio{substitutionsList.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {substitutionsList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2 text-slate-400">
                      <ArrowLeftRight className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">Sin sustituciones en la Jornada {selectedMatchday}</p>
                    <p className="text-xs text-slate-400 mt-1">La alineación no ha realizado cambios respecto a la jornada anterior.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {substitutionsList.map(({ inPlayer, outPlayer }, idx) => {
                      const inPts = playerPoints.get(inPlayer.id)
                      const outPts = playerPoints.get(outPlayer.id)

                      const outName = formatPlayerName(outPlayer.short_name || outPlayer.first_name)
                      const inName = formatPlayerName(inPlayer.short_name || inPlayer.first_name)

                      return (
                        <div
                          key={idx}
                          className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-3.5 shadow-xs hover:shadow-md transition-all duration-300"
                        >
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
                            {/* JUGADOR QUE SALE (Sustituido) */}
                            <div className="flex items-center gap-3 min-w-0 flex-1 bg-red-50/70 p-2.5 sm:p-3 rounded-xl border border-red-100/90 shadow-2xs">
                              {outPlayer.photo ? (
                                <img
                                  src={outPlayer.photo}
                                  alt={outName}
                                  className="w-14 sm:w-16 h-16 sm:h-20 object-contain object-bottom drop-shadow-md shrink-0 grayscale-[35%] opacity-85"
                                />
                              ) : (
                                <div className="w-12 h-14 rounded-xl bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold border border-red-200 shrink-0">
                                  {outPlayer.shirt_number || '?'}
                                </div>
                              )}

                              <div className="min-w-0 flex-1 flex flex-col justify-center">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[9px] font-black text-red-700 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wider">
                                    SALE
                                  </span>
                                  <span className={`text-[8px] font-bold text-white px-1.5 py-0.5 rounded-sm leading-none shrink-0 ${getPositionColor(outPlayer.position)}`}>
                                    {getPositionLabel(outPlayer.position)}
                                  </span>
                                  {outPlayer.team?.logo_url && (
                                    <img
                                      src={outPlayer.team.logo_url}
                                      alt=""
                                      className="w-4.5 h-4.5 object-contain shrink-0"
                                    />
                                  )}
                                </div>
                                <p className="text-xs sm:text-sm font-bold text-slate-800 leading-snug mt-1 break-words">
                                  {outName}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-medium">
                                  <span className="font-semibold">{outPlayer.precio ? `${outPlayer.precio}M` : '-'}</span>
                                  {outPts !== undefined && (
                                    <span className="font-extrabold text-slate-600 bg-white/90 px-1.5 py-0.2 rounded border border-slate-200/80 shadow-2xs">
                                      {outPts} pts
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* ICONO CENTRAL DE INTERCAMBIO */}
                            <div className="flex flex-col items-center justify-center shrink-0 py-0.5 sm:py-0">
                              <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md border-2 border-white">
                                <ArrowLeftRight className="w-4 h-4 text-amber-400" />
                              </div>
                            </div>

                            {/* JUGADOR QUE ENTRA (Nuevo Starter) */}
                            <div className="flex items-center gap-3 min-w-0 flex-1 bg-emerald-50/70 p-2.5 sm:p-3 rounded-xl border border-emerald-100/90 shadow-2xs">
                              {inPlayer.photo ? (
                                <img
                                  src={inPlayer.photo}
                                  alt={inName}
                                  className="w-14 sm:w-16 h-16 sm:h-20 object-contain object-bottom drop-shadow-md shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-14 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold border border-emerald-200 shrink-0">
                                  {inPlayer.shirt_number || '?'}
                                </div>
                              )}

                              <div className="min-w-0 flex-1 flex flex-col justify-center">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wider">
                                    ENTRA
                                  </span>
                                  <span className={`text-[8px] font-bold text-white px-1.5 py-0.5 rounded-sm leading-none shrink-0 ${getPositionColor(inPlayer.position)}`}>
                                    {getPositionLabel(inPlayer.position)}
                                  </span>
                                  {inPlayer.team?.logo_url && (
                                    <img
                                      src={inPlayer.team.logo_url}
                                      alt=""
                                      className="w-4.5 h-4.5 object-contain shrink-0"
                                    />
                                  )}
                                </div>
                                <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug mt-1 break-words">
                                  {inName}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-medium">
                                  <span className="font-semibold">{inPlayer.precio ? `${inPlayer.precio}M` : '-'}</span>
                                  {inPts !== undefined && (
                                    <span className="font-black text-emerald-700 bg-emerald-100/90 px-1.5 py-0.2 rounded border border-emerald-200 shadow-2xs">
                                      {inPts} pts
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-10 px-4 text-slate-400 bg-white rounded-2xl border border-slate-100 shadow-sm">
              En la primera jornada del juego no aplican sustituciones.
            </div>
          )}
        </div>
      )}

      {/* VISTA 2: RENDIMIENTO Y RANKINGS */}
      {activeTab === 'stats' && (
        <div className="space-y-6 animate-in fade-in duration-300">
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
                  data={historicalPoints}
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

      {/* Modal de selector de jugador con filtros (Ultra Moderno, Profesional, Compacto & Mobile-First) */}
      {playerToSwap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
          <div className="relative w-full max-w-5xl h-[94vh] sm:h-[88vh] bg-white rounded-2xl sm:rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col border border-slate-200/90 animate-in zoom-in-95 duration-200">
            {/* Barra superior de acento gradiente */}
            <div className="h-1 sm:h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 shrink-0" />

            {/* Cabecera del modal */}
            <div className="px-3.5 py-2.5 sm:px-5 sm:py-3 border-b border-slate-100 flex items-center justify-between gap-2 sm:gap-3 bg-white shrink-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center shrink-0 shadow-xs">
                  <ArrowLeftRight className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-tight">
                    Mercado de Fichajes
                  </h3>
                  {(() => {
                    const outP = players.find(p => p.id === playerToSwap.id)
                    if (outP) {
                      return (
                        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 truncate mt-0.5">
                          <span className="font-medium text-slate-400">Sustituyendo a:</span>
                          <span className="font-bold text-slate-800 truncate">{outP.short_name || outP.first_name}</span>
                          <span className={`text-[8px] sm:text-[9px] font-black text-white px-1.5 py-0.2 rounded ${getPositionColor(outP.position)}`}>
                            {getPositionLabel(outP.position)}
                          </span>
                          <span className="font-bold text-emerald-600">{outP.precio ? `${outP.precio}M` : '-'}</span>
                        </div>
                      )
                    }
                    return (
                      <p className="text-[11px] sm:text-xs text-slate-400 font-medium">
                        Selecciona un jugador para completar tu 11
                      </p>
                    )
                  })()}
                </div>
              </div>

              <button 
                onClick={closePlayerSelector} 
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 flex items-center justify-center transition-all duration-200 shrink-0 cursor-pointer"
                title="Cerrar ventana"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Barra de Filtros Compacta y Completa */}
            <div className="px-3 py-2 sm:px-5 sm:py-2.5 border-b border-slate-100 bg-slate-50/80 shrink-0 space-y-2">
              {/* Fila 1: Buscador + Filtro Precio + Contador */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Input de Búsqueda */}
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-600 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar jugador o club..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-2xs transition-all"
                  />
                  {searchFilter && (
                    <button
                      onClick={() => setSearchFilter('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filtro de Precios Min - Max (Ultra compacto) */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg sm:rounded-xl px-1.5 sm:px-2 py-1 shadow-2xs shrink-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase hidden sm:inline">Precio:</span>
                  <input
                    type="number"
                    placeholder="Min"
                    value={priceMinFilter}
                    onChange={(e) => setPriceMinFilter(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-9 sm:w-11 px-1 py-0.5 bg-slate-50 border border-slate-200 rounded text-[11px] font-bold text-slate-800 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    min="0"
                    step="0.1"
                  />
                  <span className="text-slate-300 text-xs">-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={priceMaxFilter}
                    onChange={(e) => setPriceMaxFilter(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-9 sm:w-11 px-1 py-0.5 bg-slate-50 border border-slate-200 rounded text-[11px] font-bold text-slate-800 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    min="0"
                    step="0.1"
                  />
                  <span className="text-[11px] font-bold text-emerald-600">M</span>
                  {(priceMinFilter !== '' || priceMaxFilter !== '') && (
                    <button
                      onClick={() => { setPriceMinFilter(''); setPriceMaxFilter('') }}
                      className="text-[10px] text-rose-500 hover:text-rose-700 font-bold ml-0.5 cursor-pointer"
                      title="Limpiar filtro de precio"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Badge Contador de Jugadores */}
                <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black shrink-0 shadow-2xs whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{filteredAvailablePlayers.length} <span className="hidden md:inline">disponibles</span></span>
                </div>
              </div>

              {/* Fila 2: Posiciones + Reset Clubes */}
              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                {/* Botones de Posición */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map(pos => {
                    const isActive = positionFilter === pos
                    const posShort: Record<string, string> = { ALL: 'Todos', GK: 'POR', DEF: 'DEF', MID: 'MED', FWD: 'DEL' }
                    const posFull: Record<string, string> = { ALL: 'Todos', GK: 'Porteros', DEF: 'Defensas', MID: 'Medios', FWD: 'Delanteros' }
                    const activeClass = 
                      pos === 'ALL' ? 'bg-slate-900 text-white shadow-xs' :
                      pos === 'GK' ? 'bg-amber-500 text-white shadow-xs' :
                      pos === 'DEF' ? 'bg-blue-600 text-white shadow-xs' :
                      pos === 'MID' ? 'bg-emerald-600 text-white shadow-xs' :
                      'bg-rose-600 text-white shadow-xs'

                    return (
                      <button
                        key={pos}
                        onClick={() => setPositionFilter(pos)}
                        className={`px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer shrink-0 ${
                          isActive
                            ? activeClass
                            : 'bg-white text-slate-650 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 shadow-2xs'
                        }`}
                      >
                        <span className="sm:hidden">{posShort[pos]}</span>
                        <span className="hidden sm:inline">{posFull[pos]}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Botón de limpiar filtro si hay equipos seleccionados */}
                {selectedTeamIds.length > 0 && (
                  <button
                    onClick={clearTeamFilter}
                    className="text-[10px] sm:text-xs font-bold text-emerald-800 bg-emerald-100/90 hover:bg-emerald-200/90 px-2 sm:px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                    title="Mostrar todos los clubes"
                  >
                    <span>Mostrar todos los clubes ({selectedTeamIds.length} selec.)</span>
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Fila 3: Escudos de Todos los Clubes (Grandes, solo escudo, todos visibles sin scroll) */}
              <div className="pt-1.5 border-t border-slate-200/60">
                <div className="flex flex-wrap items-center justify-between sm:justify-start gap-1 sm:gap-1.5 w-full">
                  {uniqueTeams.map((team) => {
                    const isSelected = selectedTeamIds.includes(team.id)
                    const hasFilter = selectedTeamIds.length > 0
                    return (
                      <button
                        key={team.id}
                        onClick={() => toggleTeamFilter(team.id)}
                        className={`group relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 p-1 sm:p-1.5 rounded-xl transition-all duration-150 cursor-pointer shrink-0 ${
                          isSelected
                            ? 'bg-emerald-50 border-2 border-emerald-500 shadow-sm ring-2 ring-emerald-500/25 scale-110 z-10'
                            : hasFilter
                            ? 'bg-white/60 border border-slate-200/60 opacity-35 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-105'
                            : 'bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 shadow-2xs hover:scale-110'
                        }`}
                        title={team.name}
                      >
                        {team.logo_url ? (
                          <img
                            src={team.logo_url}
                            alt={team.name}
                            loading="lazy"
                            decoding="async"
                            className={`w-full h-full object-contain transition-transform duration-150 ${
                              isSelected ? 'drop-shadow scale-105' : 'group-hover:scale-110'
                            }`}
                          />
                        ) : (
                          <div className="w-full h-full rounded-lg bg-slate-200 flex items-center justify-center text-[9px] font-black text-slate-700">
                            {team.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        {isSelected && (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[8px] font-black shadow-xs ring-1 ring-white">
                            ✓
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Listado de Jugadores / Cromos (Compacto y Optimizado con scroll infinito progresivo y lazy loading) */}
            <div
              onScroll={handleMarketScroll}
              className="flex-1 overflow-y-auto p-2.5 sm:p-4 md:p-5 bg-slate-100/60"
            >
              {filteredAvailablePlayers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">No se encontraron jugadores</p>
                  <p className="text-xs text-slate-500 mt-0.5">Prueba ajustando los filtros de precio, equipo o posición.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
                    {visibleAvailablePlayers.map((player) => {
                      const lockedPlayer = isTeamLocked(player.team_id)
                      const posLabel = getPositionLabel(player.position)
                      const stats = allPlayerStats.get(player.id)
                      const tc = getTeamColors(player.team?.name)

                      return (
                        <div
                          key={player.id}
                          onClick={() => !lockedPlayer && swapPlayer(player.id)}
                          className={`group relative overflow-hidden rounded-xl sm:rounded-2xl bg-white border transition-all duration-200 flex flex-col justify-between p-2 sm:p-2.5 ${
                            lockedPlayer
                              ? 'border-red-200 bg-red-50/40 opacity-65 cursor-not-allowed'
                              : 'border-slate-200/90 hover:border-emerald-500 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer shadow-2xs'
                          }`}
                        >
                          {/* Halo sutil de color del club */}
                          <div 
                            className="absolute inset-0 pointer-events-none opacity-35 group-hover:opacity-70 transition-opacity"
                            style={{
                              background: `radial-gradient(100% 60% at 50% 0%, ${tc.primary}25, transparent 70%)`
                            }}
                          />

                          {/* Cabecera de la Tarjeta: Posición + Escudo */}
                          <div className="relative z-10 w-full flex items-center justify-between">
                            <span className={`text-[9px] sm:text-[10px] font-black text-white px-1.5 py-0.5 rounded-md uppercase tracking-wider shadow-2xs ${getPositionColor(player.position)}`}>
                              {posLabel}
                            </span>
                            {player.team?.logo_url ? (
                              <img
                                src={player.team.logo_url}
                                alt={player.team?.name || ''}
                                title={player.team?.name || ''}
                                loading="lazy"
                                decoding="async"
                                className="w-4.5 h-4.5 sm:w-5 sm:h-5 object-contain drop-shadow-2xs"
                              />
                            ) : null}
                          </div>

                          {/* Foto del Jugador (Protagonista / Proporcionalmente mucho más grande) */}
                          <div className="relative z-10 my-1 flex justify-center">
                            {lockedPlayer && (
                              <div className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow-md z-20" title="Jugador bloqueado: partido fuera de jornada">
                                <Lock className="w-3 h-3 text-white stroke-[2.5]" />
                              </div>
                            )}
                            {player.photo ? (
                              <img
                                src={player.photo}
                                alt={player.short_name || ''}
                                loading="lazy"
                                decoding="async"
                                className="w-18 h-18 sm:w-20 sm:h-20 md:w-22 md:h-22 rounded-full object-cover border-2 border-white shadow-sm group-hover:scale-105 transition-transform duration-200 bg-slate-50"
                              />
                            ) : (
                              <div className="w-18 h-18 sm:w-20 sm:h-20 md:w-22 md:h-22 rounded-full bg-slate-800 text-white flex items-center justify-center text-lg font-black border-2 border-white shadow-sm">
                                {player.shirt_number || '?'}
                              </div>
                            )}
                          </div>

                          {/* Información del Jugador */}
                          <div className="relative z-10 flex flex-col items-center w-full min-w-0">
                            {/* Nombre */}
                            <p className="text-xs sm:text-sm font-extrabold text-slate-900 truncate w-full text-center group-hover:text-emerald-700 transition-colors leading-tight">
                              {player.short_name || `${player.first_name} ${player.last_name}`}
                            </p>

                            {/* Equipo */}
                            <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate w-full text-center mt-0.5 leading-tight">
                              {player.team?.name || 'LaLiga'}
                            </p>

                            {/* Precio */}
                            <div className="mt-1 inline-flex items-baseline gap-0.5 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-lg text-emerald-700 shadow-2xs">
                              <span className="text-xs sm:text-sm font-black tracking-tight tabular-nums">
                                {player.precio ? `${player.precio}` : '-'}
                              </span>
                              {player.precio && <span className="text-[10px] font-black text-emerald-600">M</span>}
                            </div>

                            {/* Resumen de Estadísticas (Compacto) */}
                            {stats && (
                              <div className="w-full mt-1.5 py-0.5 px-1.5 bg-slate-50 border border-slate-100/90 rounded-lg flex items-center justify-around text-center text-[10px]">
                                <div>
                                  <span className="text-[8px] font-bold text-slate-400 uppercase mr-1">Tot</span>
                                  <span className="font-extrabold text-slate-800 tabular-nums">
                                    {(Math.round(stats.total * 10) / 10).toFixed(1)}
                                  </span>
                                </div>
                                <div className="w-px h-2.5 bg-slate-200" />
                                <div>
                                  <span className="text-[8px] font-bold text-slate-400 uppercase mr-1">Med</span>
                                  <span className="font-extrabold text-slate-800 tabular-nums">
                                    {(Math.round(stats.avg * 10) / 10).toFixed(1)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Botón de acción */}
                          <div className="relative z-10 w-full mt-1.5">
                            {!lockedPlayer ? (
                              <div className="w-full bg-emerald-600 group-hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-bold py-1 px-2 rounded-lg flex items-center justify-center gap-1 shadow-2xs transition-colors">
                                <span>Fichar</span>
                                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                              </div>
                            ) : (
                              <div className="w-full bg-red-50 text-red-600 text-[10px] font-bold py-0.5 rounded-lg text-center border border-red-200/60">
                                Bloqueado
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Botón / Indicador de carga progresiva */}
                  {visibleAvailablePlayers.length < filteredAvailablePlayers.length && (
                    <div className="pt-4 pb-2 text-center">
                      <button
                        type="button"
                        onClick={() => setMarketRenderLimit(prev => Math.min(prev + 40, filteredAvailablePlayers.length))}
                        className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <span>Cargar más jugadores ({filteredAvailablePlayers.length - visibleAvailablePlayers.length} restantes)</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
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
                  disabled={isSavingLineup}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmSwap}
                  disabled={isSavingLineup}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingLineup ? 'Guardando...' : 'Confirmar'}
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
                  disabled={isSavingLineup}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Mantener
                </button>
                <button
                  onClick={() => cancelChange(cancelConfirmUniqueKey)}
                  disabled={isSavingLineup}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingLineup ? 'Guardando...' : 'Cancelar cambio'}
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
