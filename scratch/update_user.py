import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

team_id = '8958768d-92f3-4d71-a15b-d18b1eff174e'

print("Deleting current matchday 3 players for Alonso...")
res_delete = client.table('team_players').delete().eq('team_id', team_id).eq('matchday', 3).execute()
print("Deleted rows:", len(res_delete.data))

print("Fetching matchday 1 players to duplicate to matchday 3...")
res_m1 = client.table('team_players').select('*').eq('team_id', team_id).eq('matchday', 1).execute()

new_players = []
for p in res_m1.data:
    new_p = {
        'team_id': p['team_id'],
        'player_id': p['player_id'],
        'is_starter': p['is_starter'],
        'is_captain': p['is_captain'],
        'order': p['order'],
        'matchday': 3,
        'replaced_player_id': p['replaced_player_id']
    }
    new_players.append(new_p)

print("Inserting new matchday 3 players...")
res_insert = client.table('team_players').insert(new_players).execute()
print("Inserted rows:", len(res_insert.data))
