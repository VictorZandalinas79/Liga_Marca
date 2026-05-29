#!/usr/bin/env python3
"""
Obtiene el ID de temporada (tmcl) para LaLiga 2025/2026.
Intenta primero con Selenium, o usa requests si no está disponible.
"""

import json
import requests
from bs4 import BeautifulSoup

# Cargar configuración
with open('settings.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

LEAGUE_NAME = config['active_league']['name']
SEASON_NAME = config['active_league']['season_name']

def get_season_id_with_selenium():
    """Intenta con Selenium primero."""
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from webdriver_manager.chrome import ChromeDriverManager
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        url = "https://www.scoresway.com/en_GB/soccer/spain/laliga/"
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

        driver = webdriver.Chrome(service=ChromeDriverManager().install(), options=chrome_options)
        try:
            driver.get(url)
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "select[name='season']"))
            )
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            select = soup.find('select', {'name': 'season'})
            if select:
                for opt in select.find_all('option'):
                    name = opt.get_text(strip=True)
                    value = opt.get('value', '')
                    if name == SEASON_NAME and value:
                        parts = value.strip('/').split('/')
                        season_id = parts[-2] if parts[-1] in ['fixtures', 'results', 'tables'] else parts[-1]
                        return season_id
        finally:
            driver.quit()
    except ImportError:
        print("   ⚠️ Selenium no disponible, probando con requests...")
    except Exception as e:
        print(f"   ⚠️ Selenium falló: {e}")
    return None


def get_season_id_with_requests():
    """Alternativa con requests + BeautifulSoup."""
    print("   🔄 Intentando con requests...")

    url = "https://www.scoresway.com/en_GB/soccer/spain/laliga/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')
        select = soup.find('select', {'name': 'season'})

        if select:
            print("   ✅ Selector de temporadas encontrado")
            for opt in select.find_all('option'):
                name = opt.get_text(strip=True)
                value = opt.get('value', '')
                print(f"   - {name}")
                if name == SEASON_NAME and value:
                    parts = value.strip('/').split('/')
                    season_id = parts[-2] if parts[-1] in ['fixtures', 'results', 'tables'] else parts[-1]
                    print(f"   ✅ Encontrada: {name} -> ID: {season_id}")
                    return season_id
        else:
            print("   ⚠️ No se encontró selector de temporadas")
            # La página puede requerir JS para renderizar el selector
            return None

    except Exception as e:
        print(f"   ❌ Error con requests: {e}")
        return None

    return None


def try_known_ids():
    """Prueba IDs conocidos de LaLiga 2025/2026."""
    # IDs comunes de LaLiga en scoresway
    # La estructura suele ser numérica
    print("   🔄 Probando IDs conocidos de LaLiga...")

    # El league_id que tenemos es: 34pl8szyvrbwcmfkuocjm3r6t
    # Necesitamos el season_id (tmcl) que suele ser numérico

    # Probemos obtener la lista de competiciones desde la API
    SDAPI_OUTLET_KEY = os.environ.get("SDAPI_OUTLET_KEY", "ft1tiv1inq7v1sk3y9tv12yh5")

    # Endpoint de competiciones
    url = f"https://api.performfeeds.com/soccerdata/competitions/{SDAPI_OUTLET_KEY}/?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"

    headers = {
        'Referer': 'https://www.scoresway.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)
        content = response.text

        start_idx = content.find('{')
        end_idx = content.rfind('}')
        data = json.loads(content[start_idx:end_idx + 1])

        print(f"   Claves API: {list(data.keys())}")

        # Buscar LaLiga en la respuesta
        competitions = data.get('competition', [])
        for comp in competitions:
            if LEAGUE_NAME.lower() in comp.get('name', '').lower():
                print(f"   ✅ Competición encontrada: {comp.get('name')}")
                print(f"      ID: {comp.get('id')}")

                # Buscar seasons
                seasons = comp.get('seasons', [])
                for s in seasons:
                    print(f"      - Season: {s.get('name')} (ID: {s.get('id')})")
                    if SEASON_NAME in s.get('name', ''):
                        return s.get('id')

                # Si no hay seasons, probar currentSeason
                current = comp.get('currentSeason', {})
                if current:
                    print(f"      Current season: {current.get('name')} (ID: {current.get('id')})")
                    return current.get('id')

        return None

    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None


if __name__ == "__main__":
    import os

    print(f"🔍 Buscando ID para: {LEAGUE_NAME} - {SEASON_NAME}")

    # 1. Intentar Selenium
    season_id = get_season_id_with_selenium()

    # 2. Intentar con requests
    if not season_id:
        season_id = get_season_id_with_requests()

    # 3. Probar IDs conocidos
    if not season_id:
        season_id = try_known_ids()

    if season_id:
        print(f"\n{'='*50}")
        print(f"✅ ID de temporada obtenido: {season_id}")
        print(f"\n💡 Actualiza settings.json con este valor:")
        print(f'   "season_id": "{season_id}"')
        print(f"\nO ejecuta:")
        print(f"   python3 update_settings.py {season_id}")
    else:
        print("\n❌ No se pudo obtener el ID de temporada")
        print("\n💡 Solución alternativa:")
        print("   1. Ve a https://www.scoresway.com/en_GB/soccer/spain/laliga/")
        print("   2. Selecciona la temporada 2025/2026")
        print("   3. Copia el ID de la URL (ej: .../laliga/ID/fixtures)")
        print("   4. Ejecuta: python3 update_settings.py <ID>")
