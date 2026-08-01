import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env')
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase = create_client(url, key)
res = supabase.table('league_config').select('*').single().execute()
print("Config:", res.data)
res2 = supabase.table('fixtures').select('id, matchday, momento, start_time').order('start_time').limit(5).execute()
print("Fixtures:", res2.data)
