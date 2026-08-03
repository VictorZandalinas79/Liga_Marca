import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

downloader = MatchEventDownloader('57dotnff3xaafnxfltzt4czdg', '57dotnff3xaafnxfltzt4czdg')
downloader.upload_to_supabase = lambda *args, **kwargs: None
downloader.run()

for pid, stats in downloader.stats.items():
    if downloader.player_positions_map.get(pid) == 'POR':
        print(f"POR {downloader.player_names.get(pid)} ({pid}):")
        print(f"  Mins: {downloader.total_minutes.get(pid)}")
        print(f"  Blocajes (claims): {stats.get('claims')}")
