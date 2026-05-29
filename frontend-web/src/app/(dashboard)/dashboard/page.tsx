'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useMatchdayLock } from '@/hooks/use-matchday-lock'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Save, X, Check, Search, Lock } from 'lucide-react'

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
  const [changeHistory, setChangeHistory] = useState<Array<{outId: string, inId: string}>>([])
  const [formation, setFormation] = useState<Formation>(FORMATIONS[1])
  const [userTeamId, setUserTeamId] = useState<string | null>(null)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [currentMatchday, setCurrentMatchday] = useState<number>(1)
  const [playerToSwap, setPlayerToSwap] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState<string>('ALL')
  const supabase = createClient()
  const { isUnlockWindowOpen, timeUntilLock, unlockTime, lockTime, currentMatchday: activeMatchday } = useMatchdayLock()

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

  const selectRandomPlayers = async (allPlayers: Player[], formation: Formation, autoSave: boolean = false, matchdayToSave: number = 0) => {
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

    // Si es autoSave, guardar automáticamente en la base de datos
    if (autoSave && userTeamId) {
      console.log('[AUTO-GUARDAR] Guardando equipo inicial en matchday', matchdayToSave)
      const teamPlayers = selected.map((playerId, index) => ({
        team_id: userTeamId,
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

      // Obtener o crear equipo del usuario
      let { data: teamData } = await supabase
        .from('user_teams')
        .select('id')
        .eq('user_id', user.id)
        .single()

      // Si no existe equipo, crearlo
      if (!teamData) {
        console.log('[CARGAR] Equipo no encontrado, creando uno nuevo...')
        const { data: newTeam, error: teamError } = await supabase
          .from('user_teams')
          .insert({ user_id: user.id, name: 'Mi Equipo' })
          .select('id')
          .single()

        if (newTeam) {
          teamData = newTeam
          console.log('[CARGAR] Equipo creado:', newTeam.id)
        } else {
          console.error('[CARGAR] Error creando equipo:', teamError)
          setLoading(false)
          return
        }
      }

      setUserTeamId(teamData.id)
      console.log('[CARGAR] teamId:', teamData.id)

      // Verificar si el usuario YA tiene un equipo inicial guardado (matchday 0)
      const { data: initialTeamPlayers } = await supabase
        .from('team_players')
        .select('player_id')
        .eq('team_id', teamData.id)
        .eq('is_starter', true)
        .eq('matchday', 0)
        .limit(11)

      let savedPlayerIds: string[] = []
      let hasInitialTeam = false

      if (initialTeamPlayers && initialTeamPlayers.length === 11) {
        // El usuario ya tiene un equipo inicial permanente, usar ese
        hasInitialTeam = true
        savedPlayerIds = initialTeamPlayers.map(tp => tp.player_id)
        setSelectedPlayers(savedPlayerIds)
        setSavedPlayers(savedPlayerIds)
        console.log('[CARGAR] Equipo base permanente cargado:', savedPlayerIds.length)
      } else {
        // No tiene equipo inicial, verificar jornada activa
        const { data: teamPlayers } = await supabase
          .from('team_players')
          .select('player_id')
          .eq('team_id', teamData.id)
          .eq('is_starter', true)
          .eq('matchday', matchday)

        if (teamPlayers && teamPlayers.length === 11) {
          savedPlayerIds = teamPlayers.map(tp => tp.player_id)
          setSelectedPlayers(savedPlayerIds)
          setSavedPlayers(savedPlayerIds)
          console.log('[CARGAR] Jugadores cargados de jornada:', savedPlayerIds.length)
        }
      }

      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .order('short_name', { ascending: true })

      if (playersData) {
        const teamIds = [...new Set(playersData.map(p => p.team_id).filter(Boolean))]
        const { data: teamsData } = await supabase
          .from('real_teams')
          .select('id, name, logo_url')
          .in('id', teamIds)
        const teamsMap = new Map(teamsData?.map(t => [t.id, t]) || [])

        const playersWithTeam = playersData.map(p => ({
          ...p,
          team: teamsMap.get(p.team_id) || null
        }))
        setPlayers(playersWithTeam)

        // Si no tiene equipo inicial, generar uno aleatorio AHORA
        if (!hasInitialTeam && savedPlayerIds.length === 0) {
          console.log('[CARGAR] Generando equipo inicial PERMANENTE (matchday 0)...')
          await selectRandomPlayers(playersWithTeam, formation, true, 0)
        }
      }

      setLoading(false)
    }

    // Esperar a que el hook calcule la jornada activa
    if (activeMatchday && activeMatchday > 0) {
      fetchInitialData(activeMatchday)
    }
  }, [user?.id, activeMatchday])

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

    // Eliminar equipo anterior (solo matchday 0, que es el equipo base)
    console.log('[GUARDAR] Eliminando equipo anterior en matchday 0')
    const { error: deleteError } = await supabase
      .from('team_players')
      .delete()
      .eq('team_id', teamIdToUse)
      .eq('matchday', 0)
    if (deleteError) {
      console.error('[GUARDAR] Error eliminando:', deleteError)
    }

    if (selectedPlayers.length > 0) {
      // Guardar SOLO en matchday 0 (equipo base permanente)
      const teamPlayers = selectedPlayers.map((playerId, index) => ({
        team_id: teamIdToUse,
        player_id: playerId,
        is_starter: true,
        is_captain: index === 0,
        order: index,
        matchday: 0, // Equipo base permanente
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
  }

  const openPlayerSelector = (playerId: string) => {
    if (isUnlockWindowOpen) {
      alert('No se pueden realizar cambios durante el tramo de jornada')
      return
    }
    setPlayerToSwap(playerId)
    setSearchFilter('')
    setPositionFilter('ALL')
  }

  const closePlayerSelector = () => {
    setPlayerToSwap(null)
    setSearchFilter('')
    setPositionFilter('ALL')
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

  const availablePlayers = players.filter(p => !selectedPlayers.includes(p.id))

  // Filtrar jugadores disponibles
  const filteredAvailablePlayers = availablePlayers.filter(p => {
    const matchesSearch = searchFilter === '' ||
      p.short_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.first_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.last_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.team?.name?.toLowerCase().includes(searchFilter.toLowerCase())
    const matchesPosition = positionFilter === 'ALL' || getPositionCode(p.position) === positionFilter
    return matchesSearch && matchesPosition
  })

  const changedCount = changeHistory.length

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando...</div>
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Mensaje de bloqueo durante tramo de jornada */}
      {isUnlockWindowOpen && (
        <Card className="!bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock className="w-6 h-6 text-amber-600 animate-pulse" />
              <div>
                <p className="font-semibold text-amber-900">Cambios bloqueados</p>
                <p className="text-sm text-amber-700">
                  No se pueden realizar cambios durante el tramo de jornada
                  {timeUntilLock && <span className="ml-1">(cierra en {timeUntilLock})</span>}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cabecera con título y botón guardar */}
      <div className={`flex items-center justify-between sticky top-0 bg-white z-20 py-2 ${isUnlockWindowOpen ? 'opacity-50 pointer-events-none' : ''}`}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mi Equipo</h1>
          <p className="text-sm text-slate-600">Jornada {activeMatchday}</p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Once inicial - Grid responsive ordenado por posiciones */}
      <Card className="border-2 border-emerald-200">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-900">Once Inicial</h2>
            <span className="text-sm text-slate-500">{selectedPlayersData.length}/11</span>
          </div>

          {/* Grid responsive: 2 columnas en móvil, 3 en tablet, 4-5 en desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {selectedPlayersData.map((player, idx) => {
              const isChanged = changeHistory.some(ch => ch.inId === player.id)
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

      {/* Información de la jornada */}
      <Card className="!bg-slate-800 border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">Jornada {activeMatchday}</h2>
            {isUnlockWindowOpen ? (
              <Badge className="bg-amber-500 text-white">
                <Lock className="w-3 h-3 mr-1" />
                Tramo activo
              </Badge>
            ) : (
              <Badge className="bg-emerald-500 text-white">
                <Check className="w-3 h-3 mr-1" />
                Abierta
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-700 rounded-lg p-3">
              <p className="text-slate-400 text-xs mb-1">Apertura del tramo</p>
              <p className="text-white font-medium">
                {unlockTime ? unlockTime.toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : '-'}
              </p>
            </div>
            <div className="bg-slate-700 rounded-lg p-3">
              <p className="text-slate-400 text-xs mb-1">Cierre del tramo</p>
              <p className="text-white font-medium">
                {lockTime ? lockTime.toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : '-'}
              </p>
            </div>
          </div>
          {isUnlockWindowOpen && (
            <div className="mt-3 p-3 bg-amber-500/20 border border-amber-500/30 rounded-lg">
              <p className="text-amber-400 text-sm">
                <span className="font-semibold">⚠️ Atención:</span> No se pueden realizar cambios hasta el cierre del tramo
                {timeUntilLock && <span className="ml-1">(cierra en {timeUntilLock})</span>}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
                        <Badge className={`${getPositionColor(player.position)} text-sm px-3 py-1 w-full text-center font-semibold`}>
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
              Jornada {currentMatchday}
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
