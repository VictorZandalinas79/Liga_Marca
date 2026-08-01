import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
async function test() {
  const { data: ultimo } = await supabase.from('sync_notifications').select('created_at').eq('type', 'sync_complete').order('created_at', {ascending: false}).limit(1)
  console.log("Ultimo:", ultimo)
  if (ultimo && ultimo.length > 0) {
    const corte = ultimo[0].created_at
    const { data: res, error } = await supabase.from('sync_notifications').delete().lte('created_at', corte)
    console.log("Deleted:", error || res)
  }
}
test()
