import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://hjzdbnjdgludsaqbcrfl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemRibmpkZ2x1ZHNhcWJjcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjQ2OTMsImV4cCI6MjA5NDk0MDY5M30.Jt7C-95GCjBaRCZLUU5yHCwafZEx2zA0tdw7j1UTPJ0');
async function run() {
  const { data: teamPlayers } = await supabase.from('team_players').select('*').limit(5);
  console.log('team_players:', teamPlayers);
}
run();
