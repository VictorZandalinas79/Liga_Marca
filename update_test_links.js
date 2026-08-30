require('dotenv').config({ path: './frontend-web/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  // Get a fixture that has player_scores
  const { data: scores } = await supabase.from('player_scores').select('*').limit(50);
  
  if (!scores || scores.length === 0) {
    console.log("No scores found.");
    return;
  }
  
  const fixtureId = scores[0].fixture_id;
  
  // Find starters and subs for the same team in this fixture
  const { data: matchScores } = await supabase.from('player_scores')
    .select('player_id, is_starter')
    .eq('fixture_id', fixtureId);
    
  const starters = matchScores.filter(s => s.is_starter);
  const subs = matchScores.filter(s => !s.is_starter);
  
  if (starters.length > 0 && subs.length > 0) {
    // Link the first sub to the first starter
    const { error } = await supabase.from('player_scores')
      .update({ replaced_player_id: starters[0].player_id })
      .eq('fixture_id', fixtureId)
      .eq('player_id', subs[0].player_id);
      
    if (error) console.error("Error linking 1:", error);
    else console.log(`Linked sub ${subs[0].player_id} to starter ${starters[0].player_id}`);
    
    // Link second sub to second starter if possible
    if (starters.length > 1 && subs.length > 1) {
      const { error2 } = await supabase.from('player_scores')
        .update({ replaced_player_id: starters[1].player_id })
        .eq('fixture_id', fixtureId)
        .eq('player_id', subs[1].player_id);
      if (!error2) console.log(`Linked sub ${subs[1].player_id} to starter ${starters[1].player_id}`);
    }
  }
  
  console.log(`Updated test data for fixture: ${fixtureId}. Please reload the page for that match!`);
}

main();
