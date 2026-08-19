import { GET } from './src/app/api/admin/users/route'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
  const res = await GET()
  const data = await res.json()
  console.log(data.users.slice(0, 5).map(u => ({ id: u.id, saldo: u.saldo, amount_paid: u.amount_paid })))
}
run()
