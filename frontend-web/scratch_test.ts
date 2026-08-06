import { createClient } from '@supabase/supabase-js'
import { computeOutOfOrderLocks, isLockActive, DEFAULT_LOCK_OFFSETS } from './src/lib/locked-teams-core'

const supabase = createClient('https://hjzdbnjdgludsaqbcrfl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemRibmpkZ2x1ZHNhcWJjcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjQ2OTMsImV4cCI6MjA5NDk0MDY5M30.Jt7C-95GCjBaRCZLUU5yHCwafZEx2zA0tdw7j1UTPJ0')

async function test() {
  const { data: fixtures } = await supabase.from('fixtures').select('id,matchday,start_time,status,home_team_id,away_team_id')
  
  const locks = computeOutOfOrderLocks(fixtures, DEFAULT_LOCK_OFFSETS)
  console.log("Total out of order locks:", locks.length)
  for (const l of locks) {
    console.log(`Lock for fixture ${l.fixtureId}, type: ${l.type}, own: ${l.ownMatchday}, playedSlot: ${l.playedSlot}`)
    console.log(`  from: ${l.from}, until: ${l.until}, kickoff: ${l.kickoff}`)
    console.log(`  isActive now?: ${isLockActive(l, new Date())}`)
  }
}
test().catch(console.error)
