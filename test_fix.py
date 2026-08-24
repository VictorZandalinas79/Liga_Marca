import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

for mid in ['ekk0usjk6blgzpziu4ho01zo', 's2odkp4oybdaqou9lx1fd6ok']:
    res = client.table('fixtures').select('id, home_team_id').eq('id', mid).execute()
    print(mid, res.data)
