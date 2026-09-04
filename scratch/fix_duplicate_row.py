import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("frontend-web/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
sb = create_client(url, key)

team_id = 'da156c7f-4f74-49dc-a31c-a922017db20c'
matchday = 1

# Fetch rows
res = sb.table("team_players").select("id, player_id, order, is_starter").eq("team_id", team_id).eq("matchday", matchday).execute()
rows = res.data

print("Current rows for team in matchday 1:")
for r in rows:
    print(r)

# Find duplicates
duplicate_player_id = 'abr79wsl0folgkyvl821ggs2c'
dup_rows = [r for r in rows if r['player_id'] == duplicate_player_id]

if len(dup_rows) > 1:
    print("\nFound duplicates:", dup_rows)
    # Keep the one with order 1, delete the one with order 9
    to_delete = [r for r in dup_rows if r['order'] == 9]
    if not to_delete:
        to_delete = dup_rows[1:]
    for d in to_delete:
        print(f"Deleting duplicate row id: {d['id']}")
        del_res = sb.table("team_players").delete().eq("id", d['id']).execute()
        print("Deleted:", del_res)

# Re-check
res_after = sb.table("team_players").select("id, player_id, order").eq("team_id", team_id).eq("matchday", matchday).execute()
print(f"\nRemaining rows count: {len(res_after.data)}")
for r in res_after.data:
    print(r)
