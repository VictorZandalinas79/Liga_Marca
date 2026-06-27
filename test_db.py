import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

p = sb.table("players").select("id, team_id, short_name").ilike("short_name", "%Pino%").limit(1).execute().data[0]
print("Player:", p)

scores = sb.table("player_scores").select("fixture_id").eq("player_id", p["id"]).execute().data
print("Scores:", scores)

fixtures = sb.table("fixtures").select("id, matchday, status, home_team_id, away_team_id").eq("status", "finished").or_(f"home_team_id.eq.{p['team_id']},away_team_id.eq.{p['team_id']}").execute().data
print("Fixtures:", fixtures)
