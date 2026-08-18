import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

client = create_client(SUPABASE_URL, SUPABASE_KEY)
resp = client.table('league_config').select('*').limit(1).execute()
if resp.data:
    print(list(resp.data[0].keys()))
