import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))

try:
    res = supabase.table("sync_notifications").select("*").limit(1).execute()
    print("Columns:", res.data[0].keys() if res.data else "No data, but query succeeded.")
except Exception as e:
    print("Error:", e)
