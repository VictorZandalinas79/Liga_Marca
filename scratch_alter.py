import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
sb = create_client(url, key)

try:
    sql = """
    ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS win_bonus numeric DEFAULT 0;
    ALTER TABLE player_scores ADD COLUMN IF NOT EXISTS draw_bonus numeric DEFAULT 0;
    """
    res = sb.rpc('exec_sql', {'sql': sql}).execute()
    print("Success:", res)
except Exception as e:
    print("Error:", e)
