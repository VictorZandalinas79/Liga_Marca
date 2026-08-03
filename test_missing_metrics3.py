import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

downloader = MatchEventDownloader('57dotnff3xaafnxfltzt4czdg', '57dotnff3xaafnxfltzt4czdg')
downloader.upload_to_supabase = lambda *args, **kwargs: None
downloader.run()

for pid, stats in downloader.stats.items():
    if 'Rodri' in downloader.player_names.get(pid, ''):
        print(f"{downloader.player_names.get(pid)}")
        print(f"Stats: {stats}")
        pts = downloader.points.get(pid, 0)
        print(f"Total points: {pts}")
