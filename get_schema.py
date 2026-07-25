import os, json
from supabase import create_client
from dotenv import load_dotenv
load_dotenv('.env')
supabase = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
res = supabase.table('league_config').select('*').limit(1).execute()
print(json.dumps(res.data, indent=2))
