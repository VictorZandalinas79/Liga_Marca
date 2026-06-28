import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: configData } = await supabase.from('league_config').select('*').eq('id', 1).maybeSingle();
  const config = {
    formations: configData?.formations ?? ["3-5-2", "3-4-3", "4-4-2", "4-3-3", "4-5-1", "5-4-1", "5-3-2"]
  }
  const validFormations = config.formations.map(f => {
    const parts = f.split('-').map(n => parseInt(n.trim(), 10))
    return { defenders: parts[0], midfielders: parts[1], forwards: parts[2] }
  })
  
  const counts = { GK: 1, DEF: 3, MID: 4, FWD: 3 };
  const isFormationValid = counts.GK === 1 && validFormations.some(f => 
    f.defenders === counts.DEF && f.midfielders === counts.MID && f.forwards === counts.FWD
  )
  console.log("validFormations:", validFormations);
  console.log("isFormationValid:", isFormationValid);
}
main();
