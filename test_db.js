import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: profiles } = await supabase.from('profiles').select('id, email, full_name').ilike('email', '%victorzandal%');
  console.log("Profiles:", profiles);
  
  if (profiles && profiles.length > 0) {
    const { data: teams } = await supabase.from('user_teams').select('id, user_id, name').eq('user_id', profiles[0].id);
    console.log("Teams:", teams);
    
    if (teams && teams.length > 0) {
      const teamId = teams[0].id;
      const { data: tps } = await supabase.from('team_players').select('player_id, matchday, is_starter').eq('team_id', teamId).eq('is_starter', true);
      console.log(`Team players for team ${teamId}:`, tps.length);
      
      const countsByMatchday = {};
      tps.forEach(tp => {
        countsByMatchday[tp.matchday] = (countsByMatchday[tp.matchday] || 0) + 1;
      });
      console.log("Starters by matchday:", countsByMatchday);
    }
  }
}
main();
