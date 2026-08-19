import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function test() {
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, amount_paid, infraction_penalties, entry_fee_paid')
  console.log(profiles?.filter(p => p.amount_paid > 0 || p.infraction_penalties > 0 || p.id === '...'))
}
test()
