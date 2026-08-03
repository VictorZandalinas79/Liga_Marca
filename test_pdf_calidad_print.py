import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

def test():
    downloader = MatchEventDownloader('57dotnff3xaafnxfltzt4czdg', '57dotnff3xaafnxfltzt4czdg')
    downloader.upload_to_supabase = lambda: print("   ℹ️ Subida a BD desactivada para la generación del PDF.")
    downloader.update_match_score = lambda *args, **kwargs: None
    downloader.run()
    
    for pid, stats in downloader.stats.items():
        if pid == '3zl1q2gk6tdmzirsyfgm38no5':
            calidad = downloader.player_calidad_parada.get(pid, 0.0)
            print(f"Inside test: E. Martinez Calidad = {calidad}")

test()
