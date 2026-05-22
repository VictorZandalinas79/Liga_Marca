import os
import json
from supabase import create_client, Client
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# --- NUEVA LÓGICA: CARGAR SETTINGS ---
with open('settings.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

ACTIVE_LEAGUE_ID = config['active_league']['id']
# -------------------------------------

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BASE_PATH = Path("./data")

def sync_fixtures():
    if not BASE_PATH.exists():
        print(f"❌ Error: El directorio {BASE_PATH} no existe.")
        return

    fixture_files = list(BASE_PATH.glob("**/fixture/fixture.json"))

    if not fixture_files:
        print(f"⚠️ No se encontraron archivos fixture.json en {BASE_PATH}")
        return

    print(f"🔍 Encontrados {len(fixture_files)} archivos de fixtures")

    for file_path in fixture_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            matches = data if isinstance(data, list) else data.get('match', [])
            
            fixtures_payload = []
            
            for m in matches:
                info = m.get('matchInfo', {})
                
                # --- FILTRO DE SEGURIDAD ---
                # Comprobamos si el ID de competición del JSON coincide con el de settings.json
                comp_id = info.get('competition', {}).get('id')
                
                if comp_id != ACTIVE_LEAGUE_ID:
                    continue # Si no es nuestra liga, ignoramos este partido
                # ---------------------------

                start_date = info.get('date', '').replace('Z', '')
                start_time = info.get('time', '').replace('Z', '')
                full_timestamp = f"{start_date}T{start_time}"

                fixtures_payload.append({
                    "id": info.get('id'),
                    "matchday": int(info.get('week', 0)),
                    "home_team_id": info.get('contestant', [{},{}])[0].get('id'),
                    "away_team_id": info.get('contestant', [{},{}])[1].get('id'),
                    "start_time": full_timestamp,
                    "status": info.get('status', 'scheduled')
                })

            if fixtures_payload:
                supabase.table("fixtures").upsert(fixtures_payload).execute()
                print(f"✅ Sincronizados {len(fixtures_payload)} partidos de la liga activa ({ACTIVE_LEAGUE_ID}).")
            else:
                print(f"⚠️ No se encontraron partidos para la liga {ACTIVE_LEAGUE_ID} en este archivo.")

if __name__ == "__main__":
    sync_fixtures()