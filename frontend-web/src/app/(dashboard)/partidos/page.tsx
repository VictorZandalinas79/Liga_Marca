'use client'

import { useEffect, useState } from 'react'
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
  AlertCircle
} from 'lucide-react'
import { useRouter } from 'next/navigation'

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
  home_team?: { name: string; logo_url?: string }
  away_team?: { name: string; logo_url?: string }
  match_id?: string
  is_complete?: boolean
}

interface SyncStatus {
  syncing: boolean
  syncingAll: boolean
  syncMessage?: string
  syncType?: 'success' | 'error'
}

export default function PartidosPage() {
  const [loading, setLoading] = useState(true)
  const [currentMatchday, setCurrentMatchday] = useState<number | string>(1)
  const [currentMomento, setCurrentMomento] = useState<string>('')
  const [availableMatchdays, setAvailableMatchdays] = useState<number[]>([])
  const [momentosOrden, setMomentosOrden] = useState<string[]>([])
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ syncing: false, syncingAll: false })
  const [allFixturesGlobal, setAllFixturesGlobal] = useState<Fixture[]>([])
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    fetchMatchdaysAndFixtures()
  }, [])

  const fetchMatchdaysAndFixtures = async () => {
    setLoading(true)

    // 1. Obtener todos los fixtures para encontrar las jornadas y momentos disponibles
    const { data: allFixtures } = await supabase
      .from('fixtures')
      .select('matchday, momento, start_time')
      .order('start_time', { ascending: true })

    if (!allFixtures || allFixtures.length === 0) {
      setLoading(false)
      return
    }

    // Guardar todos los fixtures globalmente para acceso posterior
    setAllFixturesGlobal(allFixtures as unknown as Fixture[])

    // 2. Agrupar fixtures por momento (fase)
    const momentosMap = new Map<string, typeof allFixtures>()
    for (const fixture of allFixtures) {
      const momento = fixture.momento || 'Regular'
      if (!momentosMap.has(momento)) {
        momentosMap.set(momento, [])
      }
      momentosMap.get(momento)!.push(fixture)
    }

    // 3. Ordenar los momentos: primero los que tienen matchday > 0, luego los demás por fecha
    const momentosOrdenados = Array.from(momentosMap.keys()).sort((a, b) => {
      const fixturesA = momentosMap.get(a)!
      const fixturesB = momentosMap.get(b)!

      const hasMatchdayA = fixturesA.some(f => f.matchday > 0)
      const hasMatchdayB = fixturesB.some(f => f.matchday > 0)

      // Los que tienen matchday van primero
      if (hasMatchdayA && !hasMatchdayB) return -1
      if (!hasMatchdayA && hasMatchdayB) return 1

      // Si ambos tienen el mismo tipo, ordenar por la fecha más temprana
      const dateA = new Date(Math.min(...fixturesA.map(f => new Date(f.start_time).getTime())))
      const dateB = new Date(Math.min(...fixturesB.map(f => new Date(f.start_time).getTime())))
      return dateA.getTime() - dateB.getTime()
    })

    setMomentosOrden(momentosOrdenados)

    // 4. Encontrar el momento principal (Regular Season tiene la mayoría de jornadas)
    // Prioridad: Regular Season > Regular > primer momento con matchdays
    let selectedMomento: string | null = null

    // Primero intentar con 'Regular Season'
    if (momentosMap.has('Regular Season')) {
      selectedMomento = 'Regular Season'
    }
    // Luego intentar con 'Regular'
    else if (momentosMap.has('Regular')) {
      selectedMomento = 'Regular'
    }
    // Si no, buscar el primer momento con matchdays > 0
    else {
      for (const momento of momentosOrdenados) {
        const fixtures = momentosMap.get(momento)!
        const hasMatchdays = fixtures.some(f => f.matchday > 0)
        if (hasMatchdays) {
          selectedMomento = momento
          break
        }
      }
    }

    // Si no hay momentos con matchdays, usar el primero
    if (!selectedMomento) {
      selectedMomento = momentosOrdenados[0]
    }

    setCurrentMomento(selectedMomento)

    // 5. Obtener TODAS las jornadas únicas (columna matchday) de forma global,
    //    independientemente del momento, para que las flechas naveguen por matchday.
    const matchdays = [...new Set(allFixtures.map(f => f.matchday).filter(m => m > 0))].sort((a, b) => a - b)
    setAvailableMatchdays(matchdays)

    // 6. Encontrar la jornada por defecto.
    //    Prioridad: la jornada EN JUEGO ahora mismo > la última disputada > la primera.
    const now = new Date()
    const nowMs = now.getTime()
    let closestMatchday = matchdays.length > 0 ? matchdays[0] : 1

    // Duración aproximada de un partido (90' + descanso + añadido) para considerar
    // una jornada "en juego" desde su primer partido hasta que acaba el último.
    const MATCH_DURATION_MS = 2.5 * 60 * 60 * 1000

    // Trabajamos con TODOS los fixtures con jornada (independiente del momento),
    // para que el cálculo de "en juego" / "última jugada" sea siempre fiable.
    const datedFixtures = allFixtures.filter(f => f.matchday > 0 && f.start_time)

    // Ventana temporal de cada jornada: [primer partido, último partido]
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

    // ¿Hay una jornada en juego ahora mismo? (now dentro de su ventana + duración)
    // Si varias se solapan (p. ej. un partido aplazado), nos quedamos con la más alta.
    let liveMatchday: number | null = null
    for (const [md, w] of matchdayWindows) {
      if (nowMs >= w.first && nowMs <= w.last + MATCH_DURATION_MS) {
        if (liveMatchday === null || md > liveMatchday) liveMatchday = md
      }
    }

    // Filtrar los partidos que ya han comenzado o terminado (fecha anterior o igual a ahora)
    const pastFixtures = datedFixtures.filter(f => new Date(f.start_time) <= now)

    if (liveMatchday !== null) {
      // Hay partidos en juego: arrancamos en esa jornada
      closestMatchday = liveMatchday
      console.log(`🟢 Jornada en juego: ${closestMatchday}`)
    } else if (pastFixtures.length > 0) {
      // Ordenamos de más reciente a más antiguo
      pastFixtures.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      // Cogemos la jornada del partido más reciente que se ha jugado
      closestMatchday = pastFixtures[0].matchday
      console.log(`✅ Jornada actual/última disputada: ${closestMatchday}`)
    } else if (matchdays.length > 0) {
      // Si no hay partidos pasados (ej. pretemporada), cogemos la primera jornada disponible
      closestMatchday = Math.min(...matchdays)
      console.log(`✅ Inicio de temporada. Jornada: ${closestMatchday}`)
    }

    // Si no hay matchdays (> 0), cargar por momento (ej: Fase Final, Promotion Play-offs)
    if (matchdays.length === 0) {
      // Cargar el primer momento (que no sea el regular)
      const nonRegularMomento = momentosOrdenados.find(m => m !== selectedMomento)
      if (nonRegularMomento) {
        setCurrentMomento(nonRegularMomento)
        setCurrentMatchday(nonRegularMomento)
        await loadFixturesForMatchday(nonRegularMomento)
        return
      }
    }

    setCurrentMatchday(closestMatchday)
    await loadFixturesForMatchday(closestMatchday)
  }

  const loadFixturesForMatchday = async (matchday: number | string) => {
    console.log(`📥 Cargando jornada ${matchday}...`)

    // Determinar si estamos cargando por matchday o por momento
    const isMomentoMode = typeof matchday === 'string'

    // Obtener fixtures de la jornada/momento seleccionado
    const { data: fixturesData, error: fixturesError } = await supabase
      .from('fixtures')
      .select('*')
      .eq(isMomentoMode ? 'momento' : 'matchday', matchday)
      .order('start_time', { ascending: true })

    if (fixturesError) {
      console.error('Error al obtener fixtures:', fixturesError)
    }

    console.log('Fixtures recibidos:', fixturesData?.length || 0)
    console.log('Datos de fixtures:', fixturesData)

    if (!fixturesData) {
      setFixtures([])
      setLoading(false)
      return
    }

    // 4. Obtener información de los equipos con escudos
    const teamIds = [...new Set(fixturesData.flatMap(f => [f.home_team_id, f.away_team_id].filter(Boolean)))]
    const { data: teamsData } = await supabase
      .from('real_teams')
      .select('id, name, logo_url')
      .in('id', teamIds)

    const teamsMap = new Map(teamsData?.map(t => [t.id, t]) || [])

    // 5. Obtener player_scores para verificar qué partidos están completos
    const fixtureIds = fixturesData.map(f => f.id)
    const { data: scoresData, error: scoresError } = await supabase
      .from('player_scores')
      .select('fixture_id')
      .in('fixture_id', fixtureIds)

    if (scoresError) {
      console.error('Error al obtener player_scores:', scoresError)
    }

    console.log('Player scores recibidos:', scoresData?.length || 0)
    console.log('Fixture IDs:', fixtureIds)

    // Contar jugadores por fixture para determinar si está completo
    const fixturesWithPlayers = new Map<string, number>()
    scoresData?.forEach(score => {
      fixturesWithPlayers.set(score.fixture_id, (fixturesWithPlayers.get(score.fixture_id) || 0) + 1)
    })

    console.log('Contador de jugadores por fixture:', Object.fromEntries(fixturesWithPlayers))

    // Un partido se considera completo si tiene más de 18 jugadores con puntos (aprox 2 equipos completos)
    const fixturesWithTeams = fixturesData.map(f => {
      const playerCount = fixturesWithPlayers.get(f.id) || 0
      const isComplete = playerCount > 18
      console.log(`Fixture ${f.id}: ${playerCount} jugadores, status: ${f.status}, is_complete: ${isComplete}`)
      return {
        ...f,
        home_team: f.home_team_id ? {
          name: teamsMap.get(f.home_team_id)?.name || 'Local',
          logo_url: teamsMap.get(f.home_team_id)?.logo_url || undefined
        } : null,
        away_team: f.away_team_id ? {
          name: teamsMap.get(f.away_team_id)?.name || 'Visitante',
          logo_url: teamsMap.get(f.away_team_id)?.logo_url || undefined
        } : null,
        is_complete: isComplete
      }
    })

    setFixtures(fixturesWithTeams)
    setLoading(false)
  }

  const handleMatchdayChange = async (newMatchday: number | string) => {
  if (typeof newMatchday === 'string') {
    setCurrentMomento(newMatchday)
    setCurrentMatchday(newMatchday) // Cambia esto también
    const newMomentoFixtures = allFixturesGlobal?.filter(f => f.momento === newMatchday) || []
    const matchdaysForMomento = [...new Set(newMomentoFixtures.map(f => f.matchday).filter(m => m > 0))].sort((a, b) => a - b)
    setAvailableMatchdays(matchdaysForMomento)
  } else {
    setCurrentMatchday(newMatchday)
  }
  await loadFixturesForMatchday(newMatchday)
}


  const getMatchdayLabel = (matchday: number | string, momento?: string) => {
    // Si es string, es un momento (ej: "Fase Final")
    if (typeof matchday === 'string') {
      return matchday
    }
    // Si matchday es 0 o negativo, usar el nombre del momento
    if (matchday <= 0 && momento) {
      return momento
    }
    return matchday.toString()
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
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTimeUntilMatch = (startTime: string) => {
    const now = new Date()
    const matchDate = new Date(startTime)
    const diffMs = matchDate.getTime() - now.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 0) return null
    if (diffMins < 60) return `${diffMins} min`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60} min`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ${diffHours % 24}h`
  }

  const getStatusBadge = (isComplete?: boolean) => {
    // Verde si el partido está completo, rojo en cualquier otro caso
    if (isComplete) {
      return (
        <Badge className="bg-emerald-600 text-white text-xs flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          Completo
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

    // Filtrar solo los partidos que NO están completos (pendientes de sincronizar)
    const pendingFixtures = fixtures.filter(f => !f.is_complete)

    console.log('🔄 Iniciando sincronización de jornada', currentMatchday)
    console.log(`📊 Partidos totales: ${fixtures.length}, Pendientes: ${pendingFixtures.length}, Completos: ${fixtures.filter(f => f.is_complete).length}`)

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

    console.log('📋 Partidos pendientes:', pendingFixtures.map(f => ({ id: f.id, home: f.home_team?.name, away: f.away_team?.name })))

    // Mostrar mensaje inicial
    setSyncStatus({
      syncingAll: true,
      syncMessage: `⏳ Sincronizando ${pendingFixtures.length} partidos pendientes...`,
      syncing: false
    })

    setSyncStatus({ syncingAll: true, syncing: false })

    try {
      // Enviar solo los partidos pendientes, el backend usará fixture.id como fallback si no hay match_id
      const payload = {
        matchday: typeof currentMatchday === 'number' ? currentMatchday : currentMomento,
        fixtures: pendingFixtures.map(f => ({ id: f.id, match_id: f.match_id || f.id }))
      }
    
    console.log('📤 Enviando payload:', payload)

    const response = await fetch('/api/sync-all-matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    console.log('📥 Response status:', response.status)
    
    const result = await response.json()
    console.log('📥 Response data:', result)

    if (response.ok) {
      setSyncStatus({
        syncingAll: false,
        syncMessage: `✅ ${result.message || 'Sincronización lanzada'}. Los puntos aparecerán en unos minutos; refresca la página.`,
        syncType: 'success',
        syncing: false
      })

      // La sincronización corre en segundo plano (GitHub Actions): recargamos
      // por si ya había datos, pero los nuevos tardan un par de minutos.
      console.log('🔄 Recargando datos de la jornada...')
      await loadFixturesForMatchday(currentMatchday)
    } else {
      setSyncStatus({
        syncingAll: false,
        syncMessage: `❌ Error: ${result.error || 'Error desconocido'}`,
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

  const completeCount = fixtures.filter(f => f.is_complete).length

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
            disabled={syncStatus.syncingAll || fixtures.length === 0}
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
      {Object.entries(fixturesByDate).map(([date, dateFixtures]) => (
        <div key={date}>
          {/* Fecha */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-sm font-semibold text-slate-600 capitalize">
              {new Date(date).toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              })}
            </span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          {/* Cards de partidos */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dateFixtures.map((fixture) => {
              const timeUntil = fixture.start_time ? getTimeUntilMatch(fixture.start_time) : null
              const startsSoon = timeUntil !== null && timeUntil.includes('min') && parseInt(timeUntil) <= 2

              return (
                <Card
                  key={fixture.id}
                  className={`!bg-slate-800 border-slate-700 hover:shadow-lg transition-all cursor-pointer ${
                    startsSoon ? 'ring-2 ring-green-500 animate-pulse' : ''
                  } ${fixture.is_complete ? 'border-emerald-600 ring-1 ring-emerald-600' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="w-full h-full" onClick={() => handleMatchClick(fixture)}>
                      {/* Estado y hora */}
                      <div className="flex items-center justify-between mb-4">
                        {getStatusBadge(fixture.is_complete)}
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
      ))}

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
