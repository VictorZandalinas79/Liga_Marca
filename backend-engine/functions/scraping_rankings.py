import sys
import os
import json
import time
import requests
import pandas as pd

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from base import BaseScraper

class RankingsScraper(BaseScraper):
    """
    Scraper de Rankings (Goleadores, etc.).
    CORREGIDO: URL Legacy sin parámetro 'type'. Descarga el ranking por defecto.
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

    def download_rankings_for_season(self, competition_name, season_name, season_id):
        """
        Descarga Rankings usando la estructura Legacy (sin type).
        Args:
            season_id (str): Hash de la temporada (tmcl).
        """
        folder = f"{competition_name}/{season_name}/rankings"
        print(f"🏅 Descargando Rankings para: {competition_name} - {season_name}")
        
        api_headers = self._load_external_headers()
        if not api_headers:
            api_headers = {'Referer': 'https://www.scoresway.com/'}
            
        # Nombre genérico porque no sabemos qué tipo traerá por defecto (suele ser Goles)
        filename = "rankings_general.json"
        full_path = self.base_output_path / folder / filename
        
        if full_path.exists():
            # print(f"   ⏭️ Saltando (Ya existe)")
            return

        # --- CONSTRUCCIÓN URL LEGACY ---
        # Endpoint: rankings
        # tmcl: ID Temporada
        # SIN PARAMETRO TYPE
        url = (
            f"https://api.performfeeds.com/soccerdata/rankings/"
            f"{self.sdapi_outlet_key}/"
            f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
            f"&tmcl={season_id}"
        )
        
        try:
            response = requests.get(url, headers=api_headers, timeout=10)
            response.raise_for_status()
            content = response.text
            
            start_idx = content.find('{')
            end_idx = content.rfind('}')
            
            if start_idx != -1 and end_idx != -1:
                data = json.loads(content[start_idx : end_idx + 1])
                
                if "errorCode" in data:
                    print(f"   ⚠️ API Error {data['errorCode']}")
                else:
                    # Guardamos
                    self.save_data(data, folder, filename)
                    
                    # Pequeño análisis para contarle al usuario qué bajó
                    desc = "Datos"
                    if 'ranking' in data:
                        items = data['ranking']
                        if isinstance(items, list) and len(items) > 0:
                            # Intentamos adivinar qué es mirando el primer item
                            first = items[0]
                            # Si tiene 'goals', es de goleadores
                            if 'goals' in first: desc = "Goleadores"
                            elif 'assists' in first: desc = "Asistencias"
                            elif 'yellowCards' in first: desc = "Tarjetas"
                            
                        print(f"   ✅ Guardado: rankings_general.json ({len(items)} items - Posiblemente {desc})")
                    else:
                        print(f"   ✅ Guardado JSON (Estructura desconocida)")
            else:
                print(f"   ❌ Error JSONP")

        except Exception as e:
            print(f"   ❌ Error descargando: {e}")