const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({path: '.env.local'})
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function test() {
  const { data, error } = await supabase.from('fixtures').select('id, home_team:real_teams!home_team_id(name, short_name), away_team:real_teams!away_team_id(name, short_name)').limit(1)
  console.log(JSON.stringify(data, null, 2), error)
}
test()
