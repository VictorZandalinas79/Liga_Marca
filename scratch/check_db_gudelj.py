import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/imac/Programas/LFM Vilafranca/frontend-web/.env")

sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
sb = create_client(sb_url, sb_key)

print("--- SEARCH PLAYERS IN DB ---")
p_gudelj = sb.table("players").select("*").ilike("short_name", "%Gudelj%").execute().data
p_uche = sb.table("players").select("*").ilike("short_name", "%Uche%").execute().data
p_6vv = sb.table("players").select("*").eq("id", "6vvwhgic29fekmmj2cg62ytp1").execute().data
p_7ks = sb.table("players").select("*").eq("id", "7kser55g81n3lqj9rjd2mwftg").execute().data

print("Gudelj by name:", p_gudelj)
print("Uche by name:", p_uche)
print("By ID 6vvwhgic29fekmmj2cg62ytp1:", p_6vv)
print("By ID 7kser55g81n3lqj9rjd2mwftg:", p_7ks)

