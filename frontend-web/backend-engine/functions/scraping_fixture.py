import sys
import os
import json
import requests
import pandas as pd

# --- 1. AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from base import BaseScraper

class FixtureScraper(BaseScraper):
    """
    Scraper de Fixture usando API con Headers externos y parámetro 'sps=widgets'.
    """

    def download_fixture_for_season(self, season_row):
        if isinstance(season_row, pd.DataFrame):
            if not season_row.empty:
                season_row = season_row.iloc[0]
            else:
                return False

        comp_name = season_row.get('competicion', 'Unknown')
        season_name = season_row.get('temporada', 'Unknown')
        season_hash_id = season_row.get('id_temporada')

        if not season_hash_id or season_hash_id == 'current':
            print(f"⚠️ Faltan IDs válidos para {comp_name}.")
            return False

        return self.download_fixture_by_id(season_hash_id, comp_name, season_name)

    def _load_external_headers(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_path = os.path.join(base_dir, 'headers', 'headers.json')
        
        if not os.path.exists(json_path):
            return None

        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                headers = json.load(f)
            # Limpieza básica
            headers = {k: v for k, v in headers.items() if not k.startswith(':')}
            for k in ['Host', 'Authority', 'authority', 'host']:
                headers.pop(k, None)
            return headers
        except:
            return None

    def download_fixture_by_id(self, season_hash_id, competition_name, season_name):
        folder = f"{competition_name}/{season_name}/fixture"
        print(f"📅 Descargando Fixture (API): {competition_name} - {season_name}")

        # --- URL ACTUALIZADA CON SPS=WIDGETS ---
        # Agregamos también _clbk=callback para asegurar formato standard
        url = (
            f"https://api.performfeeds.com/soccerdata/match/"
            f"{self.sdapi_outlet_key}/"
            f"?_fmt=jsonp&_rt=c&tmcl={season_hash_id}&live=yes&_pgSz=400&_lcl=en"
            f"&sps=widgets&_clbk=callback"
        )

        api_headers = self._load_external_headers()
        if not api_headers:
             api_headers = {
                'Referer': 'https://www.scoresway.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }

        try:
            response = requests.get(url, headers=api_headers, timeout=15)
            response.raise_for_status()
            content = response.text
            
            # Limpieza JSONP
            start_idx = content.find('{')
            end_idx = content.rfind('}')
            
            if start_idx != -1 and end_idx != -1:
                clean_json_str = content[start_idx : end_idx + 1]
                data = json.loads(clean_json_str)
            else:
                print("   ❌ Respuesta malformada (no se halló JSON).")
                with open("debug_fail.txt", "w") as f: f.write(content)
                return False
            
            # Guardado
            matches = []
            if 'match' in data:
                matches = data['match']
            
            if matches:
                self.save_data(matches, folder, "fixture.json")
                print(f"   ✅ ÉXITO: {len(matches)} partidos descargados.")
                print(f"   💾 Guardado en: {folder}/fixture.json")
                return True
            else:
                print(f"   ⚠️ API OK, pero lista de partidos vacía.")
                return False

        except Exception as e:
            print(f"   ❌ Error API: {e}")
            return False