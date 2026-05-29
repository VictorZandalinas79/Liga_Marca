#!/usr/bin/env python3
"""
Script para obtener cookies de sesión de Scoresway/performfeeds.
Estas cookies son necesarias para acceder a la API.

Uso:
    python3 get_cookies.py
"""

import requests
import json
import os

def get_session_cookies():
    """
    Obtiene cookies de sesión haciendo una petición inicial a Scoresway.
    """
    session = requests.Session()

    # 1. Petición inicial a Scoresway para establecer sesión
    url = "https://www.scoresway.com/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://www.google.com/',
    }

    print("🍪 Obteniendo cookies de sesión...")
    response = session.get(url, headers=headers, timeout=15)

    print(f"Status: {response.status_code}")
    print(f"Cookies obtenidas: {len(session.cookies)}")

    # 2. Extraer cookies relevantes
    cookies_dict = session.cookies.get_dict()
    print(f"Cookies: {list(cookies_dict.keys())}")

    # 3. Construir headers para la API
    api_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.scoresway.com/',
        'Accept': 'application/json',
    }

    # 4. Probar la API con las cookies
    print("\n🧪 Probando API con cookies...")

    # Probar endpoint de competiciones
    test_url = "https://api.performfeeds.com/soccerdata/competitions/?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"

    response = session.get(test_url, headers=api_headers, timeout=15)
    print(f"Status competiciones: {response.status_code}")

    if response.status_code == 200:
        content = response.text
        start = content.find('{')
        end = content.rfind('}')
        if start != -1 and end != -1:
            data = json.loads(content[start:end+1])
            if 'httpStatus' in data and data['httpStatus'] == '403':
                print("❌ API requiere autenticación adicional (errorCode: {})".format(data.get('errorCode', 'N/A')))
            else:
                print("✅ API accesible con cookies")
                print(f"Claves: {list(data.keys())[:10]}")
    else:
        print(f"Error: {response.text[:200]}")

    # 5. Guardar cookies para uso futuro
    output_dir = os.path.join(os.path.dirname(__file__), 'backend-engine', 'headers')
    os.makedirs(output_dir, exist_ok=True)

    headers_file = os.path.join(output_dir, 'headers.json')

    # Guardar headers completos incluyendo cookies
    full_headers = {
        **api_headers,
        'Cookie': '; '.join([f"{k}={v}" for k, v in cookies_dict.items()])
    }

    with open(headers_file, 'w', encoding='utf-8') as f:
        json.dump(full_headers, f, indent=2)

    print(f"\n💾 Headers guardados en: {headers_file}")
    print(f"Headers: {list(full_headers.keys())}")

    return session, cookies_dict

if __name__ == "__main__":
    get_session_cookies()
