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
  })

  useEffect(() => {
    const fetchMatchdayTimes = async () => {
      const supabase = createClient()

      // Obtener todos los fixtures ordenados por fecha
      const { data: allFixtures } = await supabase
        .from('fixtures')
        .select('matchday, start_time')
        .order('start_time', { ascending: true })

      if (!allFixtures || allFixtures.length === 0) {
        setState(s => ({ ...s, isLocked: true, isUnlockWindowOpen: false }))
        return
      }

      // Encontrar la jornada activa (la que contiene hoy en su ventana)
      const now = new Date()
      let targetMatchday: number

      if (currentMatchday) {
        targetMatchday = currentMatchday
      } else {
        // Agrupar fixtures por jornada
        const matchdayFixtures = new Map<number, typeof allFixtures>()
        for (const fixture of allFixtures) {
          if (!matchdayFixtures.has(fixture.matchday)) {
            matchdayFixtures.set(fixture.matchday, [])
          }
          matchdayFixtures.get(fixture.matchday)!.push(fixture)
        }

        // Buscar la jornada cuya ventana (unlock-lock) contenga el momento actual
        let activeMatchday: number | null = null
        for (const [matchday, fixtures] of matchdayFixtures.entries()) {
          const firstMatchTime = new Date(fixtures[0].start_time)
          const lastMatchTime = new Date(fixtures[fixtures.length - 1].start_time)
          const unlockTime = firstMatchTime.getTime() - 60 * 60 * 1000 // 1h antes
          const lockTime = lastMatchTime.getTime() + 2 * 60 * 60 * 1000 // 2h después

          if (now.getTime() >= unlockTime && now.getTime() <= lockTime) {
            activeMatchday = matchday
            break
          }
        }

        // Si no hay jornada activa, usar la última jornada
        targetMatchday = activeMatchday || Math.max(...matchdayFixtures.keys())
      }

      // Filtrar fixtures de la jornada objetivo
      const journeyFixtures = allFixtures.filter(f => f.matchday === targetMatchday)

      if (journeyFixtures.length === 0) {
        setState(s => ({ ...s, isLocked: true, isUnlockWindowOpen: false }))
        return
      }

      const firstMatchTime = new Date(journeyFixtures[0].start_time)
      const lastMatchTime = new Date(journeyFixtures[journeyFixtures.length - 1].start_time)

      // El tramo de jornada abre 1 hora antes del primer partido
      // y cierra al finalizar el último partido (asumimos 2h de partido)
      const unlockTimeDate = new Date(firstMatchTime.getTime() - 60 * 60 * 1000)
      const lockTimeDate = new Date(lastMatchTime.getTime() + 2 * 60 * 60 * 1000)

      // Determinar estado
      const isUnlockWindowOpen = now.getTime() >= unlockTimeDate.getTime() && now.getTime() <= lockTimeDate.getTime()
      const isLocked = !isUnlockWindowOpen

      // Debug log
      console.log('[useMatchdayLock] Jornada:', targetMatchday)
      console.log('[useMatchdayLock] Ahora:', now.toISOString())
      console.log('[useMatchdayLock] unlockTime:', unlockTimeDate.toISOString())
      console.log('[useMatchdayLock] lockTime:', lockTimeDate.toISOString())
      console.log('[useMatchdayLock] isUnlockWindowOpen:', isUnlockWindowOpen)

      // Calcular tiempos restantes
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

      setState({
        isLocked,
        isUnlockWindowOpen,
        unlockTime: unlockTimeDate,
        lockTime: lockTimeDate,
        timeUntilUnlock,
        timeUntilLock,
        currentMatchday: targetMatchday,
      })
    }

    fetchMatchdayTimes()

    // Actualizar cada minuto
    const interval = setInterval(fetchMatchdayTimes, 60 * 1000)
    return () => clearInterval(interval)
  }, [currentMatchday])

  return state
}
