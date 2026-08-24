import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

res = client.table('player_scores').select('id, match_id, player_id, calidad_parada, relevo_block_2_pts, saves, minutes_played').eq('position', 'POR').execute()
for r in res.data:
    if r['calidad_parada'] and r['calidad_parada'] > 0:
        val_per_min = r['calidad_parada'] / r['minutes_played'] if r['minutes_played'] > 0 else 0
        if val_per_min > 0.006:
            print(f"ID: {r['id']}, Calidad: {r['calidad_parada']}, Mins: {r['minutes_played']}, Val/m: {val_per_min:.4f}, Block 2 pts: {r['relevo_block_2_pts']}")
