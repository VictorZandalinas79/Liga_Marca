import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

downloader = MatchEventDownloader('57dotnff3xaafnxfltzt4czdg', '57dotnff3xaafnxfltzt4czdg')
downloader.upload_to_supabase = lambda *args, **kwargs: None
downloader.run()

pid = 'ieu0x9fy8hpqyztdjg8bgpnt' # N. Molina
stats = downloader.stats[pid]
print(f"Mins: {downloader.total_minutes.get(pid)}")
print(f"last_man: {stats.get('relevo_def_action_last_man')}")
print(f"long_passes: {stats.get('long_balls_completed')}")
print(f"forward_passes: {stats.get('forward_passes')}")
