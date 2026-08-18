import os
import sys
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

client = create_client(SUPABASE_URL, SUPABASE_KEY)
resp = client.table('player_scores').select('dispossessed, bad_touches, takeons_lost').eq('match_id', '7000rk9jiemwpjw2i9tnpim8k').execute()

for p in resp.data:
    if p.get('dispossessed', 0) + p.get('bad_touches', 0) + p.get('takeons_lost', 0) > 0:
        print(p)
