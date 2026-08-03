import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

downloader = MatchEventDownloader('61zv9h8fu4v0812uihvl7m3h0', '61zv9h8fu4v0812uihvl7m3h0')
downloader.upload_to_supabase = lambda *args, **kwargs: None
downloader.run()

for pid, stats in downloader.stats.items():
    if downloader.player_positions_map.get(pid) == 'POR':
        print(f"POR {downloader.player_names.get(pid)} ({pid}):")
        print(f"  Calidad parada: {stats.get('calidad_parada', 0)}")
        print(f"  Paradas (saves): {stats.get('saves', 0)}")
