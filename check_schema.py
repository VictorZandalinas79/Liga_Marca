import os, sys
from supabase import create_client
from dotenv import load_dotenv
load_dotenv()
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
res = sb.table('league_config').select('*').limit(1).execute()
print(res.data)
