import os
from supabase import create_client

supabase = create_client(os.environ.get('SUPABASE_URL', 'https://hjzdbnjdgludsaqbcrfl.supabase.co'), os.environ.get('SUPABASE_KEY', ''))
res = supabase.table('player_scores').select('player_id, is_starter, replaced_player_id').limit(10).execute()
print(res.data)
