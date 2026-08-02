import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))

sql = "ALTER TABLE profiles ADD COLUMN collected_by TEXT;"
try:
    res = supabase.rpc('exec_sql', {'sql': sql}).execute()
    print("Success:", res)
except Exception as e:
    print("Error:", e)
