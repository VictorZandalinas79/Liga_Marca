import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://hjzdbnjdgludsaqbcrfl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqemRibmpkZ2x1ZHNhcWJjcmZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM2NDY5MywiZXhwIjoyMDk0OTQwNjkzfQ.8UuR2bcw8KCPmRopHCnkE2NIh7MDjSdSWB7adFC4TX8'); // USING SERVICE ROLE KEY
async function run() {
  const { data } = await supabase.from('league_config').select('*');
  console.log(data);
}
run();
