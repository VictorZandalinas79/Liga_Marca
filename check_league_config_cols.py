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
    cols = list(resp.data[0].keys())
    for c in cols:
        if 'descensos' in c:
            print("FOUND:", c)
    if not any('descensos' in c for c in cols):
        print("NO DESCENSOS COLUMNS FOUND. Columns are:", cols)
else:
    print("NO DATA")
