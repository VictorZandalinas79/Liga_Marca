'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Save, X, Check, Search, Lock, UserPlus, Trophy, TrendingUp, Users } from 'lucide-react'

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

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [savedPlayers, setSavedPlayers] = useState<string[]>([])
  // Alineación de la jornada ANTERIOR: sirve de base para resaltar los cambios
  const [basePlayers, setBasePlayers] = useState<string[]>([])
  const [changeHistory, setChangeHistory] = useState<Array<{outId: string, inId: string}>>([])
  const [formation, setFormation] = useState<Formation>(FORMATIONS[1])
  const [userTeamId, setUserTeamId] = useState<string | null>(null)
  const [isRegistered, setIsRegistered] = useState<boolean>(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [currentMatchday, setCurrentMatchday] = useState<number>(1)
  const [playerToSwap, setPlayerToSwap] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState<string>('ALL')
  const [teamFilter, setTeamFilter] = useState<string>('')
  const [priceMinFilter, setPriceMinFilter] = useState<number | ''>('')
  const [priceMaxFilter, setPriceMaxFilter] = useState<number | ''>('')
  const [playerPoints, setPlayerPoints] = useState<Map<string, number>>(new Map())
  const supabase = createClient()
  const { isUnlockWindowOpen, timeUntilLock, timeUntilUnlock, unlockTime, lockTime, currentMatchday: activeMatchday, currentMomento } = useMatchdayLock()
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
    const goalkeepers = allPlayers.filter(p => getPositionCode(p.position) === 'GK')
    const defenders = allPlayers.filter(p => getPositionCode(p.position) === 'DEF')
    const midfielders = allPlayers.filter(p => getPositionCode(p.position) === 'MID')
    const forwards = allPlayers.filter(p => getPositionCode(p.position) === 'FWD')

    const shuffle = (arr: Player[]) => arr.sort(() => Math.random() - 0.5)

    const selected: string[] = [
      ...shuffle(goalkeepers).slice(0, 1).map(p => p.id),
      ...shuffle(defenders).slice(0, formation.defenders).map(p => p.id),
      ...shuffle(midfielders).slice(0, formation.midfielders).map(p => p.id),
      ...shuffle(forwards).slice(0, formation.forwards).map(p => p.id),
    ]

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

    // Esperar a que el hook calcule la jornada activa
    if (activeMatchday !== undefined && activeMatchday !== null) {
      const matchdayToLoad = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1
      fetchInitialData(matchdayToLoad)
    }
  }, [user?.id, activeMatchday])

  // Cargar puntos de los jugadores cuando la jornada está en curso
  useEffect(() => {
    const fetchPlayerPoints = async () => {
      if (!isUnlockWindowOpen || !userTeamId || selectedPlayers.length === 0) {
        setPlayerPoints(new Map())
        return
      }

      const matchdayToLoad = typeof activeMatchday === 'number' && activeMatchday > 0 ? activeMatchday : 1

      // Obtener puntos de player_scores para esta jornada
      const { data: fixtures } = await supabase
        .from('fixtures')
        .select('id')
        .eq('matchday', matchdayToLoad)

      const fixtureIds = fixtures?.map(f => f.id) || []

      if (fixtureIds.length === 0) {
        setPlayerPoints(new Map())
        return
      }

      const { data: scores } = await supabase
        .from('player_scores')
        .select('player_id, total_points')
        .in('player_id', selectedPlayers)
        .in('fixture_id', fixtureIds)

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
  }, [isUnlockWindowOpen, userTeamId, selectedPlayers, activeMatchday])

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

      console.log('[GUARDAR] Insertando jugadores en matchday 0')
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
        setShowSaveConfirm(false)
        setShowSaveSuccess(true)
        // Cerrar el mensaje de éxito después de 3 segundos
        setTimeout(() => setShowSaveSuccess(false), 3000)
      }
    }
  }

  const swapPlayer = (newPlayerId: string) => {
    if (isUnlockWindowOpen) {
      alert('No se pueden realizar cambios durante el tramo de jornada')
      return
    }
    if (playerToSwap) {
      setChangeHistory(prev => [...prev, { outId: playerToSwap, inId: newPlayerId }])
      setSelectedPlayers(prev => prev.map(id => id === playerToSwap ? newPlayerId : id))
    }
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
    setTeamFilter('')
    setPriceMinFilter('')
    setPriceMaxFilter('')
  }

  const openPlayerSelector = (playerId: string) => {
    if (isUnlockWindowOpen) {
      alert('No se pueden realizar cambios durante el tramo de jornada')
      return
    }
    setPlayerToSwap(playerId)
    setSearchFilter('')
    setPositionFilter('ALL')
    setTeamFilter('')
    setPriceMinFilter('')
    setPriceMaxFilter('')
  }

  const closePlayerSelector = () => {
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
    setTeamFilter('')
    setPriceMinFilter('')
    setPriceMaxFilter('')
  }

  const undoLastChange = () => {
    if (changeHistory.length === 0) return

    const lastChange = changeHistory[changeHistory.length - 1]
    // Revertir el último cambio: poner el jugador que salió y quitar el que entró
    setSelectedPlayers(prev => prev.map(id => id === lastChange.inId ? lastChange.outId : id))
    setChangeHistory(prev => prev.slice(0, -1))
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
    setTeamFilter('')
    setPriceMinFilter('')
    setPriceMaxFilter('')
  }

  const selectedPlayersData = players
    .filter(p => selectedPlayers.includes(p.id))
    .sort((a, b) => {
      // Ordenar por posición: GK → DEF → MID → FWD
      const order = { GK: 0, DEF: 1, MID: 2, FWD: 3 }
      const posA = getPositionCode(a.position)
      const posB = getPositionCode(b.position)
      if (order[posA as keyof typeof order] !== order[posB as keyof typeof order]) {
        return order[posA as keyof typeof order] - order[posB as keyof typeof order]
      }
      // Dentro de cada posición, ordenar por orden de selección
      return selectedPlayers.indexOf(a.id) - selectedPlayers.indexOf(b.id)
    })

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
    puntosTotales: selectedPlayersData.reduce((sum, p) => sum + (playerPoints.get(p.id) || 0), 0),
    mediaPuntos: (() => {
      const total = selectedPlayersData.reduce((sum, p) => sum + (playerPoints.get(p.id) || 0), 0)
      const startersCount = selectedPlayersData.length
      return startersCount > 0 ? total / startersCount : 0
    })(),
  }

  const availablePlayers = players.filter(p => !selectedPlayers.includes(p.id))

  // Obtener lista única de equipos para el filtro
  const uniqueTeams = Array.from(
    new Map(players.map(p => p.team?.name ? [p.team.name, p.team_id] : null).filter(Boolean) as [string, string][])
  ).map(([name, id]) => ({ name, id })).sort((a, b) => a.name.localeCompare(b.name))

  // Filtrar jugadores disponibles
  const filteredAvailablePlayers = availablePlayers.filter(p => {
    const matchesSearch = searchFilter === '' ||
      p.short_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.first_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.last_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.team?.name?.toLowerCase().includes(searchFilter.toLowerCase())
    const matchesPosition = positionFilter === 'ALL' || getPositionCode(p.position) === positionFilter
    const matchesTeam = teamFilter === '' || p.team_id === teamFilter
    const matchesPriceMin = priceMinFilter === '' || (p.precio ?? 0) >= priceMinFilter
    const matchesPriceMax = priceMaxFilter === '' || (p.precio ?? 0) <= priceMaxFilter
    return matchesSearch && matchesPosition && matchesTeam && matchesPriceMin && matchesPriceMax
  })

  const changedCount = changeHistory.length

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
    <div className="space-y-2 pb-4">
      {/* Mensaje de bloqueo durante tramo de jornada */}
      {isUnlockWindowOpen && (
        <>
          <Card className="!bg-amber-50 border-amber-200">
            <CardContent className="p-3 flex items-center gap-3">
              <Lock className="w-5 h-5 text-amber-600 animate-pulse shrink-0" />
              <p className="text-sm font-semibold text-amber-900">
                Cambios bloqueados — tramo de jornada activo
                {timeUntilLock && timeUntilLock !== 'Finalizada' && <span className="ml-1 font-normal">(cierra en {timeUntilLock})</span>}
              </p>
            </CardContent>
          </Card>

          {/* Estadísticas del equipo durante la jornada */}
          <Card className="!bg-emerald-50 border-emerald-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-emerald-900">Estadísticas de tu Equipo</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Once inicial - Grid responsive ordenado por posiciones */}
      <Card className="border-2 border-emerald-200">
        <CardContent className="p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-slate-900">{currentMomento ? `${currentMomento} · J${activeMatchday}` : `Jornada ${activeMatchday}`}</span>
            <span className="text-xs text-slate-500">{selectedPlayersData.length}/11</span>
          </div>

          {/* Grid: más columnas para que todos los jugadores quepan en pantalla */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {selectedPlayersData.map((player, idx) => {
              // "Cambio" = lo has cambiado en esta sesión, o difiere de tu
              // alineación de la jornada anterior (se mantiene tras guardar)
              const isChanged =
                changeHistory.some(ch => ch.inId === player.id) ||
                (basePlayers.length > 0 && !basePlayers.includes(player.id))
              return (
                <div
                  key={player.id}
                  onClick={() => openPlayerSelector(player.id)}
                  className={`relative p-3 rounded-xl transition-all border-2 ${
                    isUnlockWindowOpen
                      ? 'bg-slate-800 border-transparent opacity-50 cursor-not-allowed'
                      : isChanged
                        ? 'bg-emerald-900 border-emerald-500 hover:bg-slate-700 cursor-pointer'
                        : 'bg-slate-800 border-transparent hover:bg-slate-700 cursor-pointer'
                  }`}
                >
                  {isChanged && (
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-md">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-sm font-bold text-slate-300">{idx + 1}</span>
                    <div className="relative">
                      {player.photo ? (
                        <img
                          src={player.photo}
                          alt={player.short_name || ''}
                          className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border-2 border-black shadow-md"
                        />
                      ) : (
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-200 flex items-center justify-center text-lg md:text-xl font-bold border-2 border-black shadow-md">
                          {player.shirt_number || '?'}
                        </div>
                      )}
                      {player.team?.logo_url && (
                        <img
                          src={player.team.logo_url}
                          alt={player.team?.name || ''}
                          className="absolute -bottom-1 -right-1 w-7 h-7 md:w-8 md:h-8 rounded-full bg-white border-2 border-black shadow-md"
                        />
                      )}
                    </div>
                    <div className={`text-sm px-3 py-1 w-full text-center font-semibold text-white rounded-md ${getPositionColor(player.position)}`}>
                      {getPositionLabel(player.position)}
                    </div>
                    <p className="text-sm md:text-base font-bold text-white truncate w-full text-center">
                      {player.short_name || player.first_name}
                    </p>
                    <p className="text-xs text-slate-300 truncate w-full text-center">
                      {player.team?.name || '-'}
                    </p>
                    <p className="text-base md:text-lg font-bold text-emerald-400">
                      {player.precio ? `${player.precio}M` : '-'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Botón guardar */}
      <div className={`flex items-center gap-2 justify-end ${isUnlockWindowOpen ? 'opacity-50 pointer-events-none' : ''}`}>
        {changedCount > 0 && (
          <>
            <button
              onClick={undoLastChange}
              className="flex items-center gap-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Deshacer ({changedCount})</span>
            </button>
            <span className="text-sm text-emerald-600 font-medium">
              {changedCount} cambio{changedCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
        <button
          onClick={() => setShowSaveConfirm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
        >
          <Save className="w-4 h-4" />
          Guardar
        </button>
      </div>

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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredAvailablePlayers.map((player) => (
                    <div
                      key={player.id}
                      onClick={() => swapPlayer(player.id)}
                      className="p-3 bg-slate-50 hover:bg-emerald-50 rounded-xl cursor-pointer transition-colors"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative">
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación con resumen de cambios */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-2">¿Guardar equipo?</h3>
            <p className="text-slate-600 mb-4">
              Jornada {activeMatchday || 1}
            </p>

            {changedCount > 0 ? (
              <div className="mb-4 p-3 bg-emerald-50 rounded-lg">
                <p className="text-sm font-semibold text-emerald-800 mb-2">
                  Cambios realizados ({changedCount}):
                </p>
                <ul className="space-y-2">
                  {changeHistory.map((change, idx) => {
                    const playerEntra = selectedPlayersData.find(p => p.id === change.inId)
                    const playerSale = players.find(p => p.id === change.outId)
                    return (
                      <li key={idx} className="text-sm bg-white rounded-lg p-2 border border-emerald-200">
                        <div className="flex items-center gap-2 text-emerald-700">
                          <Check className="w-4 h-4" />
                          <span className="font-semibold">Entra:</span>
                          <span>{playerEntra?.short_name || playerEntra?.first_name} ({playerEntra ? getPositionLabel(playerEntra.position) : ''})</span>
                        </div>
                        <div className="flex items-center gap-2 text-red-600 mt-1">
                          <X className="w-4 h-4" />
                          <span className="font-semibold">Sale:</span>
                          <span>{playerSale?.short_name || playerSale?.first_name} ({playerSale ? getPositionLabel(playerSale.position) : ''})</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-slate-500 mb-4">Sin cambios nuevos</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={undoLastChange}
                disabled={changedCount === 0}
                className="flex-1 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Descartar cambios
              </button>
              <button
                onClick={() => setShowSaveConfirm(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
              >
                Seguir editando
              </button>
              <button
                onClick={saveTeam}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de éxito tras guardar */}
      {showSaveSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              ¡Cambios guardados!
            </h3>
            <p className="text-slate-600">
              {user?.user_metadata?.full_name || 'Usuario'}, tu equipo ha sido actualizado correctamente.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
