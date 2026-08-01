import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://hjzdbnjdgludsaqbcrfl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemRibmpkZ2x1ZHNhcWJjcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjQ2OTMsImV4cCI6MjA5NDk0MDY5M30.Jt7C-95GCjBaRCZLUU5yHCwafZEx2zA0tdw7j1UTPJ0');

async function run() {
      let unlockOffsetMs = 60 * 60 * 1000      
      let lockOffsetMs = 2 * 60 * 60 * 1000    
      let fantasyStart = 1                     

      const { data: allFixtures } = await supabase
        .from('fixtures')
        .select('matchday, momento, start_time')
        .order('start_time', { ascending: true })

      const numericMatchdays = allFixtures
        .filter(f => f.matchday && f.matchday > 0)
        .map(f => f.matchday)
      const maxNumericMatchday = numericMatchdays.length > 0 ? Math.max(...numericMatchdays) : 0

      const jornadasMap = new Map()

      for (const fixture of allFixtures) {
        let key, logicalMatchday
        if (fixture.matchday && fixture.matchday > 0) {
          key = `md-${fixture.matchday}`
          logicalMatchday = fixture.matchday
        } else {
          const momentoName = fixture.momento || 'Unknown'
          key = `momento-${momentoName}`
          logicalMatchday = 0 
        }

        if (!jornadasMap.has(key)) {
          jornadasMap.set(key, {
            matchday: logicalMatchday,
            momento: fixture.momento,
            start_time: fixture.start_time,
            fixtures: []
          })
        }
        jornadasMap.get(key).fixtures.push(fixture)
      }

      const jornadas = Array.from(jornadasMap.values()).map(j => ({
        ...j,
        start_time: j.fixtures.length > 0
          ? j.fixtures.reduce((min, f) => f.start_time < min ? f.start_time : min, j.fixtures[0].start_time)
          : j.start_time
      }))

      const numericJornadas = jornadas.filter(j => j.matchday > 0).sort((a, b) => a.matchday - b.matchday)
      const momentJornadas = jornadas
        .filter(j => j.matchday === 0)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

      const momentJornadasWithNumbers = momentJornadas.map((j, index) => ({
        ...j,
        matchday: maxNumericMatchday + 1 + index
      }))

      const allJornadas = [...numericJornadas, ...momentJornadasWithNumbers]

      const now = new Date()
      let targetMatchday = 1
      let targetMomento = null

        let activeJornada = null
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
          let nextJornada = null
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
            const lastJornada = allJornadas[allJornadas.length - 1]
            targetMatchday = lastJornada.matchday
            targetMomento = lastJornada.momento || null
          }
        }

      const targetJornada = allJornadas.find(j => j.matchday === targetMatchday)
      const fixtures = targetJornada.fixtures.sort((a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
      const firstMatchTime = new Date(fixtures[0].start_time)
      const lastMatchTime = new Date(fixtures[fixtures.length - 1].start_time)
      const unlockTimeDate = new Date(firstMatchTime.getTime() - unlockOffsetMs)
      const lockTimeDate = new Date(lastMatchTime.getTime() + lockOffsetMs)

      const isUnlockWindowOpen = now.getTime() >= unlockTimeDate.getTime() && now.getTime() <= lockTimeDate.getTime()
      
      console.log({ targetMatchday, isUnlockWindowOpen, now, unlockTimeDate, lockTimeDate })
}
run();
