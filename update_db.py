import os
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
if not url or not key:
    from dotenv import load_dotenv
    load_dotenv(".env.local")
    load_dotenv(".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

s = create_client(url, key)

res = s.table("players").update({"is_in_biwenger": False}).in_("id", [
    '4o9d3hpjlicgce9gtbewyzhn8', # Gonzalo García
    '4sojot9t32l4a6fm3e39xkcfd', # Rafa Mir
    '1thoclfaavg8lq7xg42xjn9ck', # Alex González
    '1w5m843i9tnwb5b36xrkheihg', # Elijah Gift
    '4rndfozn1llsynt3fxiljfg2c', # Iker Rodríguez
    '8rb37jdev612rfbrbp8zovs9h', # Carlos Fernández
    'dwlouw1t5neogiv8jzg7pm7tg', # Mardones
]).execute()
print("Updated successfully using service_role key:", res.data)
