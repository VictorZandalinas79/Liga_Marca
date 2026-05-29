#!/usr/bin/env python3
import time
import requests
import json
import os
from datetime import datetime
from pathlib import Path

# --- CREDENCIALES ---
SDAPI_OUTLET_KEY = "ft1tiv1inq7v1sk3y9tv12yh5"
BASE_OUTPUT_PATH = Path("./data")

# --- SISTEMA DE PUNTUACIÓN AVANZADO ---
BASE_SCORE = 6.5
POINTS = {
    'MIN_PLAYED':   {'POR': 0.02, 'DEF': 0.02, 'MED': 0.02, 'DEL': 0.02},
    'GOAL':         {'POR': 12.0, 'DEF': 10.0, 'MED': 8.0,  'DEL': 6.0},
    'ASSIST':       {'POR': 4.0,  'DEF': 4.0,  'MED': 4.0,  'DEL': 4.0},
    'OWN_GOAL':     {'POR': -4.0, 'DEF': -4.0, 'MED': -4.0, 'DEL': -4.0},
    'GOAL_CONCEDED':{'POR': -1.5, 'DEF': -1.0, 'MED': -0.2, 'DEL': 0.0},
    'SHOT_TARGET':  {'POR': 1.0,  'DEF': 1.0,  'MED': 1.0,  'DEL': 1.0},
    'SHOT_OFF':     {'POR': 0.2,  'DEF': 0.2,  'MED': 0.2,  'DEL': 0.2},
    'PENALTY_WON':  {'POR': 3.0,  'DEF': 3.0,  'MED': 3.0,  'DEL': 3.0},
    'PENALTY_CONC': {'POR': -3.0, 'DEF': -3.0, 'MED': -3.0, 'DEL': -3.0},
    'SAVE':         {'POR': 0.6,  'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'CLEARANCE':    {'POR': 0.1,  'DEF': 0.3,  'MED': 0.1,  'DEL': 0.1},
    'INTERCEPTION': {'POR': 0.1,  'DEF': 0.3,  'MED': 0.3,  'DEL': 0.1},
    'TACKLE_WON':   {'POR': 0.1,  'DEF': 0.4,  'MED': 0.4,  'DEL': 0.2},
    'PASS_OK':      {'POR': 0.02, 'DEF': 0.02, 'MED': 0.02, 'DEL': 0.02},
    'PASS_FAIL':    {'POR': -0.02,'DEF': -0.02,'MED': -0.02,'DEL': -0.02},
    'AERIAL_WON':   {'POR': 0.2,  'DEF': 0.3,  'MED': 0.2,  'DEL': 0.3},
    'AERIAL_LOST':  {'POR': -0.1, 'DEF': -0.1, 'MED': -0.1, 'DEL': -0.1},
    'YELLOW_CARD':  {'POR': -1.0, 'DEF': -1.0, 'MED': -1.0, 'DEL': -1.0},
    'RED_CARD':     {'POR': -5.0, 'DEF': -5.0, 'MED': -5.0, 'DEL': -5.0},
}

class FantasyEngine:
    def __init__(self):
        self.positions_table = {}
        
        self.players_team = {}      
        self.player_names = {}      
        self.entry_minutes = {}     
        self.total_minutes = {}     
        self.on_pitch = set()       
        self.teams = set()          
        self.points = {}            
        self.stats = {}             
        self.processed_events = set()

    def load_positions_from_squads(self, match_id):
        """Carga las posiciones desde los archivos de squads en Partidos_Individuales/{match_id}/squads/"""
        pos_map = {
            'goalkeeper': 'POR', 'portero': 'POR', 'g': 'POR', 'gk': 'POR',
            'defender': 'DEF', 'defensa': 'DEF', 'd': 'DEF', 'df': 'DEF',
            'midfielder': 'MED', 'centrocampista': 'MED', 'm': 'MED', 'mf': 'MED',
            'attacker': 'DEL', 'striker': 'DEL', 'forward': 'DEL',
            'delantero': 'DEL', 'a': 'DEL', 'f': 'DEL', 'fw': 'DEL'
        }

        squads_path = BASE_OUTPUT_PATH / "Partidos_Individuales" / match_id / "squads"
        if not squads_path.exists():
            print(f"⚠️ No se encontró la carpeta de squads: {squads_path}")
            return False

        loaded = 0
        for squad_file in squads_path.glob("*.json"):
            try:
                with open(squad_file, 'r', encoding='utf-8') as f:
                    squad_data = json.load(f)

                players = squad_data.get('players', [])
                for player in players:
                    pid = player.get('id')
                    raw_pos = player.get('position', '').lower().strip()
                    if pid:
                        self.positions_table[pid] = pos_map.get(raw_pos, 'MED')
                        loaded += 1

            except Exception as e:
                print(f"⚠️ Error al leer {squads_file}: {e}")

        if loaded > 0:
            print(f"✅ {loaded} jugadores cargados desde squads (demarcaciones disponibles)")
            return True
        return False

    def load_positions_from_match(self, data):
        """Extrae las posiciones directamente del JSON del partido (liveData -> lineUp)"""
        pos_map = {
            'goalkeeper': 'POR', 'portero': 'POR', 'g': 'POR', 'gk': 'POR',
            'defender': 'DEF', 'defensa': 'DEF', 'd': 'DEF', 'df': 'DEF',
            'midfielder': 'MED', 'centrocampista': 'MED', 'm': 'MED', 'mf': 'MED',
            'attacker': 'DEL', 'striker': 'DEL', 'forward': 'DEL',
            'delantero': 'DEL', 'a': 'DEL', 'f': 'DEL', 'fw': 'DEL'
        }

        lineups = data.get('liveData', {}).get('lineUp', [])
        for team in lineups:
            for p in team.get('player', []):
                pid = str(p.get('playerId', p.get('id')))
                raw_pos = p.get('position', '').lower().strip()
                # Si encuentra la posición la asigna, si no, MED
                self.positions_table[pid] = pos_map.get(raw_pos, 'MED')


    def get_player_pos(self, player_id):
        # Si el jugador no está en los JSON de squads, se le asigna MED por defecto
        return self.positions_table.get(str(player_id), 'MED')

    def get_qualifier(self, event, qual_id):
        for q in event.get('qualifier', []):
            if q.get('qualifierId') == qual_id:
                return q.get('value', True) 
        return False

    def init_player(self, player_id, team_id, current_min):
        self.on_pitch.add(player_id)
        self.players_team[player_id] = team_id
        self.entry_minutes[player_id] = current_min
        
        if player_id not in self.points:
            self.points[player_id] = BASE_SCORE
            self.total_minutes[player_id] = 0
            self.stats[player_id] = {'pass_ok': 0, 'pass_total': 0, 'aerial_won': 0, 'aerial_total': 0}

    def remove_player(self, player_id, current_min):
        if player_id in self.on_pitch:
            self.on_pitch.remove(player_id)
            mins_played = current_min - self.entry_minutes.get(player_id, current_min)
            if mins_played < 0: mins_played = 0
            self.total_minutes[player_id] += mins_played
            self.apply_points(player_id, 'MIN_PLAYED', multiplier=mins_played)

    def apply_points(self, player_id, action_key, multiplier=1):
        if player_id not in self.points: return
        pos = self.get_player_pos(player_id)
        pts = POINTS.get(action_key, {}).get(pos, 0.0) * multiplier
        if pts != 0:
            self.points[player_id] += pts
            if action_key not in ['MIN_PLAYED', 'PASS_OK', 'PASS_FAIL', 'AERIAL_WON', 'AERIAL_LOST']:
                self.stats[player_id][action_key] = self.stats[player_id].get(action_key, 0) + 1

    def process_event(self, event, current_min):
        event_id = event.get('id')
        if event_id in self.processed_events: return False
        self.processed_events.add(event_id)
        
        type_id = event.get('typeId')
        outcome = event.get('outcome', 1)
        player_id = event.get('playerId')
        team_id = event.get('contestantId')
        
        if player_id and event.get('playerName'):
            self.player_names[player_id] = event['playerName']

        if type_id == 34:
            self.teams.add(team_id)
            q30 = self.get_qualifier(event, 30)
            if q30 and isinstance(q30, str):
                players = [p.strip() for p in q30.split(',')]
                for pid in players[:11]: self.init_player(pid, team_id, 0)
            return True

        if not player_id: return False

        if type_id == 18: 
            self.remove_player(player_id, current_min)
            return True
        if type_id == 19: 
            self.init_player(player_id, team_id, current_min)
            return True
        if type_id == 17 and self.get_qualifier(event, 33): 
            self.apply_points(player_id, 'RED_CARD')
            self.remove_player(player_id, current_min)
            return True

        if type_id == 1: 
            self.stats[player_id]['pass_total'] += 1
            if outcome == 1:
                self.stats[player_id]['pass_ok'] += 1
                self.apply_points(player_id, 'PASS_OK')
                if self.get_qualifier(event, 210): self.apply_points(player_id, 'ASSIST')
            else:
                self.apply_points(player_id, 'PASS_FAIL')

        elif type_id == 44: 
            self.stats[player_id]['aerial_total'] += 1
            if outcome == 1:
                self.stats[player_id]['aerial_won'] += 1
                self.apply_points(player_id, 'AERIAL_WON')
            else:
                self.apply_points(player_id, 'AERIAL_LOST')

        elif type_id == 16: 
            is_own_goal = self.get_qualifier(event, 28)
            if is_own_goal: self.apply_points(player_id, 'OWN_GOAL')
            else: self.apply_points(player_id, 'GOAL')
            conceding_team = team_id if is_own_goal else next((t for t in self.teams if t != team_id), None)
            if conceding_team:
                for pid in list(self.on_pitch):
                    if self.players_team.get(pid) == conceding_team:
                        self.apply_points(pid, 'GOAL_CONCEDED')

        elif type_id == 10: self.apply_points(player_id, 'SAVE')
        elif type_id == 12: self.apply_points(player_id, 'CLEARANCE')
        elif type_id == 7 and outcome == 1: self.apply_points(player_id, 'TACKLE_WON')
        elif type_id == 15: self.apply_points(player_id, 'SHOT_TARGET')
        
        return True

def print_dashboard(engine, current_min):
    os.system('cls' if os.name == 'nt' else 'clear')
    print(f"\n🏆 FANTASY LIVE PRO | MINUTO: {current_min}' | {datetime.now().strftime('%H:%M:%S')}")
    print("=" * 110)
    print(f"{'JUGADOR':<25} | {'POS':<3} | {'MIN':<3} | {'PTS':<5} | {'PASES %':<9} | {'AÉREO %':<9} | {'MÉTRICAS'}")
    print("-" * 110)
    
    live_scores = []
    for pid, score in engine.points.items():
        live_score = score
        mins_played = engine.total_minutes.get(pid, 0)
        
        if pid in engine.on_pitch:
            extra_mins = current_min - engine.entry_minutes.get(pid, 0)
            if extra_mins > 0:
                mins_played += extra_mins
                pos = engine.get_player_pos(pid)
                live_score += (extra_mins * POINTS['MIN_PLAYED'][pos])
            
        live_scores.append((pid, live_score, mins_played))
        
    live_scores.sort(key=lambda x: x[1], reverse=True)
    
    for pid, score, mins in live_scores:
        pos = engine.get_player_pos(pid)
        st = engine.stats.get(pid, {})
        name = engine.player_names.get(pid, str(pid))
        display_name = (name[:22] + '...') if len(name) > 25 else name
        
        p_tot, p_ok = st.get('pass_total', 0), st.get('pass_ok', 0)
        p_str = f"{p_ok}/{p_tot} ({int(p_ok/p_tot*100)}%)" if p_tot > 0 else "-"
        
        a_tot, a_ok = st.get('aerial_total', 0), st.get('aerial_won', 0)
        a_str = f"{a_ok}/{a_tot} ({int(a_ok/a_tot*100)}%)" if a_tot > 0 else "-"
        
        # Diccionario visual de métricas
        metric_emojis = {
            'GOAL': '⚽', 'ASSIST': '🎯', 'SAVE': '🧤', 
            'YELLOW_CARD': '🟨', 'RED_CARD': '🟥', 'OWN_GOAL': '🤦‍♂️', 
            'GOAL_CONCEDED': '🥅', 'SHOT_TARGET': '🏹', 'SHOT_OFF': '💨', 
            'CLEARANCE': '🛡️', 'INTERCEPTION': '🧲', 'TACKLE_WON': '⚔️', 
            'PENALTY_WON': '🎁', 'PENALTY_CONC': '❌'
        }
        
        metrics = []
        for key, emoji in metric_emojis.items():
            if st.get(key):  # Si el jugador tiene más de 0 en esta métrica
                metrics.append(f"{emoji} {st[key]}")
                
        m_str = " | ".join(metrics) if metrics else ""
        
        playing_icon = "🟢" if pid in engine.on_pitch else "🔴"
        print(f"{playing_icon} {display_name:<23} | {pos:<3} | {mins:>3}' | {score:>5.1f} | {p_str:<9} | {a_str:<9} | {m_str}")
    
    print("=" * 110)
    print("🟢 En el campo | 🔴 Sustituido/Expulsado/Terminado\n")

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
        'User-Agent': 'Mozilla/5.0'
    }

def descargar_squads_para_partido(match_id, headers):
    """Descarga los squads de los equipos que juegan este partido."""
    print("\n📥 Obteniendo información del partido para descargar squads...")

    # Primero obtenemos los datos del partido para saber qué equipos juegan y la temporada
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
            return False

        data = json.loads(content[start:end+1])

        if "errorCode" in data:
            print(f"❌ Error de API: {data.get('errorCode')}")
            return False

        # Extraer información del partido
        match_info = data.get('match', {})
        home_team = match_info.get('home', {})
        away_team = match_info.get('away', {})

        # Obtener season_id del partido (puede estar en diferentes lugares)
        season_id = None
        if 'season' in match_info:
            season_id = match_info.get('season', {}).get('id')
        elif 'competition' in match_info:
            season_id = match_info.get('competition', {}).get('currentSeason', {}).get('id')
        elif 'tournamentSeasonId' in match_info:
            season_id = match_info.get('tournamentSeasonId')

        teams = []
        if home_team.get('id'):
            teams.append({'id': home_team['id'], 'name': home_team.get('name', 'Home')})
        if away_team.get('id'):
            teams.append({'id': away_team['id'], 'name': away_team.get('name', 'Away')})

        if not teams:
            print("⚠️ No se pudieron obtener los equipos del partido")
            return False

        print(f"   🆚 {teams[0]['name']} vs {teams[1]['name']}")
        if season_id:
            print(f"   📅 Season ID: {season_id}")

    except Exception as e:
        print(f"⚠️ Error al obtener info del partido: {e}")
        return False

    # Ahora descargamos los squads de la temporada (todos los equipos)
    print(f"\n👥 Descargando squads de la temporada...")
    squads_dir = BASE_OUTPUT_PATH / "Partidos_Individuales" / match_id / "squads"
    squads_dir.mkdir(parents=True, exist_ok=True)

    if not season_id:
        print("⚠️ No se pudo obtener el season_id, intentando con teams endpoint...")
        # Fallback: intentar obtener squads por equipo usando teamId
        season_id = teams[0]['id']  # Usamos el ID del equipo local como fallback

    downloaded = 0
    page = 1
    page_size = 100

    while True:
        try:
            url_squad = (f"https://api.performfeeds.com/soccerdata/squads/"
                        f"{SDAPI_OUTLET_KEY}/"
                        f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
                        f"&tmcl={season_id}&detailed=yes&_pgSz={page_size}&_pgNm={page}")

            res = requests.get(url_squad, headers=headers, timeout=15)
            content = res.text
            start = content.find('{')
            end = content.rfind('}')

            if start == -1 or end == -1:
                print("   ❌ Error JSONP")
                break

            squad_data = json.loads(content[start:end+1])

            # Buscar la lista de equipos/jugadores
            items = []
            for key in ['squad', 'person', 'contestant', 'teams']:
                if key in squad_data:
                    items = squad_data[key]
                    break

            if not items:
                print(f"   ⚠️ No se encontró lista. Claves: {list(squad_data.keys())}")
                break

            # Procesar cada equipo
            for item in items:
                team_name = "Unknown"
                team_id = None
                contestant_obj = {}

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

                # Buscar jugadores
                players = []
                for key in ['squad', 'person', 'players', 'athlete']:
                    if key in item:
                        players = item[key]
                        break

                # Guardar solo si es uno de los equipos del partido
                if team_id and team_name != 'Unknown':
                    if any(t['id'] == team_id for t in teams):
                        safe_name = team_name.replace('/', '-').replace('\\', '-')
                        filename = f"{safe_name}_{team_id}.json"
                        team_data = {"team": contestant_obj, "players": players}

                        with open(squads_dir / filename, 'w', encoding='utf-8') as f:
                            json.dump(team_data, f, indent=2, ensure_ascii=False)
                        downloaded += 1
                        print(f"   ✅ {team_name}: {len(players)} jugadores")

            if len(items) < page_size:
                break

            page += 1

        except Exception as e:
            print(f"   ⚠️ Error: {e}")
            break

    if downloaded == 0:
        print("   ⚠️ No se descargaron squads, guardando datos crudos del partido como fallback...")
        # Fallback: guardar los datos del partido como squads en caso de fallo
        with open(squads_dir / f"match_{match_id}.json", 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ {downloaded} squads descargados en: {squads_dir}")
    return downloaded > 0

def main():
    print("⚽ FANTASY LIVE TRACKER")
    print("=" * 40)

    match_id = input("👉 Introduce el ID del partido (Ej: 8m6p1z...): ").strip()

    if not match_id:
        print("❌ Debes introducir un ID válido.")
        return

    # Carpetas de salida
    carpeta_squads = BASE_OUTPUT_PATH / "Partidos_Individuales" / match_id / "squads"
    carpeta_events = BASE_OUTPUT_PATH / "Partidos_Individuales" / match_id / "events"
    carpeta_events.mkdir(parents=True, exist_ok=True)
    archivo_salida = carpeta_events / f"{match_id}.json"

    headers = load_headers()

    # PASO 1: Descargar squads primero
    if not descargar_squads_para_partido(match_id, headers):
        print("⚠️ No se pudieron descargar los squads, continuando sin ellos...")

    # PASO 2: Inicializar motor y cargar posiciones desde squads
    engine = FantasyEngine()

    # Intentar cargar posiciones desde los squads descargados en Partidos_Individuales/{match_id}/squads/
    if not engine.load_positions_from_squads(match_id):
        print("⚠️ No se pudieron cargar las demarcaciones desde squads. Se usará MED por defecto.")

    current_minute = 0

    print(f"\n⏳ Conectando a la API para events. Los datos se guardarán en: {carpeta_events}")
    
    try:
        while True:
            url = (f"https://api.performfeeds.com/soccerdata/matchevent/"
                   f"{SDAPI_OUTLET_KEY}/{match_id}"
                   f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback")

            try:
                res = requests.get(url, headers=headers, timeout=10)
                content = res.text
                start = content.find('{')
                end = content.rfind('}')

                if start != -1 and end != -1:
                    clean_json = content[start:end+1]
                    data = json.loads(clean_json)

                    if "errorCode" in data:
                        print(f"❌ Error de API: {data.get('errorCode')}")
                        break

                    with open(archivo_salida, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=4, ensure_ascii=False)

                    # Extraer posiciones del JSON del partido (fallback si no están en squads)
                    engine.load_positions_from_match(data)
                        
                    events = data.get('liveData', {}).get('event', [])
                    events.sort(key=lambda x: x.get('id', 0))

                    updated = False
                    for event in events:
                        t_min = event.get('timeMin', 0)
                        if t_min > current_minute:
                            current_minute = t_min

                        if engine.process_event(event, current_minute):
                            updated = True

                    if updated:
                        print_dashboard(engine, current_minute)

            except requests.exceptions.RequestException as e:
                print(f"\n⚠️ Fallo de conexión: {e}. Reintentando en 15s...")

            time.sleep(15)

    except KeyboardInterrupt:
        print("\n\n⏹️ Tracker detenido por el usuario. ¡Hasta la próxima!")

if __name__ == "__main__":
    main()