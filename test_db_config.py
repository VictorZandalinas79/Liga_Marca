import sys, json
sys.path.append('frontend-web')
from lib_supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
client = create_client(SUPABASE_URL, SUPABASE_KEY)
res = client.table('scoring_config').select('*').eq('id', 1).execute()
print(json.dumps(res.data[0]['rules']['events'], indent=2))
