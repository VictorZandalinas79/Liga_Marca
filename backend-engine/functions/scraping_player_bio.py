import sys
import os
import json
import time
import requests
import pandas as pd
from glob import glob

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from base import BaseScraper

class PlayerBioScraper(BaseScraper):
    """
    Scraper de Biografías de Jugadores (Bio).
    CORREGIDO: Usa endpoint 'nlgdynamicplayerbio' + Season ID (tmcl).
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

    def _download_bio_file(self, player_id, season_id, folder, api_headers):
        """
        Descarga bio usando nlgdynamicplayerbio + tmcl.
        """
        filename = f"{player_id}.json"
        
        # --- NUEVA URL CORREGIDA ---
        # Endpoint: nlgdynamicplayerbio
        # prsn: ID Jugador
        
        # Construir URL de la API
        url = (
            f"https://api.performfeeds.com/soccerdata/nlgdynamicplayerbio/"
            f"{self.sdapi_outlet_key}/"
            f"?prsn={player_id}"
            f"&_rt=c&_fmt=jsonp&_lcl=en-gb&_clbk={self.callback_id}"
        )
        
        try:
            response = requests.get(url, headers=api_headers, timeout=10)
            
            if response.status_code == 404:
                return False
                
            response.raise_for_status()
            content = response.text
            
            start_idx = content.find('{')
            end_idx = content.rfind('}')
            
            if start_idx != -1 and end_idx != -1:
                clean_json = content[start_idx : end_idx + 1]
                data = json.loads(clean_json)
                
                if "errorCode" in data:
                    print(f"   ⚠️ API Error {data['errorCode']} para {player_id}")
                    return False
                else:
                    self.save_data(data, folder, filename)
                    return True
            else:
                print(f"   ❌ Error formato JSONP para {player_id}")
                return False

        except Exception as e:
            print(f"   ❌ Excepción descargando {player_id}: {e}")
            return False

    def download_bios_from_id_list(self, competition_name, season_name, season_id, id_list):
        """
        Descarga biografías iterando sobre una lista de IDs.
        Requiere season_id.
        """
        folder = f"{competition_name}/{season_name}/player_bio"
        print(f"👤 Descargando Bios (Endpoint NLG) para {len(id_list)} jugadores...")
        
        api_headers = self._load_external_headers()
        if not api_headers: api_headers = {'Referer': 'https://www.scoresway.com/'}
        
        count_ok = 0
        count_skip = 0
        count_err = 0
        
        for i, player_id in enumerate(id_list):
            if not player_id or pd.isna(player_id): continue
            
            player_id = str(player_id).strip()
            full_path = self.base_output_path / folder / f"{player_id}.json"
            
            if full_path.exists():
                count_skip += 1
                continue
            
            # Pasamos el season_id a la función interna
            success = self._download_bio_file(player_id, season_id, folder, api_headers)
            
            if success: count_ok += 1
            else: count_err += 1
            
            time.sleep(0.15) # Un poco más de pausa por ser endpoint pesado
            
            if (i + 1) % 20 == 0:
                print(f"   ⏳ Progreso: {i + 1}/{len(id_list)}...")

        print(f"\n🏁 Fin de descarga de Biografías.")
        print(f"   ✅ Nuevos descargados: {count_ok}")
        print(f"   ⏭️ Saltados: {count_skip}")
        print(f"   ❌ Errores: {count_err}")