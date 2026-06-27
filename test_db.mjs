import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: player } = await supabase.from('players').select('id, team_id, short_name').ilike('short_name', '%Pino%').limit(1).single();
  console.log("Player:", player);
  
  const { data: scores } = await supabase.from('player_scores').select('fixture_id').eq('player_id', player.id);
  console.log("Scores:", scores);
  
  const { data: fixtures } = await supabase.from('fixtures').select('id, matchday, status').eq('status', 'finished').or(`home_team_id.eq.${player.team_id},away_team_id.eq.${player.team_id}`);
  console.log("Fixtures:", fixtures);
}
run();
