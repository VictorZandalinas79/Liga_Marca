import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/imac/Programas/LFM Vilafranca/frontend-web/.env")

sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
sb = create_client(sb_url, sb_key)

gudelj_opta_id = "6vvwhgic29fekmmj2cg62ytp1"
gudelj_bw_id = "bw-752dffeff50304598474"
uche_id = "7kser55g81n3lqj9rjd2mwftg"

print("--- FIXING UCHE AND GUDELJ IN DB ---")

# 1. Restore Uche row with id = 7kser55g81n3lqj9rjd2mwftg
current_6vv = sb.table("players").select("*").eq("id", gudelj_opta_id).execute().data[0]
uche_row = dict(current_6vv)
uche_row["id"] = uche_id
uche_row["external_id"] = uche_id

# Insert Uche back under 7kser55g81n3lqj9rjd2mwftg
sb.table("players").insert(uche_row).execute()
print("Restored Christantus Uche with ID:", uche_id)

# Update team_players pointing to 6vvwhgic29fekmmj2cg62ytp1 back to Uche's ID (7kser55g81n3lqj9rjd2mwftg)
res_tp = sb.table("team_players").update({"player_id": uche_id}).eq("player_id", gudelj_opta_id).execute()
print(f"Reverted {len(res_tp.data)} team_players rows to Uche's ID ({uche_id}).")

# Update player_scores if any exists for 6vvwhgic29fekmmj2cg62ytp1
sb.table("player_scores").delete().eq("player_id", gudelj_opta_id).execute()

# Delete current 6vvwhgic29fekmmj2cg62ytp1 from players so we can assign 6vvwhgic29fekmmj2cg62ytp1 to Gudelj
sb.table("players").delete().eq("id", gudelj_opta_id).execute()

# 2. Update Nemanja Gudelj to use Opta ID 6vvwhgic29fekmmj2cg62ytp1
gudelj_row = sb.table("players").select("*").eq("id", gudelj_bw_id).execute().data[0]
new_gudelj = dict(gudelj_row)
new_gudelj["id"] = gudelj_opta_id
new_gudelj["external_id"] = gudelj_opta_id
new_gudelj["is_provisional"] = False
new_gudelj["shirt_number"] = 8

sb.table("players").insert(new_gudelj).execute()
print("Inserted Nemanja Gudelj with Opta ID:", gudelj_opta_id)

# Update team_players for Gudelj if any
sb.table("team_players").update({"player_id": gudelj_opta_id}).eq("player_id", gudelj_bw_id).execute()

# Delete old provisional Gudelj row
sb.table("players").delete().eq("id", gudelj_bw_id).execute()
print("Deleted old provisional Gudelj row.")

print("\n--- FINAL VERIFICATION IN DB ---")
p1 = sb.table("players").select("id, short_name, team_id, is_provisional").eq("id", gudelj_opta_id).execute().data
p2 = sb.table("players").select("id, short_name, team_id, is_provisional").eq("id", uche_id).execute().data
print("Gudelj in DB:", p1)
print("Uche in DB:", p2)

