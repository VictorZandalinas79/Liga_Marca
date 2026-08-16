import os
import json
from supabase import create_client
from dotenv import load_dotenv

# Load env variables
load_dotenv(".env.local")
load_dotenv(".env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

client = create_client(url, key)

# Find Kike Salas
p_info = client.table('players').select('*').ilike('short_name', '%Kike Salas%').execute()
print("Found players in 'players' table:")
for p in p_info.data:
    print(f"ID: {p['id']}, Name: {p['short_name']}")

if p_info.data:
    p_id = p_info.data[0]['id']
    response = client.table('player_scores').select('*').eq('player_id', p_id).execute()
    print("\nFound player scores:")
    for row in response.data:
        print(f"Player: {p_info.data[0]['short_name']} ({row.get('player_id')})")
        print(f"Fixture: {row.get('fixture_id')}")
        print(f"Total Points: {row.get('total_points')}")
        print("Stats columns of interest:")
        for k in ['minutes_played', 'win_bonus', 'draw_bonus', 'goals_conceded', 'clean_sheet', 'red_cards', 'yellow_cards', 'saves', 'clearances', 'shots_on_target', 'takeons_won', 'box_entries', 'ball_recoveries', 'relevo_points', 'relevo_block_1_pts', 'relevo_block_2_pts', 'relevo_block_3_pts', 'relevo_block_4_pts', 'is_starter']:
            print(f"  {k}: {row.get(k)}")
        print("All non-zero/non-null stats:")
        for k, v in row.items():
            if v is not None and v != 0 and v != False and v != 'false':
                print(f"  {k}: {v}")
else:
    print("Kike Salas not found in 'players' table")
