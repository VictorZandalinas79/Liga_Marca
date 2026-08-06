const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({path: '.env'})

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function test() {
  const { data: fixtures } = await supabase.from('fixtures').select('id, matchday, start_time, status, home_team_id, away_team_id').order('start_time')
  const numeric = fixtures.filter(f => f.matchday && f.matchday > 0 && f.start_time && f.home_team_id && f.away_team_id)
  
  const byMatchday = new Map()
  for (const f of numeric) {
    if (!byMatchday.has(f.matchday)) byMatchday.set(f.matchday, [])
    byMatchday.get(f.matchday).push(f)
  }
  
  const repTime = new Map()
  for (const [md, fs] of byMatchday) {
    const times = fs.map(f => new Date(f.start_time).getTime()).sort((a, b) => a - b)
    repTime.set(md, times[Math.floor(times.length / 2)])
  }
  
  const chronoOrder = [...byMatchday.keys()].sort((a, b) => repTime.get(a) - repTime.get(b))
  console.log("RepTimes:", [...repTime.entries()].map(([k,v]) => [k, new Date(v).toISOString()]))
  
  const slotFor = (t) => {
    for (let i = 0; i < chronoOrder.length; i++) {
      const cur = chronoOrder[i]
      const next = chronoOrder[i + 1]
      if (next === undefined) return cur
      const boundary = (repTime.get(cur) + repTime.get(next)) / 2
      if (t <= boundary) return cur
    }
    return chronoOrder[chronoOrder.length - 1]
  }

  const locks = []
  for (const f of numeric) {
    const ownMatchday = f.matchday
    const t = new Date(f.start_time).getTime()
    const playedSlot = slotFor(t)
    if (playedSlot !== ownMatchday) {
      locks.push({
        fixtureId: f.id,
        matchday: ownMatchday,
        playedSlot: playedSlot,
        date: f.start_time
      })
    }
  }
  console.log("Locks:", locks)
}
test()
