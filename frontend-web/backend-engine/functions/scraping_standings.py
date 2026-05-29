import sys
import os
import json
import time
import requests
import pandas as pd

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from base import BaseScraper

class StandingsScraper(BaseScraper):
    """
    Scraper de tablas de posiciones (Standings).
    Usa headers externos y la estructura de URL legacy.
    """

    def _load_external_headers(self):
        """Reutilizamos los headers del fixture."""
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_path = os.path.join(base_dir, 'headers', 'headers.json')
        
        if not os.path.exists(json_path):
            print("⚠️ No se encontró headers.json, usando headers básicos.")
            return None

        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                headers = json.load(f)
            # Limpieza para requests (quitamos pseudo-headers)
            headers = {k: v for k, v in headers.items() if not k.startswith(':')}
            for k in ['Host', 'Authority', 'authority', 'host']:
                headers.pop(k, None)
            return headers
        except Exception as e:
            print(f"⚠️ Error leyendo headers: {e}")
            return None

    def download_standings_for_season(self, competition_name, season_name, season_id):
        """
        Descarga la tabla de posiciones.
        Args:
            season_id (str): El hash de la temporada (que en esta API va en tmcl).
        """
        folder = f"{competition_name}/{season_name}/standings"
        
        print(f"🏆 Descargando Tabla de Posiciones para: {competition_name} - {season_name}")
        
        # 1. Cargar Headers
        api_headers = self._load_external_headers()
        if not api_headers:
            api_headers = {
                'Referer': 'https://www.scoresway.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }

        # 2. Construir URL (Igual a tu script legacy)
        # tmcl = ID Temporada (Hash)
        # live = yes (Vital)
        # sps = widgets (Vital)
        # Quité 'type=total' para ser fiel a tu código original
        url = (
            f"https://api.performfeeds.com/soccerdata/standings/"
            f"{self.sdapi_outlet_key}/"
            f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
            f"&tmcl={season_id}"
            f"&live=yes"
        )
        
        # --- DEBUG: IMPRIMIR URL ---
        # print("-" * 60)
        # print(f"🔗 URL GENERADA: {url}")
        # print("-" * 60)
        
        try:
            response = requests.get(url, headers=api_headers, timeout=10)
            
            # Si da error HTTP, lo mostramos
            if response.status_code != 200:
                print(f"❌ Error HTTP {response.status_code}")
                print(f"   Respuesta: {response.text[:200]}")
                return False

            content = response.text
            
            # Limpieza JSONP
            start_idx = content.find('{')
            end_idx = content.rfind('}')
            
            if start_idx != -1 and end_idx != -1:
                clean_json = content[start_idx : end_idx + 1]
                data = json.loads(clean_json)
                
                # Chequeo de errores de API (como el 10201) dentro del JSON válido
                if "errorCode" in data:
                    print(f"❌ La API devolvió error lógico: {data}")
                    return False
                
                # Guardado
                self.save_data(data, folder, "standings.json")
                print(f"   ✅ Tabla guardada en: {folder}/standings.json")
                return True
            else:
                print(f"   ⚠️ Respuesta malformada o vacía: {content[:100]}")
                return False

        except Exception as e:
            print(f"   ❌ Excepción al descargar: {e}")
            return False