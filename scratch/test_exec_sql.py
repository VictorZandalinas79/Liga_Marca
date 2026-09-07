import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

supabase = create_client(url, key)

try:
    res = supabase.rpc('exec_sql', {'sql': 'SELECT 1 as test;'}).execute()
    print("RPC exec_sql exists! Output:", res.data)
except Exception as e:
    print("exec_sql failed:", e)
