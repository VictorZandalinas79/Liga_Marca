import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

team_id = '8958768d-92f3-4d71-a15b-d18b1eff174e'

print("Existing team players for Matchday 1:")
res = client.table('team_players').select('*').eq('team_id', team_id).eq('matchday', 1).execute()
for r in res.data:
    print(r)
