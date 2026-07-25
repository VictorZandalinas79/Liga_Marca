#!/usr/bin/env python3
"""
Script de diagnóstico para verificar CUÁNTOS jugadores descarga la API
antes de cualquier filtro de CSV o subida a base de datos.
"""

import os
import json
import requests
import time
from dotenv import load_dotenv

load_dotenv()

# Cargar configuración
try:
    with open('settings.json', 'r', encoding='utf-8') as f:
        config = json.load(f)
    ACTIVE_LEAGUE_ID = config['active_league']['id']
    LEAGUE_NAME = config['active_league']['name']
    SEASON_NAME = config['active_league']['season_name']
    SEASON_ID = config['active_league'].get('season_id')
except Exception as e:
    print(f"❌ Error leyendo settings.json: {e}")
    exit(1)

SDAPI_OUTLET_KEY = os.environ.get("SDAPI_OUTLET_KEY", "ft1tiv1inq7v1sk3y9tv12yh5")

def load_headers():
    import pathlib
    headers_path = pathlib.Path('headers/headers.json')
    if headers_path.exists():
        try:
            with open(headers_path, 'r', encoding='utf-8') as f:
                headers = json.load(f)
            headers = {k: v for k, v in headers.items() if not k.startswith(':')}
            for k in ['Host', 'Authority', 'authority', 'host']:
                headers.pop(k, None)
            return headers
        except Exception:
            pass
    return {
        'Referer': 'https://www.scoresway.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

def get_season_id(league_id: str) -> str | None:
    url = f"https://api.performfeeds.com/soccerdata/competitions/{SDAPI_OUTLET_KEY}/?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
    headers = load_headers()
    try:
        response = requests.get(url, headers=headers, timeout=15)
        content = response.text
        start_idx, end_idx = content.find('{'), content.rfind('}')
        if start_idx == -1 or end_idx == -1: return None
        
        data = json.loads(content[start_idx:end_idx + 1])
        competitions = data.get('competition', [])
        for comp in competitions:
            if comp.get('id') == league_id:
                return comp.get('currentSeason', {}).get('id') or comp.get('seasons', [{}])[0].get('id')
    except Exception as e:
        print(f"Error obteniendo season_id: {e}")
    return None

def descargar_squads_api(season_id: str):
    print(f"\n📡 Conectando a la API para: {LEAGUE_NAME} ({SEASON_NAME}) - ID: {season_id}")
    headers = load_headers()
    base_url = f"https://api.performfeeds.com/soccerdata/squads/{SDAPI_OUTLET_KEY}/?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback&tmcl={season_id}&detailed=yes"
    
    page = 1
    page_size = 100
    all_squads_data = []

    while True:
        url = f"{base_url}&_pgSz={page_size}&_pgNm={page}"
        print(f"   🔄 Descargando página {page}...")
        try:
            response = requests.get(url, headers=headers, timeout=15)
            content = response.text
            start_idx, end_idx = content.find('{'), content.rfind('}')
            if start_idx == -1 or end_idx == -1: break
            
            data = json.loads(content[start_idx:end_idx + 1])
            items = data.get('squad') or data.get('person') or data.get('contestant') or data.get('teams')
            
            if not items: break

            for item in items:
                team_name = "Unknown"
                if 'contestant' in item and isinstance(item['contestant'], dict):
                    team_name = item['contestant'].get('name', 'Unknown')
                elif 'contestantName' in item: team_name = item.get('contestantName')
                elif 'name' in item: team_name = item.get('name')
                
                players = item.get('squad') or item.get('person') or item.get('players') or item.get('athlete') or []
                all_squads_data.append({"team_name": team_name, "players": players})

            if len(items) < page_size: break
            page += 1
            time.sleep(0.5)
        except Exception as e:
            print(f"   ❌ Error: {e}")
            break

    return all_squads_data

def analizar_jugadores(squads_data):
    total_equipos = len(squads_data)
    total_jugadores_raw = 0
    total_jugadores_activos = 0
    total_staff = 0 # Entrenadores, etc.

    print("\n" + "="*50)
    print("📊 REPORTE DE JUGADORES POR EQUIPO")
    print("="*50)

    for squad in squads_data:
        team = squad['team_name']
        players = squad['players']
        
        num_raw = len(players)
        num_activos = 0
        num_staff = 0
        
        for p in players:
            p_type = p.get('type', 'unknown')
            p_active = p.get('active', 'no')
            
            if p_type == 'player':
                if p_active == 'yes':
                    num_activos += 1
            else:
                num_staff += 1

        print(f"⚽ {team}:")
        print(f"   ➤ Total recibidos de la API : {num_raw}")
        print(f"   ➤ Jugadores 'Activos' (Válidos): {num_activos}")
        if num_staff > 0:
            print(f"   ➤ Staff/Entrenadores omitidos: {num_staff}")
        
        total_jugadores_raw += num_raw
        total_jugadores_activos += num_activos
        total_staff += num_staff

    print("\n" + "="*50)
    print("🏆 RESUMEN GLOBAL DE LA API")
    print("="*50)
    print(f"Equipos encontrados      : {total_equipos}")
    print(f"Registros totales en API : {total_jugadores_raw}")
    print(f"Staff / No jugadores     : {total_staff}")
    print(f"JUGADORES ACTIVOS REALES : {total_jugadores_activos}")
    print("="*50)
    print("💡 Nota: Tu script original SOLO sube los 'Jugadores Activos Reales'.")
    print("   Si este número es bajo, el problema es la API.")
    print("   Si este número es alto pero no se suben, el problema es el cruce con el CSV.\n")

def main():
    season_id = SEASON_ID if SEASON_ID else get_season_id(ACTIVE_LEAGUE_ID)
    if not season_id:
        print("❌ No se pudo obtener el Season ID.")
        return

    squads = descargar_squads_api(season_id)
    if squads:
        analizar_jugadores(squads)
    else:
        print("⚠️ La API no devolvió equipos.")

if __name__ == "__main__":
    main()