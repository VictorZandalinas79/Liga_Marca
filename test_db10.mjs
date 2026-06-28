import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: config } = await supabase.from('league_config').select('*').eq('id', 1).single();
  console.log("League config:", config);
  const now = new Date();
  const isUnlockWindowOpen = config.unlock_window_start && config.unlock_window_end && now >= new Date(config.unlock_window_start) && now <= new Date(config.unlock_window_end);
  console.log("Now:", now.toISOString());
  console.log("isUnlockWindowOpen:", isUnlockWindowOpen);
}
main();
