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
  const { data: fixturesData } = await sb.from('fixtures').select('id, matchday, status');
  const fixtureToMatchday = new Map();
  fixturesData.forEach(f => {
    if (f.id && f.matchday && f.matchday > 0) {
      fixtureToMatchday.set(f.id, f.matchday);
    }
  });

  const { data: allScores } = await sb.from('player_scores').select('player_id, total_points, fixture_id, matchday');
  
  const playerPointsByMatchday = new Map();
  for (const score of allScores) {
    let md = score.matchday && score.matchday > 0 ? score.matchday : undefined;
    if (!md && score.fixture_id) {
      md = fixtureToMatchday.get(score.fixture_id);
    }
    if (!md) continue;
    if ((score.total_points || 0) > 0) {
      if (!playerPointsByMatchday.has(score.player_id)) {
        playerPointsByMatchday.set(score.player_id, new Map());
      }
      const current = playerPointsByMatchday.get(score.player_id).get(md) || 0;
      playerPointsByMatchday.get(score.player_id).set(md, current + (score.total_points || 0));
    }
  }

  const playedMatchdays = new Set();
  for (const playerMds of playerPointsByMatchday.values()) {
    for (const md of playerMds.keys()) {
      playedMatchdays.add(md);
    }
  }
  const sortedPlayedMatchdays = Array.from(playedMatchdays).sort((a, b) => a - b);
  console.log("Sorted Played Matchdays in Clasificacion:", sortedPlayedMatchdays);
}

main().catch(console.error);
