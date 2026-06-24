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
  const { data: fixtures } = await sb.from('fixtures').select('id, matchday');
  const fixToMd = new Map(fixtures.map(f => [f.id, f.matchday]));

  const { data: allScores } = await sb.from('player_scores').select('id, matchday, fixture_id, total_points');
  
  const mds = new Set();
  const mdCount = {};
  allScores.forEach(s => {
    let md = s.matchday;
    if (!md && s.fixture_id) md = fixToMd.get(s.fixture_id);
    if (md) {
      mds.add(md);
      mdCount[md] = (mdCount[md] || 0) + 1;
    }
  });

  console.log("All resolved matchdays in player_scores:", Array.from(mds).sort((a,b)=>a-b));
  console.log("Counts per matchday in player_scores:", mdCount);
}

main().catch(console.error);
