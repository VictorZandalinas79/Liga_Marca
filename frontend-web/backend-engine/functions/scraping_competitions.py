import sys
import os
import json
import time
import pandas as pd
from bs4 import BeautifulSoup

# --- IMPORTS DE SELENIUM ---
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

# --- 1. AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from base import BaseScraper

class CompetitionScraper(BaseScraper):
    """
    Scraper de competiciones usando Selenium.
    Evita problemas de cookies/bloqueos WAF y extrae la estructura:
    Continents -> Countries -> Comps.
    """
    
    def scrape_all(self):
        url = "https://www.scoresway.com/en_GB/soccer/competitions"
        print(f"🌍 Iniciando Selenium para buscar competiciones en: {url}")
        print("   ⏳ Esto tomará unos segundos mientras carga la página...")

        df_competitions = pd.DataFrame()
        driver = None

        try:
            # --- CONFIGURACIÓN DEL DRIVER (Igual que en Seasons) ---
            chrome_options = Options()
            # Descomenta esta linea si no quieres ver la ventana del navegador:
            chrome_options.add_argument("--headless") 
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--no-sandbox")
            # Truco para ocultar que es un bot
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")
            chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

            # Iniciar Chrome
            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
            
            # Navegar
            driver.get(url)
            
            # Esperar tiempo prudente para superar el 'Bot Manager' (pantalla de carga)
            # Scoresway suele tardar 5s en verificar. Ponemos 10s por seguridad.
            time.sleep(10)
            
            # Extraer HTML final renderizado
            html_content = driver.page_source
            print("   ✅ HTML obtenido correctamente.")

            # Intentar parsear con la lógica que ya validamos
            df_competitions = self._parse_from_json_script(html_content)
            
            if not df_competitions.empty:
                output_file = self.base_output_path / "todas_las_competiciones.csv"
                self.base_output_path.mkdir(parents=True, exist_ok=True)
                df_competitions.to_csv(output_file, index=False)
                print(f"✅ ÉXITO TOTAL: {len(df_competitions)} competiciones encontradas.")
                print(f"💾 Guardado en: {output_file}")
            else:
                print("⚠️ Selenium cargó la página, pero no se extrajeron datos (JSON no encontrado).")

        except Exception as e:
            print(f"❌ Error crítico con Selenium: {e}")
            
        finally:
            if driver:
                driver.quit() # Cerrar navegador siempre

        return df_competitions

    def _parse_from_json_script(self, html_content):
        """
        Extrae el JSON del script #compData (Lógica validada).
        """
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
                print("   🗺️  Procesando estructura: Continents -> Countries -> Comps...")
                
                # 1. Iterar Continentes
                for continent in raw_data['continents']:
                    # 2. Iterar Países (clave 'countries')
                    countries = continent.get('countries', [])
                    
                    for country in countries:
                        country_name = country.get('name', 'Unknown')
                        country_slug = self._simple_slugify(country_name)
                        
                        # 3. Iterar Competiciones (clave 'comps')
                        comps = country.get('comps', [])
                        
                        for comp in comps:
                            c_id = comp.get('id')
                            c_name = comp.get('name') or comp.get('title')
                            
                            if c_id and c_name:
                                c_slug = comp.get('slug') or self._simple_slugify(c_name)
                                
                                # Construir URL
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
                # Fallback por si cambia la estructura de nuevo
                print(f"   ⚠️ Estructura diferente. Claves raíz: {list(raw_data.keys())}")

            return pd.DataFrame(competitions_list)

        except Exception as e:
            print(f"   ❌ Error procesando JSON interno: {e}")
            return pd.DataFrame()

    def _simple_slugify(self, text):
        if not text: return "unknown"
        return text.lower().replace(' ', '-').replace('/', '-').replace('.', '')