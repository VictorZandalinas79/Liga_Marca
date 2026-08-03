import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

downloader = MatchEventDownloader('57dotnff3xaafnxfltzt4czdg', '57dotnff3xaafnxfltzt4czdg')
downloader.upload_to_supabase = lambda *args, **kwargs: None
downloader.run()

for pid, stats in downloader.stats.items():
    if stats.get('relevo_def_action_last_man', 0) == 1:
        print(f"Player {downloader.player_names.get(pid)} ({pid}):")
        print(f"  Mins: {downloader.total_minutes.get(pid)}")
        print(f"  last_man: {stats.get('relevo_def_action_last_man')}")
        print(f"  block_1_pts: {stats.get('block_1_pts')}")
        print(f"  pos: {downloader.player_positions_map.get(pid)}")
