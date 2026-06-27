import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

sb = create_client(url, key)

res_fixtures = sb.table("fixtures").select("matchday, start_time").execute()
print("Fixtures sample:", [f for f in res_fixtures.data if f['matchday'] in [1, 2, 3]][:5])
