import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
sb = create_client(url, key)

print("Checking team players...")
res = sb.table("players").select("id, short_name, position").in_("short_name", ["Unai Simón", "Marquinhos", "A. Robertson", "R. James", "Mikel Merino", "E. Anderson", "Rodri", "Vitinha", "M. Olise", "D. Undav", "E. Haaland", "L. Messi"]).execute()
players = res.data
print("Players found:", len(players))
for p in players:
    print(p)

player_ids = [p["id"] for p in players]
if player_ids:
    tp_res = sb.table("team_players").select("team_id, player_id, is_starter, matchday").in_("player_id", player_ids).execute()
    print("Team Players:")
    # We want to find the team that has most of these players as starters
    teams = {}
    for tp in tp_res.data:
        if tp["is_starter"]:
            teams.setdefault(tp["team_id"], []).append(tp)
    for tid, tps in teams.items():
        if len(tps) >= 8:
            print(f"Team {tid} has {len(tps)} starters:")
            for tp in tps:
                print(tp)
