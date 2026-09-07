import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/imac/Programas/LFM Vilafranca/frontend-web/.env")

sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
sb = create_client(sb_url, sb_key)

print("--- SYNC RUNS RECENT WITH HTTP STATUS FROM GITHUB ---")
try:
    recent = sb.from_("sync_runs_recent").select("*").limit(20).execute().data
    print(json.dumps(recent, indent=2))
except Exception as e:
    print("Error querying sync_runs_recent:", e)

