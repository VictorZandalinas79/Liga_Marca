import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: fixtures } = await supabase.from('fixtures').select('id, matchday, status, home_team_id, away_team_id').in('id', ['8muyl6d5ahy04fbwarplcg3kk', 'ahb6v608gitlu543aevomjuac']);
  console.log("Fixtures:", fixtures);
}
run();
