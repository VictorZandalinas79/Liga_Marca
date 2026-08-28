import os
from supabase import create_client
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta

load_dotenv('frontend-web/.env.local')
load_dotenv('frontend-web/.env')

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

def get_current_matchday():
    cfg = client.table('league_config').select('matchday_start_hours_before_midweek, matchday_start_hours_before_weekend, matchday_end_hours_after').eq('id', 1).execute().data[0]
    
    lockOffsets = {
        'startHoursBeforeMidweek': cfg.get('matchday_start_hours_before_midweek', 1),
        'startHoursBeforeWeekend': cfg.get('matchday_start_hours_before_weekend', 19),
        'endHoursAfter': cfg.get('matchday_end_hours_after', 12)
    }
    
    fixtures = client.table('fixtures').select('matchday, start_time').order('start_time').execute().data
    if not fixtures: return 1
    
    jornadasMap = {}
    for f in fixtures:
        md = f['matchday'] or 1
        if md not in jornadasMap:
            jornadasMap[md] = {'matchday': md, 'start_time': f['start_time'], 'fixtures': []}
        jornadasMap[md]['fixtures'].append(f)
        
    sortedJornadas = []
    for md, j in jornadasMap.items():
        sorted_fixtures = sorted(j['fixtures'], key=lambda x: x['start_time'])
        j['first_match'] = sorted_fixtures[0]
        j['last_match'] = sorted_fixtures[-1]
        sortedJornadas.append(j)
        
    sortedJornadas.sort(key=lambda x: x['first_match']['start_time'])
    
    now = datetime.now(timezone.utc)
    # just print all the matchdays up to 5
    for j in sortedJornadas[:5]:
        print(f"MD: {j['matchday']}, First: {j['first_match']['start_time']}, Last: {j['last_match']['start_time']}")
        
    for i, j in enumerate(sortedJornadas):
        last_match_start = datetime.fromisoformat(j['last_match']['start_time'].replace('Z', '+00:00'))
        # simple check: if now < last_match_start + lockOffsets['endHoursAfter']: return j['matchday']
        if now < last_match_start + timedelta(hours=lockOffsets['endHoursAfter']):
            return j['matchday']
            
    return sortedJornadas[-1]['matchday']

print("Current matchday:", get_current_matchday())
