#!/usr/bin/env python3
"""
Descarga los fixtures (partidos) y squads (planteles) de la liga activa desde la API.
Los guarda en data/{liga}/{temporada}/
"""

import os
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Cargar configuración
with open('settings.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

ACTIVE_LEAGUE_ID = config['active_league']['id']
LEAGUE_NAME = config['active_league']['name']
SEASON_NAME = config['active_league']['season_name']
SEASON_ID = config['active_league'].get('season_id')

# Credenciales API
SDAPI_OUTLET_KEY = os.environ.get("SDAPI_OUTLET_KEY", "ft1tiv1inq7v1sk3y9tv12yh5")

def load_headers():
    """Carga headers desde headers/headers.json si existe."""
    headers_path = Path('headers/headers.json')
    if headers_path.exists():
        try:
            with open(headers_path, 'r', encoding='utf-8') as f:
                headers = json.load(f)
            headers = {k: v for k, v in headers.items() if not k.startswith(':')}
            for k in ['Host', 'Authority', 'authority', 'host']:
                headers.pop(k, None)
            return headers
        except Exception as e:
            print(f"⚠️ Error al cargar headers: {e}")

    return {
        'Referer': 'https://www.scoresway.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

def get_season_id(league_id: str) -> str | None:
    """
    Obtiene el ID de la temporada actual para una liga.
    La API de performfeeds usa 'tmcl' que es el ID de temporada, no de liga.
    """
    # Primero necesitamos obtener la lista de competiciones para encontrar el tmcl
    url = "https://api.performfeeds.com/soccerdata/competitions/"
    url += f"{SDAPI_OUTLET_KEY}/?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"

    headers = load_headers()

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        content = response.text

        start_idx = content.find('{')
        end_idx = content.rfind('}')
        if start_idx == -1 or end_idx == -1:
            return None

        data = json.loads(content[start_idx:end_idx + 1])

        # Buscar la competición en la respuesta
        competitions = data.get('competition', [])
        for comp in competitions:
            if comp.get('id') == league_id:
                # Encontramos la liga, ahora necesitamos su temporada actual
                # La estructura puede variar, a veces viene inline
                return comp.get('currentSeason', {}).get('id') or comp.get('seasons', [{}])[0].get('id')

        # Si no encontramos por ID, probamos buscar por nombre
        for comp in competitions:
            if LEAGUE_NAME.lower() in comp.get('name', '').lower():
                seasons = comp.get('seasons', [])
                if seasons:
                    for s in seasons:
                        if SEASON_NAME in s.get('name', ''):
                            return s.get('id')

        return None

    except Exception as e:
        print(f"⚠️ Error al obtener ID de temporada: {e}")
        return None

def load_headers():
    """Carga headers desde headers/headers.json si existe."""
    headers_path = Path('headers/headers.json')
    if headers_path.exists():
        try:
            with open(headers_path, 'r', encoding='utf-8') as f:
                headers = json.load(f)
            # Limpiar headers no válidos para requests
            headers = {k: v for k, v in headers.items() if not k.startswith(':')}
            for k in ['Host', 'Authority', 'authority', 'host']:
                headers.pop(k, None)
            return headers
        except Exception as e:
            print(f"⚠️ Error al cargar headers: {e}")

    # Headers por defecto
    return {
        'Referer': 'https://www.scoresway.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

def descargar_fixtures(season_id: str):
    """Descarga los fixtures de la liga activa."""

    print(f"📥 Descargando fixtures para: {LEAGUE_NAME} ({SEASON_NAME})")
    print(f"   ID Temporada (tmcl): {season_id}")

    # URL de la API - usa tmcl (season_id) en lugar de league_id
    url = (
        f"https://api.performfeeds.com/soccerdata/match/"
        f"{SDAPI_OUTLET_KEY}/"
        f"?_fmt=jsonp&_rt=c&tmcl={season_id}&live=yes&_pgSz=400&_lcl=en"
        f"&sps=widgets&_clbk=callback"
    )

    headers = load_headers()

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        content = response.text

        # Limpieza JSONP: extraer solo el JSON
        start_idx = content.find('{')
        end_idx = content.rfind('}')

        if start_idx == -1 or end_idx == -1:
            print("❌ Respuesta malformada (no se halló JSON)")
            with open("debug_fixture.txt", "w", encoding="utf-8") as f:
                f.write(content[:500])
            return False

        clean_json = content[start_idx:end_idx + 1]
        data = json.loads(clean_json)

        # Extraer partidos
        matches = data.get('match', [])

        if not matches:
            print("⚠️ No se encontraron partidos en la respuesta de la API")
            print(f"   Claves: {list(data.keys())}")
            return False

        # Crear directorio de salida
        output_dir = Path(f"./data/{LEAGUE_NAME}/{SEASON_NAME}/fixture")
        output_dir.mkdir(parents=True, exist_ok=True)

        output_path = output_dir / "fixture.json"

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(matches, f, indent=2, ensure_ascii=False)

        print(f"✅ ÉXITO: {len(matches)} partidos descargados")
        print(f"💾 Guardado en: {output_path}")
        return True

    except requests.exceptions.Timeout:
        print("❌ Timeout al conectar con la API")
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Error de conexión: {e}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Error al parsear JSON: {e}")
        return False
    except Exception as e:
        print(f"❌ Error inesperado: {e}")
        return False


def descargar_squads(season_id: str):
    """Descarga los planteles (squads) de todos los equipos usando el endpoint squads (plural)."""

    print(f"\n👥 Descargando squads para: {LEAGUE_NAME} ({SEASON_NAME})")
    print(f"   ID Temporada: {season_id}")

    headers = load_headers()
    squads_dir = Path(f"./data/{LEAGUE_NAME}/{SEASON_NAME}/squads")
    squads_dir.mkdir(parents=True, exist_ok=True)

    # Endpoint squads (plural) con paginación
    base_url = (
        f"https://api.performfeeds.com/soccerdata/squads/"
        f"{SDAPI_OUTLET_KEY}/"
        f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
        f"&tmcl={season_id}"
        f"&detailed=yes"
    )

    page = 1
    page_size = 100
    downloaded = 0

    while True:
        url = f"{base_url}&_pgSz={page_size}&_pgNm={page}"
        print(f"   🔄 Descargando página {page}...")

        try:
            response = requests.get(url, headers=headers, timeout=15)
            content = response.text
            start_idx = content.find('{')
            end_idx = content.rfind('}')

            if start_idx == -1 or end_idx == -1:
                print("   ❌ Error JSONP")
                break

            data = json.loads(content[start_idx:end_idx + 1])

            # Buscar la lista principal
            items = []
            for key in ['squad', 'person', 'contestant', 'teams']:
                if key in data:
                    items = data[key]
                    print(f"      -> Lista encontrada en clave: '{key}'")
                    break

            if not items:
                print(f"   ⚠️ No se encontró lista de equipos. Claves: {list(data.keys())}")
                break

            # Procesar cada equipo
            for item in items:
                team_name = "Unknown"
                team_id = None
                contestant_obj = {}

                # Estrategia multi-clave
                if 'contestant' in item and isinstance(item['contestant'], dict):
                    team_name = item['contestant'].get('name', 'Unknown')
                    team_id = item['contestant'].get('id')
                    contestant_obj = item['contestant']
                elif 'contestantName' in item:
                    team_name = item.get('contestantName')
                    team_id = item.get('contestantId')
                    contestant_obj = {'id': team_id, 'name': team_name}
                elif 'name' in item and 'id' in item:
                    team_name = item.get('name')
                    team_id = item.get('id')
                    contestant_obj = {'id': team_id, 'name': team_name}
                elif 'description' in item:
                    team_name = item.get('description')
                    team_id = item.get('id', 'no_id')
                    contestant_obj = {'id': team_id, 'name': team_name}

                # Buscar jugadores
                players = []
                for key in ['squad', 'person', 'players', 'athlete']:
                    if key in item:
                        players = item[key]
                        break

                # Guardar
                if team_id and team_name != 'Unknown':
                    safe_name = team_name.replace('/', '-').replace('\\', '-')
                    filename = f"{safe_name}_{team_id}.json"
                    team_data = {"team": contestant_obj, "players": players}

                    with open(squads_dir / filename, 'w', encoding='utf-8') as f:
                        json.dump(team_data, f, indent=2, ensure_ascii=False)
                    downloaded += 1

            if len(items) < page_size:
                break

            page += 1

        except Exception as e:
            print(f"   ❌ Error: {e}")
            break

    print(f"✅ ÉXITO: {downloaded} squads descargados")
    print(f"💾 Guardado en: {squads_dir}")
    return downloaded > 0


if __name__ == "__main__":
    print("=" * 56)
    print(f"🏆 DESCARGA DE DATOS: {LEAGUE_NAME} - {SEASON_NAME}")
    print("=" * 56)

    # Paso 1: Obtener el ID de la temporada
    if SEASON_ID:
        season_id = SEASON_ID
        print(f"\n✅ Usando season_id de settings.json: {season_id}")
    else:
        print("\n🔍 Obteniendo ID de temporada...")
        season_id = get_season_id(ACTIVE_LEAGUE_ID)

        if not season_id:
            print(f"❌ No se pudo obtener el ID de temporada para {LEAGUE_NAME}")
            print("\n💡 Añade el campo 'season_id' en settings.json:")
            print(f'   "season_id": "<ID>"')
            exit(1)

    # Paso 2: Descargar fixtures
    fixtures_ok = descargar_fixtures(season_id)

    # Paso 3: Descargar squads
    squads_ok = descargar_squads(season_id)

    # Resumen
    print("\n" + "=" * 56)
    print("📊 RESUMEN")
    print("=" * 56)
    print(f"   Fixtures: {'✅' if fixtures_ok else '❌'}")
    print(f"   Squads:   {'✅' if squads_ok else '❌'}")

    if fixtures_ok or squads_ok:
        print("\n✅ Ahora puedes ejecutar: python3 sync_fixtures.py")
    else:
        print("\n❌ La descarga falló. Verifica tu conexión o credenciales.")
