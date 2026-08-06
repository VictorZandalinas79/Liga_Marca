const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({path: '.env.local'})
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function test() {
  const { data, error } = await supabase.from('fixtures').select('id, matchday, start_time, home_team_id, away_team_id, status').in('matchday', [1, 2]).order('start_time')
  if (error) {
    console.error("ERROR:", error)
  } else {
    data.forEach(f => console.log(`J${f.matchday} | ${f.start_time} | Status: ${f.status} | H:${f.home_team_id} A:${f.away_team_id}`))
  }
}
test()
