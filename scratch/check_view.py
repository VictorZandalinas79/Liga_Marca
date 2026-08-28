import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

res = client.rpc('get_view_definition', {'view_name': 'matchday_status'}).execute()
print(res)
