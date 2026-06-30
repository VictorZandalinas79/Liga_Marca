'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Search, TrendingUp, Goal, Ticket, Download, Swords, ChevronDown, ChevronUp } from 'lucide-react'

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
  const [isComparatorOpen, setIsComparatorOpen] = useState(false)
  const [playerAId, setPlayerAId] = useState<string>('')
  const [playerBId, setPlayerBId] = useState<string>('')
  const router = useRouter()
  const supabase = createClient()

  const exportToExcel = () => {
    const headers = ['Nombre', 'Equipo', 'Precio (M)']
    const data = players.map(player => {
      const nombre = player.short_name || `${player.first_name} ${player.last_name}`
      const equipo = player.team?.name || 'Sin equipo'
      const precio = player.precio || 0
      return `"${nombre.replace(/"/g, '""')}";"${equipo.replace(/"/g, '""')}";${precio}`
    })
    
    const csvContent = [headers.join(';'), ...data].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = 'jugadores_liga_marca.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  useEffect(() => {
    const fetchPlayers = async () => {
      // 1. Obtener todos los jugadores (paginado: Supabase devuelve máx. 1000 por petición)
      const PAGE_SIZE = 1000
      const playersData: any[] = []
      let from = 0
      while (true) {
        const { data: page, error: playersError } = await supabase
          .from('players')
          .select('*')
          .order('short_name', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)

        if (playersError) {
          console.error("Error al cargar jugadores:", JSON.stringify(playersError, null, 2))
          setLoading(false)
          return
        }

        if (!page || page.length === 0) break
        playersData.push(...page)
        if (page.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      if (playersData.length === 0) {
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

  const normalize = (text: string) =>
    text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

  const filteredPlayers = players
    .filter((p) => {
      const normalizedFilter = normalize(filter)
      const matchesFilter = normalize(p.short_name ?? '').includes(normalizedFilter) ||
        normalize(p.first_name ?? '').includes(normalizedFilter) ||
        normalize(p.last_name ?? '').includes(normalizedFilter)
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Jugadores</h1>
          <p className="text-slate-600 mt-1">Estadísticas y puntos de todos los jugadores</p>
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-sm w-fit"
        >
          <Download className="w-4 h-4" />
          Exportar Excel
        </button>
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
            <div className="flex gap-2 flex-wrap">
              {positions.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPositionFilter(pos)}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white ${
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

      {/* COMPARADOR DE JUGADORES */}
      <div className="flex flex-col gap-2 my-6">
        <button
          onClick={() => setIsComparatorOpen(!isComparatorOpen)}
          className="flex items-center justify-between px-5 py-4 bg-slate-900 text-white rounded-xl shadow-md hover:bg-slate-800 transition-colors border border-slate-700"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Swords className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="font-bold text-lg">Comparador de Jugadores</span>
          </div>
          {isComparatorOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </button>

        {isComparatorOpen && (
          <Card className="!bg-slate-900 border-slate-700 shadow-2xl mt-2 overflow-visible">
            <CardContent className="p-4 sm:p-6 lg:p-8">
              {/* Selectores */}
              <div className="flex flex-col md:flex-row gap-4 mb-8 items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <div className="flex-1 w-full">
                  <label className="text-xs text-emerald-400 font-bold mb-2 block uppercase tracking-wider">Jugador 1</label>
                  <select
                    value={playerAId}
                    onChange={(e) => setPlayerAId(e.target.value)}
                    className="w-full bg-slate-950 text-white border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 font-medium"
                  >
                    <option value="">Selecciona un jugador...</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.short_name || `${p.first_name} ${p.last_name}`} ({getPositionLabel(p.position)})</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-center shrink-0 py-2 md:py-0 mt-6 md:mt-4">
                  <div className="w-10 h-10 rounded-full bg-slate-950 border-2 border-slate-700 flex items-center justify-center text-xs font-black text-slate-500 shadow-inner">
                    VS
                  </div>
                </div>
                <div className="flex-1 w-full">
                  <label className="text-xs text-emerald-400 font-bold mb-2 block uppercase tracking-wider">Jugador 2</label>
                  <select
                    value={playerBId}
                    onChange={(e) => setPlayerBId(e.target.value)}
                    className="w-full bg-slate-950 text-white border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-emerald-500 font-medium"
                  >
                    <option value="">Selecciona un jugador...</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.short_name || `${p.first_name} ${p.last_name}`} ({getPositionLabel(p.position)})</option>)}
                  </select>
                </div>
              </div>

              {/* Área de Comparación */}
              {playerAId && playerBId && playerAId !== playerBId ? (() => {
                const playerA = players.find(p => p.id === playerAId)!
                const playerB = players.find(p => p.id === playerBId)!
                
                const renderMetricBar = (label: string, valA: number, valB: number, reverseColors = false) => {
                  const total = Math.max(valA, 0) + Math.max(valB, 0) || 1
                  const percentA = (Math.max(valA, 0) / total) * 100
                  const percentB = (Math.max(valB, 0) / total) * 100
                  const isAWinner = reverseColors ? valA < valB : valA > valB
                  const isBWinner = reverseColors ? valB < valA : valB > valA
                  const isTie = valA === valB
                  
                  return (
                    <div className="flex flex-col mb-5" key={label}>
                      <div className="flex justify-between items-end mb-1.5 px-1">
                        <span className={`text-base font-black ${isAWinner ? 'text-emerald-400' : isTie ? 'text-slate-300' : 'text-slate-500'}`}>{typeof valA === 'number' && valA % 1 !== 0 ? valA.toFixed(1) : valA}</span>
                        <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest">{label}</span>
                        <span className={`text-base font-black ${isBWinner ? 'text-emerald-400' : isTie ? 'text-slate-300' : 'text-slate-500'}`}>{typeof valB === 'number' && valB % 1 !== 0 ? valB.toFixed(1) : valB}</span>
                      </div>
                      <div className="flex h-3 w-full bg-slate-950 rounded-full overflow-hidden shadow-inner border border-slate-800">
                        <div className={`h-full transition-all duration-700 ${isAWinner ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : isTie ? 'bg-slate-600' : 'bg-slate-700'}`} style={{ width: `${percentA}%` }} />
                        <div className="w-1 shrink-0 bg-slate-900" />
                        <div className={`h-full transition-all duration-700 ${isBWinner ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : isTie ? 'bg-slate-600' : 'bg-slate-700'}`} style={{ width: `${percentB}%` }} />
                      </div>
                    </div>
                  )
                }

                const renderProfile = (p: Player, isLeft: boolean) => (
                  <div className={`flex flex-col items-center ${isLeft ? 'md:items-start' : 'md:items-end'} w-full`}>
                    <div className="relative mb-4 group">
                      {p.photo ? (
                        <div className="relative w-28 h-28 sm:w-36 sm:h-36">
                          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-emerald-400 to-blue-500 blur-md opacity-40 group-hover:opacity-70 transition-opacity duration-500" />
                          <img src={p.photo} className="relative w-full h-full rounded-full object-cover border-4 border-slate-900 shadow-2xl bg-white" alt={p.short_name || ''} />
                        </div>
                      ) : (
                        <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-slate-800 flex items-center justify-center text-4xl font-bold text-slate-600 border-4 border-slate-900 shadow-2xl">
                          {p.shirt_number || '?'}
                        </div>
                      )}
                      {p.team?.logo_url && (
                        <div className={`absolute -bottom-3 ${isLeft ? '-right-3' : '-left-3'} w-12 h-12 bg-white rounded-full p-1.5 border-2 border-slate-700 shadow-lg z-10`}>
                          <img src={p.team.logo_url} className="w-full h-full object-contain drop-shadow-md" alt={p.team.name} />
                        </div>
                      )}
                      {p.shirt_number && (
                        <div className={`absolute -top-2 ${isLeft ? '-left-2' : '-right-2'} w-10 h-10 flex items-center justify-center text-xl font-black text-white bg-slate-950 rounded-lg border-2 border-slate-700 shadow-xl z-10`} style={{ textShadow: '2px 2px 0 #000' }}>
                          {p.shirt_number}
                        </div>
                      )}
                    </div>
                    <h3 className={`text-xl sm:text-2xl font-black text-white text-center ${isLeft ? 'md:text-left' : 'md:text-right'} w-full truncate mb-2`}>{p.short_name || `${p.first_name} ${p.last_name}`}</h3>
                    <div className={`flex items-center gap-2 ${isLeft ? 'justify-center md:justify-start' : 'justify-center md:justify-end'} w-full`}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getPositionColor(p.position)}`}>
                        {getPositionLabel(p.position)}
                      </span>
                      <span className="text-sm text-slate-400 font-medium truncate">{p.team?.name || 'Sin equipo'}</span>
                    </div>
                  </div>
                )

                return (
                  <div className="flex flex-col md:flex-row gap-8 lg:gap-12 items-start mt-2">
                    {/* Perfil A */}
                    <div className="w-full md:w-1/4 flex justify-center md:justify-start order-1">
                      {renderProfile(playerA, true)}
                    </div>

                    {/* Barras Centrales */}
                    <div className="w-full md:w-2/4 bg-slate-950/50 rounded-2xl p-5 sm:p-8 border border-slate-800 flex flex-col justify-center shadow-inner order-3 md:order-2">
                      {renderMetricBar('Precio (M)', playerA.precio || 0, playerB.precio || 0)}
                      {renderMetricBar('Puntos Totales', playerA.stats?.total_points || 0, playerB.stats?.total_points || 0)}
                      {renderMetricBar('Media Puntos', playerA.stats?.avg_points || 0, playerB.stats?.avg_points || 0)}
                      {renderMetricBar('Goles', playerA.stats?.goals || 0, playerB.stats?.goals || 0)}
                      {renderMetricBar('Asistencias', playerA.stats?.assists || 0, playerB.stats?.assists || 0)}
                      {renderMetricBar('Minutos', playerA.stats?.minutes_played || 0, playerB.stats?.minutes_played || 0)}
                      {renderMetricBar('T. Amarillas', playerA.stats?.yellow_cards || 0, playerB.stats?.yellow_cards || 0, true)}
                      {renderMetricBar('T. Rojas', playerA.stats?.red_cards || 0, playerB.stats?.red_cards || 0, true)}
                    </div>

                    {/* Perfil B */}
                    <div className="w-full md:w-1/4 flex justify-center md:justify-end order-2 md:order-3">
                      {renderProfile(playerB, false)}
                    </div>
                  </div>
                )
              })() : (
                <div className="text-center py-12 px-4 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30">
                  <Swords className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg font-medium">Selecciona dos jugadores diferentes arriba para iniciar la comparativa.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Lista de jugadores */}
      <div className="grid gap-3">
        {filteredPlayers.map((player) => (
          <div
            key={player.id}
            onClick={() => router.push(`/jugadores/${player.id}`)}
            className="cursor-pointer"
          >
            <Card className="hover:shadow-lg transition-all !bg-slate-800 border-transparent hover:border-emerald-500">
              <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-4 sm:space-x-5">
                  {player.photo ? (
                    <img
                      src={player.photo}
                      alt={player.short_name || ''}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-sm border-2 border-black shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-600 border-2 border-black shrink-0">
                      {player.shirt_number || '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold text-white truncate">{player.short_name || `${player.first_name} ${player.last_name}`}</h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${getPositionColor(player.position)}`}>
                        {getPositionLabel(player.position)}
                      </span>
                    </div>
                    {/* Equipo y escudo */}
                    <div className="flex items-center space-x-2 mt-1">
                      {player.team?.logo_url && (
                        <img src={player.team.logo_url} alt={player.team.name || ''} className="w-4 h-4 object-contain shrink-0" />
                      )}
                      <p className="text-sm text-slate-400 truncate">{player.team?.name || 'Sin equipo'}</p>
                      {player.shirt_number && (
                        <span 
                          className="font-black text-white/95 text-xl sm:text-2xl leading-none ml-2"
                          style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.9), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }}
                        >
                          {player.shirt_number}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 flex-wrap border-t border-slate-700 sm:border-0 pt-3 sm:pt-0">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 mb-1">Precio</p>
                    <span className="text-2xl sm:text-3xl font-bold text-emerald-400">
                      {player.precio ? `${player.precio}M` : '-'}
                    </span>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-1 text-emerald-400">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-2xl font-bold">
                        {player.stats ? Math.round(player.stats.total_points * 10) / 10 : 0}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">Puntos</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-1 text-slate-300">
                      <Goal className="h-4 w-4" />
                      <span className="font-semibold">{player.stats?.goals || 0}</span>
                    </div>
                    <p className="text-xs text-slate-400">Goles</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-1 text-slate-300">
                      <span className="text-sm">🅰️</span>
                      <span className="font-semibold">{player.stats?.assists || 0}</span>
                    </div>
                    <p className="text-xs text-slate-400">Asist.</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-1 text-amber-400">
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

    </div>
  )
}