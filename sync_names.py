import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv('frontend-web/.env.local')

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# If SERVICE_ROLE_KEY isn't there, let's try to get it from .env
if not key:
    load_dotenv('.env')
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(url, key)

def main():
    print("Syncing names from auth.users (user_metadata) to profiles.full_name...")
    
    # 1. Fetch all users from auth
    page = 1
    per_page = 1000
    users = []
    
    while True:
        res = supabase.auth.admin.list_users(page=page, per_page=per_page)
        
        # Depending on supabase-py version, res is either a list of users or an object with .users
        fetched_users = getattr(res, 'users', res)
        if type(fetched_users) is not list:
            # Maybe it's a dict
            if 'users' in fetched_users:
                fetched_users = fetched_users['users']
            
        users.extend(fetched_users)
        if len(fetched_users) < per_page:
            break
        page += 1
        
    print(f"Found {len(users)} users in auth.")
    
    updates = 0
    for u in users:
        # User objects in python supabase client might be objects or dicts
        metadata = getattr(u, 'user_metadata', None)
        if metadata is None and isinstance(u, dict):
            metadata = u.get('user_metadata', {})
            
        uid = getattr(u, 'id', None)
        if uid is None and isinstance(u, dict):
            uid = u.get('id')
            
        if metadata is None: metadata = {}
            
        full_name = metadata.get('full_name', '')
        
        if full_name:
            prof = supabase.table('profiles').select('full_name').eq('id', uid).execute()
            if prof.data and len(prof.data) > 0:
                cur_name = prof.data[0].get('full_name')
                if cur_name != full_name:
                    print(f"Updating {uid}: {cur_name} -> {full_name}")
                    supabase.table('profiles').update({'full_name': full_name}).eq('id', uid).execute()
                    updates += 1
                    
    print(f"Done. {updates} profiles updated.")

if __name__ == "__main__":
    main()
