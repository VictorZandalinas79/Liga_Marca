import os
import requests
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

# We will use raw PostgreSQL via the REST API or we can just use the pg function or direct RPC if available.
# But actually, the easiest way to add columns if we don't have direct SQL access is to use REST if `rpc` is available.
# Let's check if we can run SQL.
