import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("frontend-web/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
sb = create_client(url, key)

team_id = 'da156c7f-4f74-49dc-a31c-a922017db20c'
team = sb.table("user_teams").select("id, name, user_id").eq("id", team_id).single().execute().data
print("Team details:", team)

res = sb.table("team_players").select("id, player_id, is_starter, order").eq("team_id", team_id).eq("matchday", 1).execute()
print(f"Matchday 1 players count: {len(res.data)}")

pids = [p['player_id'] for p in res.data]
players_res = sb.table("players").select("id, short_name, first_name, last_name").in_("id", pids).execute()
p_map = {p['id']: p.get('short_name') or f"{p.get('first_name','')} {p.get('last_name','')}" for p in players_res.data}

for p in res.data:
    pid = p.get('player_id')
    print(f"id: {p.get('id')}, order: {p.get('order')}, player_id: {pid}, name: {p_map.get(pid)}")
