const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({path: '.env.local'})
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function test() {
  const { data: d1 } = await supabase.from('fixtures').select('id, matchday, name, start_time, home_team:real_teams!home_team_id(name), away_team:real_teams!away_team_id(name)').in('matchday', [1, 2]).order('start_time')
  console.log("J1 and J2 fixtures:");
  d1.forEach(f => console.log(`J${f.matchday} | ${f.start_time} | ${f.home_team?.name} vs ${f.away_team?.name}`));
}
test()
