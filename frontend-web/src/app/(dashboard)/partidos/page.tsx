'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  Clock,
  MapPin,
  Trophy,
  Play,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Users
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'

interface Team {
  id: string
  name: string
  logo_url?: string
}

interface Fixture {
  id: string
  matchday: number
  momento?: string
  home_team_id: string
  away_team_id: string
  start_time: string
  venue?: string
  status?: string
  home_score?: number
  away_score?: number
  home_team?: { name: string; logo_url?: string } | null
  away_team?: { name: string; logo_url?: string } | null
  match_id?: string
  /** Derivado en cliente: ya hay alineaciones (evento Opta typeId 34 procesado) */
  has_lineups?: boolean
  /** Minuto del último evento descargado (lo escribe trigger_descarga_eventos.py) */
  current_minute?: number
  // Lo rellena el trigger de la migración 024. Antes de aplicarla llega undefined
  // y la "última actualización" se calcula solo con player_scores.
  updated_at?: string
}

// Cada cuánto se refrescan marcadores y puntos mientras hay partidos en juego
const LIVE_REFRESH_MS = 45_000
// Desde cuándo se considera que un partido está "en directo" a efectos de
// refresco. Media hora antes del pitido inicial, igual que la ventana del cron
// de sincronización (ci/run_live_sync.py -> UPCOMING_WINDOW = 30): así la
// página ya está refrescando cuando llegan las alineaciones.
const PREMATCH_WINDOW_MS = 30 * 60 * 1000
// Hasta cuándo se sigue refrescando un partido que nunca llegó a marcarse
// 'live' (90' + descanso + descuento + retrasos de kick-off).
const POSTMATCH_WINDOW_MS = 3 * 60 * 60 * 1000
// Estados en los que el partido ya no da más datos: se deja de refrescar.
const TERMINAL_STATUSES = new Set(['finished', 'cancelled', 'postponed'])
// Cada cuánto se recalcula el "ahora" (ventana de juego, minutos transcurridos).
// Sin esto la página no se enteraba de que un partido había empezado hasta que
// algo la re-renderizaba, y el auto-refresco no llegaba a arrancar nunca.
const CLOCK_TICK_MS = 30_000
// El evento de alineación (Opta typeId 34) crea una fila en player_scores por
// cada titular: 11 + 11 = 22. Con más de 10 ya hay al menos un once cargado, y
// el margen absorbe a los titulares que el motor descarta por no estar en la
// BD. (El umbral anterior, 18, se quedaba a solo 4 filas de fallar.)
const LINEUP_PLAYER_THRESHOLD = 10
// Estados con los que la API dice que el partido ha terminado
const FINISHED_STATUSES = new Set(['finished', 'ft', 'completed'])

/**
 * ¿Está rodando el balón? Criterio único para el badge y para el aro rojo de
 * la tarjeta, que antes lo calculaban por separado y podían discrepar.
 * Está en juego si la API lo marca 'live' o si ya hay minuto del último evento.
 */
function isFixtureInPlay(status?: string, currentMinute?: number) {
  const s = (status || '').toLowerCase()
  if (FINISHED_STATUSES.has(s) || TERMINAL_STATUSES.has(s)) return false
  return ['live', '1h', '2h', 'ht', 'in play', 'playing'].includes(s) || (currentMinute ?? 0) > 0
}

interface SyncStatus {
  syncing: boolean
  syncingAll: boolean
  syncMessage?: string
  syncType?: 'success' | 'error'
}

interface ScoresState {
  /** Fixtures (ids unidos por coma) a los que corresponden estos datos */
  key: string
  /** Jugadores puntuados por fixture */
  counts: Record<string, number>
  /** Mayor player_scores.updated_at, en ms */
  updatedAt: number
}

const EMPTY_COUNTS: Record<string, number> = {}

export default function PartidosPage() {
  // Todos los fixtures de la temporada, ya con equipos resueltos. Cambiar de
  // jornada es filtrar en memoria: no vuelve a la red.
  const [allFixturesGlobal, setAllFixturesGlobal] = useState<Fixture[]>([])
  const [fixturesLoaded, setFixturesLoaded] = useState(false)
  // Jornada/momento elegidos por el usuario con las flechas. Mientras sea null
  // manda la jornada calculada por defecto.
  const [userMatchday, setUserMatchday] = useState<number | string | null>(null)
  // Fase a la que el usuario ha navegado explícitamente (acota las flechas)
  const [momentoFilter, setMomentoFilter] = useState<string | null>(null)
  // Puntuaciones de la jornada visible: nº de jugadores por fixture y mayor
  // `updated_at` (ms). `key` es la lista de fixtures a la que corresponden.
  const [scoresState, setScoresState] = useState<ScoresState>({
    key: '',
    counts: EMPTY_COUNTS,
    updatedAt: 0
  })
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ syncing: false, syncingAll: false })
  // Mientras Date.now() < pollUntil forzamos refresco aunque ningún partido esté marcado 'live'
  // (tras lanzar un sync los datos tardan un par de minutos en aparecer).
  const [pollUntil, setPollUntil] = useState(0)
  // Reloj propio: se usa para las cuentas atrás y para decidir si toca auto-refrescar.
  const [now, setNow] = useState(() => Date.now())

  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { currentMatchday: hookMatchday, unlockTime: hookUnlockTime } = useMatchdayLock()

  // Esperar a que el hook resuelva la jornada real antes de fijar la jornada.
  // Mientras tanto, la página muestra "Cargando jornada..." sin flashear la J1.
  const hookReady = hookUnlockTime !== null

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(id)
  }, [])

  // ── Carga masiva (una sola vez) ────────────────────────────────────────
  // Antes eran 4 consultas encadenadas DESPUÉS de esperar al hook: todos los
  // fixtures → los de la jornada → equipos → player_scores. Ahora fixtures y
  // equipos salen a la vez y en paralelo con el hook, así que el tiempo de
  // carga es el del más lento, no la suma de todos.
  useEffect(() => {
    let cancelled = false

    const loadAll = async () => {
      const [{ data: fixturesData, error: fixturesError }, { data: teamsData }] = await Promise.all([
        supabase.from('fixtures').select('*').order('start_time', { ascending: true }),
        supabase.from('real_teams').select('id, name, logo_url')
      ])

      if (cancelled) return

      if (fixturesError) console.error('Error al obtener fixtures:', fixturesError)
      if (!fixturesData || fixturesData.length === 0) {
        setFixturesLoaded(true)
        return
      }

      const teamsMap = new Map<string, Team>((teamsData || []).map(t => [t.id, t as Team]))
      const enriched: Fixture[] = fixturesData.map(f => ({
        ...f,
        home_team: f.home_team_id
          ? {
              name: teamsMap.get(f.home_team_id)?.name || 'Local',
              logo_url: teamsMap.get(f.home_team_id)?.logo_url || undefined
            }
          : null,
        away_team: f.away_team_id
          ? {
              name: teamsMap.get(f.away_team_id)?.name || 'Visitante',
              logo_url: teamsMap.get(f.away_team_id)?.logo_url || undefined
            }
          : null
      }))

      setAllFixturesGlobal(enriched)
      setFixturesLoaded(true)
    }

    loadAll()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const momentosOrden = useMemo(() => computeMomentosOrden(allFixturesGlobal), [allFixturesGlobal])

  const allMatchdays = useMemo(
    () => [...new Set(allFixturesGlobal.map(f => f.matchday).filter(m => m > 0))].sort((a, b) => a - b),
    [allFixturesGlobal]
  )

  // ── Jornada por defecto ────────────────────────────────────────────────
  // Derivada, no un efecto: en cuanto llegan los fixtures y el hook resuelve,
  // ya hay jornada. No toca la red.
  const defaultSelection = useMemo(() => {
    if (allFixturesGlobal.length === 0 || !hookReady) return null

    const momentosSet = new Set(allFixturesGlobal.map(f => f.momento || 'Regular'))
    let momento: string
    if (momentosSet.has('Regular Season')) momento = 'Regular Season'
    else if (momentosSet.has('Regular')) momento = 'Regular'
    else {
      momento =
        momentosOrden.find(m =>
          allFixturesGlobal.some(f => (f.momento || 'Regular') === m && f.matchday > 0)
        ) || momentosOrden[0]
    }

    // Sin jornadas numéricas: mostrar por momento (Fase Final, Play-offs...)
    if (allMatchdays.length === 0) {
      const nonRegular = momentosOrden.find(m => m !== momento) || momentosOrden[0]
      return { matchday: nonRegular as number | string, momento: nonRegular }
    }

    return {
      matchday: pickDefaultMatchday(allFixturesGlobal, allMatchdays, hookMatchday) as number | string,
      momento
    }
  }, [allFixturesGlobal, allMatchdays, momentosOrden, hookReady, hookMatchday])

  const currentMatchday: number | string | null = userMatchday ?? defaultSelection?.matchday ?? null
  const currentMomento = momentoFilter ?? defaultSelection?.momento ?? ''

  // Global por defecto (las flechas navegan por jornada de toda la temporada);
  // se acota solo cuando el usuario entra explícitamente en una fase.
  const availableMatchdays = useMemo(() => {
    if (!momentoFilter) return allMatchdays
    return [
      ...new Set(allFixturesGlobal.filter(f => f.momento === momentoFilter).map(f => f.matchday).filter(m => m > 0))
    ].sort((a, b) => a - b)
  }, [allFixturesGlobal, allMatchdays, momentoFilter])

  const loading = !fixturesLoaded || (allFixturesGlobal.length > 0 && currentMatchday === null)

  // Fixtures de la jornada/momento visible: filtro en memoria, sin red
  const visibleFixtures = useMemo<Fixture[]>(() => {
    if (currentMatchday === null) return []
    const isMomentoMode = typeof currentMatchday === 'string'
    return allFixturesGlobal.filter(f =>
      isMomentoMode ? f.momento === currentMatchday : f.matchday === currentMatchday
    )
  }, [allFixturesGlobal, currentMatchday])

  const fixtureIdsKey = useMemo(() => visibleFixtures.map(f => f.id).join(','), [visibleFixtures])

  // Las puntuaciones se guardan junto a la jornada de la que son. Así
  // `scoresLoaded` es derivado: no hace falta resetearlo desde un efecto, y al
  // refrescar en vivo (misma jornada) no parpadean los badges.
  const scoresLoaded = scoresState.key === fixtureIdsKey
  const scoreCounts = scoresLoaded ? scoresState.counts : EMPTY_COUNTS

  // Fixtures con el marcador de "hay alineaciones" ya resuelto
  const fixtures = useMemo<Fixture[]>(
    () =>
      visibleFixtures.map(f => ({
        ...f,
        has_lineups: scoresLoaded && (scoreCounts[f.id] || 0) > LINEUP_PLAYER_THRESHOLD
      })),
    [visibleFixtures, scoreCounts, scoresLoaded]
  )

  // La ref evita que `refreshCurrent` se recree (y reinicie el intervalo) cada
  // vez que cambian los datos. Se sincroniza en un efecto, no en el render.
  const fixtureIdsRef = useRef<string[]>([])
  useEffect(() => {
    fixtureIdsRef.current = fixtureIdsKey ? fixtureIdsKey.split(',') : []
  }, [fixtureIdsKey])

  // ── Última actualización real ──────────────────────────────────────────
  // No es la hora del fetch del navegador: es el mayor `updated_at` que hay en
  // Supabase para esta jornada, que ponen los triggers de la BD al escribir.
  const lastDataUpdate = useMemo(() => {
    let best = scoresLoaded ? scoresState.updatedAt : 0
    for (const f of visibleFixtures) {
      if (!f.updated_at) continue
      const t = new Date(f.updated_at).getTime()
      if (t > best) best = t
    }
    return best > 0 ? new Date(best) : null
  }, [visibleFixtures, scoresState, scoresLoaded])

  // ── Puntuaciones ───────────────────────────────────────────────────────
  // Una sola consulta por jornada (antes eran 3 encadenadas).
  // Sin fixtures no hay consulta: el estado inicial (key '') ya vale.
  useEffect(() => {
    if (!fixtureIdsKey) return
    let cancelled = false

    const run = async () => {
      const next = await fetchScores(supabase, fixtureIdsKey.split(','))
      if (!cancelled && next) setScoresState(next)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [fixtureIdsKey, supabase])

  // ── Refresco silencioso ────────────────────────────────────────────────
  // Solo los fixtures de la jornada visible (no toda la temporada ni los
  // equipos, que no cambian) más sus puntuaciones.
  const refreshCurrent = useCallback(async () => {
    const ids = fixtureIdsRef.current
    if (ids.length === 0) return

    const [{ data: fresh }, nextScores] = await Promise.all([
      supabase.from('fixtures').select('*').in('id', ids),
      fetchScores(supabase, ids)
    ])

    if (nextScores) setScoresState(nextScores)

    if (!fresh) return
    const byId = new Map(fresh.map(f => [f.id, f]))
    // Se fusionan sobre la lista global conservando home_team/away_team, que
    // no se vuelven a pedir porque los equipos no cambian.
    setAllFixturesGlobal(prev =>
      prev.map(f => {
        const updated = byId.get(f.id)
        return updated ? { ...f, ...updated } : f
      })
    )
  }, [supabase])

  // ── ¿Toca auto-refrescar? ──────────────────────────────────────────────
  // Depende de `now`, que avanza solo, así que el directo se enciende y se
  // apaga sin necesidad de recargar la página.
  const hasLiveFixtures = fixtures.some(f => f.status === 'live')
  const hasFixturesInPlayWindow = fixtures.some(f => {
    if (!f.start_time) return false
    // Se mira el estado real del partido, NO `has_lineups`: ese flag solo dice
    // que ya hay jugadores puntuados, y eso se cumple en cuanto llegan las
    // alineaciones (antes incluso de empezar). Usarlo aquí apagaba
    // el auto-refresco justo cuando empezaban a entrar los datos del directo.
    if (TERMINAL_STATUSES.has((f.status || '').toLowerCase())) return false
    const elapsedMs = now - new Date(f.start_time).getTime()
    // Desde media hora antes del pitido inicial hasta 3 h después
    return elapsedMs > -PREMATCH_WINDOW_MS && elapsedMs < POSTMATCH_WINDOW_MS
  })
  const shouldAutoRefresh = hasLiveFixtures || hasFixturesInPlayWindow || now < pollUntil

  // ── Auto-procesado ─────────────────────────────────────────────────────
  // Antes, esta página solo releía Supabase (refreshCurrent): si nadie abría
  // el partido concreto para disparar su auto-sync, los puntos no se
  // procesaban nunca aunque el partido llevara horas en juego. Ahora, con la
  // lista abierta, se relanza el procesado (sync-all-matches) cada
  // AUTO_SYNC_LIST_COOLDOWN_MS mientras haya partidos en ventana de juego.
  const AUTO_SYNC_LIST_KEY = 'partidos-lista-autosync'
  const AUTO_SYNC_LIST_COOLDOWN_MS = 5 * 60 * 1000

  const canAutoSyncList = () => {
    try {
      const last = Number(sessionStorage.getItem(AUTO_SYNC_LIST_KEY) || 0)
      return Date.now() - last > AUTO_SYNC_LIST_COOLDOWN_MS
    } catch {
      return true
    }
  }
  const markAutoSyncList = () => {
    try {
      sessionStorage.setItem(AUTO_SYNC_LIST_KEY, String(Date.now()))
    } catch {
      /* sin persistencia, no pasa nada: peor caso, se sincroniza de más */
    }
  }

  const autoSyncPending = useCallback(async () => {
    const pending = fixtures.filter(f => {
      if (!f.start_time) return false
      if (TERMINAL_STATUSES.has((f.status || '').toLowerCase())) return false
      const elapsedMs = Date.now() - new Date(f.start_time).getTime()
      return elapsedMs > -PREMATCH_WINDOW_MS && elapsedMs < POSTMATCH_WINDOW_MS
    })
    if (pending.length === 0) return

    try {
      await fetch('/api/sync-all-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchday: typeof currentMatchday === 'number' ? currentMatchday : currentMomento,
          fixtures: pending.map(f => ({ id: f.id, match_id: f.match_id || f.id }))
        })
      })
    } catch (error) {
      console.error('Auto-sync (lista de partidos) falló:', error)
    }
  }, [fixtures, currentMatchday, currentMomento])

  useEffect(() => {
    if (!shouldAutoRefresh) return

    const tick = () => {
      if (document.hidden) return // sin refrescos en pestañas de fondo
      refreshCurrent()
      if (hasFixturesInPlayWindow && canAutoSyncList()) {
        markAutoSyncList()
        autoSyncPending()
      }
    }

    tick() // al entrar a la página, no esperar LIVE_REFRESH_MS para procesar
    const intervalId = setInterval(tick, LIVE_REFRESH_MS)

    const onVisible = () => {
      if (!document.hidden) refreshCurrent()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [shouldAutoRefresh, refreshCurrent, hasFixturesInPlayWindow, autoSyncPending])

  // Cambiar de jornada no dispara ninguna consulta de fixtures: ya están todos
  // en memoria. Solo se recargan las puntuaciones de la nueva jornada.
  const handleMatchdayChange = (newMatchday: number | string) => {
    if (typeof newMatchday === 'string') setMomentoFilter(newMatchday)
    setUserMatchday(newMatchday)
  }

  const getNextMomento = () => {
    const currentIndex = momentosOrden.indexOf(currentMomento)
    if (currentIndex < momentosOrden.length - 1) {
      return momentosOrden[currentIndex + 1]
    }
    return null
  }

  const getPrevMomento = () => {
    const currentIndex = momentosOrden.indexOf(currentMomento)
    if (currentIndex > 0) {
      return momentosOrden[currentIndex - 1]
    }
    return null
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // "hace 3 min" / "hace 2 h" / "ayer 21:40"
  const formatLastUpdate = (date: Date) => {
    const diffMin = Math.floor((now - date.getTime()) / 60000)
    const hora = date.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
    if (diffMin < 1) return `${hora} · hace un momento`
    if (diffMin < 60) return `${hora} · hace ${diffMin} min`
    const sameDay = new Date().toDateString() === date.toDateString()
    if (sameDay) return `${hora} · hace ${Math.floor(diffMin / 60)} h`
    return `${date.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' })} ${hora}`
  }

  const getTimeUntilMatch = (startTime: string) => {
    const diffMs = new Date(startTime).getTime() - now
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 0) return null
    if (diffMins < 60) return `${diffMins} min`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60} min`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ${diffHours % 24}h`
  }

  const getStatusBadge = (
    hasLineups?: boolean,
    status?: string,
    currentMinute?: number,
    startTime?: string
  ) => {
    const s = (status || '').toLowerCase()

    // 1) En juego: badge rojo + minuto del último evento descargado
    if (isFixtureInPlay(status, currentMinute)) {
      // El minuto se muestra aunque sea 0 (pitido inicial recién dado)
      const showMinute = currentMinute !== undefined && currentMinute !== null && currentMinute >= 0
      return (
        <div className="flex items-center gap-2">
          <Badge className="bg-red-600 text-white text-xs flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white inline-block" />
            En Juego
          </Badge>
          {showMinute && (
            <span className="text-yellow-400 font-black text-xs sm:text-sm tracking-wide bg-yellow-950/40 border border-yellow-500/20 px-2 py-0.5 rounded shadow-sm">
              Min {currentMinute}&apos;
            </span>
          )}
        </div>
      )
    }

    // 2) Terminado: no depende de las puntuaciones, solo del estado de la API
    if (FINISHED_STATUSES.has(s)) {
      return (
        <Badge className="bg-emerald-600 text-white text-xs flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          Completo
        </Badge>
      )
    }

    // 3) Suspendido / cancelado: antes caían en el "Incompleto" rojo
    if (s === 'postponed' || s === 'cancelled') {
      return (
        <Badge className="bg-amber-600 text-white text-xs flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {s === 'postponed' ? 'Aplazado' : 'Cancelado'}
        </Badge>
      )
    }

    // A partir de aquí hace falta saber si hay alineaciones, y eso sale de
    // player_scores: sin ellas cargadas, esqueleto en vez de un badge falso.
    if (!scoresLoaded) {
      return <span className="h-5 w-20 rounded bg-slate-700/60 animate-pulse inline-block" />
    }

    // 4) Alineaciones publicadas (evento typeId 34 ya procesado) pero sin rodar
    //    el balón: pre-partido, o post-inicio con la API retrasada.
    if (hasLineups) {
      return (
        <Badge className="bg-blue-600 text-white text-xs flex items-center gap-1">
          <Users className="w-3 h-3" />
          Alineaciones disponibles
        </Badge>
      )
    }

    if (startTime && new Date(startTime).getTime() > now) {
      return (
        <Badge className="bg-slate-600 text-white text-xs flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Por jugar
        </Badge>
      )
    }

    return (
      <Badge className="bg-red-500 text-white text-xs flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        Incompleto
      </Badge>
    )
  }

  const handleMatchClick = (fixture: Fixture) => {
    router.push(`/partidos/${fixture.id}`)
  }

  const handleSyncAll = async () => {
    if (fixtures.length === 0) return

    // Pendiente = todavía puede dar datos nuevos. Un partido en juego ya tiene
    // jugadores puntuados (`has_lineups`), así que con el filtro anterior el
    // botón contestaba "todos sincronizados" en pleno directo, justo cuando
    // más falta hace pulsarlo.
    const pendingFixtures = fixtures.filter(
      f => !TERMINAL_STATUSES.has((f.status || '').toLowerCase()) || !f.has_lineups
    )

    if (pendingFixtures.length === 0) {
      setSyncStatus({
        syncing: false,
        syncingAll: false,
        syncMessage: `✅ Todos los partidos ya están sincronizados (${fixtures.length} partidos)`,
        syncType: 'success'
      })
      setTimeout(() => setSyncStatus({ syncing: false, syncingAll: false }), 5000)
      return
    }

    setSyncStatus({
      syncingAll: true,
      syncMessage: `⏳ Sincronizando ${pendingFixtures.length} partidos pendientes...`,
      syncing: false
    })

    try {
      // Enviar solo los partidos pendientes, el backend usará fixture.id como fallback si no hay match_id
      const payload = {
        matchday: typeof currentMatchday === 'number' ? currentMatchday : currentMomento,
        fixtures: pendingFixtures.map(f => ({ id: f.id, match_id: f.match_id || f.id }))
      }

      const response = await fetch('/api/sync-all-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (response.ok) {
        setSyncStatus({
          syncingAll: false,
          syncMessage: `✅ ${result.message || 'Sincronización lanzada'}. Los puntos se actualizarán solos en cuanto lleguen.`,
          syncType: 'success',
          syncing: false
        })

        // La sincronización corre en segundo plano (GitHub Actions): recargamos
        // por si ya había datos, y mantenemos el auto-refresco 10 min para
        // recoger los que lleguen después.
        setPollUntil(Date.now() + 10 * 60 * 1000)
        setNow(Date.now())
        await refreshCurrent()
      } else {
        setSyncStatus({
          syncingAll: false,
          // `details` trae la causa real (p.ej. token de GitHub caducado)
          syncMessage: `❌ Error: ${result.details || result.error || 'Error desconocido'}`,
          syncType: 'error',
          syncing: false
        })
      }
    } catch (error) {
      console.error('💥 Error en sincronización:', error)
      setSyncStatus({
        syncingAll: false,
        syncMessage: `❌ Error de conexión: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        syncType: 'error',
        syncing: false
      })
    }

    // Limpiar mensaje después de 8 segundos
    setTimeout(() => {
      setSyncStatus(prev => ({ ...prev, syncMessage: undefined }))
    }, 8000)
  }

  // Agrupar partidos por fecha
  const fixturesByDate = fixtures.reduce((acc, fixture) => {
    const date = fixture.start_time.split('T')[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(fixture)
    return acc
  }, {} as Record<string, Fixture[]>)

  // "Completos" = partidos terminados, no partidos con alineaciones cargadas:
  // con el flag anterior la cabecera cantaba "3/10 completos" media hora antes
  // del pitido inicial, solo porque ya habían llegado los onces.
  const completeCount = fixtures.filter(f =>
    FINISHED_STATUSES.has((f.status || '').toLowerCase())
  ).length

  // Jornada actual como número (NaN si estamos en modo "momento", p. ej. "Fase Final")
  const currentMatchdayNum = Number(currentMatchday)
  // Jornadas disponibles ordenadas de menor a mayor
  const sortedMatchdays = [...availableMatchdays].sort((a, b) => a - b)
  // Momento (fase) al que pertenece la jornada actual, derivado de los fixtures
  const currentMatchdayMomento =
    typeof currentMatchday === 'string'
      ? currentMatchday
      : allFixturesGlobal.find(f => f.matchday === currentMatchdayNum)?.momento || currentMomento

  // Navegar una jornada hacia atrás (-1, menor) o hacia delante (+1, mayor).
  // Busca por VALOR la jornada inmediatamente menor/mayor, así no depende de
  // coincidencias exactas de índice ni de tipos. Al llegar al borde de la fase,
  // salta al momento anterior/siguiente.
  const goToAdjacentMatchday = (direction: -1 | 1) => {
    if (!Number.isNaN(currentMatchdayNum)) {
      const target =
        direction === 1
          ? sortedMatchdays.find(m => m > currentMatchdayNum) // inmediata mayor
          : [...sortedMatchdays].reverse().find(m => m < currentMatchdayNum) // inmediata menor
      if (target !== undefined) {
        handleMatchdayChange(target)
        return
      }
    }
    const adjacentMomento = direction === -1 ? getPrevMomento() : getNextMomento()
    if (adjacentMomento) {
      handleMatchdayChange(adjacentMomento)
    }
  }

  // ¿Hay algo a lo que navegar en cada dirección? (para deshabilitar las flechas)
  const canGoPrev =
    (!Number.isNaN(currentMatchdayNum) && sortedMatchdays.some(m => m < currentMatchdayNum)) ||
    getPrevMomento() !== null
  const canGoNext =
    (!Number.isNaN(currentMatchdayNum) && sortedMatchdays.some(m => m > currentMatchdayNum)) ||
    getNextMomento() !== null

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando jornada...</div>
  }

  return (
    <div className="space-y-6">
      {/* Cabecera con selector de jornadas */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Partidos</h1>
            <p className="text-slate-600 mt-1 text-sm sm:text-base">
              {availableMatchdays.length === 0
                ? `${currentMomento}`
                : typeof currentMatchday === 'string'
                  ? `${currentMatchday}`
                  : currentMatchday === 0
                    ? `${currentMomento}`
                    : `Jornada ${currentMatchday} de ${Math.max(...availableMatchdays)}`
              }
              {completeCount > 0 && (
                <span className="ml-2 text-emerald-600 text-sm">
                  ({completeCount}/{fixtures.length} completos)
                </span>
              )}
            </p>
            {/* Hora real del último dato escrito en Supabase */}
            {lastDataUpdate && (
              <p className={`mt-1 flex items-center gap-1.5 text-xs ${shouldAutoRefresh ? 'text-red-600' : 'text-slate-500'}`}>
                {shouldAutoRefresh ? (
                  <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-red-600 inline-block animate-pulse" />
                ) : (
                  <RefreshCw className="w-3 h-3 shrink-0" />
                )}
                <span>
                  {shouldAutoRefresh && 'En directo · '}
                  Última actualización: {formatLastUpdate(lastDataUpdate)}
                </span>
              </p>
            )}
          </div>

          {/* Selector de jornadas */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToAdjacentMatchday(-1)}
                disabled={!canGoPrev}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <span className="text-sm font-medium text-slate-600 min-w-[120px] text-center">
                {availableMatchdays.length === 0
                  ? currentMomento
                  : typeof currentMatchday === 'string'
                    ? currentMatchday
                    : currentMatchday === 0
                      ? currentMomento
                      : `JD ${currentMatchday}/${Math.max(...availableMatchdays)}`
                }
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => goToAdjacentMatchday(1)}
                disabled={!canGoNext}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Nombre del momento (fase) de la jornada actual */}
            {currentMatchdayMomento && (
              <span className="text-xs text-slate-400 text-center">
                {currentMatchdayMomento}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-emerald-600" />
            <span className="text-sm font-medium text-slate-600">
              {fixtures.length} partidos
            </span>
          </div>

          {/* Botón sincronizar todos */}
          <Button
            onClick={handleSyncAll}
            disabled={syncStatus.syncingAll || fixtures.length === 0 || !scoresLoaded}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          >
            <RefreshCw className={`w-4 h-4 sm:mr-2 ${syncStatus.syncingAll ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{syncStatus.syncingAll ? 'Sincronizando...' : 'Sincronizar Jornada'}</span>
            <span className="sm:hidden">{syncStatus.syncingAll ? 'Sincronizando' : 'Sincronizar'}</span>
          </Button>
        </div>
      </div>

      {/* Mensaje de estado */}
      {syncStatus.syncMessage && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          syncStatus.syncType === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {syncStatus.syncType === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="text-sm font-medium">{syncStatus.syncMessage}</span>
        </div>
      )}

      {/* Partidos agrupados por fecha */}
      {Object.entries(fixturesByDate).map(([date, dateFixtures]) => {
        const isToday = new Date(date + 'T00:00:00').toDateString() === new Date(now).toDateString()
        return (
        <div
          key={date}
          className={isToday ? 'rounded-2xl border-2 border-emerald-500 bg-emerald-50/60 shadow-lg shadow-emerald-500/20 p-4' : ''}
        >
          {/* Fecha */}
          <div className="flex items-center gap-2 mb-4">
            <div className={`flex-1 h-px ${isToday ? 'bg-emerald-400' : 'bg-slate-200'}`}></div>
            <span className={`text-sm font-semibold capitalize ${isToday ? 'text-emerald-700' : 'text-slate-600'}`}>
              {new Date(date).toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              })}
              {isToday && (
                <span className="ml-2 text-emerald-600 font-bold animate-pulse">(Hoy)</span>
              )}
            </span>
            <div className={`flex-1 h-px ${isToday ? 'bg-emerald-400' : 'bg-slate-200'}`}></div>
          </div>

          {/* Cards de partidos */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dateFixtures.map((fixture) => {
              const timeUntil = fixture.start_time ? getTimeUntilMatch(fixture.start_time) : null
              const startsSoon = timeUntil !== null && !timeUntil.includes('h') && timeUntil.includes('min') && parseInt(timeUntil) <= 30
              const isLive = isFixtureInPlay(fixture.status, fixture.current_minute)

              return (
                <Card
                  key={fixture.id}
                  className={`!bg-slate-800 border-slate-700 hover:shadow-lg transition-all cursor-pointer ${
                    isLive ? 'ring-2 ring-red-500 animate-pulse' :
                    startsSoon ? 'ring-2 ring-blue-500 animate-pulse' : ''
                  } ${
                    FINISHED_STATUSES.has((fixture.status || '').toLowerCase())
                      ? 'border-emerald-600 ring-1 ring-emerald-600'
                      : ''
                  }`}
                >
                  <CardContent className="p-4 relative overflow-hidden">
                    {/* Fondo semitransparente del icono de la liga */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 opacity-10 pointer-events-none z-0">
                      <img
                        src="/icono_lliga.png"
                        alt="Fondo Liga"
                        className="w-full h-full object-contain grayscale"
                      />
                    </div>
                    <div className="w-full h-full relative z-10" onClick={() => handleMatchClick(fixture)}>
                      {/* Estado y hora */}
                      <div className="flex items-center justify-between mb-4">
                        {getStatusBadge(fixture.has_lineups, fixture.status, fixture.current_minute, fixture.start_time)}
                        <div className="flex items-center gap-1 text-sm text-slate-300">
                          <Clock className="w-4 h-4" />
                          {formatTime(fixture.start_time)}
                        </div>
                      </div>

                      {/* Equipos */}
                      <div className="space-y-3">
                        {/* Local */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {fixture.home_team?.logo_url ? (
                              <img
                                src={fixture.home_team.logo_url}
                                alt={fixture.home_team.name}
                                className="w-8 h-8 object-contain"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                <Trophy className="w-4 h-4 text-slate-400" />
                              </div>
                            )}
                            <span className="font-semibold text-white">
                              {fixture.home_team?.name || 'Local'}
                            </span>
                          </div>
                          <span className="text-2xl font-bold text-white">
                            {fixture.home_score ?? 0}
                          </span>
                        </div>

                        {/* Visitante */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {fixture.away_team?.logo_url ? (
                              <img
                                src={fixture.away_team.logo_url}
                                alt={fixture.away_team.name}
                                className="w-8 h-8 object-contain"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                <Trophy className="w-4 h-4 text-slate-400" />
                              </div>
                            )}
                            <span className="font-semibold text-white">
                              {fixture.away_team?.name || 'Visitante'}
                            </span>
                          </div>
                          <span className="text-2xl font-bold text-white">
                            {fixture.away_score ?? 0}
                          </span>
                        </div>
                      </div>

                      {/* Estadio y tiempo restante */}
                      <div className="mt-4 pt-3 border-t border-slate-700">
                        <div className="flex items-center justify-between">
                          {fixture.venue && (
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <MapPin className="w-3 h-3" />
                              {fixture.venue}
                            </div>
                          )}
                          {timeUntil && !fixture.status && (
                            <div className="flex items-center gap-1 text-xs text-green-400 ml-auto">
                              <Play className="w-3 h-3" />
                              En {timeUntil}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
        )
      })}

      {/* Sin partidos */}
      {fixtures.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              No hay partidos programados
            </h3>
            <p className="text-slate-500">
              La jornada {currentMatchday} aún no tiene fixtures asignados
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Jugadores puntuados por fixture y mayor `updated_at` de esas puntuaciones.
 * Devuelve null si falla, para no borrar lo que ya se estaba mostrando.
 */
async function fetchScores(
  supabase: ReturnType<typeof createClient>,
  ids: string[]
): Promise<ScoresState | null> {
  const { data, error } = await supabase
    .from('player_scores')
    .select('fixture_id, updated_at')
    .in('fixture_id', ids)

  if (error) {
    console.error('Error al obtener player_scores:', error)
    return null
  }

  const counts: Record<string, number> = {}
  let updatedAt = 0
  for (const row of data || []) {
    counts[row.fixture_id] = (counts[row.fixture_id] || 0) + 1
    const t = row.updated_at ? new Date(row.updated_at).getTime() : 0
    if (t > updatedAt) updatedAt = t
  }

  return { key: ids.join(','), counts, updatedAt }
}

/** Momentos (fases) ordenados: primero los que tienen jornadas, luego por fecha. */
function computeMomentosOrden(fixtures: Fixture[]): string[] {
  const momentosMap = new Map<string, Fixture[]>()
  for (const fixture of fixtures) {
    const momento = fixture.momento || 'Regular'
    if (!momentosMap.has(momento)) momentosMap.set(momento, [])
    momentosMap.get(momento)!.push(fixture)
  }

  return Array.from(momentosMap.keys()).sort((a, b) => {
    const fixturesA = momentosMap.get(a)!
    const fixturesB = momentosMap.get(b)!

    const hasMatchdayA = fixturesA.some(f => f.matchday > 0)
    const hasMatchdayB = fixturesB.some(f => f.matchday > 0)

    // Los que tienen matchday van primero
    if (hasMatchdayA && !hasMatchdayB) return -1
    if (!hasMatchdayA && hasMatchdayB) return 1

    // Si ambos tienen el mismo tipo, ordenar por la fecha más temprana
    const dateA = Math.min(...fixturesA.map(f => new Date(f.start_time).getTime()))
    const dateB = Math.min(...fixturesB.map(f => new Date(f.start_time).getTime()))
    return dateA - dateB
  })
}

/**
 * Jornada a mostrar al entrar. Prioridad: la que resuelve useMatchdayLock (ya
 * conoce la activa/próxima según la config de la liga). Si no está disponible,
 * se calcula aquí: en juego → próxima (<2 h) → última disputada → primera.
 */
function pickDefaultMatchday(
  allFixtures: Fixture[],
  matchdays: number[],
  hookMatchday: number
): number {
  const nowMs = Date.now()
  const datedFixtures = allFixtures.filter(f => f.matchday > 0 && f.start_time)

  // Prioridad máxima: si hoy hay algún partido programado, abrir esa jornada
  // (por encima incluso de la jornada "activa" según useMatchdayLock: si hoy
  // juega la J2 aunque la J1 siga "en curso" según el bloqueo, se abre la J2).
  const todayStr = new Date(nowMs).toDateString()
  const todayFixture = datedFixtures.find(f => new Date(f.start_time).toDateString() === todayStr)
  if (todayFixture) return todayFixture.matchday

  if (hookMatchday && hookMatchday > 0 && matchdays.includes(hookMatchday)) {
    return hookMatchday
  }

  const MATCH_DURATION_MS = 2.5 * 60 * 60 * 1000
  const PRE_MATCH_LEAD_MS = 2 * 60 * 60 * 1000

  const matchdayWindows = new Map<number, { first: number; last: number }>()
  for (const f of datedFixtures) {
    const t = new Date(f.start_time).getTime()
    const w = matchdayWindows.get(f.matchday)
    if (!w) {
      matchdayWindows.set(f.matchday, { first: t, last: t })
    } else {
      w.first = Math.min(w.first, t)
      w.last = Math.max(w.last, t)
    }
  }

  let liveMatchday: number | null = null
  for (const [md, w] of matchdayWindows) {
    if (nowMs >= w.first && nowMs <= w.last + MATCH_DURATION_MS) {
      if (liveMatchday === null || md > liveMatchday) liveMatchday = md
    }
  }
  if (liveMatchday !== null) return liveMatchday

  let upcomingMatchday: number | null = null
  for (const [md, w] of matchdayWindows) {
    const timeUntilStart = w.first - nowMs
    if (timeUntilStart > 0 && timeUntilStart <= PRE_MATCH_LEAD_MS) {
      if (upcomingMatchday === null || md < upcomingMatchday) upcomingMatchday = md
    }
  }
  if (upcomingMatchday !== null) return upcomingMatchday

  const pastFixtures = datedFixtures.filter(f => new Date(f.start_time).getTime() <= nowMs)
  if (pastFixtures.length > 0) {
    pastFixtures.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    return pastFixtures[0].matchday
  }

  return matchdays.length > 0 ? Math.min(...matchdays) : 1
}
