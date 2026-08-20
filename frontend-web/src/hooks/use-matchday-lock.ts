import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeOutOfOrderLocks, type FixtureLite, type OutOfOrderLock } from '@/lib/locked-teams-core'

let lastLogKey = ''

/**
 * Un fixture tal y como lo consulta este hook. `FixtureLite` (compartido con
 * locked-teams-core) no lleva `momento`, y aquí sí hace falta para agrupar las
 * jornadas especiales.
 */
type FixtureWithMomento = FixtureLite & { momento: string | null }

interface MatchdayLockState {
  isLocked: boolean
  isUnlockWindowOpen: boolean
  unlockTime: Date | null
  lockTime: Date | null
  timeUntilUnlock: string
  timeUntilLock: string
  currentMatchday: number
  currentMomento: string | null
  upcomingLocks: OutOfOrderLock[]
}

export function useMatchdayLock(currentMatchday?: number): MatchdayLockState {
  const [state, setState] = useState<MatchdayLockState>({
    isLocked: true,
    isUnlockWindowOpen: false,
    unlockTime: null,
    lockTime: null,
    timeUntilUnlock: '',
    timeUntilLock: '',
    currentMatchday: 0,
    currentMomento: null,
    upcomingLocks: [],
  })

  useEffect(() => {
    let cancelled = false

    // El calendario y la configuración cambian como mucho una vez al día, pero
    // la cuenta atrás tiene que refrescarse cada segundo. Separamos las dos
    // cosas: la BD se consulta cada minuto y se cachea aquí, y el reloj se
    // recalcula en memoria sobre esa caché. Antes se repetían las dos consultas
    // (la de fixtures son >100 KB con los joins) una vez por segundo y por cada
    // sitio que monta el hook, lo que ahogaba la carga inicial de la página.
    let cache: {
      fixtures: FixtureWithMomento[]
      unlockOffsetMs: number
      lockOffsetMs: number
      fantasyStart: number
    } | null = null

    const fetchMatchdayData = async () => {
      const supabase = createClient()

      // Offsets configurables (Admin → Reglas del Juego): cuándo empieza la
      // jornada (cierra el mercado) y cuándo se considera cerrada.
      let unlockOffsetMs = 60 * 60 * 1000      // 1h antes del primer partido
      let lockOffsetMs = 2 * 60 * 60 * 1000    // 2h después del último partido
      let fantasyStart = 1                     // jornada en la que arranca el juego
      const { data: cfg } = await supabase
        .from('league_config')
        .select('matchday_start_hours_before, matchday_end_hours_after, fantasy_starting_matchday')
        .eq('id', 1)
        .maybeSingle()
      if (cfg) {
        if (cfg.matchday_start_hours_before != null) unlockOffsetMs = Number(cfg.matchday_start_hours_before) * 60 * 60 * 1000
        if (cfg.matchday_end_hours_after != null) lockOffsetMs = Number(cfg.matchday_end_hours_after) * 60 * 60 * 1000
        if (cfg.fantasy_starting_matchday != null) fantasyStart = Number(cfg.fantasy_starting_matchday)
      }

      // Obtener todos los fixtures ordenados por fecha
      const { data: allFixtures } = await supabase
        .from('fixtures')
        .select('id, matchday, momento, start_time, status, home_team_id, away_team_id, home_team:real_teams!home_team_id(name), away_team:real_teams!away_team_id(name)')
        .order('start_time', { ascending: true })

      if (cancelled) return

      if (!allFixtures || allFixtures.length === 0) {
        cache = null
        setState(s => ({ ...s, isLocked: true, isUnlockWindowOpen: false }))
        return
      }

      cache = {
        fixtures: allFixtures as unknown as FixtureWithMomento[],
        unlockOffsetMs,
        lockOffsetMs,
        fantasyStart,
      }
      recomputeState()
    }

    // Recalcula el estado a partir de la caché. No toca la red.
    const recomputeState = () => {
      if (cancelled || !cache) return
      const { fixtures: allFixtures, unlockOffsetMs, lockOffsetMs, fantasyStart } = cache

      const outOfOrderLocks = computeOutOfOrderLocks(allFixtures as FixtureLite[], {
        startHoursBefore: unlockOffsetMs / (60 * 60 * 1000),
        endHoursAfter: lockOffsetMs / (60 * 60 * 1000)
      })
      const outOfOrderIds = new Set(outOfOrderLocks.map(l => l.fixtureId))
      const VOID_STATUSES = new Set(['cancelled', 'postponed'])

      // Usamos todos los fixtures que no estén cancelados
      const validFixtures = allFixtures.filter(f => {
        if (f.status && VOID_STATUSES.has(f.status.toLowerCase())) return false
        return true
      })

      // Calcular el matchday numérico máximo
      const numericMatchdays = validFixtures
        .filter(f => f.matchday && f.matchday > 0)
        .map(f => f.matchday as number)
      const maxNumericMatchday = numericMatchdays.length > 0 ? Math.max(...numericMatchdays) : 0

      // Crear lista de "jornadas" unificadas: numèriques + moments especials
      // Cada jornada té: matchday (number), momento (string | null), start_time
      const jornadasMap = new Map<string, { matchday: number; momento: string | null; start_time: string; fixtures: typeof validFixtures }>()

      for (const fixture of validFixtures) {
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

      // El juego puede arrancar más tarde que LaLiga (Admin → Reglas del Juego).
      // Mientras no se llegue a esa jornada, el reloj y la cabecera apuntan a
      // ella: el mercado sigue abierto y la cuenta atrás marca cuándo empieza
      // de verdad, no la próxima jornada de LaLiga que se juegue.
      if (!currentMatchday && targetMatchday < fantasyStart) {
        const startJornada = allJornadas.find(j => j.matchday === fantasyStart)
        if (startJornada) {
          targetMatchday = startJornada.matchday
          targetMomento = startJornada.momento || null
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

      interface LockBlock { start: number; end: number }
      const blocks: LockBlock[] = []
      
      // Añadir los bloques regulares de TODAS las jornadas
      // Esto hace que si la Jornada 1 y la Jornada 2 se solapan (o una engloba a la otra),
      // el mercado global no se abra hasta que terminen AMBAS.
      for (const jornada of allJornadas) {
        const regularFixtures = jornada.fixtures.filter(f => !outOfOrderIds.has(f.id))
        if (regularFixtures.length > 0) {
          const sorted = regularFixtures.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
          blocks.push({
            start: new Date(sorted[0].start_time).getTime() - unlockOffsetMs,
            end: new Date(sorted[sorted.length - 1].start_time).getTime() + lockOffsetMs
          })
        }
      }
      
      // Añadir partidos out-of-order de la jornada actual que estamos viendo
      const oooFixtures = fixtures.filter(f => outOfOrderIds.has(f.id))
      for (const f of oooFixtures) {
        blocks.push({
          start: new Date(f.start_time).getTime() - unlockOffsetMs,
          end: new Date(f.start_time).getTime() + lockOffsetMs
        })
      }
      
      blocks.sort((a, b) => a.start - b.start)
      const mergedBlocks: LockBlock[] = []
      if (blocks.length > 0) {
         let current = blocks[0]
         for (let i = 1; i < blocks.length; i++) {
            if (blocks[i].start <= current.end) {
               current.end = Math.max(current.end, blocks[i].end)
            } else {
               mergedBlocks.push(current)
               current = blocks[i]
            }
         }
         mergedBlocks.push(current)
      }

      let isUnlockWindowOpen = false
      let unlockTimeDate = new Date(mergedBlocks[0].start)
      let lockTimeDate = new Date(mergedBlocks[mergedBlocks.length - 1].end)
      let nextBlockIndex = -1

      for (let i = 0; i < mergedBlocks.length; i++) {
         const b = mergedBlocks[i]
         if (now.getTime() >= b.start && now.getTime() <= b.end) {
            isUnlockWindowOpen = true
            unlockTimeDate = new Date(b.start) // Cuando empezó el bloqueo actual
            lockTimeDate = new Date(b.end)     // Cuando terminará este bloqueo
            break
         }
         if (now.getTime() < b.start && nextBlockIndex === -1) {
            nextBlockIndex = i
         }
      }

      if (!isUnlockWindowOpen) {
         if (nextBlockIndex !== -1) {
            // Hueco ANTES de un bloqueo
            unlockTimeDate = new Date(mergedBlocks[nextBlockIndex].start)
            lockTimeDate = new Date(mergedBlocks[nextBlockIndex].end)
         } else {
            // Ya pasaron todos los bloqueos
            unlockTimeDate = new Date(mergedBlocks[mergedBlocks.length - 1].start)
            lockTimeDate = new Date(mergedBlocks[mergedBlocks.length - 1].end)
         }
      }

      const isLocked = !isUnlockWindowOpen

      // Se recalcula cada segundo, así que solo se traza cuando algo cambia:
      // si no, la consola se llena de la misma línea repetida.
      const logKey = `${targetMatchday}|${targetMomento}|${isUnlockWindowOpen}`
      if (logKey !== lastLogKey) {
        lastLogKey = logKey
        console.log('[useMatchdayLock] Jornada:', targetMatchday)
        console.log('[useMatchdayLock] Momento:', targetMomento)
        console.log('[useMatchdayLock] Ahora:', now.toISOString())
        console.log('[useMatchdayLock] unlockTime:', unlockTimeDate.toISOString())
        console.log('[useMatchdayLock] lockTime:', lockTimeDate.toISOString())
        console.log('[useMatchdayLock] isUnlockWindowOpen:', isUnlockWindowOpen)
      }

      let timeUntilUnlock = ''
      let timeUntilLock = ''

      if (now.getTime() < unlockTimeDate.getTime()) {
        const diffMs = unlockTimeDate.getTime() - now.getTime()
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
        timeUntilUnlock = `${diffHours}h ${diffMins}min`
      } else if (now.getTime() > mergedBlocks[mergedBlocks.length - 1].end) {
        timeUntilLock = 'Finalizada'
      } else if (isUnlockWindowOpen) {
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
        upcomingLocks: outOfOrderLocks.filter(l => l.until.getTime() > now.getTime()),
      })
    }

    fetchMatchdayData()

    // La cuenta atrás sigue avanzando cada segundo, pero sobre la caché.
    const tickInterval = setInterval(recomputeState, 1000)
    // El calendario y la config se releen cada minuto (por si el admin cambia
    // los offsets o entra un partido aplazado mientras la página está abierta).
    const dataInterval = setInterval(fetchMatchdayData, 60 * 1000)

    return () => {
      cancelled = true
      clearInterval(tickInterval)
      clearInterval(dataInterval)
    }
  }, [currentMatchday])

  return state
}
