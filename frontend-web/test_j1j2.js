const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({path: '.env.local'})
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function test() {
  const { data } = await supabase.from('fixtures').select('id, matchday, name, start_time').eq('matchday', 2)
  console.log("J2:", data)
  const { data: d1 } = await supabase.from('fixtures').select('id, matchday, name, start_time').eq('matchday', 1)
  console.log("J1:", d1)
}
test()
