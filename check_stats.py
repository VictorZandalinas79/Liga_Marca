import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_KEY")

sb = create_client(url, key)

# Get distinct matchdays in player_scores
res_scores = sb.table("player_scores").select("matchday, total_points").execute()
scores = res_scores.data
print(f"Total player scores: {len(scores)}")
md_scores = {}
for s in scores:
    md = s.get("matchday")
    pts = s.get("total_points") or 0
    if md is not None:
        md_scores[md] = md_scores.get(md, 0) + (1 if pts > 0 else 0)
print("Matchdays with non-zero scores in player_scores:")
for md, count in sorted(md_scores.items()):
    print(f"  Matchday {md}: {count} player-scores > 0 points")

# Get fixtures count and status per matchday
res_fixtures = sb.table("fixtures").select("matchday, status, start_time").execute()
fixtures = res_fixtures.data
print("\nFixtures by matchday:")
md_fixtures = {}
for f in fixtures:
    md = f.get("matchday")
    status = f.get("status")
    start_time = f.get("start_time")
    if md is not None:
        if md not in md_fixtures:
            md_fixtures[md] = []
        md_fixtures[md].append((status, start_time))

for md, fixs in sorted(md_fixtures.items()):
    finished = sum(1 for status, _ in fixs if status == 'finished')
    print(f"  Matchday {md}: {len(fixs)} fixtures, {finished} finished. First start: {min(t for _, t in fixs if t)}")

res_status = sb.table("matchday_status").select("*").execute()
print("\nMatchday Status:", res_status.data)
