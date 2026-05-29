import sys
import os
import json
import time
import requests
import pandas as pd

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from base import BaseScraper
from functions.utils_common import sanitize_dir_name

class SquadsScraper(BaseScraper):
    """
    Scraper de Planteles (Squads).
    Versión DEBUG: Busca múltiples variantes de claves e imprime estructura si falla.
    """

    def _load_external_headers(self):
        """Reutilizamos los headers del fixture."""
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_path = os.path.join(base_dir, 'headers', 'headers.json')
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                headers = json.load(f)
            headers = {k: v for k, v in headers.items() if not k.startswith(':')}
            for k in ['Host', 'Authority', 'authority', 'host']: headers.pop(k, None)
            return headers
        except:
            return None

    def download_squads_for_season(self, competition_name, season_name, season_id):
        folder = f"{competition_name}/{season_name}/squads"
        print(f"👥 Descargando Planteles (tmcl={season_id})...")
        
        api_headers = self._load_external_headers()
        if not api_headers:
            api_headers = {'Referer': 'https://www.scoresway.com/'}
        
        page = 1
        page_size = 100 
        teams_processed = 0
        
        while True:
            print(f"   🔄 Descargando página {page}...")
            
            url = (
                f"https://api.performfeeds.com/soccerdata/squads/"
                f"{self.sdapi_outlet_key}/"
                f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
                f"&tmcl={season_id}"
                f"&detailed=yes"
                f"&_pgSz={page_size}"
                f"&_pgNm={page}"
            )
            
            try:
                response = requests.get(url, headers=api_headers, timeout=15)
                content = response.text
                start_idx = content.find('{')
                end_idx = content.rfind('}')
                
                if start_idx != -1 and end_idx != -1:
                    data = json.loads(content[start_idx : end_idx + 1])
                    
                    # 1. ENCONTRAR LA LISTA PRINCIPAL
                    items = []
                    for key in ['squad', 'person', 'contestant', 'teams']:
                        if key in data:
                            items = data[key]
                            print(f"      -> Lista encontrada bajo la clave: '{key}'")
                            break
                    
                    if not items:
                        print(f"   ⚠️ No se encontró lista de equipos. Claves disponibles: {list(data.keys())}")
                        break
                        
                    # 2. PROCESAR CADA ITEM
                    for i, item in enumerate(items):
                        team_name = "Unknown"
                        team_id = None
                        contestant_obj = {}

                        # --- ESTRATEGIA MULTI-CLAVE PARA ENCONTRAR EL NOMBRE ---
                        
                        # Opción A: Objeto 'contestant' anidado (Estructura clásica)
                        if 'contestant' in item and isinstance(item['contestant'], dict):
                            team_name = item['contestant'].get('name', 'Unknown')
                            team_id = item['contestant'].get('id')
                            contestant_obj = item['contestant']
                        
                        # Opción B: Claves planas (Estructura Bulk a veces)
                        elif 'contestantName' in item:
                            team_name = item.get('contestantName')
                            team_id = item.get('contestantId')
                            contestant_obj = {'id': team_id, 'name': team_name}
                            
                        # Opción C: Objeto directo (El item ES el equipo)
                        elif 'name' in item and 'id' in item:
                            team_name = item.get('name')
                            team_id = item.get('id')
                            contestant_obj = {'id': team_id, 'name': team_name}
                            
                        # Opción D: Descripción como nombre
                        elif 'description' in item:
                            team_name = item.get('description')
                            team_id = item.get('id', 'no_id')
                            contestant_obj = {'id': team_id, 'name': team_name}

                        # --- DEBUG DE EMERGENCIA ---
                        # Si es el primer item y no encontramos nombre, imprimimos sus claves
                        if i == 0 and (team_name == 'Unknown' or team_id is None):
                            print(f"\n   🛑 DEBUG CLAVES DEL ITEM (Copia esto si falla):")
                            print(f"      {list(item.keys())}")
                            if len(item.keys()) > 0:
                                first_key = list(item.keys())[0]
                                print(f"      Ejemplo valor '{first_key}': {item[first_key]}")
                            print("-" * 40)

                        # --- BUSCAR JUGADORES DENTRO DEL ITEM ---
                        players = []
                        for key in ['squad', 'person', 'players', 'athlete']:
                            if key in item:
                                players = item[key]
                                break

                        # --- GUARDAR ---
                        if team_id and team_name != 'Unknown':
                            safe_name = sanitize_dir_name(team_name)
                            filename = f"{safe_name}_{team_id}.json"
                            
                            team_data = {
                                "team": contestant_obj,
                                "players": players
                            }
                            
                            self.save_data(team_data, folder, filename)
                            teams_processed += 1
                    
                    if len(items) < page_size:
                        break
                    page += 1
                    time.sleep(0.5)
                else:
                    print("   ❌ Error JSONP.")
                    break
            except Exception as e:
                print(f"   ❌ Error: {e}")
                break
        
        print(f"\n🏁 Fin de Squads. Procesados: {teams_processed}")