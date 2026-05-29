'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, MapPin, Trophy, Play } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Fixture {
  id: string
  matchday: number
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
}

export default function PartidosPage() {
  const [loading, setLoading] = useState(true)
  const [currentMatchday, setCurrentMatchday] = useState<number>(1)
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const fetchPartidos = async () => {
      // 1. Obtener todos los fixtures para encontrar la jornada más cercana
      const { data: allFixtures } = await supabase
        .from('fixtures')
        .select('matchday, start_time')
        .order('start_time', { ascending: true })

      if (!allFixtures || allFixtures.length === 0) {
        setLoading(false)
        return
      }

      // 2. Encontrar la jornada con el primer partido más cercano a hoy
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Agrupar por jornada y encontrar la primera fecha de cada una
      const matchdayFirstDate = new Map<number, Date>()
      for (const fixture of allFixtures) {
        if (!matchdayFirstDate.has(fixture.matchday)) {
          matchdayFirstDate.set(fixture.matchday, new Date(fixture.start_time))
        }
      }

      // Encontrar la jornada cuya primera fecha sea >= hoy y más cercana
      let closestMatchday = 1
      let minDiff = Infinity

      for (const [matchday, firstDate] of matchdayFirstDate.entries()) {
        const diff = firstDate.getTime() - today.getTime()
        if (diff >= 0 && diff < minDiff) {
          minDiff = diff
          closestMatchday = matchday
        }
      }

      // Si todas las jornadas son pasadas, usar la última
      if (minDiff === Infinity) {
        closestMatchday = Math.max(...matchdayFirstDate.keys())
      }

      setCurrentMatchday(closestMatchday)

      // 3. Obtener fixtures de la jornada seleccionada
      const { data: fixturesData } = await supabase
        .from('fixtures')
        .select('*')
        .eq('matchday', closestMatchday)
        .order('start_time', { ascending: true })

      if (!fixturesData) {
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

      // 5. Combinar datos
      const fixturesWithTeams = fixturesData.map(f => ({
        ...f,
        home_team: f.home_team_id ? {
          name: teamsMap.get(f.home_team_id)?.name || 'Local',
          logo_url: teamsMap.get(f.home_team_id)?.logo_url || undefined
        } : null,
        away_team: f.away_team_id ? {
          name: teamsMap.get(f.away_team_id)?.name || 'Visitante',
          logo_url: teamsMap.get(f.away_team_id)?.logo_url || undefined
        } : null
      }))

      setFixtures(fixturesWithTeams)
      setLoading(false)
    }

    fetchPartidos()
  }, [])

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

    if (diffMins < 0) return null // Ya empezado
    if (diffMins < 60) return `${diffMins} min`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60} min`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ${diffHours % 24}h`
  }

  const getStatusBadge = (status?: string, startTime?: string) => {
    if (status === 'live') return <Badge className="bg-red-500 text-white text-xs">En Juego</Badge>
    if (status === 'finished') return <Badge className="bg-emerald-500 text-white text-xs">Finalizado</Badge>
    if (status === 'postponed') return <Badge className="bg-amber-500 text-white text-xs">Pospuesto</Badge>

    if (startTime) {
      const timeUntil = getTimeUntilMatch(startTime)
      if (timeUntil === null) return <Badge className="bg-emerald-500 text-white text-xs">Comenzado</Badge>
      if (timeUntil.includes('min') && parseInt(timeUntil) <= 2) {
        return <Badge className="bg-green-500 text-white text-xs animate-pulse">Empieza en {timeUntil}</Badge>
      }
    }

    return <Badge className="bg-slate-500 text-white text-xs">Programado</Badge>
  }

  const handleMatchClick = (fixture: Fixture) => {
    router.push(`/partidos/${fixture.id}`)
  }

  // Agrupar partidos por fecha
  const fixturesByDate = fixtures.reduce((acc, fixture) => {
    const date = fixture.start_time.split('T')[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(fixture)
    return acc
  }, {} as Record<string, Fixture[]>)

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Cargando jornada...</div>
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Partidos</h1>
          <p className="text-slate-600 mt-1">Jornada {currentMatchday}</p>
        </div>
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-emerald-600" />
          <span className="text-sm font-medium text-slate-600">
            {fixtures.length} partidos
          </span>
        </div>
      </div>

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
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="w-full h-full" onClick={() => handleMatchClick(fixture)}>
                      {/* Estado y hora */}
                      <div className="flex items-center justify-between mb-4">
                        {getStatusBadge(fixture.status, fixture.start_time)}
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
