import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: fixtures } = await supabase.from('fixtures').select('id, matchday, status, home_team_id, away_team_id').or(`home_team_id.eq.eh7yt2x2wck51oixw8012ux5j,away_team_id.eq.eh7yt2x2wck51oixw8012ux5j`).order('matchday');
  console.log("Spain Fixtures:", fixtures);
}
run();
