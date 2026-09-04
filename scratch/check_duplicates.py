import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("frontend-web/.env")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

sb = create_client(url, key)

rows = []
offset = 0
limit = 1000
while True:
    res = sb.table("team_players").select("team_id, matchday, player_id").range(offset, offset + limit - 1).execute()
    data = res.data
    if not data:
        break
    rows.extend(data)
    if len(data) < limit:
        break
    offset += limit

seen = {}
duplicates = []

for r in rows:
    key_tup = (r["team_id"], r["matchday"], r["player_id"])
    if key_tup in seen:
        duplicates.append(r)
    else:
        seen[key_tup] = True

print(f"Total rows in team_players: {len(rows)}")
print(f"Duplicates found: {len(duplicates)}")
if duplicates:
    print("Duplicate samples:", duplicates)
