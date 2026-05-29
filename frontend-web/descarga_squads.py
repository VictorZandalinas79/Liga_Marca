#!/usr/bin/env python3
"""
Script para descargar los squads de ambos equipos de un partido con las demarcaciones (posiciones) de cada jugador.
Los datos se guardan en data/Partidos_Individuales/{match_id}/squads/
"""

import requests
import json
import os
from pathlib import Path

# --- CREDENCIALES ---
SDAPI_OUTLET_KEY = "ft1tiv1inq7v1sk3y9tv12yh5"
BASE_OUTPUT_PATH = Path("./data")


def load_headers():
    """Carga headers desde headers/headers.json si existe."""
    headers_path = Path('backend-engine/headers/headers.json')
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
        'User-Agent': 'Mozilla/5.0'
    }


def obtener_info_partido(match_id, headers):
    """Obtiene la información del partido para saber qué equipos juegan y la temporada."""
    url = (f"https://api.performfeeds.com/soccerdata/matchevent/"
           f"{SDAPI_OUTLET_KEY}/{match_id}"
           f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback")

    try:
        res = requests.get(url, headers=headers, timeout=15)
        content = res.text
        start = content.find('{')
        end = content.rfind('}')

        if start == -1 or end == -1:
            print("❌ Respuesta malformada de la API")
            print(f"   Raw: {content[:200]}...")
            return None, None

        data = json.loads(content[start:end+1])

        if "errorCode" in data:
            print(f"❌ Error de API: {data.get('errorCode')}")
            return None, None

        # DEBUG: imprimir claves disponibles
        print(f"   🔍 Claves en respuesta: {list(data.keys())}")

        match_info = data.get('match', {})

        # Si no hay 'match', buscar alternativas
        if not match_info:
            for key in ['matchInfo', 'matchSummary', 'fixture', 'event', 'liveData']:
                if key in data:
                    match_info = data[key]
                    print(f"   ➡️ Usando clave alternativa: '{key}'")
                    break

        home_team = match_info.get('home', {})
        away_team = match_info.get('away', {})

        # Si no hay home/away, buscar alternativas en matchInfo/liveData
        if not home_team or not away_team:
            # Buscar en liveData si existe
            live_data = data.get('liveData', {})
            if live_data:
                home_team = live_data.get('home', live_data.get('homeTeam', {}))
                away_team = live_data.get('away', live_data.get('awayTeam', {}))

            # Si aun asi no hay, buscar en match_info con otras claves
            if not home_team or not away_team:
                for key in ['homeTeam', 'awayTeam', 'homeContestant', 'awayContestant']:
                    if key in match_info:
                        if key.startswith('home'):
                            home_team = match_info[key]
                        else:
                            away_team = match_info[key]

            # Si hay 'contestant' como lista (varios equipos)
            if (not home_team or not away_team) and 'contestant' in match_info:
                contestants = match_info.get('contestant', [])
                if isinstance(contestants, list) and len(contestants) >= 2:
                    home_team = contestants[0] if len(contestants) > 0 else {}
                    away_team = contestants[1] if len(contestants) > 1 else {}
                    print(f"   ➡️ Equipos obtenidos de lista 'contestant'")

        season_id = None
        # Buscar season_id en varias ubicaciones posibles
        if 'season' in match_info:
            season_id = match_info.get('season', {}).get('id')
        elif 'competition' in match_info:
            comp = match_info.get('competition', {})
            season_id = comp.get('currentSeason', {}).get('id') or comp.get('season', {}).get('id')
        elif 'tournamentSeasonId' in match_info:
            season_id = match_info.get('tournamentSeasonId')
        elif 'seasonId' in match_info:
            season_id = match_info.get('seasonId')
        elif 'tournament' in match_info:
            # A veces season está dentro de tournament
            tournament = match_info.get('tournament', {})
            season_id = tournament.get('season', {}).get('id') or tournament.get('currentSeason', {}).get('id')
        elif 'competitionId' in match_info:
            # Si hay competitionId pero no season, intentar con tournamentCalendar
            tc = match_info.get('tournamentCalendar', {})
            season_id = tc.get('season', {}).get('id') or tc.get('id')

        # Fallback: usar tournamentCalendar.id si no hay season_id
        if not season_id:
            tc = match_info.get('tournamentCalendar', {})
            if tc and tc.get('id'):
                season_id = tc.get('id')
                print(f"   ➡️ Usando tournamentCalendar.id como season_id: {season_id}")

        teams = []
        if home_team.get('id'):
            teams.append({'id': home_team['id'], 'name': home_team.get('name', 'Home')})
        if away_team.get('id'):
            teams.append({'id': away_team['id'], 'name': away_team.get('name', 'Away')})

        if not teams:
            print("⚠️ No se pudieron obtener los equipos del partido")
            print(f"   home_team: {home_team}")
            print(f"   away_team: {away_team}")
            print(f"   match_info keys: {list(match_info.keys()) if match_info else 'vacío'}")
            return None, None

        print(f"   🆚 {teams[0]['name']} vs {teams[1]['name']}")
        if season_id:
            print(f"   📅 Season ID: {season_id}")
        else:
            print("   ⚠️ No se encontró season_id en la respuesta")
            print(f"   🔍 tournamentCalendar: {match_info.get('tournamentCalendar', {})}")
            print(f"   🔍 competition: {match_info.get('competition', {})}")

        return teams, season_id

    except Exception as e:
        print(f"⚠️ Error al obtener info del partido: {e}")
        import traceback
        traceback.print_exc()
        return None, None


def descargar_squads_temporada(season_id, team_ids, headers, squads_dir):
    """Descarga los squads de la temporada y filtra solo los equipos del partido."""
    downloaded = 0
    page = 1
    page_size = 100

    while True:
        try:
            url_squad = (f"https://api.performfeeds.com/soccerdata/squads/"
                        f"{SDAPI_OUTLET_KEY}/"
                        f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
                        f"&tmcl={season_id}&detailed=yes&_pgSz={page_size}&_pgNm={page}")

            print(f"   📥 Página {page}...")
            res = requests.get(url_squad, headers=headers, timeout=15)
            content = res.text
            start = content.find('{')
            end = content.rfind('}')

            if start == -1 or end == -1:
                print("   ❌ Error JSONP")
                break

            squad_data = json.loads(content[start:end+1])

            items = []
            for key in ['squad', 'person', 'contestant', 'teams']:
                if key in squad_data:
                    items = squad_data[key]
                    if isinstance(items, dict):
                        items = [items]
                    break

            if not items:
                print(f"   ⚠️ No se encontró lista. Claves: {list(squad_data.keys())}")
                break

            for item in items:
                team_name = "Unknown"
                team_id = None
                contestant_obj = {}
                players = []

                # Caso 1: 'squad' como lista (estructura vista en el ejemplo del usuario)
                if 'squad' in item and isinstance(item['squad'], list) and len(item['squad']) > 0:
                    first_squad = item['squad'][0]
                    team_name = first_squad.get('contestantName', 'Unknown')
                    team_id = first_squad.get('contestantId')
                    contestant_obj = {
                        'id': team_id,
                        'name': team_name,
                        'shortName': first_squad.get('contestantShortName'),
                        'code': first_squad.get('contestantCode')
                    }
                    players = first_squad.get('person', [])

                # Caso 2: 'contestant' anidado
                elif 'contestant' in item and isinstance(item['contestant'], dict):
                    team_name = item['contestant'].get('name', 'Unknown')
                    team_id = item['contestant'].get('id')
                    contestant_obj = item['contestant']
                    for key in ['squad', 'person', 'players', 'athlete']:
                        if key in item:
                            players = item[key]
                            if isinstance(players, dict):
                                players = [players]
                            break

                # Caso 3: Claves planas
                elif 'contestantName' in item:
                    team_name = item.get('contestantName')
                    team_id = item.get('contestantId')
                    contestant_obj = {'id': team_id, 'name': team_name}
                    for key in ['squad', 'person', 'players', 'athlete']:
                        if key in item:
                            players = item[key]
                            if isinstance(players, dict):
                                players = [players]
                            break

                # Caso 4: Objeto directo
                elif 'name' in item and 'id' in item:
                    team_name = item.get('name')
                    team_id = item.get('id')
                    contestant_obj = {'id': team_id, 'name': team_name}
                    for key in ['squad', 'person', 'players', 'athlete']:
                        if key in item:
                            players = item[key]
                            if isinstance(players, dict):
                                players = [players]
                            break

                if team_id and team_name != 'Unknown' and team_id in team_ids:
                    safe_name = team_name.replace('/', '-').replace('\\', '-')
                    filename = f"{safe_name}_{team_id}.json"
                    team_data = {"team": contestant_obj, "players": players}

                    with open(squads_dir / filename, 'w', encoding='utf-8') as f:
                        json.dump(team_data, f, indent=2, ensure_ascii=False)
                    downloaded += 1
                    print(f"   ✅ {team_name}: {len(players)} jugadores con demarcaciones")

            if len(items) < page_size:
                break

            page += 1

        except Exception as e:
            print(f"   ⚠️ Error en página {page}: {e}")
            break

    return downloaded


def descargar_squads_por_equipo(team_id, team_name, headers, squads_dir):
    """Fallback: descarga el squad de un equipo específico usando su ID."""
    try:
        url_squad = (f"https://api.performfeeds.com/soccerdata/squads/"
                    f"{SDAPI_OUTLET_KEY}/{team_id}"
                    f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
                    f"&detailed=yes")

        print(f"   📥 Descargando squad de {team_name}...")
        res = requests.get(url_squad, headers=headers, timeout=15)
        content = res.text
        start = content.find('{')
        end = content.rfind('}')

        if start == -1 or end == -1:
            print(f"   ❌ Error JSONP para {team_name}")
            return 0

        squad_data = json.loads(content[start:end+1])

        players = []
        contestant_obj = {}

        # La API devuelve 'squad' como lista, y cada item tiene 'person' con los jugadores
        if 'squad' in squad_data:
            squad_list = squad_data['squad']
            if isinstance(squad_list, list) and len(squad_list) > 0:
                # Primer elemento de la lista squad
                first_squad = squad_list[0] if isinstance(squad_list, list) else squad_list
                contestant_obj = {
                    'id': first_squad.get('contestantId'),
                    'name': first_squad.get('contestantName'),
                    'shortName': first_squad.get('contestantShortName'),
                    'code': first_squad.get('contestantCode')
                }
                # Los jugadores están en 'person'
                players = first_squad.get('person', [])
            elif isinstance(squad_list, dict):
                contestant_obj = {
                    'id': squad_list.get('contestantId'),
                    'name': squad_list.get('contestantName')
                }
                players = squad_list.get('person', [])
        elif 'person' in squad_data:
            players = squad_data['person']
            contestant_obj = {
                'id': squad_data.get('contestantId'),
                'name': squad_data.get('contestantName')
            }
        elif 'contestant' in squad_data:
            contestant_obj = squad_data['contestant']
            for key in ['squad', 'person', 'players', 'athlete']:
                if key in squad_data:
                    players = squad_data[key] if isinstance(squad_data[key], list) else [squad_data[key]]
                    break

        safe_name = team_name.replace('/', '-').replace('\\', '-')
        filename = f"{safe_name}_{team_id}.json"
        team_data = {"team": contestant_obj, "players": players}

        with open(squads_dir / filename, 'w', encoding='utf-8') as f:
            json.dump(team_data, f, indent=2, ensure_ascii=False)

        print(f"   ✅ {team_name}: {len(players)} jugadores con demarcaciones")
        return len(players)

    except Exception as e:
        print(f"   ⚠️ Error descargando {team_name}: {e}")
        import traceback
        traceback.print_exc()
        return 0


def main():
    print("=" * 60)
    print("📋 DESCARGA DE SQUADS CON DEMARCACIONES")
    print("=" * 60)

    match_id = input("👉 Introduce el ID del partido (Ej: 8m6p1z...): ").strip()

    if not match_id:
        print("❌ Debes introducir un ID válido.")
        return

    squads_dir = BASE_OUTPUT_PATH / "Partidos_Individuales" / match_id / "squads"
    squads_dir.mkdir(parents=True, exist_ok=True)

    headers = load_headers()

    print("\n📥 Paso 1: Obteniendo información del partido...")
    teams, season_id = obtener_info_partido(match_id, headers)

    if not teams:
        print("❌ No se pudo obtener información del partido.")
        return

    team_ids = {t['id'] for t in teams}
    total_descargados = 0

    print("\n📥 Paso 2: Descargando squads con demarcaciones...")

    if season_id:
        total_descargados = descargar_squads_temporada(season_id, team_ids, headers, squads_dir)

    if total_descargados < 2:
        print("\n⚠️ Algunos squads no se descargaron, intentando por equipo individual...")
        for team in teams:
            safe_name = team['name'].replace('/', '-').replace('\\', '-')
            squad_file = squads_dir / f"{safe_name}_{team['id']}.json"
            if not squad_file.exists():
                descargar_squads_por_equipo(team['id'], team['name'], headers, squads_dir)

    print("\n" + "=" * 60)
    print(f"✅ Proceso completado. Squads guardados en: {squads_dir}")
    print("=" * 60)

    print("\n📁 Archivos descargados:")
    for f in squads_dir.glob("*.json"):
        print(f"   - {f.name}")


if __name__ == "__main__":
    main()
