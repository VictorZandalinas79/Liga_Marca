import sys
import os
import json
import pandas as pd
import cloudscraper
from bs4 import BeautifulSoup

# --- 1. AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from base import BaseScraper

class CompetitionScraper(BaseScraper):
    """
    Scraper de competiciones.
    Estructura confirmada: Continents -> Countries -> Comps.
    """
    
    def scrape_all(self):
        url = "https://www.scoresway.com/en_GB/soccer/competitions"
        print(f"🌍 Buscando competiciones con Cloudscraper en: {url}")

        try:
            # Usar Cloudscraper con la sesión existente
            scraper = cloudscraper.create_scraper(sess=self.session)
            response = scraper.get(url)
            response.raise_for_status()
            
            if "bm-verify" in response.text:
                print("❌ ALERTA: Cloudscraper detectó bloqueo (bm-verify).")
                return pd.DataFrame()

            # Intentar parsear
            df_competitions = self._parse_from_json_script(response.text)
            
            if not df_competitions.empty:
                output_file = self.base_output_path / "todas_las_competiciones.csv"
                self.base_output_path.mkdir(parents=True, exist_ok=True)
                df_competitions.to_csv(output_file, index=False)
                print(f"✅ ÉXITO TOTAL: {len(df_competitions)} competiciones encontradas.")
                print(f"💾 Guardado en: {output_file}")
            else:
                print("⚠️ Se accedió a la web, pero no se extrajeron datos (Revisar logs internos).")

            return df_competitions

        except Exception as e:
            print(f"❌ Error descargando competiciones: {e}")
            return pd.DataFrame()

    def _parse_from_json_script(self, html_content):
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Buscar script por ID
        script = soup.find('script', {'id': 'compData', 'type': 'application/json'})
        
        if not script or not script.string:
            print("   ❌ No se encontró el script JSON <script id='compData'>.")
            return pd.DataFrame()

        try:
            raw_data = json.loads(script.string)
            competitions_list = []
            
            # --- LÓGICA DE EXTRACCIÓN CONFIRMADA ---
            # Ruta: continents -> countries -> comps
            
            if isinstance(raw_data, dict) and 'continents' in raw_data:
                print("   🗺️  Recorriendo estructura: Continents -> Countries -> Comps...")
                
                # 1. Iterar Continentes
                for continent in raw_data['continents']:
                    # 2. Iterar Países (clave 'countries')
                    countries = continent.get('countries', [])
                    
                    for country in countries:
                        country_name = country.get('name', 'Unknown')
                        # Generamos slug del país por si hace falta para la URL
                        country_slug = self._simple_slugify(country_name)
                        
                        # 3. Iterar Competiciones (clave 'comps')
                        comps = country.get('comps', [])
                        
                        for comp in comps:
                            c_id = comp.get('id')
                            c_name = comp.get('name') or comp.get('title')
                            
                            if c_id and c_name:
                                # Slug de la competición
                                c_slug = comp.get('slug') or self._simple_slugify(c_name)
                                
                                # Construir URL
                                # Patrón: /en_GB/soccer/{pais}/{competicion}/{id}/
                                url = comp.get('url') or comp.get('href')
                                if not url:
                                    url = f"https://www.scoresway.com/en_GB/soccer/{country_slug}/{c_slug}/{c_id}/"
                                elif not url.startswith('http'):
                                    url = f"https://www.scoresway.com{url}"

                                competitions_list.append({
                                    'competicion': c_name,
                                    'id_competicion': str(c_id),
                                    'area': country_name,
                                    'pais': country_name,
                                    'url': url,
                                    'format': comp.get('format', 'Domestic league')
                                })
            
            else:
                print(f"   ⚠️ El JSON no tiene la clave 'continents'. Claves raíz: {list(raw_data.keys())}")

            return pd.DataFrame(competitions_list)

        except Exception as e:
            print(f"   ❌ Error procesando JSON interno: {e}")
            return pd.DataFrame()

    def _simple_slugify(self, text):
        if not text: return "unknown"
        return text.lower().replace(' ', '-').replace('/', '-').replace('.', '')