import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

res = client.table('player_scores').select('id, match_id, player_id, calidad_parada, relevo_block_2_pts, saves, minutes_played').eq('match_id', 's2odkp4oybdaqou9lx1fd6ok').eq('position', 'POR').execute()
for r in res.data:
    print(r)
