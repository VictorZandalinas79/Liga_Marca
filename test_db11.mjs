import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: config } = await supabase.from('league_config').select('*').eq('id', 1).single();
  const { data: fixtures } = await supabase.from('fixtures').select('*').order('date', { ascending: true });
  
  const now = new Date();
  console.log("Current time:", now.toISOString());
  
  // Find current matchday based on first future fixture
  const futureFixtures = fixtures.filter(f => new Date(f.date) > now);
  if (futureFixtures.length > 0) {
    const nextMatch = futureFixtures[0];
    console.log("Next match:", nextMatch.matchday, "at", nextMatch.date);
    
    // Find first match of that matchday
    const matchdayFixtures = fixtures.filter(f => f.matchday === nextMatch.matchday).sort((a,b) => new Date(a.date) - new Date(b.date));
    const firstMatch = matchdayFixtures[0];
    
    // Find last match of PREVIOUS matchday
    const prevFixtures = fixtures.filter(f => f.matchday === nextMatch.matchday - 1).sort((a,b) => new Date(b.date) - new Date(a.date));
    const lastMatchPrev = prevFixtures.length > 0 ? prevFixtures[0] : null;
    
    let unlockTime = new Date(0);
    if (lastMatchPrev) {
      unlockTime = new Date(lastMatchPrev.date);
      unlockTime.setHours(unlockTime.getHours() + config.matchday_end_hours_after);
    }
    
    let lockTime = new Date(firstMatch.date);
    lockTime.setHours(lockTime.getHours() - config.matchday_start_hours_before);
    
    console.log("Unlock time:", unlockTime.toISOString());
    console.log("Lock time:", lockTime.toISOString());
    console.log("Is unlock window open:", now >= unlockTime && now <= lockTime);
  }
}
main();
