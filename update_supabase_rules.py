import os
import json
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Faltan credenciales de Supabase")
    exit(1)

client = create_client(url, key)

with open('scoring_rules.json', 'r', encoding='utf-8') as f:
    rules = json.load(f)

# The table scoring_config has a column 'rules'
response = client.table('scoring_config').update({'rules': rules}).eq('id', 1).execute()
print("Reglas actualizadas en Supabase:", response)
