require('dotenv').config({ path: './frontend-web/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase.from('player_scores').select('replaced_player_id').limit(1);
  if (error) {
    console.error("Error fetching replaced_player_id:", error);
  } else {
    console.log("Success! Column exists. Sample data:", data);
  }
}
main();
