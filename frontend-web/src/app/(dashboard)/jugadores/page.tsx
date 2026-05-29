'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, TrendingUp, Goal, Ticket, X } from 'lucide-react'

interface Player {
  id: string
  first_name: string
  last_name: string
  short_name: string
  position: string
  status?: string
  team_id: string
  photo?: string
  shirt_number?: number
  date_of_birth?: string
  nationality?: string
  height?: number
  weight?: number
  foot?: string
  precio?: number
  created_at?: string
  updated_at?: string
  stats?: PlayerStats
  team?: Team
}

interface PlayerStats {
  total_points: number
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  minutes_played: number
  matches_played: number
  avg_points: number
}

interface Team {
  id: string
  name: string
  logo_url?: string
}

export default function JugadoresPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [filter, setFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('ALL')
  const [teamFilter, setTeamFilter] = useState<string>('ALL')
  const [teams, setTeams] = useState<Array<{ id: string; name: string; logo_url?: string }>>([])
  const [sortBy, setSortBy] = useState<'price' | 'points' | 'goals' | 'name'>('price')
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchPlayers = async () => {
      // 1. Obtener todos los jugadores
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .order('short_name', { ascending: true })

      if (playersError) {
        console.error("Error al cargar jugadores:", JSON.stringify(playersError, null, 2))
        setLoading(false)
        return
      }

      if (!playersData) {
        console.error("No se recibieron datos de jugadores")
        setLoading(false)
        return
      }

      // 2. Obtener los equipos únicos con sus nombres y escudos
      const teamIds = [...new Set(playersData.map(p => p.team_id).filter(Boolean))]
      const { data: teamsData } = await supabase
        .from('real_teams')
        .select('id, name, logo_url')
        .in('id', teamIds)

      const teamsMap = new Map(teamsData?.map(t => [t.id, t]) || [])

      // 3. Crear la lista de equipos para el filtro
      const teamsList = teamIds.map(id => ({
        id,
        name: teamsMap.get(id)?.name || 'Sin nombre',
        logo_url: teamsMap.get(id)?.logo_url || undefined
      })).sort((a, b) => a.name.localeCompare(b.name))

      setTeams(teamsList)

      console.log("Jugadores cargados:", playersData)
      console.log("Primer jugador (para debug):", JSON.stringify(playersData[0], null, 2))

      // 2. Obtener stats y combinarlas con los jugadores
      const playersWithStats = await Promise.all(
        playersData.map(async (player) => {
          const { data: scores } = await supabase
            .from('player_scores')
            .select('total_points, goals, assists, yellow_cards, red_cards, minutes_played')
            .eq('player_id', player.id)

          const stats = scores?.reduce(
            (acc, s) => ({
              total_points: acc.total_points + (s.total_points || 0),
              goals: acc.goals + (s.goals || 0),
              assists: acc.assists + (s.assists || 0),
              yellow_cards: acc.yellow_cards + (s.yellow_cards || 0),
              red_cards: acc.red_cards + (s.red_cards || 0),
              minutes_played: acc.minutes_played + (s.minutes_played || 0),
              matches_played: scores?.length || 0,
              avg_points: 0,
            }),
            { total_points: 0, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, minutes_played: 0, matches_played: 0, avg_points: 0 }
          ) || { total_points: 0, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, minutes_played: 0, matches_played: 0, avg_points: 0 }

          stats.avg_points = stats.matches_played > 0 ? Math.round((stats.total_points / stats.matches_played) * 10) / 10 : 0

          // Retornamos el jugador con el equipo y logo_url
          const team = player.team_id ? teamsMap.get(player.team_id) : null
          return {
            ...player,
            stats,
            team: team || null
          }
        })
      )
      setPlayers(playersWithStats)
      setLoading(false)
    }

    fetchPlayers()
  }, [])

  // Convierte posición en inglés a abreviatura en español
  const getPositionCode = (position: string): string => {
    const posLower = position.toLowerCase()
    if (posLower.includes('goalkeeper') || posLower === 'gk') return 'GK'
    if (posLower.includes('defender') || posLower === 'def') return 'DEF'
    if (posLower.includes('midfielder') || posLower === 'mid') return 'MID'
    if (posLower.includes('forward') || posLower === 'fwd') return 'FWD'
    return 'MID' // Por defecto
  }

  const getPositionLabel = (position: string) => {
    const code = getPositionCode(position)
    const labels: Record<string, string> = {
      GK: 'POR',
      DEF: 'DEF',
      MID: 'MED',
      FWD: 'DEL',
    }
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

  const getPositionFilterColor = (position: string) => {
    const colors: Record<string, string> = {
      ALL: '',
      GK: 'bg-amber-500 hover:bg-amber-600',
      DEF: 'bg-blue-500 hover:bg-blue-600',
      MID: 'bg-emerald-500 hover:bg-emerald-600',
      FWD: 'bg-red-500 hover:bg-red-600',
    }
    return colors[position] || 'bg-slate-500 hover:bg-slate-600'
  }

  const filteredPlayers = players
    .filter((p) => {
      const matchesFilter = p.short_name?.toLowerCase().includes(filter.toLowerCase()) ||
        p.first_name?.toLowerCase().includes(filter.toLowerCase()) ||
        p.last_name?.toLowerCase().includes(filter.toLowerCase())
      const matchesPosition = positionFilter === 'ALL' || getPositionCode(p.position) === positionFilter
      const matchesTeam = teamFilter === 'ALL' || p.team_id === teamFilter
      return matchesFilter && matchesPosition && matchesTeam
    })
    .sort((a, b) => {
      if (sortBy === 'price') return (b.precio || 0) - (a.precio || 0)
      if (sortBy === 'points') return (b.stats?.total_points || 0) - (a.stats?.total_points || 0)
      if (sortBy === 'goals') return (b.stats?.goals || 0) - (a.stats?.goals || 0)
      return (a.short_name || '').localeCompare(b.short_name || '')
    })

  const positions = ['ALL', 'GK', 'DEF', 'MID', 'FWD']

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando jugadores...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Jugadores</h1>
          <p className="text-slate-600 mt-1">Estadísticas y puntos de todos los jugadores</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar jugador..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex gap-2">
              {positions.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPositionFilter(pos)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white ${
                    positionFilter === pos
                      ? getPositionFilterColor(pos)
                      : 'bg-slate-300 text-slate-600 hover:bg-slate-400'
                  }`}
                >
                  {pos === 'ALL' ? 'Todos' : getPositionLabel(pos)}
                </button>
              ))}
            </div>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Todos los equipos</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'price' | 'points' | 'goals' | 'name')}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            >
              <option value="price">Ordenar por Precio</option>
              <option value="points">Ordenar por Puntos</option>
              <option value="goals">Ordenar por Goles</option>
              <option value="name">Ordenar por Nombre</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de jugadores */}
      <div className="grid gap-3">
        {filteredPlayers.map((player) => (
          <div
            key={player.id}
            onClick={() => setSelectedPlayer(player)}
            className="cursor-pointer"
          >
            <Card className="hover:shadow-lg transition-all !bg-slate-800 border-transparent hover:border-emerald-500">
              <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-5">
                  {player.photo ? (
                    <img
                      src={player.photo}
                      alt={player.short_name || ''}
                      className="w-20 h-20 rounded-full object-cover shadow-sm border-2 border-black"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 border-2 border-black">
                      {player.shirt_number || '?'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold text-white">{player.short_name || `${player.first_name} ${player.last_name}`}</h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPositionColor(player.position)}`}>
                        {getPositionLabel(player.position)}
                      </span>
                    </div>
                    {/* Equipo y escudo */}
                    <div className="flex items-center space-x-2 mt-1">
                      {player.team?.logo_url && (
                        <img src={player.team.logo_url} alt={player.team.name || ''} className="w-4 h-4 object-contain" />
                      )}
                      <p className="text-sm text-slate-400">{player.team?.name || 'Sin equipo'}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-1">Precio</p>
                    <span className="text-3xl font-bold text-emerald-400">
                      {player.precio ? `${player.precio}M` : '-'}
                    </span>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center space-x-1 text-emerald-400">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-2xl font-bold">{player.stats?.total_points || 0}</span>
                    </div>
                    <p className="text-xs text-slate-400">Puntos</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center space-x-1 text-slate-300">
                      <Goal className="h-4 w-4" />
                      <span className="font-semibold">{player.stats?.goals || 0}</span>
                    </div>
                    <p className="text-xs text-slate-400">Goles</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center space-x-1 text-slate-300">
                      <span className="text-sm">🅰️</span>
                      <span className="font-semibold">{player.stats?.assists || 0}</span>
                    </div>
                    <p className="text-xs text-slate-400">Asist.</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center space-x-1 text-amber-400">
                      <Ticket className="h-4 w-4" />
                      <span className="font-semibold">{player.stats?.yellow_cards || 0}</span>
                    </div>
                    <p className="text-xs text-slate-400">Amarillas</p>
                  </div>
                  <div className="text-center min-w-[60px]">
                    <div className="text-sm text-slate-400">
                      {player.stats?.matches_played || 0} partidos
                    </div>
                    <p className="text-xs text-slate-500">
                      Media: {player.stats?.avg_points || 0} pts
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>
        ))}
      </div>

      {filteredPlayers.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            No se encontraron jugadores
          </CardContent>
        </Card>
      )}

      {/* MODAL DE DETALLES DEL JUGADOR */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

            {/* Cabecera del modal */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 p-6 flex justify-between items-start z-10">
              <div className="flex items-center space-x-6">
                {selectedPlayer.photo ? (
                  <img
                    src={selectedPlayer.photo}
                    alt={selectedPlayer.short_name || ''}
                    className="w-24 h-24 rounded-full object-cover shadow-md border-4 border-white"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center text-2xl font-bold text-slate-600">
                    {selectedPlayer.shirt_number || '?'}
                  </div>
                )}
                <div>
                  <div className="flex items-center space-x-3 mb-1">
                    <h2 className="text-2xl font-bold text-slate-900">
                      {selectedPlayer.first_name} {selectedPlayer.last_name}
                    </h2>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPositionColor(selectedPlayer.position)}`}>
                      {getPositionLabel(selectedPlayer.position)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {selectedPlayer.team?.logo_url && (
                      <img src={selectedPlayer.team.logo_url} alt={selectedPlayer.team.name || ''} className="w-5 h-5 object-contain" />
                    )}
                    <span className="text-slate-600 font-medium">{selectedPlayer.team?.name || 'Sin equipo'}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cuerpo del modal (Métricas) */}
            <div className="p-6 space-y-8">

              {/* Resumen principal */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center">
                  <p className="text-emerald-800 text-sm font-semibold mb-1">Precio</p>
                  <p className="text-3xl font-bold text-emerald-600">{selectedPlayer.precio ? `${(selectedPlayer.precio / 1000000).toFixed(1)}M` : '-'}</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 text-center">
                  <p className="text-emerald-800 text-sm font-semibold mb-1">Puntos Totales</p>
                  <p className="text-3xl font-bold text-emerald-600">{selectedPlayer.stats?.total_points || 0}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                  <p className="text-slate-600 text-sm font-semibold mb-1">Media</p>
                  <p className="text-3xl font-bold text-slate-800">{selectedPlayer.stats?.avg_points || 0}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                  <p className="text-slate-600 text-sm font-semibold mb-1">Partidos</p>
                  <p className="text-3xl font-bold text-slate-800">{selectedPlayer.stats?.matches_played || 0}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                  <p className="text-slate-600 text-sm font-semibold mb-1">Minutos</p>
                  <p className="text-3xl font-bold text-slate-800">{selectedPlayer.stats?.minutes_played || 0}</p>
                </div>
              </div>

              {/* Datos Personales */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  👤 Datos Personales
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Nombre completo</p>
                    <p className="font-medium text-slate-900">{selectedPlayer.first_name} {selectedPlayer.last_name}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Nombre corto</p>
                    <p className="font-medium text-slate-900">{selectedPlayer.short_name || '-'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Posición</p>
                    <p className="font-medium text-slate-900">{getPositionLabel(selectedPlayer.position)}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Fecha de nacimiento</p>
                    <p className="font-medium text-slate-900">{selectedPlayer.date_of_birth ? new Date(selectedPlayer.date_of_birth).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Nacionalidad</p>
                    <p className="font-medium text-slate-900">{selectedPlayer.nationality || '-'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Estado</p>
                    <Badge variant={selectedPlayer.status === 'active' ? 'default' : 'outline'} className="mt-1">
                      {selectedPlayer.status || 'Desconocido'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Datos Físicos */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  📏 Datos Físicos
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg text-center">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Altura</p>
                    <p className="text-2xl font-bold text-slate-800">{selectedPlayer.height ? `${selectedPlayer.height} cm` : '-'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg text-center">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Peso</p>
                    <p className="text-2xl font-bold text-slate-800">{selectedPlayer.weight ? `${selectedPlayer.weight} kg` : '-'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg text-center">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Pie</p>
                    <p className="text-2xl font-bold text-slate-800">{selectedPlayer.foot ? selectedPlayer.foot.toUpperCase() : '-'}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg text-center">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Dorsal</p>
                    <p className="text-2xl font-bold text-slate-800">{selectedPlayer.shirt_number ?? '-'}</p>
                  </div>
                </div>
              </div>

              {/* Equipo */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  🛡️ Equipo
                </h3>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-4">
                  {selectedPlayer.team?.logo_url ? (
                    <img src={selectedPlayer.team.logo_url} alt={selectedPlayer.team.name || ''} className="w-12 h-12 object-contain" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">?</div>
                  )}
                  <div>
                    <p className="font-semibold text-slate-900">{selectedPlayer.team?.name || 'Sin equipo'}</p>
                    <p className="text-sm text-slate-500">ID: {selectedPlayer.team_id || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Estadísticas de Rendimiento */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  📊 Estadísticas de Rendimiento
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                    <p className="text-emerald-800 text-sm font-semibold mb-1">Puntos Totales</p>
                    <p className="text-3xl font-bold text-emerald-600">{selectedPlayer.stats?.total_points || 0}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <p className="text-slate-600 text-sm font-semibold mb-1">Media</p>
                    <p className="text-3xl font-bold text-slate-800">{selectedPlayer.stats?.avg_points || 0}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <p className="text-slate-600 text-sm font-semibold mb-1">Partidos</p>
                    <p className="text-3xl font-bold text-slate-800">{selectedPlayer.stats?.matches_played || 0}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                    <p className="text-slate-600 text-sm font-semibold mb-1">Minutos</p>
                    <p className="text-3xl font-bold text-slate-800">{selectedPlayer.stats?.minutes_played || 0}</p>
                  </div>
                </div>
              </div>

              {/* Estadísticas Detalladas */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  ⚽ Estadísticas Detalladas
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                    <span className="text-slate-600">Goles</span>
                    <span className="font-bold text-lg">{selectedPlayer.stats?.goals || 0}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                    <span className="text-slate-600">Asistencias</span>
                    <span className="font-bold text-lg">{selectedPlayer.stats?.assists || 0}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                    <span className="text-slate-600">T. Amarillas</span>
                    <span className="font-bold text-lg text-amber-600">{selectedPlayer.stats?.yellow_cards || 0}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                    <span className="text-slate-600">T. Rojas</span>
                    <span className="font-bold text-lg text-red-600">{selectedPlayer.stats?.red_cards || 0}</span>
                  </div>
                </div>
              </div>

              {/* Información adicional */}
              <div className="pt-4 border-t border-slate-200">
                <p className="text-xs text-slate-400">
                  Última actualización: {selectedPlayer.updated_at ? new Date(selectedPlayer.updated_at).toLocaleString('es-ES') : '-'}
                </p>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}