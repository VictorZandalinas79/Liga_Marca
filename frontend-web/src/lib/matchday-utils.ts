import { createClient } from '@/lib/supabase/client'

export interface LogicalMatchday {
  matchday: number // Número lògic (43, 44, 45...)
  momento: string // Nom del moment
  start_time: string
  isMomento: true
}

export interface NumericMatchday {
  matchday: number
  isMomento: false
}

export type MatchdayType = LogicalMatchday | NumericMatchday

/**
 * Obtenir tots els matchdays disponibles (numèrics + moments especials)
 * amb numeració correlativa
 */
export async function getAllMatchdays(): Promise<MatchdayType[]> {
  const supabase = createClient()

  // 1. Obtener todos los fixtures
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('matchday, momento, start_time')
    .order('start_time', { ascending: true })

  if (!fixtures || fixtures.length === 0) {
    return []
  }

  // 2. Calcular el máximo matchday numérico
  const numericMatchdays = fixtures
    .filter(f => f.matchday && f.matchday > 0)
    .map(f => f.matchday as number)
  const maxNumericMatchday = numericMatchdays.length > 0 ? Math.max(...numericMatchdays) : 0

  // 3. Agrupar fixtures por matchday (numéricos) y por momento (especiales)
  const matchdaysMap = new Map<number | string, { matchday: number | string; momento: string | null; start_time: string; fixtures: typeof fixtures }>()

  for (const fixture of fixtures) {
    let key: string | number
    let logicalMatchday: number | string

    if (fixture.matchday && fixture.matchday > 0) {
      // Jornada numérica: usar el mismo número
      key = fixture.matchday
      logicalMatchday = fixture.matchday
    } else {
      // Momento especial (matchday = 0): agrupar por nombre de momento
      const momentoName = fixture.momento || 'Unknown'
      key = `momento-${momentoName}`
      logicalMatchday = momentoName
    }

    if (!matchdaysMap.has(key)) {
      matchdaysMap.set(key, {
        matchday: logicalMatchday,
        momento: fixture.momento || null,
        start_time: fixture.start_time,
        fixtures: []
      })
    }
    matchdaysMap.get(key)!.fixtures.push(fixture)
  }

  // 4. Convertir a array y calcular fechas mínimas
  const matchdays: MatchdayType[] = Array.from(matchdaysMap.values()).map(m => {
    const minDate = m.fixtures.length > 0
      ? m.fixtures.reduce((min, f) => f.start_time < min ? f.start_time : min, m.fixtures[0].start_time)
      : m.start_time

    if (typeof m.matchday === 'number' && m.matchday > 0) {
      // Numérico
      return {
        matchday: m.matchday,
        isMomento: false as const
      }
    } else {
      // Momento especial: calcular número correlativo
      const momentoName = m.momento || 'Unknown'
      return {
        matchday: maxNumericMatchday + 1, // Se asignará después al ordenar
        momento: momentoName,
        start_time: minDate,
        isMomento: true as const
      }
    }
  })

  // 5. Ordenar: primero numéricos (por número), luego momentos (por fecha)
  const numeric = matchdays.filter(m => !m.isMomento).sort((a, b) => a.matchday - b.matchday)
  const moments = matchdays
    .filter(m => m.isMomento)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  // 6. Asignar números correlativos a los momentos
  const momentsWithNumbers: LogicalMatchday[] = moments.map((m, index) => ({
    ...m,
    matchday: maxNumericMatchday + 1 + index
  }))

  return [...numeric, ...momentsWithNumbers]
}

/**
 * Obtener el próximo matchday lógico (futuro)
 */
export async function getNextMatchday(): Promise<MatchdayType | null> {
  const allMatchdays = await getAllMatchdays()
  const now = new Date()

  for (const md of allMatchdays) {
    if (md.isMomento) {
      if (new Date(md.start_time) > now) {
        return md
      }
    } else {
      // Para matchdays numéricos, verificar si hay fixtures futuros
      const supabase = createClient()
      const { data: fixture } = await supabase
        .from('fixtures')
        .select('start_time')
        .eq('matchday', md.matchday)
        .gte('start_time', now.toISOString())
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (fixture) {
        return md
      }
    }
  }

  // Si no hay futuro, devolver el último disponible
  return allMatchdays.length > 0 ? allMatchdays[allMatchdays.length - 1] : null
}

/**
 * Obtener el número de matchday lógico para un momento específico
 */
export async function getLogicalMatchdayForMomento(momento: string): Promise<number> {
  const allMatchdays = await getAllMatchdays()
  const momentoMatchday = allMatchdays.find(m => m.isMomento && m.momento === momento)
  return momentoMatchday?.matchday || 0
}
