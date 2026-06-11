#!/usr/bin/env python3
"""
Descarga fixtures y squads desde la API, y sincroniza DIRECTO con Supabase:
1. Descarga fixtures y squads desde performfeeds API en memoria.
2. Sube fixtures a la tabla 'fixtures'.
3. Sube los equipos a la tabla 'real_teams'.
4. Procesa el CSV jugadores_optimizados.csv y hace matching con la data en memoria.
5. Sube jugadores con precio_normalizado y foto a la tabla 'players'.
* NO guarda archivos JSON locales *
"""

import os
import json
import csv
import requests
import time
from supabase import create_client, Client
from pathlib import Path
from dotenv import load_dotenv
from difflib import SequenceMatcher
from deep_translator import GoogleTranslator

load_dotenv()

# Cargar configuración
with open('settings.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

# ID de liga configurado por el usuario
ACTIVE_LEAGUE_ID = "70excpe1synn9kadnbppahdn7"
LEAGUE_NAME = config['active_league']['name']
SEASON_NAME = config['active_league']['season_name']
SEASON_ID = config['active_league'].get('season_id')

# Credenciales API
SDAPI_OUTLET_KEY = os.environ.get("SDAPI_OUTLET_KEY", "ft1tiv1inq7v1sk3y9tv12yh5")

# Supabase
def _clean_env(value):
    """Quita espacios y comillas envolventes que se cuelan al pegar secrets."""
    if value is None:
        return None
    return value.strip().strip('"').strip("'").strip()

SUPABASE_URL = _clean_env(os.environ.get("SUPABASE_URL"))
SUPABASE_KEY = _clean_env(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY"))
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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
    """Obtiene el ID de la temporada actual para una liga."""
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
        competitions = data.get('competition', [])

        for comp in competitions:
            if comp.get('id') == league_id:
                return comp.get('currentSeason', {}).get('id') or comp.get('seasons', [{}])[0].get('id')

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

def descargar_fixtures(season_id: str):
    """Descarga los fixtures y los devuelve en memoria."""
    print(f"\n📥 Descargando fixtures de API (en memoria) para: {LEAGUE_NAME} ({SEASON_NAME})")
    print(f"   ID Temporada (tmcl): {season_id}")

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

        start_idx = content.find('{')
        end_idx = content.rfind('}')

        if start_idx == -1 or end_idx == -1:
            print("❌ Respuesta malformada (no se halló JSON)")
            return False, []

        clean_json = content[start_idx:end_idx + 1]
        data = json.loads(clean_json)

        matches = data.get('match', [])

        if not matches:
            print("⚠️ No se encontraron partidos en la respuesta de la API")
            return False, []

        print(f"✅ ÉXITO: {len(matches)} partidos obtenidos en memoria")
        return True, matches

    except Exception as e:
        print(f"❌ Error: {e}")
        return False, []

def descargar_squads(season_id: str):
    """Descarga los planteles y los devuelve en memoria."""
    print(f"\n👥 Descargando squads de API (en memoria) para: {LEAGUE_NAME} ({SEASON_NAME})")

    headers = load_headers()
    
    base_url = (
        f"https://api.performfeeds.com/soccerdata/squads/"
        f"{SDAPI_OUTLET_KEY}/"
        f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
        f"&tmcl={season_id}"
        f"&detailed=yes"
    )

    page = 1
    page_size = 100
    all_squads_data = []

    while True:
        url = f"{base_url}&_pgSz={page_size}&_pgNm={page}"
        print(f"   🔄 Extrayendo página {page}...")

        try:
            response = requests.get(url, headers=headers, timeout=15)
            content = response.text
            start_idx = content.find('{')
            end_idx = content.rfind('}')

            if start_idx == -1 or end_idx == -1:
                print("   ❌ Error JSONP")
                break

            data = json.loads(content[start_idx:end_idx + 1])

            items = []
            for key in ['squad', 'person', 'contestant', 'teams']:
                if key in data:
                    items = data[key]
                    print(f"      -> Lista de equipos encontrada ('{key}')")
                    break

            if not items:
                print(f"   ⚠️ No se encontró lista de equipos en esta página.")
                break

            for item in items:
                team_name = "Unknown"
                team_id = None
                contestant_obj = {}

                # Buscar datos del equipo
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

                # Buscar jugadores del equipo
                players = []
                for key in ['squad', 'person', 'players', 'athlete']:
                    if key in item:
                        players = item[key]
                        break

                if team_id and team_name != 'Unknown':
                    team_data = {"team": contestant_obj, "players": players}
                    all_squads_data.append(team_data)

            if len(items) < page_size:
                break

            page += 1
            time.sleep(0.5)

        except Exception as e:
            print(f"   ❌ Error procesando página {page}: {e}")
            break

    print(f"✅ ÉXITO: {len(all_squads_data)} squads obtenidos en memoria")
    return len(all_squads_data) > 0, all_squads_data

def upload_fixtures_to_supabase(matches):
    """Sube los fixtures a la tabla fixtures de Supabase."""
    print(f"\n📤 Subiendo fixtures a Supabase (tabla 'fixtures')...")

    fixtures_payload = []
    for m in matches:
        info = m.get('matchInfo', {})
        comp_id = info.get('competition', {}).get('id')

        if comp_id != ACTIVE_LEAGUE_ID:
            continue

        start_date = info.get('date', '').replace('Z', '')
        start_time = info.get('time', '').replace('Z', '')
        full_timestamp = f"{start_date}T{start_time}"

        contestants = info.get('contestant', [{}, {}])
        
        # Capturamos el matchday (0 por defecto si no existe)
        raw_week = info.get('week')
        matchday = int(raw_week) if raw_week else 0

        fixtures_payload.append({
            "id": info.get('id'),
            "matchday": matchday,
            "momento": info.get('stage', {}).get('name'),
            "home_team_id": contestants[0].get('id') if len(contestants) > 0 else None,
            "away_team_id": contestants[1].get('id') if len(contestants) > 1 else None,
            "start_time": full_timestamp,
            "status": info.get('status', 'scheduled')
        })

    if not fixtures_payload:
        print(f"⚠️ No hay fixtures para subir de la liga {ACTIVE_LEAGUE_ID}")
        return False

    # --- NUEVA LÓGICA: Corregir matchday = 0 ---
    # 1. Encontrar la jornada máxima actual
    max_matchday = max([f['matchday'] for f in fixtures_payload if f['matchday'] and f['matchday'] > 0], default=0)

    # 2. Filtrar los partidos que tienen matchday 0
    zero_matchdays = [f for f in fixtures_payload if not f['matchday'] or f['matchday'] == 0]

    if zero_matchdays:
        # Diccionario para guardar la fecha más temprana de cada "momento"
        momento_dates = {}
        for f in zero_matchdays:
            momento = f['momento'] or "Fase Desconocida"
            f['momento'] = momento # Asegurarnos de que no sea None
            
            # Formato YYYY-MM-DDTHH:MM:SS es perfectamente ordenable por string
            if momento not in momento_dates or f['start_time'] < momento_dates[momento]:
                momento_dates[momento] = f['start_time']

        # 3. Ordenar los momentos cronológicamente según su fecha de inicio más temprana
        sorted_momentos = sorted(momento_dates.keys(), key=lambda m: momento_dates[m])

        # 4. Crear un mapa para asignar el nuevo matchday a cada momento
        momento_to_matchday = {}
        current_new_matchday = max_matchday + 1
        for momento in sorted_momentos:
            momento_to_matchday[momento] = current_new_matchday
            current_new_matchday += 1

        # 5. Aplicar los nuevos matchdays al payload final
        for f in fixtures_payload:
            if not f['matchday'] or f['matchday'] == 0:
                f['matchday'] = momento_to_matchday[f['momento']]
                
        print(f"   🔄 Se asignaron jornadas {max_matchday + 1} a {current_new_matchday - 1} a fases eliminatorias.")
    # --- FIN NUEVA LÓGICA ---

    # Subir a Supabase
    try:
        # Usamos UPSERT: Actualiza la fecha/jornada si ya existe, y crea si es nuevo.
        result = supabase.table("fixtures").upsert(fixtures_payload).execute()
        print(f"✅ {len(fixtures_payload)} fixtures actualizados/insertados en Supabase")
        return True
    except Exception as e:
        print(f"❌ Error insertando los nuevos fixtures: {e}")
        return False


def upload_teams_to_supabase(squads_data):
    """Sube los equipos a la tabla real_teams de Supabase con su escudo."""
    print(f"\n📤 Subiendo equipos a Supabase (tabla 'real_teams')...")

    teams_payload = []
    for squad in squads_data:
        team_info = squad.get('team', {})
        team_id = team_info.get('id')
        team_name = team_info.get('name', '')

        if not team_id:
            continue

        badge_url = f"https://omo.akamai.opta.net/image.php?secure=true&h=omo.akamai.opta.net&sport=football&entity=team&description=badges&dimensions=150&id={team_id}"

        teams_payload.append({
            "id": team_id,
            "name": team_name,
            "logo_url": badge_url
        })

    if teams_payload:
        result = supabase.table("real_teams").upsert(teams_payload).execute()
        print(f"✅ {len(teams_payload)} equipos subidos a real_teams")
        return True
    else:
        print(f"⚠️ No hay equipos para subir")
        return False


# --- Lógica de procesamiento CSV para Jugadores ---

def load_csv_players():
    """Carga jugadores del CSV agrupados por equipo."""
    players_by_team = {}
    csv_path = Path('jugadores_optimizados.csv')

    if not csv_path.exists():
        print(f"❌ No se encontró el archivo {csv_path}")
        return {}

    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            team = row['Equipo']
            if team not in players_by_team:
                players_by_team[team] = []
            players_by_team[team].append(row)

    return players_by_team

def normalize_name(name):
    if not name: return ""
    name = name.lower()
    name = name.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u').replace('ñ', 'n')
    name = ''.join(c for c in name if c.isalnum() or c.isspace())
    return ' '.join(name.split()).strip()

def similarity_score(s1, s2):
    return SequenceMatcher(None, normalize_name(s1), normalize_name(s2)).ratio()

def translate_to_english(text):
    """Traduce automáticamente cualquier idioma al inglés."""
    if not text: return ""
    try:
        return GoogleTranslator(source='auto', target='en').translate(text)
    except Exception as e:
        print(f"   ⚠️ Falló la traducción para '{text}': {e}")
        return text # Si falla internet, devuelve el original

def find_team_match(json_team_name, csv_teams):
    # 1. TRADUCIR EL NOMBRE DE LA API AL INGLÉS
    translated_json_name = translate_to_english(json_team_name)
    
    # 2. Normalizar el nombre traducido
    norm_json = normalize_name(translated_json_name)
    json_words = set(norm_json.split())

    # 3. Búsqueda por contención exacta (100% de las palabras coinciden)
    for csv_team in csv_teams:
        norm_csv = normalize_name(csv_team)
        csv_words = set(norm_csv.split())
        
        # Evitamos falsos positivos con palabras comunes
        if not csv_words or (len(csv_words) == 1 and list(csv_words)[0] in ['fc', 'cd', 'ud', 'real']):
            continue
            
        # Comprobamos contención
        if csv_words.issubset(json_words) or json_words.issubset(csv_words):
            return csv_team, 1.0  # Coincidencia 100%

    # 4. Fallback: Similitud por ratio usando el nombre traducido
    best_match, best_score = None, 0.0
    for csv_team in csv_teams:
        # Usamos translated_json_name para que compare "Spain" con "Spain"
        score = similarity_score(translated_json_name, csv_team)
        if score > best_score:
            best_score = score
            best_match = csv_team
            
    if best_score > 0.55: # Límite permisivo
        return best_match, best_score
        
    return None, best_score

def find_player_match(player_json, csv_players):
    match_name = player_json.get('matchName', '')
    first_name = player_json.get('firstName', '')
    last_name = player_json.get('lastName', '')
    best_match, best_score = None, 0.0

    for csv_player in csv_players:
        csv_name = csv_player['Nombre']
        
        # Prioridad 1: matchName
        if match_name:
            score = similarity_score(match_name, csv_name)
            if score > best_score: best_score = score; best_match = csv_player
        # Prioridad 2: firstName + lastName
        if first_name and last_name:
            score = similarity_score(f"{first_name} {last_name}", csv_name)
            if score > best_score: best_score = score; best_match = csv_player
        # Prioridad 3: solo firstName
        if first_name:
            score = similarity_score(first_name, csv_name.split()[0] if csv_name else '')
            if score > best_score and score > 0.85: best_score = score; best_match = csv_player

    if best_score > 0.75:
        return best_match, best_score
    return None, best_score

def sync_players_with_csv(squads_data):
    """Cruza la info de squads (en memoria) con el CSV y sube a 'players' en Supabase."""
    print(f"\n🔗 Procesando matching de Jugadores con CSV y subiendo a Supabase...")

    csv_players_by_team = load_csv_players()
    if not csv_players_by_team:
        print("❌ Operación cancelada: No se pudieron cargar jugadores del CSV")
        return False

    min_precio = float('inf')
    for team_players in csv_players_by_team.values():
        for player in team_players:
            if player.get('Precio_Normalizado'):
                precio = int(float(player['Precio_Normalizado']))
                if precio < min_precio: min_precio = precio
    if min_precio == float('inf'): min_precio = None

    print(f"   💰 Precio mínimo base del CSV: {min_precio}")

    csv_teams = list(csv_players_by_team.keys())
    total_synced = 0
    total_matched = 0
    total_no_match = 0
    players_payload = []

    for squad in squads_data:
        team_info = squad.get('team', {})
        team_id = team_info.get('id')
        json_team_name = team_info.get('name', '')

        if not team_id: continue

        csv_team_name, team_score = find_team_match(json_team_name, csv_teams)
        if not csv_team_name:
            continue

        csv_players = csv_players_by_team.get(csv_team_name, [])
        players = squad.get('players', [])

        for p in players:
            if p.get('type') != 'player' or p.get('active') != 'yes':
                continue

            matched_csv, player_score = find_player_match(p, csv_players)
            precio_normalizado = None
            foto_url = None

            if matched_csv:
                precio_normalizado = int(float(matched_csv['Precio_Normalizado'])) if matched_csv.get('Precio_Normalizado') else None
                foto_url = matched_csv.get('Foto')
                total_matched += 1
            else:
                total_no_match += 1
                precio_normalizado = min_precio
                player_id = p.get('id', '')
                foto_url = f"https://omo.akamai.opta.net/image.php?secure=true&h=omo.akamai.opta.net&sport=football&entity=player&description={team_id}&dimensions=103x155&id={player_id}"

            pos_map = {
                "Goalkeeper": "Goalkeeper", "Defender": "Defender",
                "Midfielder": "Midfielder", "Forward": "Forward", "Attacker": "Forward"
            }

            players_payload.append({
                "id": p.get('id'),
                "team_id": team_id,
                "first_name": p.get('firstName'),
                "last_name": p.get('lastName'),
                "short_name": p.get('matchName') or p.get('shortLastName', ''),
                "position": pos_map.get(p.get('position', 'Forward'), "Forward"),
                "status": p.get('status', 'active'),
                "photo": foto_url,
                "precio": precio_normalizado,
                "date_of_birth": p.get('dateOfBirth'),
                "nationality": p.get('nationality'),
                "height": p.get('height'),
                "weight": p.get('weight'),
                "foot": p.get('foot'),
                "shirt_number": p.get('shirtNumber'),
            })
            total_synced += 1

    if players_payload:
        # Supabase tiene un límite en el payload, si hay miles de jugadores es bueno dividirlo,
        # pero para ~500-600 jugadores (una liga estándar) un solo insert suele aguantar sin problema.
        try:
            # ignore_duplicates=True significa: "Si el ID ya existe en Supabase, sáltatelo. Si no existe, créalo."
            result = supabase.table("players").upsert(players_payload, ignore_duplicates=True).execute()
            print(f"\n✅ Proceso de jugadores terminado. (Los nuevos se han añadido, los existentes se ignoraron)")
            print(f"   Match encontrado en CSV: {total_matched} ({100*total_matched/total_synced:.1f}%)")
            print(f"   Sin match (precio base): {total_no_match} ({100*total_no_match/total_synced:.1f}%)")
            return True
        except Exception as e:
            print(f"❌ Error subiendo jugadores a Supabase: {e}")
            return False

    return False

def main():
    print("=" * 60)
    print(f"🏆 API -> DIRECTO A SUPABASE: {LEAGUE_NAME} - {SEASON_NAME}")
    print(f"   League ID: {ACTIVE_LEAGUE_ID}")
    print("=" * 60)

    # 1: Obtener season_id
    if SEASON_ID:
        season_id = SEASON_ID
        print(f"\n✅ Usando season_id de settings.json: {season_id}")
    else:
        print("\n🔍 Obteniendo ID de temporada...")
        season_id = get_season_id(ACTIVE_LEAGUE_ID)
        if not season_id:
            print(f"❌ No se pudo obtener season_id")
            exit(1)

    # 2: Descargar Todo (A RAM)
    fixtures_ok, fixtures_data = descargar_fixtures(season_id)
    squads_ok, squads_data = descargar_squads(season_id)

    # 3: Subir Todo a Supabase
    
    # PRIMERO: Subimos los equipos (para que existan en la BD)
    if squads_ok:
        upload_teams_to_supabase(squads_data)

    # SEGUNDO: Subimos los fixtures (ahora los equipos ya existen)
    if fixtures_ok:
        upload_fixtures_to_supabase(fixtures_data)

    # TERCERO: Subimos los jugadores cruzados con el CSV
    if squads_ok:
        sync_players_with_csv(squads_data)

    print("\n" + "=" * 60)
    print("📊 RESUMEN FINAL")
    print("=" * 60)
    print(f"   Fixtures (API -> Supabase): {'✅' if fixtures_ok else '❌'}")
    print(f"   Teams (API -> Supabase):    {'✅' if squads_ok else '❌'}")
    print(f"   Players (API+CSV -> Sup):   {'✅' if squads_ok else '❌'}")
    print("\n✅ Proceso completado sin escribir archivos locales!")


if __name__ == "__main__":
    main()