'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { applyMarketFilter } from '@/lib/market'
import { Card, CardContent } from '@/components/ui/card'
import { Search, TrendingUp, Goal, Ticket, Download, Swords, ChevronDown, ChevronUp, X } from 'lucide-react'

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
  is_in_biwenger?: boolean
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
  shots_on_target: number
  passes_completed: number
  passes_attempted: number
  tackles_won: number
  interceptions: number
  saves: number
  clearances: number
  takeons_won: number
  ball_recoveries: number
  key_passes: number
  big_chances_created: number
  aerials_won: number
  penalties_won: number
  dispossessed: number
  bad_touches: number
  own_goals: number
  forward_passes: number
  box_entries: number
  recoveries_high: number
  recoveries_med: number
  recoveries_low: number
  interceptions_high: number
  interceptions_med: number
  interceptions_low: number
  set_pieces_taken: number
  successful_crosses: number
  long_balls_completed: number
}

interface Team {
  id: string
  name: string
  logo_url?: string
}

// Buscador de jugadores con dropdown
function PlayerSearchPicker({
  label,
  color,
  selectedId,
  onSelect,
  players,
  getPositionLabel,
  getPositionColor,
  normalize,
}: {
  label: string
  color: string
  selectedId: string
  onSelect: (id: string) => void
  players: Player[]
  getPositionLabel: (pos: string) => string
  getPositionColor: (pos: string) => string
  normalize: (text: string) => string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = players.find(p => p.id === selectedId)

  const filtered = query.trim()
    ? players
        .filter(p => {
          const q = normalize(query)
          const displayName = normalize(p.short_name || `${p.first_name} ${p.last_name}`)
          return displayName.includes(q) || normalize(p.team?.name || '').includes(q)
        })
        .slice(0, 40)
    : players.slice(0, 30)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (selected) {
    return (
      <div className="flex-1 w-full">
        <label className={`text-xs font-bold mb-2 block uppercase tracking-wider ${color}`}>{label}</label>
        <div className="flex items-center gap-3 bg-slate-950 border border-slate-600 rounded-xl px-3 py-2.5">
          {selected.photo ? (
            <img src={selected.photo} alt={selected.short_name || ''} className="w-10 h-10 rounded-full object-cover border-2 border-slate-700 shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400 shrink-0">
              {selected.shirt_number || '?'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm truncate">{selected.short_name || `${selected.first_name} ${selected.last_name}`}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${getPositionColor(selected.position)}`}>
                {getPositionLabel(selected.position)}
              </span>
              {selected.team?.logo_url && (
                <img src={selected.team.logo_url} alt={selected.team.name} className="w-3.5 h-3.5 object-contain" />
              )}
              <span className="text-slate-400 text-xs truncate">{selected.team?.name}</span>
            </div>
          </div>
          <button
            onClick={() => { onSelect(''); setQuery('') }}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 w-full relative" ref={ref}>
      <label className={`text-xs font-bold mb-2 block uppercase tracking-wider ${color}`}>{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar jugador o equipo..."
          className="w-full bg-slate-950 text-white border border-slate-700 rounded-xl pl-9 pr-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder:text-slate-600"
        />
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-slate-500 text-sm px-4 py-3 text-center">Sin resultados</p>
          ) : filtered.map(p => (
            <button
              key={p.id}
              onMouseDown={() => { onSelect(p.id); setQuery(''); setOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-800 transition-colors text-left"
            >
              {p.photo ? (
                <img src={p.photo} alt={p.short_name || ''} className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                  {p.shirt_number || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{p.short_name || `${p.first_name} ${p.last_name}`}</p>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${getPositionColor(p.position)}`}>
                    {getPositionLabel(p.position)}
                  </span>
                  {p.team?.logo_url && <img src={p.team.logo_url} alt="" className="w-3 h-3 object-contain" />}
                  <span className="text-slate-400 text-xs truncate">{p.team?.name}</span>
                </div>
              </div>
              {p.precio && <span className="text-emerald-400 text-xs font-bold shrink-0">{p.precio}M</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function JugadoresPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [filter, setFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('ALL')
  const [teamFilter, setTeamFilter] = useState<string>('ALL')
  const [minPrice, setMinPrice] = useState<string>('')
  const [maxPrice, setMaxPrice] = useState<string>('')
  const [teams, setTeams] = useState<Array<{ id: string; name: string; logo_url?: string }>>([])
  const [sortBy, setSortBy] = useState<'price' | 'points' | 'goals' | 'name'>('price')
  const [loading, setLoading] = useState(true)
  const [isComparatorOpen, setIsComparatorOpen] = useState(false)
  const [playerAId, setPlayerAId] = useState<string>('')
  const [playerBId, setPlayerBId] = useState<string>('')
  const [per90Mode, setPer90Mode] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const exportToExcel = () => {
    const headers = ['Nombre', 'Equipo', 'Posición', 'Precio (M)']
    const data = players.map(player => {
      const nombre = player.short_name || `${player.first_name} ${player.last_name}`
      const equipo = player.team?.name || 'Sin equipo'
      const posicion = getPositionLabel(player.position)
      const precio = player.precio || 0
      return `"${nombre.replace(/"/g, '""')}";"${equipo.replace(/"/g, '""')}";"${posicion}";${precio}`
    })
    const csvContent = [headers.join(';'), ...data].join('\n')
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
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
      const PAGE_SIZE = 1000
      const playersData: any[] = []
      let from = 0
      while (true) {
        // Solo los que sigue listando Biwenger: los que se fueron del mercado
        // (aunque alguien los tenga fichados) y los que solo están en la API
        // no salen en este listado. Ver src/lib/market.ts.
        const { data: page, error } = await applyMarketFilter(
          supabase
            .from('players')
            .select('*')
        )
          .order('short_name', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
        if (error || !page || page.length === 0) break
        playersData.push(...page)
        if (page.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      if (playersData.length === 0) { setLoading(false); return }

      const teamIds = [...new Set(playersData.map(p => p.team_id).filter(Boolean))]
      const { data: teamsData } = await supabase
        .from('real_teams')
        .select('id, name, logo_url')
        .in('id', teamIds)
      const teamsMap = new Map(teamsData?.map(t => [t.id, t]) || [])

      setTeams(
        teamIds.map(id => ({
          id,
          name: teamsMap.get(id)?.name || 'Sin nombre',
          logo_url: teamsMap.get(id)?.logo_url,
        })).sort((a, b) => a.name.localeCompare(b.name))
      )

      const allScores: any[] = []
      let scoresFrom = 0
      while (true) {
        const { data: page, error } = await supabase
          .from('player_scores')
          .select('player_id, total_points, goals, assists, yellow_cards, red_cards, minutes_played, shots_on_target, passes_completed, passes_attempted, tackles_won, interceptions, saves, clearances, takeons_won, ball_recoveries, key_passes, big_chances_created, aerials_won, penalties_won, dispossessed, bad_touches, own_goals, forward_passes, box_entries, recoveries_high, recoveries_med, recoveries_low, interceptions_high, interceptions_med, interceptions_low, set_pieces_taken, successful_crosses, long_balls_completed')
          .range(scoresFrom, scoresFrom + PAGE_SIZE - 1)
        if (error || !page || page.length === 0) break
        allScores.push(...page)
        if (page.length < PAGE_SIZE) break
        scoresFrom += PAGE_SIZE
      }

      const scoresByPlayer = new Map<string, any[]>()
      for (const score of allScores) {
        if (!scoresByPlayer.has(score.player_id)) {
          scoresByPlayer.set(score.player_id, [])
        }
        scoresByPlayer.get(score.player_id)!.push(score)
      }

      const playersWithStats = playersData.map((player) => {
        const scores = scoresByPlayer.get(player.id) || []

        const zero: PlayerStats = {
          total_points: 0, goals: 0, assists: 0, yellow_cards: 0, red_cards: 0,
          minutes_played: 0, matches_played: 0, avg_points: 0,
          shots_on_target: 0, passes_completed: 0, passes_attempted: 0,
          tackles_won: 0, interceptions: 0, saves: 0, clearances: 0,
          takeons_won: 0, ball_recoveries: 0, key_passes: 0,
          big_chances_created: 0, aerials_won: 0, penalties_won: 0,
          dispossessed: 0, bad_touches: 0, own_goals: 0,
          forward_passes: 0, box_entries: 0, recoveries_high: 0, recoveries_med: 0, recoveries_low: 0,
          interceptions_high: 0, interceptions_med: 0, interceptions_low: 0,
          set_pieces_taken: 0, successful_crosses: 0, long_balls_completed: 0,
        }

        const stats = scores.reduce((acc, s) => ({
          total_points: acc.total_points + (s.total_points || 0),
          goals: acc.goals + (s.goals || 0),
          assists: acc.assists + (s.assists || 0),
          yellow_cards: acc.yellow_cards + (s.yellow_cards || 0),
          red_cards: acc.red_cards + (s.red_cards || 0),
          minutes_played: acc.minutes_played + (s.minutes_played || 0),
          matches_played: scores.length,
          avg_points: 0,
          shots_on_target: acc.shots_on_target + (s.shots_on_target || 0),
          passes_completed: acc.passes_completed + (s.passes_completed || 0),
          passes_attempted: acc.passes_attempted + (s.passes_attempted || 0),
          tackles_won: acc.tackles_won + (s.tackles_won || 0),
          interceptions: acc.interceptions + (s.interceptions || 0),
          saves: acc.saves + (s.saves || 0),
          clearances: acc.clearances + (s.clearances || 0),
          takeons_won: acc.takeons_won + (s.takeons_won || 0),
          ball_recoveries: acc.ball_recoveries + (s.ball_recoveries || 0),
          key_passes: acc.key_passes + (s.key_passes || 0),
          big_chances_created: acc.big_chances_created + (s.big_chances_created || 0),
          aerials_won: acc.aerials_won + (s.aerials_won || 0),
          penalties_won: acc.penalties_won + (s.penalties_won || 0),
          dispossessed: acc.dispossessed + (s.dispossessed || 0),
          bad_touches: acc.bad_touches + (s.bad_touches || 0),
          own_goals: acc.own_goals + (s.own_goals || 0),
          forward_passes: acc.forward_passes + (s.forward_passes || 0),
          box_entries: acc.box_entries + (s.box_entries || 0),
          recoveries_high: acc.recoveries_high + (s.recoveries_high || 0),
          recoveries_med: acc.recoveries_med + (s.recoveries_med || 0),
          recoveries_low: acc.recoveries_low + (s.recoveries_low || 0),
          interceptions_high: acc.interceptions_high + (s.interceptions_high || 0),
          interceptions_med: acc.interceptions_med + (s.interceptions_med || 0),
          interceptions_low: acc.interceptions_low + (s.interceptions_low || 0),
          set_pieces_taken: acc.set_pieces_taken + (s.set_pieces_taken || 0),
          successful_crosses: acc.successful_crosses + (s.successful_crosses || 0),
          long_balls_completed: acc.long_balls_completed + (s.long_balls_completed || 0),
        }), zero) as PlayerStats || zero

        stats.avg_points = stats.matches_played > 0
          ? Math.round((stats.total_points / stats.matches_played) * 10) / 10
          : 0

        const team = player.team_id ? teamsMap.get(player.team_id) : null
        return { ...player, stats, team: team || null }
      })

      setPlayers(playersWithStats)
      setLoading(false)
    }

    fetchPlayers()
  }, [])

  const getPositionCode = (position: string): string => {
    const posLower = position.toLowerCase()
    if (posLower.includes('goalkeeper') || posLower === 'gk') return 'GK'
    if (posLower.includes('defender') || posLower === 'def') return 'DEF'
    if (posLower.includes('midfielder') || posLower === 'mid') return 'MID'
    if (posLower.includes('forward') || posLower === 'fwd') return 'FWD'
    return 'MID'
  }

  const getPositionLabel = (position: string) => {
    const labels: Record<string, string> = { GK: 'POR', DEF: 'DEF', MID: 'MED', FWD: 'DEL' }
    return labels[getPositionCode(position)] || position
  }

  const getPositionColor = (position: string) => {
    const colors: Record<string, string> = {
      GK: 'bg-amber-500 text-white',
      DEF: 'bg-blue-500 text-white',
      MID: 'bg-emerald-500 text-white',
      FWD: 'bg-red-500 text-white',
    }
    return colors[getPositionCode(position)] || 'bg-slate-500 text-white'
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
    .filter(p => {
      const q = normalize(filter)
      const displayName = normalize(p.short_name || `${p.first_name} ${p.last_name}`)
      const matchesFilter = !q || displayName.includes(q)
      const matchesPosition = positionFilter === 'ALL' || getPositionCode(p.position) === positionFilter
      const matchesTeam = teamFilter === 'ALL' || p.team_id === teamFilter
      
      const price = p.precio || 0
      const matchesMin = minPrice === '' || price >= parseFloat(minPrice)
      const matchesMax = maxPrice === '' || price <= parseFloat(maxPrice)
      
      return matchesFilter && matchesPosition && matchesTeam && matchesMin && matchesMax
    })
    .sort((a, b) => {
      const q = normalize(filter)
      if (q) {
        const aName = normalize(a.short_name || `${a.first_name} ${a.last_name}`)
        const bName = normalize(b.short_name || `${b.first_name} ${b.last_name}`)
        const aExact = aName === q
        const bExact = bName === q
        if (aExact && !bExact) return -1
        if (bExact && !aExact) return 1
      }
      
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
        <CardContent className="p-4 space-y-4">
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
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Todos los equipos</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
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

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex gap-2 flex-wrap w-full md:w-auto">
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

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <span className="text-sm font-medium text-slate-600 shrink-0">Precio (M):</span>
              <input
                type="number"
                step="0.1"
                placeholder="Mín"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-20 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
              />
              <span className="text-slate-400 text-sm">-</span>
              <input
                type="number"
                step="0.1"
                placeholder="Máx"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-20 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
              />
              {(minPrice !== '' || maxPrice !== '') && (
                <button
                  onClick={() => { setMinPrice(''); setMaxPrice('') }}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Limpiar precios"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
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
              {/* Selectores con buscador */}
              <div className="flex flex-col md:flex-row gap-4 mb-6 items-end bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <PlayerSearchPicker
                  label="Jugador 1"
                  color="text-emerald-400"
                  selectedId={playerAId}
                  onSelect={setPlayerAId}
                  players={players}
                  getPositionLabel={getPositionLabel}
                  getPositionColor={getPositionColor}
                  normalize={normalize}
                />
                <div className="flex items-center justify-center shrink-0 pb-1">
                  <div className="w-10 h-10 rounded-full bg-slate-950 border-2 border-slate-700 flex items-center justify-center text-xs font-black text-slate-500 shadow-inner">
                    VS
                  </div>
                </div>
                <PlayerSearchPicker
                  label="Jugador 2"
                  color="text-orange-400"
                  selectedId={playerBId}
                  onSelect={setPlayerBId}
                  players={players}
                  getPositionLabel={getPositionLabel}
                  getPositionColor={getPositionColor}
                  normalize={normalize}
                />
              </div>

              {/* Toggle per/90 */}
              {playerAId && playerBId && playerAId !== playerBId && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setPer90Mode(v => !v)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
                      per90Mode
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>⚡</span>
                    {per90Mode ? 'Modo: Por 90 min' : 'Modo: Total'}
                  </button>
                </div>
              )}

              {/* Área de Comparación */}
              {playerAId && playerBId && playerAId !== playerBId ? (() => {
                const playerA = players.find(p => p.id === playerAId)!
                const playerB = players.find(p => p.id === playerBId)!

                const p90 = (val: number, minutes: number) => {
                  if (!per90Mode || minutes < 1) return val
                  return Math.round((val / minutes * 90) * 100) / 100
                }
                const fmt = (v: number) => typeof v === 'number' && v % 1 !== 0 ? v.toFixed(2) : v

                const renderMetricBar = (
                  label: string,
                  rawA: number,
                  rawB: number,
                  reverseColors = false,
                  skipPer90 = false
                ) => {
                  const minsA = playerA.stats?.minutes_played || 0
                  const minsB = playerB.stats?.minutes_played || 0
                  const valA = skipPer90 ? rawA : p90(rawA, minsA)
                  const valB = skipPer90 ? rawB : p90(rawB, minsB)
                  const total = Math.max(valA, 0) + Math.max(valB, 0) || 1
                  const percentA = (Math.max(valA, 0) / total) * 100
                  const percentB = (Math.max(valB, 0) / total) * 100
                  const isAWinner = reverseColors ? valA < valB : valA > valB
                  const isBWinner = reverseColors ? valB < valA : valB > valA
                  const isTie = valA === valB

                  return (
                    <div className="flex flex-col mb-4" key={label}>
                      <div className="flex justify-between items-end mb-1.5 px-1">
                        <span className={`text-base font-black ${isAWinner ? 'text-emerald-400' : isTie ? 'text-slate-300' : 'text-slate-500'}`}>
                          {fmt(valA)}
                        </span>
                        <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest text-center">{label}</span>
                        <span className={`text-base font-black ${isBWinner ? 'text-orange-400' : isTie ? 'text-slate-300' : 'text-slate-500'}`}>
                          {fmt(valB)}
                        </span>
                      </div>
                      <div className="flex h-2.5 w-full bg-slate-950 rounded-full overflow-hidden shadow-inner border border-slate-800">
                        <div
                          className={`h-full transition-all duration-700 ${isAWinner ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]' : isTie ? 'bg-slate-600' : 'bg-slate-700'}`}
                          style={{ width: `${percentA}%` }}
                        />
                        <div className="w-0.5 shrink-0 bg-slate-900" />
                        <div
                          className={`h-full transition-all duration-700 ${isBWinner ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.7)]' : isTie ? 'bg-slate-600' : 'bg-slate-700'}`}
                          style={{ width: `${percentB}%` }}
                        />
                      </div>
                    </div>
                  )
                }

                const renderSection = (title: string, emoji: string) => (
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5 mb-2 flex items-center gap-1.5">
                    <span>{emoji}</span> {title}
                  </p>
                )

                const renderProfile = (p: Player, isLeft: boolean, accentColor: string) => (
                  <div className={`flex flex-col items-center ${isLeft ? 'md:items-start' : 'md:items-end'} w-full`}>
                    <div className="relative mb-4 group">
                      {p.photo ? (
                        <div className="relative w-24 h-24 sm:w-32 sm:h-32">
                          <div className={`absolute inset-0 rounded-full blur-md opacity-40 group-hover:opacity-70 transition-opacity duration-500 ${accentColor}`} />
                          <img src={p.photo} className="relative w-full h-full rounded-full object-cover border-4 border-slate-900 shadow-2xl bg-white" alt={p.short_name || ''} />
                        </div>
                      ) : (
                        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-slate-800 flex items-center justify-center text-4xl font-bold text-slate-600 border-4 border-slate-900 shadow-2xl">
                          {p.shirt_number || '?'}
                        </div>
                      )}
                      {p.team?.logo_url && (
                        <div className={`absolute -bottom-3 ${isLeft ? '-right-3' : '-left-3'} w-10 h-10 bg-white rounded-full p-1.5 border-2 border-slate-700 shadow-lg z-10`}>
                          <img src={p.team.logo_url} className="w-full h-full object-contain" alt={p.team.name} />
                        </div>
                      )}
                      {p.shirt_number && (
                        <div className={`absolute -top-2 ${isLeft ? '-left-2' : '-right-2'} w-9 h-9 flex items-center justify-center text-lg font-black text-white bg-slate-950 rounded-lg border-2 border-slate-700 shadow-xl z-10`}>
                          {p.shirt_number}
                        </div>
                      )}
                    </div>
                    <h3 className={`text-xl sm:text-2xl font-black text-white text-center ${isLeft ? 'md:text-left' : 'md:text-right'} w-full truncate mb-2`}>
                      {p.short_name || `${p.first_name} ${p.last_name}`}
                    </h3>
                    <div className={`flex items-center gap-2 ${isLeft ? 'justify-center md:justify-start' : 'justify-center md:justify-end'} w-full`}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getPositionColor(p.position)}`}>
                        {getPositionLabel(p.position)}
                      </span>
                      <span className="text-sm text-slate-400 font-medium truncate">{p.team?.name || 'Sin equipo'}</span>
                    </div>
                    <div className="mt-2 text-center">
                      <span className="text-2xl font-black text-emerald-400">{p.precio ? `${p.precio}M` : '-'}</span>
                    </div>
                  </div>
                )

                const sA = playerA.stats!
                const sB = playerB.stats!

                return (
                  <div className="flex flex-col md:flex-row gap-6 lg:gap-10 items-start mt-2">
                    {/* Perfil A */}
                    <div className="w-full md:w-1/4 flex justify-center md:justify-start order-1">
                      {renderProfile(playerA, true, 'bg-gradient-to-tr from-emerald-400 to-blue-500')}
                    </div>

                    {/* Barras centrales */}
                    <div className="w-full md:w-2/4 bg-slate-950/50 rounded-2xl p-5 sm:p-6 border border-slate-800 flex flex-col justify-center shadow-inner order-3 md:order-2">
                      {/* Indicadores colores */}
                      <div className="flex justify-between text-[10px] font-bold mb-4 px-1">
                        <span className="text-emerald-400 truncate max-w-[45%]">
                          {playerA.short_name || playerA.first_name}
                        </span>
                        <span className="text-orange-400 truncate max-w-[45%] text-right">
                          {playerB.short_name || playerB.first_name}
                        </span>
                      </div>

                      {per90Mode && (
                        <p className="text-center text-[10px] text-violet-400 font-bold mb-3 bg-violet-950/40 rounded-lg py-1">
                          ⚡ Estadísticas por 90 minutos
                        </p>
                      )}

                      {renderSection('General', '📊')}
                      {renderMetricBar('Precio (M)', sA.total_points !== undefined ? (playerA.precio || 0) : 0, playerB.precio || 0, false, true)}
                      {renderMetricBar('Partidos', sA.matches_played, sB.matches_played, false, true)}
                      {renderMetricBar('Minutos', sA.minutes_played, sB.minutes_played, false, true)}
                      {renderMetricBar(per90Mode ? 'Puntos / 90' : 'Puntos Totales', sA.total_points, sB.total_points)}
                      {renderMetricBar('Media Puntos', sA.avg_points, sB.avg_points, false, true)}

                      {renderSection('Ataque', '⚽')}
                      {renderMetricBar(per90Mode ? 'Goles / 90' : 'Goles', sA.goals, sB.goals)}
                      {renderMetricBar(per90Mode ? 'Asistencias / 90' : 'Asistencias', sA.assists, sB.assists)}
                      {renderMetricBar(per90Mode ? 'Tiros a puerta / 90' : 'Tiros a puerta', sA.shots_on_target, sB.shots_on_target)}
                      {renderMetricBar(per90Mode ? 'Regates / 90' : 'Regates ganados', sA.takeons_won, sB.takeons_won)}
                      {renderMetricBar(per90Mode ? 'Goles propia / 90' : 'Goles en propia', sA.own_goals, sB.own_goals, true)}

                      {renderSection('Pases y Creación', '📈')}
                      {renderMetricBar(per90Mode ? 'Pases completados / 90' : 'Pases completados', sA.passes_completed, sB.passes_completed)}
                      {renderMetricBar(per90Mode ? 'Pases hacia adelante / 90' : 'Pases hacia adelante', sA.forward_passes, sB.forward_passes)}
                      {renderMetricBar(per90Mode ? 'Pases largos / 90' : 'Pases largos', sA.long_balls_completed, sB.long_balls_completed)}
                      {renderMetricBar(per90Mode ? 'Centros exitosos / 90' : 'Centros exitosos', sA.successful_crosses, sB.successful_crosses)}
                      {renderMetricBar(per90Mode ? 'Balones al área / 90' : 'Balones al área', sA.box_entries, sB.box_entries)}
                      {renderMetricBar(per90Mode ? 'Balón parado / 90' : 'Lanz. Balón Parado', sA.set_pieces_taken, sB.set_pieces_taken)}

                      {renderSection('Defensa', '🛡️')}
                      {renderMetricBar(per90Mode ? 'Intercept. Altas / 90' : 'Intercept. Altas', sA.interceptions_high, sB.interceptions_high)}
                      {renderMetricBar(per90Mode ? 'Intercept. Medias / 90' : 'Intercept. Medias', sA.interceptions_med, sB.interceptions_med)}
                      {renderMetricBar(per90Mode ? 'Intercept. Bajas / 90' : 'Intercept. Bajas', sA.interceptions_low, sB.interceptions_low)}
                      {renderMetricBar(per90Mode ? 'Despejes / 90' : 'Despejes', sA.clearances, sB.clearances)}
                      {renderMetricBar(per90Mode ? 'Recup. Altas / 90' : 'Recup. Altas', sA.recoveries_high, sB.recoveries_high)}
                      {renderMetricBar(per90Mode ? 'Recup. Medias / 90' : 'Recup. Medias', sA.recoveries_med, sB.recoveries_med)}
                      {renderMetricBar(per90Mode ? 'Recup. Bajas / 90' : 'Recup. Bajas', sA.recoveries_low, sB.recoveries_low)}

                      {renderSection('Portería', '🧤')}
                      {renderMetricBar(per90Mode ? 'Paradas / 90' : 'Paradas', sA.saves, sB.saves)}

                      {renderSection('Penaltis y Disciplina', '🟨')}
                      {renderMetricBar(per90Mode ? 'Penaltis provocados / 90' : 'Penaltis provocados', sA.penalties_won, sB.penalties_won)}
                      {renderMetricBar(per90Mode ? 'Balones perdidos / 90' : 'Balones perdidos', (sA.dispossessed + sA.bad_touches), (sB.dispossessed + sB.bad_touches), true)}
                      {renderMetricBar('T. Amarillas', sA.yellow_cards, sB.yellow_cards, true, true)}
                      {renderMetricBar('T. Rojas', sA.red_cards, sB.red_cards, true, true)}
                    </div>

                    {/* Perfil B */}
                    <div className="w-full md:w-1/4 flex justify-center md:justify-end order-2 md:order-3">
                      {renderProfile(playerB, false, 'bg-gradient-to-tr from-orange-400 to-red-500')}
                    </div>
                  </div>
                )
              })() : (
                <div className="text-center py-12 px-4 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30">
                  <Swords className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg font-medium">Busca y selecciona dos jugadores para iniciar la comparativa.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Lista de jugadores */}
      <div className="grid gap-2 -mx-4 sm:mx-0">
        {filteredPlayers.map((player) => (
          <div key={player.id} onClick={() => router.push(`/jugadores/${player.id}`)} className="cursor-pointer">
            <Card className="!bg-white hover:shadow-md transition-all border-slate-200 hover:border-emerald-500 rounded-none sm:rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-2.5 sm:p-3">
                {player.photo ? (
                  <img
                    src={player.photo}
                    alt={player.short_name || ''}
                    className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-400 border border-slate-200 shrink-0">
                    {player.shirt_number || '?'}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold !text-slate-900 truncate">{player.short_name || `${player.first_name} ${player.last_name}`}</h3>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${getPositionColor(player.position)}`}>
                      {getPositionLabel(player.position)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {player.team?.logo_url && (
                      <img src={player.team.logo_url} alt={player.team.name || ''} className="w-4 h-4 object-contain shrink-0" />
                    )}
                    <p className="text-xs !text-slate-500 truncate">{player.team?.name || 'Sin equipo'}</p>
                    {player.shirt_number && (
                      <span className="text-xs font-bold !text-slate-400 shrink-0">#{player.shirt_number}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                  <div className="text-center">
                    <span className="block text-sm font-bold !text-emerald-600 leading-none">
                      {player.precio ? `${player.precio}M` : '-'}
                    </span>
                    <p className="text-[10px] !text-slate-400 mt-0.5">Precio</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-0.5 !text-emerald-600 leading-none">
                      <TrendingUp className="h-3 w-3" />
                      <span className="text-sm font-bold">
                        {player.stats ? Math.round(player.stats.total_points * 10) / 10 : 0}
                      </span>
                    </div>
                    <p className="text-[10px] !text-slate-400 mt-0.5">Puntos</p>
                  </div>
                  <div className="hidden sm:block text-center">
                    <div className="flex items-center justify-center gap-0.5 !text-slate-700 leading-none">
                      <Goal className="h-3 w-3" />
                      <span className="text-sm font-semibold">{player.stats?.goals || 0}</span>
                    </div>
                    <p className="text-[10px] !text-slate-400 mt-0.5">Goles</p>
                  </div>
                  <div className="hidden sm:block text-center">
                    <div className="flex items-center justify-center gap-0.5 !text-slate-700 leading-none">
                      <span className="text-[11px]">🅰️</span>
                      <span className="text-sm font-semibold">{player.stats?.assists || 0}</span>
                    </div>
                    <p className="text-[10px] !text-slate-400 mt-0.5">Asist.</p>
                  </div>
                  <div className="hidden sm:block text-center">
                    <div className="flex items-center justify-center gap-0.5 !text-amber-600 leading-none">
                      <Ticket className="h-3 w-3" />
                      <span className="text-sm font-semibold">{player.stats?.yellow_cards || 0}</span>
                    </div>
                    <p className="text-[10px] !text-slate-400 mt-0.5">Amarillas</p>
                  </div>
                  <div className="hidden md:block text-center min-w-[52px]">
                    <span className="block text-sm font-semibold !text-slate-700 leading-none">
                      {player.stats?.matches_played || 0}
                    </span>
                    <p className="text-[10px] !text-slate-400 mt-0.5">
                      {player.stats?.avg_points || 0} pts/pj
                    </p>
                  </div>
                </div>
              </div>
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
