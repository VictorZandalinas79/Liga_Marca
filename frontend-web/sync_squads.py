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

def sync_real_teams_and_players():
    # Solo buscamos archivos dentro de la carpeta que coincida con nuestro LEAGUE_ID
    # Esto evita procesar otras ligas que hayas descargado por error
    squad_files = list(BASE_PATH.glob(f"**/{ACTIVE_LEAGUE_ID}/**/squads/*.json"))
    
    if not squad_files:
        print(f"❌ No se encontraron archivos de squads para la liga {ACTIVE_LEAGUE_ID}")
        return

    print(f"Encontrados {len(squad_files)} archivos de equipos para la liga activa.")

    for file_path in squad_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            # Sincronizar Equipo
            team_info = data.get('team', {})
            team_id = team_info.get('id')
            if not team_id: continue

            team_payload = {
                "id": team_id,
                "name": team_info.get('name'),
                "short_name": team_info.get('shortName', ''),
                "code": team_info.get('code', '')
            }
            
            supabase.table("real_teams").upsert(team_payload).execute()

            # Sincronizar Jugadores
            players = data.get('players', [])
            players_payload = []
            
            for p in players:
                raw_pos = p.get('position', 'Forward')
                pos_map = {
                    "Goalkeeper": "Goalkeeper", "Defender": "Defender",
                    "Midfielder": "Midfielder", "Forward": "Forward", "Attacker": "Forward"
                }
                
                players_payload.append({
                    "id": p.get('id'),
                    "team_id": team_id,
                    "first_name": p.get('firstName'),
                    "last_name": p.get('lastName'),
                    "short_name": p.get('matchName') or p.get('shortLastName'),
                    "position": pos_map.get(raw_pos, "Forward"),
                    "status": p.get('status', 'active')
                })

            if players_payload:
                supabase.table("players").upsert(players_payload).execute()
                print(f"✅ Equipo {team_payload['name']} y sus jugadores sincronizados.")

if __name__ == "__main__":
    sync_real_teams_and_players()