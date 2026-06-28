import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: tps } = await supabase.from('team_players').select('player_id');
  const { data: players } = await supabase.from('players').select('id');
  
  const playerIds = new Set(players.map(p => p.id));
  const missing = [];
  tps.forEach(tp => {
    if (!playerIds.has(tp.player_id)) missing.push(tp.player_id);
  });
  console.log("Missing player IDs:", missing);
}
main();
