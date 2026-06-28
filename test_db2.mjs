import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: tps } = await supabase.from('team_players').select('team_id, matchday, is_starter').eq('is_starter', true);
  
  const countsByTeamAndMd = {};
  tps.forEach(tp => {
    if (!countsByTeamAndMd[tp.team_id]) countsByTeamAndMd[tp.team_id] = {};
    countsByTeamAndMd[tp.team_id][tp.matchday] = (countsByTeamAndMd[tp.team_id][tp.matchday] || 0) + 1;
  });
  
  for (const [tid, mds] of Object.entries(countsByTeamAndMd)) {
    for (const [md, count] of Object.entries(mds)) {
      if (count !== 11) {
        console.log(`Team ${tid} Matchday ${md} has ${count} starters!`);
      }
    }
  }
}
main();
