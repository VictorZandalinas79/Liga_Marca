import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'frontend-web'))
from trigger_descarga_eventos import MatchEventDownloader

def check_match(match_id):
    downloader = MatchEventDownloader(match_id, match_id)
    downloader.upload_to_supabase = lambda: None
    downloader.update_match_score = lambda *args, **kwargs: None
    downloader.run()
    
    print("\n--- RESULTS ---")
    teams = list(set(downloader.players_team.values()))
    print("Teams found:", teams)
    for t in teams:
        print(f"Team {t} goals:", downloader.team_goals_scored.get(t, 0))
        
    print("\nBonus assigned:")
    for pid, st in downloader.stats.items():
        wb = st.get('win_bonus', 0)
        db = st.get('draw_bonus', 0)
        if wb > 0 or db > 0:
            print(f"Player {pid} (Team: {downloader.players_team.get(pid)}): win={wb} draw={db}")
    
check_match("1s8ry79zt6zhqqa2eoakvm904")
