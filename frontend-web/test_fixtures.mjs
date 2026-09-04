import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function run() {
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, matchday, start_time, home_team:real_teams!home_team_id(name), away_team:real_teams!away_team_id(name)')
    .gt('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(10)
    
  console.log(JSON.stringify(data, null, 2))
}
run()
