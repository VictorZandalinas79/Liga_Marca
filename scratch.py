import json
with open('frontend-web/trigger_descarga_eventos.py') as f:
    pass

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('frontend-web/.env.local')
supabase = create_client(os.environ['NEXT_PUBLIC_SUPABASE_URL'], os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY'])

# Buscamos a David Soria en la base de datos
res = supabase.table('players').select('id, name').ilike('name', '%Soria%').execute()
print("Jugadores:", res.data)
if res.data:
    p_id = res.data[0]['id']
    scores = supabase.table('player_scores').select('id, fixture_id, relevo_block_4_pts, saves_gte_07, relevo_saves_gte_07').eq('player_id', p_id).order('fixture_id', desc=True).limit(5).execute()
    print("Scores Soria:")
    for s in scores.data:
        print(s)
