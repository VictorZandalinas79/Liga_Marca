import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


# If get_schema rpc doesn't exist, just select from pg_tables if possible or use a known list.
# Actually we can just query a few known tables.
# Or better, we can use a direct postgres connection if we have it, but we only have supabase keys.
# I'll just print out standard tables based on the code I've seen.
tables = ["players", "fixtures", "player_scores", "player_stats", "transfers", "user_team_players", "user_team_history", "transactions", "market_transactions", "profiles", "users"]
for t in tables:
    try:
        r = sb.table(t).select("id").limit(1).execute()
        print(f"Table exists: {t}")
    except Exception as e:
        print(f"Table {t} failed: {e}")
