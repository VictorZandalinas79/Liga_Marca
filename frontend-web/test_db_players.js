import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('/Users/victorzandal/Proyectos/Liga_Marca/frontend-web/.env.local', 'utf-8');
const supabaseUrl = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('player_scores')
    .select('player_id, matchday, set_piece_shots, minutes_played')
    .gt('set_piece_shots', 0)
    .limit(10);
    
  if (error) {
    console.error("Error fetching data:", error);
  } else {
    console.log("Match scores with set_piece_shots > 0:");
    console.log(JSON.stringify(data, null, 2));
  }
}
main();
