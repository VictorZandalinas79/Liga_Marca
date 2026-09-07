import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("/Users/imac/Programas/LFM Vilafranca/frontend-web/.env")

sb_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
sb = create_client(sb_url, sb_key)

opta_id = "6vvwhgic29fekmmj2cg62ytp1"
match_id = "7aptq9m7p1p3ezgnl011sdafo"

print("--- CHECK PLAYER SCORE IN DB FOR UCHE ---")
score = sb.table("player_scores").select("*").eq("player_id", opta_id).eq("fixture_id", match_id).execute().data
print("Player score in DB:", json.dumps(score, indent=2))

