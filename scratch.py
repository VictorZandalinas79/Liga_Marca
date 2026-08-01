import os
from supabase import create_client

supabase = create_client(os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
resp = supabase.table("sync_notifications").select("id, type, created_at").order("created_at", desc=True).limit(5000).execute()
print(f"Total notificaciones: {len(resp.data)}")
import collections
counts = collections.Counter(n['type'] for n in resp.data)
print(counts)
