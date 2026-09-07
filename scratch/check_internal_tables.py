import os
import requests
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

# Let's check different schemas via PostgREST if exposed or if header Accept-Profile works
for schema_name in ["public", "auth", "cron", "net", "storage", "vault"]:
    h = {**headers, "Accept-Profile": schema_name}
    res = requests.get(f"{url}/rest/v1/", headers=h)
    if res.status_code == 200:
        schema_json = res.json()
        defs = schema_json.get("definitions", {})
        print(f"Schema '{schema_name}' exposed {len(defs)} tables: {list(defs.keys())}")
    else:
        print(f"Schema '{schema_name}' not accessible via REST ({res.status_code})")

