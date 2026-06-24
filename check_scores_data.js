global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value.trim();
  }
});

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: scores } = await sb.from("player_scores").select("*").limit(20);
  console.log("Sample scores:", scores);
  
  const { data: nonZeroScores } = await sb.from("player_scores").select("matchday, total_points").neq("total_points", 0).limit(20);
  console.log("Sample non-zero scores:", nonZeroScores);

  const { data: nullMatchdayScores } = await sb.from("player_scores").select("matchday, total_points").is("matchday", null).limit(10);
  console.log("Null matchday scores count/sample:", nullMatchdayScores.length, nullMatchdayScores);
}

main().catch(console.error);
