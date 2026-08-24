import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

res = client.table('player_scores').select('fixture_id, match_id, player_id').eq('id', 'acc52479-8665-412f-969d-e131fe1aa557').execute()
print("Soria:", res.data)
