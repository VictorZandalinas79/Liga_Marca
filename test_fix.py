import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("frontend-web/.env.local")
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase = create_client(url, key)
response = supabase.table("fixtures").select("id, matchday, start_time, status, momento").gt("start_time", "2026-09-04T00:00:00").order("start_time").limit(10).execute()
print(response.data)
