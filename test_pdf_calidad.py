import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

downloader = MatchEventDownloader('57dotnff3xaafnxfltzt4czdg', '57dotnff3xaafnxfltzt4czdg')
downloader.upload_to_supabase = lambda *args, **kwargs: None
downloader.run()

for pid, stats in downloader.stats.items():
    pos = downloader.player_positions_map.get(pid, 'MED')
    if pos == 'POR':
        mins = downloader.total_minutes.get(pid, 0)
        saves = stats.get('saves', 0)
        calidad = downloader.player_calidad_parada.get(pid, 0.0)
        calidad_min = (calidad / mins) if mins > 0 else 0
        saves_min = (saves / mins) if mins > 0 else 0
        lim2 = 0.5 * saves_min
        print(f"POR {downloader.player_names.get(pid)} ({pid}):")
        print(f"  Calidad: {calidad}")
        print(f"  Mins: {mins}")
        print(f"  Calidad P.: {calidad_min:.3f}/m (> {lim2:.3f}/m)")
