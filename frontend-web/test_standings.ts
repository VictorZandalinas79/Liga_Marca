import { createClient } from '@supabase/supabase-js'
import { getStandings } from './src/lib/standings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function test() {
  const result = await getStandings(supabase)
  console.log(result.standings.map(s => ({ user_id: s.user_id, name: s.user_name, saldo: s.saldo })).slice(0, 5))
}
test()
