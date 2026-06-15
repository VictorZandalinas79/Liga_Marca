import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface MatchdayLockState {
  isLocked: boolean
  isUnlockWindowOpen: boolean
  unlockTime: Date | null
  lockTime: Date | null
  timeUntilUnlock: string
  timeUntilLock: string
  currentMatchday: number
  currentMomento: string | null
}

export function useMatchdayLock(currentMatchday?: number): MatchdayLockState {
  const [state, setState] = useState<MatchdayLockState>({
    isLocked: true,
    isUnlockWindowOpen: false,
    unlockTime: null,
    lockTime: null,
    timeUntilUnlock: '',
    timeUntilLock: '',
    currentMatchday: 1,
    currentMomento: null,
  })

  useEffect(() => {
    const fetchMatchdayTimes = async () => {
      const supabase = createClient()

      // Offsets configurables (Admin → Reglas del Juego): cuándo empieza la
      // jornada (cierra el mercado) y cuándo se considera cerrada.
      let unlockOffsetMs = 60 * 60 * 1000      // 1h antes del primer partido
      let lockOffsetMs = 2 * 60 * 60 * 1000    // 2h después del último partido
      const { data: cfg } = await supabase
        .from('league_config')
        .select('matchday_start_hours_before, matchday_end_hours_after')
        .eq('id', 1)
        .maybeSingle()
      if (cfg) {
        if (cfg.matchday_start_hours_before != null) unlockOffsetMs = Number(cfg.matchday_start_hours_before) * 60 * 60 * 1000
        if (cfg.matchday_end_hours_after != null) lockOffsetMs = Number(cfg.matchday_end_hours_after) * 60 * 60 * 1000
      }

      // Obtener todos los fixtures ordenados por fecha
      const { data: allFixtures } = await supabase
        .from('fixtures')
        .select('matchday, momento, start_time')
        .order('start_time', { ascending: true })

      if (!allFixtures || allFixtures.length === 0) {
        setState(s => ({ ...s, isLocked: true, isUnlockWindowOpen: false }))
        return
      }

      // Calcular el matchday numérico máximo
      const numericMatchdays = allFixtures
        .filter(f => f.matchday && f.matchday > 0)
        .map(f => f.matchday as number)
      const maxNumericMatchday = numericMatchdays.length > 0 ? Math.max(...numericMatchdays) : 0

      // Crear lista de "jornadas" unificadas: numèriques + moments especials
      // Cada jornada té: matchday (number), momento (string | null), start_time
      const jornadasMap = new Map<string, { matchday: number; momento: string | null; start_time: string; fixtures: typeof allFixtures }>()

      for (const fixture of allFixtures) {
        let key: string
        let logicalMatchday: number

        if (fixture.matchday && fixture.matchday > 0) {
          // Jornada numèrica: usar el mateix número
          key = `md-${fixture.matchday}`
          logicalMatchday = fixture.matchday
        } else {
          // Moment especial (matchday = 0): agrupar per nom de momento
          const momentoName = fixture.momento || 'Unknown'
          key = `momento-${momentoName}`
          // El número lògic es calcularà després
          logicalMatchday = 0 // Placeholder
        }

        if (!jornadasMap.has(key)) {
          const momentoName = fixture.momento || 'Unknown'
          jornadasMap.set(key, {
            matchday: logicalMatchday,
            momento: fixture.momento,
            start_time: fixture.start_time,
            fixtures: []
          })
        }
        jornadasMap.get(key)!.fixtures.push(fixture)
      }

      // Convertir a array i calcular dates mínimes
      const jornadas = Array.from(jornadasMap.values()).map(j => ({
        ...j,
        start_time: j.fixtures.length > 0
          ? j.fixtures.reduce((min, f) => f.start_time < min ? f.start_time : min, j.fixtures[0].start_time)
          : j.start_time
      }))

      // Separar numèriques i moments
      const numericJornadas = jornadas.filter(j => j.matchday > 0).sort((a, b) => a.matchday - b.matchday)
      const momentJornadas = jornadas
        .filter(j => j.matchday === 0)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

      // Assignar números correlatius als moments: maxNumeric + 1, maxNumeric + 2, ...
      const momentJornadasWithNumbers = momentJornadas.map((j, index) => ({
        ...j,
        matchday: maxNumericMatchday + 1 + index
      }))

      // Unir: primer numèriques, després moments
      const allJornadas = [...numericJornadas, ...momentJornadasWithNumbers]

      if (allJornadas.length === 0) {
        setState(s => ({ ...s, isLocked: true, isUnlockWindowOpen: false }))
        return
      }

      const now = new Date()
      let targetMatchday: number = 1
      let targetMomento: string | null = null

      if (currentMatchday) {
        targetMatchday = typeof currentMatchday === 'string' ? parseInt(currentMatchday) : currentMatchday
      } else {
        // Buscar jornada activa (dins de la finestra de temps)
        let activeJornada: typeof allJornadas[0] | null = null

        for (const jornada of allJornadas) {
          const fixtures = jornada.fixtures.sort((a, b) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          )

          const firstMatchTime = new Date(fixtures[0].start_time)
          const lastMatchTime = new Date(fixtures[fixtures.length - 1].start_time)
          const unlockTime = firstMatchTime.getTime() - unlockOffsetMs
          const lockTime = lastMatchTime.getTime() + lockOffsetMs

          if (now.getTime() >= unlockTime && now.getTime() <= lockTime) {
            activeJornada = jornada
            break
          }
        }

        if (activeJornada) {
          targetMatchday = activeJornada.matchday
          targetMomento = activeJornada.momento || null
        } else {
          // Buscar la PRÒXIMA jornada (la primera amb unlockTime > now)
          let nextJornada: typeof allJornadas[0] | null = null

          for (const jornada of allJornadas) {
            const fixtures = jornada.fixtures.sort((a, b) =>
              new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
            )

            const firstMatchTime = new Date(fixtures[0].start_time)
            const unlockTime = firstMatchTime.getTime() - unlockOffsetMs

            if (unlockTime > now.getTime()) {
              nextJornada = jornada
              break
            }
          }

          if (nextJornada) {
            targetMatchday = nextJornada.matchday
            targetMomento = nextJornada.momento || null
          } else {
            // Usar l'última jornada disponible
            const lastJornada = allJornadas[allJornadas.length - 1]
            targetMatchday = lastJornada.matchday
            targetMomento = lastJornada.momento || null
          }
        }
      }

      // Trobar la jornada objectiu per obtindre els fixtures
      const targetJornada = allJornadas.find(j => j.matchday === targetMatchday)

      if (!targetJornada || targetJornada.fixtures.length === 0) {
        setState(s => ({ ...s, isLocked: true, isUnlockWindowOpen: false }))
        return
      }

      const fixtures = targetJornada.fixtures.sort((a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )

      const firstMatchTime = new Date(fixtures[0].start_time)
      const lastMatchTime = new Date(fixtures[fixtures.length - 1].start_time)

      const unlockTimeDate = new Date(firstMatchTime.getTime() - unlockOffsetMs)
      const lockTimeDate = new Date(lastMatchTime.getTime() + lockOffsetMs)

      const isUnlockWindowOpen = now.getTime() >= unlockTimeDate.getTime() && now.getTime() <= lockTimeDate.getTime()
      const isLocked = !isUnlockWindowOpen

      console.log('[useMatchdayLock] Jornada:', targetMatchday)
      console.log('[useMatchdayLock] Momento:', targetMomento)
      console.log('[useMatchdayLock] Ahora:', now.toISOString())
      console.log('[useMatchdayLock] unlockTime:', unlockTimeDate.toISOString())
      console.log('[useMatchdayLock] lockTime:', lockTimeDate.toISOString())
      console.log('[useMatchdayLock] isUnlockWindowOpen:', isUnlockWindowOpen)

      let timeUntilUnlock = ''
      let timeUntilLock = ''

      if (now.getTime() < unlockTimeDate.getTime()) {
        const diffMs = unlockTimeDate.getTime() - now.getTime()
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        timeUntilUnlock = `${diffHours}h ${diffMins}min`
      } else if (now.getTime() > lockTimeDate.getTime()) {
        timeUntilLock = 'Finalizada'
      } else {
        const diffMs = lockTimeDate.getTime() - now.getTime()
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        timeUntilLock = `${diffHours}h ${diffMins}min`
      }

      const shouldShowMomento = targetMomento !== null

      setState({
        isLocked,
        isUnlockWindowOpen,
        unlockTime: unlockTimeDate,
        lockTime: lockTimeDate,
        timeUntilUnlock,
        timeUntilLock,
        currentMatchday: targetMatchday,
        currentMomento: shouldShowMomento ? targetMomento : null,
      })
    }

    fetchMatchdayTimes()

    const interval = setInterval(fetchMatchdayTimes, 60 * 1000)
    return () => clearInterval(interval)
  }, [currentMatchday])

  return state
}
