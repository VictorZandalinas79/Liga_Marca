import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/imac/Programas/LFM Vilafranca/frontend-web/.env")

sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
sb = create_client(sb_url, sb_key)

old_id = "7kser55g81n3lqj9rjd2mwftg"
opta_id = "6vvwhgic29fekmmj2cg62ytp1"

print(f"--- FIXING PLAYER ID FOR CHRISTANTUS UCHE ({old_id} -> {opta_id}) ---")

# 1. Fetch current player row for Uche
uche_row = sb.table("players").select("*").eq("id", old_id).execute().data
if not uche_row:
    print(f"Player with old_id '{old_id}' not found. Checking if opta_id '{opta_id}' already exists...")
    opta_row = sb.table("players").select("*").eq("id", opta_id).execute().data
    print("Opta row in players:", opta_row)
else:
    row = uche_row[0]
    print("Found Uche row:", row)
    
    # 2. Insert new row with opta_id
    new_row = dict(row)
    new_row["id"] = opta_id
    new_row["external_id"] = opta_id
    
    res_insert = sb.table("players").insert(new_row).execute()
    print("Inserted new player row with Opta ID:", res_insert.data)
    
    # 3. Update team_players to point to opta_id
    res_tp = sb.table("team_players").update({"player_id": opta_id}).eq("player_id", old_id).execute()
    print(f"Updated {len(res_tp.data)} team_players rows to Opta ID.")
    
    # 4. Delete old player row
    res_del = sb.table("players").delete().eq("id", old_id).execute()
    print("Deleted old player row.")

print("\n--- VERIFYING FIX IN DB ---")
p_check = sb.table("players").select("id, short_name, team_id").eq("id", opta_id).execute().data
print("Player check in DB:", p_check)
tp_check = sb.table("team_players").select("id, team_id, player_id, is_starter").eq("player_id", opta_id).execute().data
print("team_players check in DB:", len(tp_check), "rows")

