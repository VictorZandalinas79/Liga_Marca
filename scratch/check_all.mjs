import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://hjzdbnjdgludsaqbcrfl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemRibmpkZ2x1ZHNhcWJjcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjQ2OTMsImV4cCI6MjA5NDk0MDY5M30.Jt7C-95GCjBaRCZLUU5yHCwafZEx2zA0tdw7j1UTPJ0');
async function run() {
  const { data: fixtures } = await supabase.from('fixtures').select('id, matchday, momento, start_time').order('start_time');
  console.log('Total fixtures:', fixtures.length);
  const beforeAug15 = fixtures.filter(f => new Date(f.start_time) < new Date('2026-08-15'));
  console.log('Fixtures before Aug 15:', beforeAug15);
}
run();
