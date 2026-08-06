import os
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
if not url or not key:
    from dotenv import load_dotenv
    load_dotenv(".env.local")
    load_dotenv(".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")

s = create_client(url, key)

nombres = ["Gonzalo García", "Rafa Mir"]
print("Check players in DB:")
for nombre in nombres:
    try:
        res = s.table("players").select("id, short_name, is_in_biwenger, precio").ilike("short_name", f"%{nombre}%").execute()
        for p in res.data:
            print(p)
    except Exception as e:
        print(f"Error checking {nombre}: {e}")
