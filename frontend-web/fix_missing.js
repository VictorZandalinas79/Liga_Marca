require('dotenv').config({ path: '.env.local' });
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  const { data: currentTeams } = await supabase.from('team_players').select('team_id, player_id, order').eq('matchday', 3).eq('is_starter', true);
  
  const teamsMap = {};
  currentTeams.forEach(row => {
    if (!teamsMap[row.team_id]) teamsMap[row.team_id] = [];
    teamsMap[row.team_id].push(row);
  });
  
  const { data: allTeams } = await supabase.from('user_teams').select('id, name');
  const { data: players } = await supabase.from('players').select('id');
  const allPlayerIds = players.map(p => p.id);
  
  let totalAdded = 0;
  
  for (const team of allTeams) {
    const tPlayers = teamsMap[team.id] || [];
    if (tPlayers.length < 11) {
      console.log(`Equipo ${team.name} tiene ${tPlayers.length} jugadores. Rellenando hasta 11...`);
      
      const existing = new Set(tPlayers.map(p => p.player_id));
      const available = allPlayerIds.filter(id => !existing.has(id));
      
      // Shuffle
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }
      
      const needed = 11 - tPlayers.length;
      const usedOrders = new Set(tPlayers.map(p => p.order));
      
      let nextOrder = 0;
      for (let i = 0; i < needed; i++) {
        while(usedOrders.has(nextOrder)) nextOrder++;
        
        const pid = available.pop();
        await supabase.from('team_players').insert({
          team_id: team.id,
          player_id: pid,
          is_starter: true,
          is_captain: nextOrder === 0,
          order: nextOrder,
          matchday: 3
        });
        
        console.log(` -> Añadido jugador al orden ${nextOrder}`);
        usedOrders.add(nextOrder);
        totalAdded++;
      }
    }
  }
  
  console.log(`Completado. Se añadieron ${totalAdded} jugadores en total.`);
}

run().catch(console.error);
