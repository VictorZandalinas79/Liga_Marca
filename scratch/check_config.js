import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf-8').split('\n');
let url = '', key = '';
env.forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
});
const supabase = createClient(url, key);
async function run() {
  const { data: cfg } = await supabase.from('league_config').select('*').single();
  console.log('league_config:', cfg);
  const { data: fixtures } = await supabase.from('fixtures').select('*').order('start_time').limit(5);
  console.log('First 5 fixtures:', fixtures.map(f => ({id: f.id, matchday: f.matchday, start: f.start_time})));
}
run();
