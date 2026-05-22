import sys
import os
import json
import time
import requests
import pandas as pd

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from base import BaseScraper

class MatchDataScraper(BaseScraper):
    """
    Scraper de datos detallados del partido (Metadata, Estadio, Árbitros).
    Consulta el endpoint 'match' para un ID específico.
    """

    def _load_external_headers(self):
        """Reutilizamos los headers del fixture."""
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_path = os.path.join(base_dir, 'headers', 'headers.json')
        
        if not os.path.exists(json_path):
            return None

        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                headers = json.load(f)
            # Limpieza
            headers = {k: v for k, v in headers.items() if not k.startswith(':')}
            for k in ['Host', 'Authority', 'authority', 'host']:
                headers.pop(k, None)
            return headers
        except:
            return None

    def download_match_data_for_season(self, competition_name, season_name, df_matches):
        """
        Descarga la info detallada (match_data) para cada partido en df_matches.
        """
        folder = f"{competition_name}/{season_name}/match_data"
        
        print(f"🏟️  Descargando Info Detallada (Match Data) para: {competition_name} - {season_name}")
        
        # Headers
        api_headers = self._load_external_headers()
        if not api_headers:
            api_headers = {
                'Referer': 'https://www.scoresway.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }

        count_ok = 0
        count_skip = 0
        count_err = 0

        for index, row in df_matches.iterrows():
            match_id = row.get('id_partido')
            
            if not match_id or pd.isna(match_id):
                continue

            # Verificar si ya existe
            full_path = self.base_output_path / folder / f"{match_id}.json"
            if full_path.exists():
                count_skip += 1
                continue

            # --- CONSTRUCCIÓN URL ---
            # Endpoint: match
            # Estructura: /match/{KEY}/{MATCH_ID}
            # Parámetros: sps=widgets (Vital), live=yes
            url = (
                f"https://api.performfeeds.com/soccerdata/match/"
                f"{self.sdapi_outlet_key}/"
                f"{match_id}"
                f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
                f"&live=yes"
            )
            
            try:
                response = requests.get(url, headers=api_headers, timeout=10)
                response.raise_for_status()
                content = response.text
                
                # Limpieza JSONP
                start_idx = content.find('{')
                end_idx = content.rfind('}')
                
                if start_idx != -1 and end_idx != -1:
                    clean_json = content[start_idx : end_idx + 1]
                    data = json.loads(clean_json)
                    
                    self.save_data(data, folder, f"{match_id}.json")
                    count_ok += 1
                else:
                    print(f"   ⚠️ Respuesta vacía para {match_id}")
                    count_err += 1

            except Exception as e:
                print(f"   ❌ Error en partido {match_id}: {e}")
                count_err += 1
            
            # Pausa pequeña
            time.sleep(0.1)
            
            if (count_ok + count_err + count_skip) % 50 == 0:
                print(f"   ⏳ Progreso: {count_ok + count_err + count_skip}/{len(df_matches)}...")

        print(f"\n🏁 Fin de descarga de Match Data.")
        print(f"   ✅ Descargados: {count_ok}")
        print(f"   ⏭️ Saltados: {count_skip}")
        print(f"   ❌ Errores: {count_err}")