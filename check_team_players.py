import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

sb = create_client(url, key)

res = sb.table("team_players").select("team_id, player_id, matchday").eq("matchday", 1).execute()
print("Team Players for J1:", len(res.data))
