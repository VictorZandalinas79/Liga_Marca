import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_KEY:
    print("No service role key found.")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

email = "vilafranca.fantasy2026@gmail.com"
password = "admin_vilafranca"

user_id = None

print("Checking users...")
try:
    # Try creating the user
    resp = supabase.auth.admin.create_user({
        "email": email,
        "password": password,
        "email_confirm": True
    })
    user_id = resp.user.id
    print(f"User created: {user_id}")
except Exception as e:
    print(f"User creation failed (might exist): {e}")
    
if not user_id:
    try:
        # Try finding the user
        users = supabase.auth.admin.list_users()
        for u in users:
            if getattr(u, 'email', None) == email or u.get('email') == email if isinstance(u, dict) else False:
                user_id = u.id if hasattr(u, 'id') else u.get('id')
                break
                
        if not user_id and hasattr(users, 'users'):
            for u in users.users:
                if getattr(u, 'email', None) == email or (isinstance(u, dict) and u.get('email') == email):
                    user_id = u.id if hasattr(u, 'id') else u.get('id')
                    break

        if user_id:
            print(f"User found: {user_id}, updating password...")
            supabase.auth.admin.update_user_by_id(user_id, {"password": password})
    except Exception as e:
        print(f"Error finding/updating user: {e}")

if user_id:
    print(f"Setting admin privileges for {user_id}...")
    try:
        # Usually triggers create the profile, so it might exist. Let's update it.
        supabase.table("profiles").upsert({
            "id": user_id,
            "email": email,
            "is_admin": True,
            "has_paid": True
        }).execute()
        print("Admin privileges set successfully.")
    except Exception as e:
        print(f"Error updating profile: {e}")
        # Maybe upsert needs more fields or fails, try update
        try:
            supabase.table("profiles").update({
                "is_admin": True,
                "has_paid": True
            }).eq("id", user_id).execute()
            print("Admin privileges updated via update().")
        except Exception as e2:
            print(f"Update failed too: {e2}")
else:
    print("Could not obtain user_id.")
