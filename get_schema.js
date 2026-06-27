const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: t1 } = await supabase.from('user_team_players').select('*').limit(1);
  const { data: t2 } = await supabase.from('transfers').select('*').limit(1);
  const { data: t3 } = await supabase.from('transactions').select('*').limit(1);
  const { data: t4 } = await supabase.from('user_team_history').select('*').limit(1);
  const { data: t5 } = await supabase.from('player_transfers').select('*').limit(1);
  const { data: t6 } = await supabase.from('market_transactions').select('*').limit(1);
  
  console.log("user_team_players:", JSON.stringify(t1, null, 2))
  console.log("transfers:", JSON.stringify(t2, null, 2))
  console.log("transactions:", JSON.stringify(t3, null, 2))
  console.log("user_team_history:", JSON.stringify(t4, null, 2))
  console.log("player_transfers:", JSON.stringify(t5, null, 2))
  console.log("market_transactions:", JSON.stringify(t6, null, 2))
}
check()
