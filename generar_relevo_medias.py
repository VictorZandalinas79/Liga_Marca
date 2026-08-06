#!/usr/bin/env python3
import os
import sys

# Añadir frontend-web al path para poder importar el downloader
sys.path.append(os.path.join(os.path.dirname(__file__), 'frontend-web'))
from trigger_descarga_eventos import MatchEventDownloader

def calcular_medias(fixture_ids):
    print(f"📊 Procesando {len(fixture_ids)} partidos para extraer estadísticas RELEVO...")
    
    # Agrupar estadísticas por posición
    stats_by_pos = {
        'POR': {'matches': 0, 'mins': 0, 'sum': {}},
        'DEF': {'matches': 0, 'mins': 0, 'sum': {}},
        'MED': {'matches': 0, 'mins': 0, 'sum': {}},
        'DEL': {'matches': 0, 'mins': 0, 'sum': {}}
    }
    
    # Campos que se suman directamente para sacar ratios
    sum_fields = [
        'saves', 'long_balls_completed', 'passes_completed', 'passes_attempted',
        'claims', 'punches_ok', 'punches_fail', 'relevo_def_action_last_man',
        'forward_passes', 'aerials_won', 'aerials_lost', 'relevo_ground_duels_won',
        'relevo_ground_duels_total', 'relevo_abp_remates', 'successful_crosses',
        'pass_opp_half_completed', 'pass_opp_half_attempted', 'shots_on_target',
        'shots_total', 'takeons_won', 'takeons_lost', 'takeons_overrun',
        'assists', 'relevo_recup_campo_rival', 'relevo_remates_cabeza'
    ]

    jugadores_totales = 0

    for fixture_id in fixture_ids:
        print(f"\n⏳ Descargando y procesando eventos del partido: {fixture_id}...")
        try:
            downloader = MatchEventDownloader(fixture_id, fixture_id)
            # Desactivar subida a DB
            downloader.upload_to_supabase = lambda: None
            downloader.update_match_score = lambda *args, **kwargs: None
            downloader.run()
            
            # Recopilar estadísticas procesadas por el downloader
            for pid, stats in downloader.stats.items():
                mins = downloader.total_minutes.get(pid, 0)
                if mins <= 0:
                    continue
                    
                pos = downloader.player_positions_map.get(pid, 'MED')
                if pos not in stats_by_pos: pos = 'MED'
                
                stats_by_pos[pos]['matches'] += 1
                stats_by_pos[pos]['mins'] += mins
                jugadores_totales += 1
                
                for f in sum_fields:
                    val = stats.get(f) or 0
                    stats_by_pos[pos]['sum'][f] = stats_by_pos[pos]['sum'].get(f, 0) + val
                    
                # Añadir calidad de parada para porteros (que está en otro dict del downloader)
                if pos == 'POR':
                    calidad = downloader.player_calidad_parada.get(pid, 0.0)
                    stats_by_pos['POR']['sum']['calidad_parada'] = stats_by_pos['POR']['sum'].get('calidad_parada', 0) + calidad
                    
        except Exception as e:
            print(f"❌ Error procesando el partido {fixture_id}: {e}")

    if jugadores_totales == 0:
        print("⚠️ No se encontraron registros válidos de jugadores en los partidos indicados.")
        return

    print(f"\n✅ Se procesaron estadísticas de {jugadores_totales} apariciones de jugadores en total.\n")
            
    # Calcular y mostrar las medias (Topes RELEVO)
    print("="*60)
    print("🚀 MEDIAS PARA TOPES RELEVO POR POSICIÓN")
    print("="*60)
    
    for pos, data in stats_by_pos.items():
        if data['matches'] == 0:
            continue
            
        print(f"\n[{pos}] - Analizados {data['matches']} partidos/jugador ({data['mins']} minutos totales)")
        print("-" * 50)
        
        s = data['sum']
        mins = data['mins']
        
        def per_min(key): return s.get(key, 0) / mins if mins > 0 else 0
        def pct(w, tot): return (s.get(w, 0) / s.get(tot, 0) * 100) if s.get(tot, 0) > 0 else 0
        def pct_sum(w, l1, l2=None):
            tot = s.get(w, 0) + s.get(l1, 0) + (s.get(l2, 0) if l2 else 0)
            return (s.get(w, 0) / tot * 100) if tot > 0 else 0
        
        # POR
        if pos == 'POR':
            print(f"  - saves_per_min: {per_min('saves'):.4f} (ej: umbral act {0.06})")
            print(f"  - long_passes_per_min: {per_min('long_balls_completed'):.4f} (ej: umbral act {0.05})")
            print(f"  - pass_att_per_min: {per_min('passes_attempted'):.4f} (ej: umbral act {0.3})")
            print(f"  - pass_pct: {pct('passes_completed', 'passes_attempted'):.1f}% (ej: umbral act 65%)")
            print(f"  - claims_per_min: {per_min('claims'):.4f} (ej: umbral act {0.02})")
            punches = s.get('punches_ok', 0) + s.get('punches_fail', 0)
            print(f"  - punches_per_min: {(punches / mins if mins > 0 else 0):.4f} (ej: umbral act {0.03})")
            
            calidad = s.get('calidad_parada', 0.0)
            saves = s.get('saves', 0)
            avg_calidad = (calidad / saves) if saves > 0 else 0.0
            print(f"  - calidad_parada_per_min: {per_min('calidad_parada'):.4f} (Calidad media por parada: {avg_calidad:.3f})")
            
        # DEF
        if pos == 'DEF':
            print(f"  - last_man_per_min: {per_min('relevo_def_action_last_man'):.4f} (ej: umbral act {0.02})")
            print(f"  - long_passes_per_min: {per_min('long_balls_completed'):.4f} (ej: umbral act {0.05})")
            print(f"  - forward_passes_per_min: {per_min('forward_passes'):.4f} (ej: umbral act {0.05})")
            print(f"  - aerials_pct: {pct_sum('aerials_won', 'aerials_lost'):.1f}% (ej: umbral act 60%)")
            print(f"  - ground_duels_pct: {pct('relevo_ground_duels_won', 'relevo_ground_duels_total'):.1f}% (ej: umbral act 60%)")
            print(f"  - abp_remates_per_min: {per_min('relevo_abp_remates'):.4f} (ej: umbral act {0.01})")
            print(f"  - crosses_per_min: {per_min('successful_crosses'):.4f} (ej: umbral act {0.02})")
            
        # MED
        if pos == 'MED':
            print(f"  - pass_opp_pct: {pct('pass_opp_half_completed', 'pass_opp_half_attempted'):.1f}% (ej: umbral act 50%)")
            print(f"  - aerials_pct: {pct_sum('aerials_won', 'aerials_lost'):.1f}% (ej: umbral act 60%)")
            print(f"  - ground_duels_pct: {pct('relevo_ground_duels_won', 'relevo_ground_duels_total'):.1f}% (ej: umbral act 60%)")
            print(f"  - shots_on_pct: {pct('shots_on_target', 'shots_total'):.1f}% (ej: umbral act 50%)")
            print(f"  - takeons_pct: {pct_sum('takeons_won', 'takeons_lost', 'takeons_overrun'):.1f}% (ej: umbral act 35%)")
            print(f"  - assists_per_min: {per_min('assists'):.4f} (ej: umbral act {0.03})")
            print(f"  - crosses_per_min: {per_min('successful_crosses'):.4f} (ej: umbral act {0.02})")
            
        # DEL
        if pos == 'DEL':
            print(f"  - pass_opp_pct: {pct('pass_opp_half_completed', 'pass_opp_half_attempted'):.1f}% (ej: umbral act 50%)")
            print(f"  - aerials_pct: {pct_sum('aerials_won', 'aerials_lost'):.1f}% (ej: umbral act 40%)")
            print(f"  - recup_opp_per_min: {per_min('relevo_recup_campo_rival'):.4f} (ej: umbral act {0.03})")
            print(f"  - shots_on_pct: {pct('shots_on_target', 'shots_total'):.1f}% (ej: umbral act 60%)")
            print(f"  - head_shots_per_min: {per_min('relevo_remates_cabeza'):.4f} (ej: umbral act {0.02})")
            print(f"  - assists_per_min: {per_min('assists'):.4f} (ej: umbral act {0.03})")
            print(f"  - takeons_pct: {pct_sum('takeons_won', 'takeons_lost', 'takeons_overrun'):.1f}% (ej: umbral act 35%)")
            
    print("\n💡 Sugerencia: Usa estos valores promedio reales calculados para afinar tus 'relevo_limits' en el panel de Admin.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python generar_relevo_medias.py <fixture_id_1> <fixture_id_2> ...")
        sys.exit(1)
        
    fixtures = sys.argv[1:]
    calcular_medias(fixtures)
