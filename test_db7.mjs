import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: penalties } = await supabase.from('penalties').select('*');
  console.log("Penalties in DB:", penalties.length);
  penalties.forEach(p => {
    if (p.description && p.description.includes('Táctica incorrecta') && p.matchday === 4) {
      console.log(`Matchday 4 tactic penalty in DB: user=${p.user_id}, desc=${p.description}`);
    }
  });
}
main();
