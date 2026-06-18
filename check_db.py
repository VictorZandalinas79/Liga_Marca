import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

print("URL:", url)
sb = create_client(url, key)

# Get penalties
res = sb.table("penalties").select("*").execute()
print("Penalties:", res.data)

# Get profiles
res_p = sb.table("profiles").select("id, full_name, email").execute()
print("Profiles:", res_p.data)

# Get active matchday status
res_md = sb.table("matchday_status").select("*").execute()
print("Matchday Status:", res_md.data)
