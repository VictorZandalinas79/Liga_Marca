const fixtures = [
  {id: 'j1-1', matchday: 1, start_time: '2026-08-15T17:30:00Z'},
  {id: 'j1-2', matchday: 1, start_time: '2026-08-15T19:30:00Z'},
  {id: 'j1-3', matchday: 1, start_time: '2026-08-16T15:00:00Z'},
  {id: 'j1-4', matchday: 1, start_time: '2026-08-16T17:00:00Z'},
  {id: 'j1-5', matchday: 1, start_time: '2026-08-16T19:30:00Z'},
  {id: 'j1-6', matchday: 1, start_time: '2026-08-17T19:00:00Z'},
  {id: 'j1-7', matchday: 1, start_time: '2026-08-19T19:00:00Z'},
  {id: 'j1-8', matchday: 1, start_time: '2026-08-25T19:00:00Z'},
  {id: 'j1-9', matchday: 1, start_time: '2026-08-26T19:00:00Z'},
  {id: 'j1-10', matchday: 1, start_time: '2026-08-27T19:00:00Z'},

  {id: 'j2-1', matchday: 2, start_time: '2026-08-20T19:00:00Z'},
  {id: 'j2-2', matchday: 2, start_time: '2026-08-21T19:00:00Z'},
  {id: 'j2-3', matchday: 2, start_time: '2026-08-22T15:00:00Z'},
  {id: 'j2-4', matchday: 2, start_time: '2026-08-22T17:30:00Z'},
  {id: 'j2-5', matchday: 2, start_time: '2026-08-22T19:30:00Z'},
  {id: 'j2-6', matchday: 2, start_time: '2026-08-23T15:00:00Z'},
  {id: 'j2-7', matchday: 2, start_time: '2026-08-23T17:30:00Z'},
  {id: 'j2-8', matchday: 2, start_time: '2026-08-23T19:30:00Z'},
  {id: 'j2-9', matchday: 2, start_time: '2026-08-24T17:30:00Z'},
  {id: 'j2-10', matchday: 2, start_time: '2026-08-24T19:30:00Z'},
  
  {id: 'j3-1', matchday: 3, start_time: '2026-08-28T19:00:00Z'},
];

const byMatchday = new Map();
fixtures.forEach(f => {
  if (!byMatchday.has(f.matchday)) byMatchday.set(f.matchday, []);
  byMatchday.get(f.matchday).push(f);
});

const chronoOrder = [...byMatchday.keys()].sort((a, b) => a - b);
const bounds = new Map();
for (const [md, fs] of byMatchday.entries()) {
  const times = fs.map(f => new Date(f.start_time).getTime());
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const MAX_DISTANCE = 14 * 24 * 60 * 60 * 1000;
  const validTimes = times.filter(t => Math.abs(t - median) <= MAX_DISTANCE);
  bounds.set(md, { min: Math.min(...validTimes), max: Math.max(...validTimes) });
}

const slotFor = (t, ownMatchday) => {
  for (const k of chronoOrder) {
    if (k >= ownMatchday) break;
    const b = bounds.get(k);
    if (t >= b.min && t <= b.max) return k;
  }
  for (let i = chronoOrder.length - 1; i >= 0; i--) {
    const k = chronoOrder[i];
    if (k <= ownMatchday) break;
    const b = bounds.get(k);
    if (t >= b.min && t <= b.max) return k;
  }
  return ownMatchday;
};

const locks = [];
for (const f of fixtures) {
  const t = new Date(f.start_time).getTime();
  const ps = slotFor(t, f.matchday);
  if (ps !== f.matchday) {
    locks.push({id: f.id, matchday: f.matchday, playedSlot: ps});
  }
}

console.log("Bounds:", [...bounds.entries()].map(([k, v]) => [k, new Date(v.min).toISOString(), new Date(v.max).toISOString()]));
console.log("Locks:", locks);
