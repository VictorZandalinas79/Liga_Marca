import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

sb = create_client(url, key)

res_tp = sb.table("team_players").select("id, team_id, matchday, created_at").order("created_at", desc=True).limit(5).execute()
print("Team players sample:", res_tp.data)

# Let's also check if there is a 'user_changes' or something similar
res_changes = sb.table("team_players").select("created_at, matchday").limit(1).execute()
print("Keys:", res_changes.data[0].keys() if res_changes.data else "Empty")
