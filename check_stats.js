// Mock WebSocket global for older Node versions using Supabase
global.WebSocket = class {};

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let envContent = '';
try {
  envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
} catch (e) {
  console.error("Could not read .env file:", e.message);
}

const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    env[key] = value.trim();
  }
});

const url = env.SUPABASE_URL || process.env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in env configuration", { url, key });
  process.exit(1);
}

const sb = createClient(url, key);

async function main() {
  console.log("Connecting to Supabase at", url);

  // 1. Get matchday_status
  const { data: statusData, error: statusErr } = await sb.from("matchday_status").select("*");
  if (statusErr) console.error("Error status:", statusErr);
  else console.log("\nMatchday Status:", statusData);

  // 2. Get distinct matchdays in player_scores
  const { data: scores, error: scoresErr } = await sb.from("player_scores").select("matchday, total_points");
  if (scoresErr) {
    console.error("Error scores:", scoresErr);
  } else {
    console.log(`\nTotal player scores: ${scores.length}`);
    const mdScores = {};
    for (const s of scores) {
      const md = s.matchday;
      const pts = s.total_points || 0;
      if (md != null) {
        mdScores[md] = (mdScores[md] || 0) + (pts > 0 ? 1 : 0);
      }
    }
    console.log("Matchdays with non-zero scores in player_scores:");
    for (const md of Object.keys(mdScores).sort((a,b) => a-b)) {
      console.log(`  Matchday ${md}: ${mdScores[md]} player-scores > 0 points`);
    }
  }

  // 3. Get fixtures status
  const { data: fixtures, error: fixErr } = await sb.from("fixtures").select("matchday, status, start_time");
  if (fixErr) {
    console.error("Error fixtures:", fixErr);
  } else {
    console.log("\nFixtures by matchday:");
    const mdFixtures = {};
    for (const f of fixtures) {
      const md = f.matchday;
      const status = f.status;
      const start_time = f.start_time;
      if (md != null) {
        if (!mdFixtures[md]) mdFixtures[md] = [];
        mdFixtures[md].push({ status, start_time });
      }
    }
    for (const md of Object.keys(mdFixtures).sort((a,b) => a-b)) {
      const fixs = mdFixtures[md];
      const finished = fixs.filter(f => f.status === 'finished').length;
      const started = fixs.filter(f => f.status === 'started' || f.status === 'finished').length;
      const firstStart = fixs.map(f => f.start_time).filter(Boolean).sort()[0];
      console.log(`  Matchday ${md}: ${fixs.length} fixtures, ${finished} finished, ${started} started. First start: ${firstStart}`);
    }
  }
}

main().catch(console.error);
