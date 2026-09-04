import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { computeOutOfOrderLocks, resolveStartHoursBefore } from './src/lib/locked-teams-core.ts';

dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: allFixtures } = await supabase
    .from('fixtures')
    .select('id, matchday, momento, start_time, status, home_team_id, away_team_id')
    .order('start_time', { ascending: true });

  const lockOffsets = { startHoursBeforeMidweek: 1, startHoursBeforeWeekend: 1, endHoursAfter: 2 };
  const lockOffsetMs = 2 * 60 * 60 * 1000;
  const fantasyStart = 1;

  const outOfOrderLocks = computeOutOfOrderLocks(allFixtures, lockOffsets, fantasyStart);
  const outOfOrderIds = new Set(outOfOrderLocks.map(l => l.fixtureId));

  const validFixtures = allFixtures.filter(f => !['cancelled', 'postponed'].includes((f.status || '').toLowerCase()));
  
  const jornadasMap = new Map();
  for (const fixture of validFixtures) {
    let key = fixture.matchday > 0 ? `md-${fixture.matchday}` : `momento-${fixture.momento || 'Unknown'}`;
    if (!jornadasMap.has(key)) {
      jornadasMap.set(key, { matchday: fixture.matchday || 0, momento: fixture.momento, start_time: fixture.start_time, fixtures: [] });
    }
    jornadasMap.get(key).fixtures.push(fixture);
  }

  const jornadas = Array.from(jornadasMap.values()).map(j => ({
    ...j,
    start_time: j.fixtures.reduce((min, f) => f.start_time < min ? f.start_time : min, j.fixtures[0].start_time)
  }));

  const numericJornadas = jornadas.filter(j => j.matchday > 0).sort((a, b) => a.matchday - b.matchday);
  const momentJornadas = jornadas.filter(j => j.matchday === 0).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  
  const maxNumericMatchday = numericJornadas.length > 0 ? numericJornadas[numericJornadas.length - 1].matchday : 0;
  const momentJornadasWithNumbers = momentJornadas.map((j, index) => ({ ...j, matchday: maxNumericMatchday + 1 + index }));
  const allJornadas = [...numericJornadas, ...momentJornadasWithNumbers];

  const startOffsetMsFor = (date, offsets) => resolveStartHoursBefore(date, offsets) * 60 * 60 * 1000;

  const blocks = [];
  for (const jornada of allJornadas) {
    if (jornada.matchday < fantasyStart) continue;
    const regularFixtures = jornada.fixtures.filter(f => !outOfOrderIds.has(f.id));
    if (regularFixtures.length > 0) {
      const sorted = regularFixtures.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      const firstTime = new Date(sorted[0].start_time);
      blocks.push({
        start: firstTime.getTime() - startOffsetMsFor(firstTime, lockOffsets),
        end: new Date(sorted[sorted.length - 1].start_time).getTime() + lockOffsetMs,
        matchday: jornada.matchday,
        momento: jornada.momento || null,
        outOfOrder: false,
      });
    }
  }

  const oooFixtures = allFixtures.filter(f => outOfOrderIds.has(f.id) && f.matchday >= fantasyStart);
  for (const f of oooFixtures) {
    const fTime = new Date(f.start_time);
    blocks.push({
      start: fTime.getTime() - startOffsetMsFor(fTime, lockOffsets),
      end: fTime.getTime() + lockOffsetMs,
      matchday: f.matchday,
      momento: f.momento || null,
      outOfOrder: true,
    });
  }

  blocks.sort((a, b) => a.start - b.start);

  const now = new Date();
  let target = null;
  for (const b of blocks) {
    if (now.getTime() < b.start || now.getTime() > b.end) continue;
    if (!target || !b.outOfOrder || target.outOfOrder) target = b;
  }
  if (!target) {
    target = blocks.find(b => b.start > now.getTime()) || blocks[blocks.length - 1];
  }
  
  console.log("NOW:", now.toISOString());
  console.log("TARGET:", target);
  
  // Show blocks near 'now'
  const upcomingBlocks = blocks.filter(b => b.end > now.getTime() - 24*60*60*1000).slice(0, 5);
  for (const b of upcomingBlocks) {
    console.log(`Block MD: ${b.matchday}, OOO: ${b.outOfOrder}, start: ${new Date(b.start).toISOString()}, end: ${new Date(b.end).toISOString()}`);
  }
}

run().catch(console.error);
