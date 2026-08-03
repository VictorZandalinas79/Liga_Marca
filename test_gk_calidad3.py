import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

downloader = MatchEventDownloader('57dotnff3xaafnxfltzt4czdg', '57dotnff3xaafnxfltzt4czdg')
downloader.upload_to_supabase = lambda *args, **kwargs: None
downloader.run()
for pid, stats in downloader.stats.items():
    if pid == '3zl1q2gk6tdmzirsyfgm38no5':
        print(f"E. Martinez Calidad Parada = {stats.get('calidad_parada', 0)}")
