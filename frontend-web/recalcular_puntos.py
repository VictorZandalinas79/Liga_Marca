#!/usr/bin/env python3
import os
import sys
import json
import subprocess
from pathlib import Path
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
BASE_OUTPUT_PATH = Path("./data/Partidos_Individuales")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_fixture_id_for_match(match_id):
    response = supabase.table('fixtures').select('id').eq('id', match_id).execute()
    if response.data:
        return response.data[0]['id']

    response = supabase.table('fixtures').select('id, home_team_id, away_team_id').execute()
    if response.data:
        events_path = BASE_OUTPUT_PATH / match_id / "events" / f"{match_id}.json"
        if events_path.exists():
            with open(events_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                match_info = data.get('match', {})
                home_id = match_info.get('home', {}).get('id')
                away_id = match_info.get('away', {}).get('id')

                if home_id and away_id:
                    for fixture in response.data:
                        if fixture.get('home_team_id') == home_id and fixture.get('away_team_id') == away_id:
                            return fixture['id']
                            
    # Fallback to checking player_scores
    response = supabase.table('player_scores').select('fixture_id').eq('match_id', match_id).limit(1).execute()
    if response.data and len(response.data) > 0:
        return response.data[0]['fixture_id']
        
    return None

def main():
    print("=" * 60)
    print("📊 RECALCULANDO PUNTOS DE TODOS LOS PARTIDOS")
    print("=" * 60)

    # Note: force_sync.py expects to be run from frontend-web directory and uses Path("./data/Partidos_Individuales")
    # But wait, force_sync.py uses Path("./data/Partidos_Individuales").
    # It seems data is inside frontend-web/data OR root/data? Let's check where data is.

    base_path = Path("./data/Partidos_Individuales")
    if not base_path.exists():
        base_path = Path("../data/Partidos_Individuales")
        
    match_folders = [
        f for f in base_path.iterdir()
        if f.is_dir() and not f.name.startswith('.') and f.name != '123'
    ]

    print(f"Encontrados {len(match_folders)} partidos descargados en {base_path}.")
    
    for idx, match_folder in enumerate(match_folders):
        match_id = match_folder.name
        print(f"\n[{idx+1}/{len(match_folders)}] Procesando {match_id}...")
        
        fixture_id = get_fixture_id_for_match(match_id)
        if not fixture_id:
            print(f"   ⚠️ No se encontró fixture_id para {match_id}. Saltando.")
            continue
            
        print(f"   ✅ Fixture ID: {fixture_id}")
        
        try:
            cmd = ["python3", "trigger_descarga_eventos.py", fixture_id, match_id]
            print(f"   Ejecutando: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                print(f"   ✅ Sincronización completada.")
            else:
                print(f"   ❌ Error en force_sync.py:")
                print(result.stderr)
        except Exception as e:
            print(f"   ❌ Excepción: {e}")

if __name__ == "__main__":
    main()
