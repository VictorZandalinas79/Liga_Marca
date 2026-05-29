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

class SeasonStatsScraper(BaseScraper):
    """
    Scraper de estadísticas acumuladas de temporada por equipo.
    CORREGIDO: URL idéntica al código legacy (Solo tmcl y ctst).
    """

    def _load_external_headers(self):
        """Carga headers del archivo JSON compartido."""
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

    def download_season_stats_from_list(self, competition_name, season_name, season_id, df_equipos):
        folder = f"{competition_name}/{season_name}/season_stats"
        print(f"📈 Iniciando descarga de Season Stats para {len(df_equipos)} equipos...")
        
        api_headers = self._load_external_headers()
        if not api_headers:
            api_headers = {'Referer': 'https://www.scoresway.com/'}
        
        count_ok = 0
        count_err = 0
        count_skip = 0
        
        for index, row in df_equipos.iterrows():
            team_id = row['id']
            team_name = row['nombre']
            
            if not team_id or pd.isna(team_id):
                continue
                
            safe_name = sanitize_dir_name(team_name)
            filename = f"{safe_name}_{team_id}.json"
            full_path = self.base_output_path / folder / filename
            
            # --- VALIDACIÓN DE ARCHIVO EXISTENTE ---
            # Si tiene error 10201 guardado, lo volvemos a bajar
            should_download = True
            if full_path.exists():
                try:
                    with open(full_path, 'r', encoding='utf-8') as f:
                        existing_data = json.load(f)
                    if "errorCode" in existing_data:
                        should_download = True
                    else:
                        count_skip += 1
                        should_download = False
                except:
                    should_download = True

            if not should_download:
                continue

            # --- CONSTRUCCIÓN URL (LEGACY STYLE) ---
            # Quitamos 'type=team'.
            # Usamos tmcl (Temporada Hash) y ctst (Equipo ID).
            # Tal cual tu código: ?_rt=c&tmcl={torneo_id}&ctst={squad_id}...
            url = (
                f"https://api.performfeeds.com/soccerdata/seasonstats/"
                f"{self.sdapi_outlet_key}/"
                f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
                f"&tmcl={season_id}"
                f"&ctst={team_id}"
            )
            
            try:
                response = requests.get(url, headers=api_headers, timeout=10)
                response.raise_for_status()
                content = response.text
                
                start_idx = content.find('{')
                end_idx = content.rfind('}')
                
                if start_idx != -1 and end_idx != -1:
                    clean_json = content[start_idx : end_idx + 1]
                    data = json.loads(clean_json)
                    
                    if "errorCode" in data:
                        print(f"   ⚠️ API Error {data['errorCode']} para {team_name}")
                        count_err += 1
                    else:
                        self.save_data(data, folder, filename)
                        count_ok += 1
                else:
                    print(f"   ⚠️ Respuesta malformada para {team_name}")
                    count_err += 1

            except Exception as e:
                print(f"   ❌ Error en equipo {team_name} ({team_id}): {e}")
                count_err += 1
            
            time.sleep(0.15)
            
            if (count_ok + count_err + count_skip) % 10 == 0:
                print(f"   ⏳ Progreso: {count_ok + count_err + count_skip}/{len(df_equipos)}...")

        print(f"\n🏁 Fin Season Stats.")
        print(f"   ✅ Descargados OK: {count_ok}")
        print(f"   ⏭️ Saltados: {count_skip}")
        print(f"   ❌ Errores API: {count_err}")