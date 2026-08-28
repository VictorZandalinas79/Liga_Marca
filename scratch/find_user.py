import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

print("Searching for Alonso Roqueta in division 3...")
res = client.table('profiles').select('id, full_name, division').ilike('full_name', '%Alonso%').execute()
for r in res.data:
    print(r)
    
if res.data:
    user_id = res.data[0]['id']
    team_res = client.table('user_teams').select('*').eq('user_id', user_id).execute()
    print("User Team:", team_res.data)

print("\nSearching for players:")
names = [
    "Courtois",
    "Cubars",
    "Pau Navarro",
    "Gay",
    "López", # Fermin Lopez
    "Silva", # B. Silva in Real Madrid
    "Soler",
    "Lo Celso",
    "Oyarzabal",
    "Budimir",
    "Hugo Duro"
]
for n in names:
    res = client.table('players').select('id, short_name, team_id, position').ilike('short_name', f'%{n}%').execute()
    print(f"Search {n}:")
    for p in res.data:
        print(f"  {p}")
