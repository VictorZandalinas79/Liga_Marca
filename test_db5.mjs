import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');
  const { data: teams } = await supabase.from('user_teams').select('id, user_id, name');
  
  const victorProfile = profiles.find(p => p.full_name?.toLowerCase().includes('victor') || p.email?.toLowerCase().includes('victor'));
  if (!victorProfile) {
    console.log("Could not find victor profile. Found emails:", profiles.map(p => p.email));
    return;
  }
  const team = teams.find(t => t.user_id === victorProfile.id);
  if (!team) {
    console.log("Team not found");
    return;
  }
  
  const { data: tps } = await supabase.from('team_players').select('player_id').eq('team_id', team.id).eq('matchday', 4).eq('is_starter', true);
  const pids = tps.map(tp => tp.player_id);
  
  const { data: players } = await supabase.from('players').select('id, position, short_name').in('id', pids);
  
  const getPositionCode = (position) => {
    const posLower = (position || '').toLowerCase()
    if (posLower.includes('goalkeeper') || posLower === 'gk') return 'GK'
    if (posLower.includes('defender') || posLower === 'def') return 'DEF'
    if (posLower.includes('midfielder') || posLower === 'mid') return 'MID'
    if (posLower.includes('forward') || posLower === 'fwd') return 'FWD'
    return 'MID'
  }
  
  let gk=0, def=0, mid=0, fwd=0;
  console.log("Players for Matchday 4:");
  players.forEach(p => {
    const code = getPositionCode(p.position);
    console.log(`${p.short_name}: ${p.position} -> ${code}`);
    if (code === 'GK') gk++;
    if (code === 'DEF') def++;
    if (code === 'MID') mid++;
    if (code === 'FWD') fwd++;
  });
  console.log(`Counts: GK:${gk} DEF:${def} MID:${mid} FWD:${fwd}`);
}
main();
