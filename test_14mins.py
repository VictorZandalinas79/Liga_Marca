import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

downloader = MatchEventDownloader('57dotnff3xaafnxfltzt4czdg', '57dotnff3xaafnxfltzt4czdg')
downloader.upload_to_supabase = lambda *args, **kwargs: None
downloader.run()

for pid, stats in downloader.stats.items():
    mins = downloader.total_minutes.get(pid, 0)
    if mins == 14:
        pos = downloader.player_positions_map.get(pid)
        print(f"Player {pid} ({pos}):")
        print(f"  Mins: {mins}")
        print(f"  last_man: {stats.get('relevo_def_action_last_man')}")
        print(f"  block_1_pts: {stats.get('block_1_pts')}")
        break
