import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function test() {
  const { data } = await supabase.from('sync_notifications').select('id', { count: 'exact' })
  console.log("Remaining rows:", data.length)
}
test()
