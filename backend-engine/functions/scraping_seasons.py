import sys
import os
import time
import json
import pandas as pd
from bs4 import BeautifulSoup

# --- IMPORTS DE SELENIUM ---
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# --- AJUSTE DE RUTAS ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from base import BaseScraper
from functions.utils_common import get_season_name_from_url

class SeasonScraper(BaseScraper):
    """
    Scraper de temporadas usando Selenium.
    Ajustado para leer el selector <select name="season"> y guardar CSV al final.
    """
    
    def scrape_all_seasons(self, df_competitions):
        all_seasons = []
        
        print(f"🔄 Iniciando Selenium para buscar temporadas de {len(df_competitions)} competiciones...")
        
        # Configuración del Driver
        chrome_options = Options()
        # Si quieres ver el navegador, comenta la línea headless:
        chrome_options.add_argument("--headless") 
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

        driver = None
        
        try:
            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)
            
            for index, row in df_competitions.iterrows():
                comp_name = row.get('competicion') or row.get('name') or 'Unknown'
                url = row.get('url_fixture') or row.get('url')
                
                if not url: continue
                    
                print(f"   🔎 Navegando a: {comp_name}...")
                
                try:
                    driver.get(url)
                    
                    # 1. Esperar al selector correcto
                    try:
                        WebDriverWait(driver, 8).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, "select[name='season'], select#season-select"))
                        )
                    except:
                        # Si falla el wait, esperamos un poco manual y seguimos
                        time.sleep(2)

                    # 2. Parsear HTML
                    html = driver.page_source
                    soup = BeautifulSoup(html, 'html.parser')

                    # Buscar el select
                    select = soup.find('select', {'name': 'season'})
                    if not select:
                        select = soup.find('select', {'id': 'season-select'})
                    
                    found = False
                    if select:
                        options = select.find_all('option')
                        print(f"      🎉 Menú encontrado con {len(options)} temporadas.")
                        
                        for opt in options:
                            s_name = opt.get_text(strip=True)
                            s_value = opt.get('value') 
                            
                            if s_value:
                                try:
                                    # Extraer ID de la URL relativa
                                    parts = s_value.strip('/').split('/')
                                    if parts[-1] in ['fixtures', 'results', 'tables']:
                                        s_id = parts[-2]
                                    else:
                                        s_id = parts[-1]
                                    
                                    # Construir URL absoluta
                                    full_url = f"https://www.scoresway.com{s_value}"
                                    
                                    all_seasons.append({
                                        'competicion': comp_name,
                                        'temporada': s_name,
                                        'id_temporada': s_id,
                                        'id_competicion': row.get('id_competicion'),
                                        'url': full_url
                                    })
                                    found = True
                                except:
                                    pass
                    
                    if not found:
                        print("      ⚠️ No se extrajeron temporadas. Agregando actual por defecto.")
                        s_name = get_season_name_from_url(url) or "Current"
                        all_seasons.append({
                            'competicion': comp_name,
                            'temporada': s_name,
                            'id_temporada': 'current',
                            'id_competicion': row.get('id_competicion'),
                            'url': url
                        })

                except Exception as e:
                    print(f"      ❌ Error navegando: {e}")

        except Exception as e:
            print(f"❌ Error crítico Selenium: {e}")
            
        finally:
            if driver:
                driver.quit() # Cerramos navegador

        # --- AQUÍ ES DONDE SE GUARDA CORRECTAMENTE ---
        # 1. Convertimos la lista a DataFrame
        df_seasons = pd.DataFrame(all_seasons)

        # 2. Guardamos el CSV si hay datos
        if not df_seasons.empty:
            output_file = self.base_output_path / "todas_las_temporadas.csv"
            
            # Asegurar que la carpeta exista
            self.base_output_path.mkdir(parents=True, exist_ok=True)
            
            # Guardar
            df_seasons.to_csv(output_file, index=False)
            print(f"✅ ÉXITO TOTAL: {len(df_seasons)} temporadas encontradas.")
            print(f"💾 Guardado en: {output_file}")
        else:
            print("⚠️ No se encontraron temporadas para guardar.")

        return df_seasons