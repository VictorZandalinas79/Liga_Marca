import os
import sys
import subprocess
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')
load_dotenv('.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

client = create_client(SUPABASE_URL, SUPABASE_KEY)
resp = client.table('fixtures').select('id, status').eq('status', 'finished').execute()

fixtures = resp.data
print(f"Found {len(fixtures)} finished fixtures.")

for i, f in enumerate(fixtures):
    print(f"Updating {f['id']} ({i+1}/{len(fixtures)})")
    subprocess.run(["python3", "frontend-web/trigger_descarga_eventos.py", str(f['id']), str(f['id'])])

print("Done")
