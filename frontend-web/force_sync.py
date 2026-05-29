#!/usr/bin/env python3
"""
Script para forzar la sincronización de un partido específico.
Uso: python3 force_sync.py <fixture_id> <match_id>
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SDAPI_OUTLET_KEY = "ft1tiv1inq7v1sk3y9tv12yh5"
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def log(msg):
    print(f"[INFO] {msg}")

def download_squads(fixture_id, home_team_id, away_team_id):
    """Descarga los squads de ambos equipos"""
    log(f"Descargando squads para {home_team_id} vs {away_team_id}")

    BASE_PATH = Path("./data/Partidos_Individuales")
    BASE_PATH.mkdir(parents=True, exist_ok=True)

    # Ejecutar descarga_squads.py para cada equipo
    for team_id in [home_team_id, away_team_id]:
        output_file = BASE_PATH / f"{fixture_id}_{team_id}_squad.json"
        log(f"  -> Squad para {team_id}")

        try:
            from descarga_squads import download_squad
            squad = download_squad(team_id, fixture_id)
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(squad, f, indent=2)
            log(f"     ✅ Guardado en {output_file}")
        except Exception as e:
            log(f"     ❌ Error: {e}")

def process_events(fixture_id, match_id):
    """Procesa los eventos del partido"""
    log(f"Procesando eventos para {match_id}")

    try:
        # Importar funciones de descarga_eventos.py
        import importlib.util
        spec = importlib.util.spec_from_file_location("descarga_eventos", "descarga_eventos.py")
        de = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(de)

        # Ejecutar procesamiento
        if hasattr(de, 'process_match_events'):
            result = de.process_match_events(match_id, fixture_id)
            log(f"✅ Eventos procesados: {result}")
        else:
            log("❌ No se encontró process_match_events en descarga_eventos.py")
    except Exception as e:
        log(f"❌ Error procesando eventos: {e}")

def main():
    if len(sys.argv) < 3:
        print("Uso: python3 force_sync.py <fixture_id> <match_id>")
        print("Ejemplo: python3 force_sync.py 3y3gz2ufpcbu5vkgph7jyg74k 3y3gz2ufpcbu5vkgph7jyg74k")
        sys.exit(1)

    fixture_id = sys.argv[1]
    match_id = sys.argv[2]

    log("=" * 60)
    log(f"Forzando sincronización del partido {match_id}")
    log("=" * 60)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. Obtener info del fixture
    fixture = supabase.table('fixtures').select('*').eq('id', fixture_id).single().execute()
    if not fixture.data:
        log(f"❌ Fixture {fixture_id} no encontrado")
        sys.exit(1)

    home_team_id = fixture.data['home_team_id']
    away_team_id = fixture.data['away_team_id']

    log(f"Equipos: {home_team_id} vs {away_team_id}")

    # 2. Descargar squads
    download_squads(fixture_id, home_team_id, away_team_id)

    # 3. Procesar eventos
    process_events(fixture_id, match_id)

    # 4. Verificar datos en Supabase
    log("Verificando datos en Supabase...")
    scores = supabase.table('player_scores').select('player_id, total_points').eq('fixture_id', fixture_id).execute()
    log(f"✅ Player scores encontrados: {len(scores.data) if scores.data else 0}")

    if scores.data:
        print("\nTop 5 jugadores con más puntos:")
        sorted_scores = sorted(scores.data, key=lambda x: x.get('total_points', 0), reverse=True)[:5]
        for s in sorted_scores:
            print(f"  - {s['player_id']}: {s['total_points']} pts")

    log("=" * 60)
    log("Sincronización completada")
    log("=" * 60)

if __name__ == "__main__":
    main()
