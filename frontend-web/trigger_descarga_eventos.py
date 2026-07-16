#!/usr/bin/env python3
"""
Script para descargar eventos de un partido específico y subirlos a Supabase.
Se usa desde la UI cuando se hace click en "Sincronizar partido".

Uso: python trigger_descarga_eventos.py <fixture_id> <match_id>

El sistema de puntuación se carga desde scoring_rules.json en la raíz del proyecto.
Modifica ese archivo para cambiar las puntuaciones sin tocar este código.
"""

import os
import sys
import json
import time
import requests
from datetime import datetime
from pathlib import Path
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Configuración
SDAPI_OUTLET_KEY = "ft1tiv1inq7v1sk3y9tv12yh5"
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
BASE_OUTPUT_PATH = Path("./data/Partidos_Individuales")

# Debug: print env vars
print(f"DEBUG: SUPABASE_URL={SUPABASE_URL}")
print(f"DEBUG: SUPABASE_KEY present={bool(SUPABASE_KEY)}")

# Sistema de puntuación inicial
BASE_SCORE = 0

# Qualifier IDs (se mantienen para compatibilidad con el parsing de eventos)
Q_LONG_BALL = 1
Q_CROSS = 2
Q_THROUGH_BALL = 4
Q_PLAYERS_INVOLVED = 30
Q_YELLOW = 31
Q_SECOND_YELLOW = 32
Q_RED = 33
Q_OWN_GOAL = 28
Q_PENALTY = 9
Q_HEAD = 15
Q_FREE_KICK_SHOT = 26
Q_LAST_LINE = 14
Q_DEF_BLOCK = 94
Q_LAY_OFF = 156
Q_INTENT_ASSIST = 154
Q_BIG_CHANCE = 214
Q_PULL_BACK = 195
Q_SWITCH_PLAY = 196
Q_ASSIST = 210
Q_SECOND_ASSIST = 218
Q_PASS_END_X = 140
Q_PASS_END_Y = 141
Q_BLOCKED_PASS_QF = 236
Q_BLOCKED_CROSS = 185
Q_PARRIED_SAFE = 173
Q_PARRIED_DANGER = 174
Q_FUMBLE = 381
Q_CORNER = 6
Q_FREE_KICK = 5
Q_PEN_SCORED = 186
Q_PEN_SAVED = 187
Q_PEN_MISSED = 188
Q_ERROR_LED_SHOT = 169
Q_ERROR_LED_GOAL = 170
Q_OVERRUN = 211


def load_scoring_rules_from_supabase():
    """Intenta cargar las reglas desde la tabla scoring_config en Supabase.

    Devuelve el dict de reglas o None si no hay credenciales, no existe la fila
    o falla la consulta (nunca lanza: la puntuación cae al JSON del repo)."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    try:
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        response = client.table('scoring_config').select('rules').eq('id', 1).single().execute()
        rules = getattr(response, 'data', None)
        rules = rules.get('rules') if isinstance(rules, dict) else None
        if rules:
            print("✅ Reglas de puntuación cargadas desde Supabase (scoring_config)")
            print(f"   Versión: {rules.get('version', 'N/A')}")
            return rules
    except Exception as e:
        print(f"⚠️ No se pudieron leer reglas de Supabase, usando JSON local: {e}")
    return None


def load_scoring_rules():
    """Carga las reglas de puntuación: primero Supabase, luego scoring_rules.json."""
    # 1) Fuente de verdad editable desde Admin: tabla scoring_config en Supabase.
    rules = load_scoring_rules_from_supabase()
    if rules:
        return rules

    # 2) Fallback: scoring_rules.json en la raíz del proyecto.
    possible_paths = [
        Path(__file__).parent.parent / 'scoring_rules.json',
        Path(__file__).parent / 'scoring_rules.json',
        Path('scoring_rules.json'),
    ]

    for path in possible_paths:
        if path.exists():
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    rules = json.load(f)
                print(f"✅ Reglas de puntuación cargadas desde: {path}")
                print(f"   Versión: {rules.get('version', 'N/A')}")
                return rules
            except Exception as e:
                print(f"⚠️ Error al cargar {path}: {e}")

    # Si no se encuentra, devolver reglas por defecto
    print("⚠️ No se encontró scoring_rules.json, usando reglas por defecto")
    return {
        "version": "default",
        "participation": {"starter_bonus": 2, "substitute_bonus": 1, "minutes_threshold": 60},
        "events": {
            "goal": {"POR": 6, "DEF": 6, "MED": 5, "DEL": 4},
            "own_goal": {"all": -2},
            "assist_goal": {"all": 3},
            "assist_no_goal": {"all": 1},
            "clean_sheet": {"POR": 4, "DEF": 3, "MED": 2, "DEL": 1, "min_minutes": 60},
            "goal_conceded": {"POR": -2, "DEF": -2, "MED": -1, "DEL": -1},
            "save_per_2": {"all": 1},
            "penalty_save": {"all": 5},
            "penalty_missed": {"all": -2},
            "penalty_won": {"all": 2},
            "penalty_conceded": {"all": -2},
            "yellow_card": {"all": -1},
            "red_card": {"all": -3}
        }
    }


class MatchEventDownloader:
    def __init__(self, fixture_id: str, match_id: str):
        self.fixture_id = fixture_id
        self.match_id = match_id
        self.supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

        # Cargar reglas de puntuación desde JSON
        self.scoring_rules = load_scoring_rules()
        self.participation_rules = self.scoring_rules.get('participation', {})
        self.events_rules = self.scoring_rules.get('events', {})

        self.positions_table = {}
        self.players_team = {}
        self.player_names = {}
        self.entry_minutes = {}
        self.total_minutes = {}
        self.on_pitch = set()
        self.teams = set()
        self.points = {}
        self.stats = {}
        self.team_total_events = {} # NUEVO: Para calcular el % de participación
        self.processed_events = set()
        self.team_goals_conceded = {}
        self.team_goals_scored = {}
        self.player_positions_map = {}
        self.home_team_id = None
        self.away_team_id = None
        self.matchday = None

    def get_position_points(self, rule_key: str, position: str) -> int:
        """Obtiene los puntos para una regla y posición específicas."""
        rule = self.events_rules.get(rule_key, {})
        # Primero buscar por posición específica, luego por 'all' como fallback
        return rule.get(position, rule.get('all', 0))

    def load_headers(self):
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

    def download_squads(self):
        print(f"\n📥 Descargando squads para el partido {self.match_id}...")
        squads_dir = BASE_OUTPUT_PATH / self.match_id / "squads"
        squads_dir.mkdir(parents=True, exist_ok=True)
        headers = self.load_headers()

        url_match = (f"https://api.performfeeds.com/soccerdata/matchevent/"
                     f"{SDAPI_OUTLET_KEY}/{self.match_id}"
                     f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback")
        try:
            res = requests.get(url_match, headers=headers, timeout=15)
            content = res.text
            start = content.find('{')
            end = content.rfind('}')
            if start == -1 or end == -1:
                self.load_teams_from_db()
                return False

            data = json.loads(content[start:end+1])
            if "errorCode" in data:
                self.load_teams_from_db()
                return False

            # El feed matchevent usa la clave 'matchInfo' (no 'match') y los
            # equipos vienen en 'contestant' con position 'home'/'away'.
            match_info = data.get('matchInfo') or data.get('match', {})
            season_id = (
                match_info.get('tournamentCalendar', {}).get('id')
                or match_info.get('season', {}).get('id')
                or match_info.get('competition', {}).get('currentSeason', {}).get('id')
                or match_info.get('tournamentSeasonId')
            )

            teams = []
            # Estructura nueva: matchInfo.contestant = [{id, name, position}]
            for c in match_info.get('contestant', []):
                cid = c.get('id')
                if not cid:
                    continue
                teams.append({'id': cid, 'name': c.get('name', 'Unknown')})
                if c.get('position') == 'home':
                    self.home_team_id = cid
                elif c.get('position') == 'away':
                    self.away_team_id = cid

            # Estructura antigua (fallback): matchInfo.home / matchInfo.away
            if not teams:
                if match_info.get('home', {}).get('id'):
                    teams.append({'id': match_info['home']['id'], 'name': match_info['home'].get('name', 'Home')})
                    self.home_team_id = match_info['home']['id']
                if match_info.get('away', {}).get('id'):
                    teams.append({'id': match_info['away']['id'], 'name': match_info['away'].get('name', 'Away')})
                    self.away_team_id = match_info['away']['id']

            if not teams:
                self.load_teams_from_db()
                return False
        except Exception as e:
            self.load_teams_from_db()
            return False

        if not season_id: season_id = teams[0]['id']

        downloaded = 0
        page = 1
        page_size = 100

        while True:
            try:
                url_squad = (f"https://api.performfeeds.com/soccerdata/squads/{SDAPI_OUTLET_KEY}/"
                             f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback&tmcl={season_id}&detailed=yes&_pgSz={page_size}&_pgNm={page}")
                res = requests.get(url_squad, headers=headers, timeout=15)
                content = res.text
                start = content.find('{')
                end = content.rfind('}')
                if start == -1 or end == -1: break

                squad_data = json.loads(content[start:end+1])
                items = squad_data.get('squad') or squad_data.get('person') or squad_data.get('contestant') or squad_data.get('teams') or []
                if not items: break

                for item in items:
                    team_name, team_id = "Unknown", None
                    if 'contestant' in item and isinstance(item['contestant'], dict):
                        team_name, team_id = item['contestant'].get('name', 'Unknown'), item['contestant'].get('id')
                    elif 'contestantName' in item:
                        team_name, team_id = item.get('contestantName'), item.get('contestantId')

                    players = item.get('squad') or item.get('person') or item.get('players') or item.get('athlete') or []

                    if team_id and team_name != 'Unknown' and any(t['id'] == team_id for t in teams):
                        safe_name = team_name.replace('/', '-').replace('\\', '-')
                        with open(squads_dir / f"{safe_name}_{team_id}.json", 'w', encoding='utf-8') as f:
                            json.dump({"team": {"id": team_id, "name": team_name}, "players": players}, f, indent=2, ensure_ascii=False)
                        downloaded += 1

                if len(items) < page_size: break
                page += 1
            except Exception: break

        print(f"\n✅ {downloaded} squads descargados en: {squads_dir}")
        return downloaded > 0

    def load_teams_from_db(self):
        """Obtiene los IDs de local y visitante desde la tabla fixtures en Supabase."""
        print(f"   🔄 Obteniendo equipos desde la base de datos...")
        try:
            response = self.supabase.table('fixtures').select('home_team_id, away_team_id, matchday').eq('id', self.fixture_id).single().execute()
            if response.data:
                self.home_team_id = response.data['home_team_id']
                self.away_team_id = response.data['away_team_id']
                self.matchday = response.data.get('matchday')
                print(f"   ✅ Equipos cargados: Local={self.home_team_id}, Visitante={self.away_team_id} (jornada {self.matchday})")
            else:
                print(f"   ⚠️ No se encontraron equipos para el fixture {self.fixture_id}")
        except Exception as e:
            print(f"   ⚠️ Error cargando equipos desde BD: {e}")

    def load_positions_from_squads(self):
        pos_map = {
            'goalkeeper': 'POR', 'portero': 'POR', 'g': 'POR', 'gk': 'POR',
            'defender': 'DEF', 'defensa': 'DEF', 'd': 'DEF', 'df': 'DEF',
            'midfielder': 'MED', 'centrocampista': 'MED', 'm': 'MED', 'mf': 'MED',
            'attacker': 'DEL', 'striker': 'DEL', 'forward': 'DEL', 'delantero': 'DEL', 'a': 'DEL', 'f': 'DEL', 'fw': 'DEL'
        }
        squads_path = BASE_OUTPUT_PATH / self.match_id / "squads"
        if not squads_path.exists(): return False

        loaded = 0
        for squad_file in squads_path.glob("*.json"):
            try:
                with open(squad_file, 'r', encoding='utf-8') as f:
                    squad_data = json.load(f)
                for player in squad_data.get('players', []):
                    pid = str(player.get('id'))
                    if pid:
                        pos = pos_map.get(player.get('position', '').lower().strip(), 'MED')
                        self.positions_table[pid] = pos
                        self.player_positions_map[pid] = pos
                        loaded += 1
            except Exception: pass
        return loaded > 0

    def get_qualifier(self, event, qual_id):
        for q in event.get('qualifier', []):
            if q.get('qualifierId') == qual_id: return q.get('value', True)
        return False

    def has_qualifier(self, event, qual_id):
        return any(q.get('qualifierId') == qual_id for q in event.get('qualifier', []))

    def get_qualifier_float(self, event, qual_id, default=None):
        val = self.get_qualifier(event, qual_id)
        if val in [False, True]: return default
        try: return float(val)
        except (TypeError, ValueError): return default

    def init_player_stats_if_none(self, player_id):
        """Inicializa los contadores a 0 la primera vez que el jugador hace algo."""
        if player_id not in self.stats:
            self.stats[player_id] = {
                'goals': 0, 'own_goals': 0,
                'assists': 0, 'fantasy_assist': 0, 'recoveries_high': 0, 'recoveries_med': 0, 'recoveries_low': 0,
                'punches_ok': 0, 'punches_fail': 0, 
                'claims': 0, 'sweepers': 0,
                'penalties_missed': 0, 'penalties_saved': 0, 'penalties_won': 0, 'penalties_conceded': 0,
                'goals_conceded': 0, 'clean_sheet': 0, 'saves': 0,
                'yellow_cards': 0, 'second_yellow_cards': 0, 'red_cards': 0,
                'shots_on_target': 0, 'shots_off_target': 0, 'shots_hit_woodwork': 0,
                'big_chances_created': 0, 'big_chances_missed': 0,
                'clearances': 0, 'clearances_last_line': 0, 'blocked_crosses': 0,
                'interceptions': 0, 'interceptions_high': 0, 'interceptions_med': 0, 'interceptions_low': 0,
                'tackles_won': 0, 'tackles_lost': 0,
                'blocked_shots': 0, 'blocked_passes': 0, 'ball_recoveries': 0,
                'offsides_provoked': 0, 'challenges_lost': 0,
                'errors_leading_to_shot': 0, 'errors_leading_to_goal': 0,
                'passes_completed': 0, 'passes_attempted': 0,
                'progressive_passes': 0, 'passes_into_final_third': 0,
                'passes_into_box': 0, 'through_balls': 0,
                'crosses_completed': 0, 'crosses_attempted': 0,
                'switch_plays': 0, 'pull_backs': 0,
                'long_balls_completed': 0, 'lay_offs': 0,
                'offside_passes': 0,
                # Nuevas métricas v3.0 RELEVO
                'forward_passes': 0,
                'set_pieces_taken': 0,
                'successful_crosses': 0,
                'takeons_won': 0, 'takeons_lost': 0, 'takeons_overrun': 0,
                'good_skills': 0, 'dispossessed': 0, 'bad_touches': 0,
                'aerials_won': 0, 'aerials_lost': 0,
                'fouls_committed': 0, 'fouls_won': 0,
                # Internos y Puntos RELEVO
                'pass_opp_half': 0,
                'box_entries': 0,
                'total_events': 0,
                'pass_opp_half_attempted': 0,
                'pass_opp_half_completed': 0,
                'shots_total': 0,
                'relevo_points': 0
            }
            if player_id not in self.points:
                self.points[player_id] = BASE_SCORE

    def apply_points(self, player_id, stat_key, multiplier=1, current_min=0):
        """Suma al contador y automáticamente recalcula los puntos en tiempo real."""
        self.init_player_stats_if_none(player_id)
        
        if stat_key != 'MIN_PLAYED':
            self.stats[player_id][stat_key] = self.stats[player_id].get(stat_key, 0) + int(multiplier)
            
        self.recalculate_player_points(player_id, current_min)

    def calculate_relevo_points(self, player_id):
        """Calcula los Puntos RELEVO (0 a 4) basados en estadísticas y porcentajes"""
        stats = self.stats[player_id]
        team_id = self.players_team.get(player_id)
        if not team_id: return 0
        
        rules = self.scoring_rules.get('relevo_rules', {})
        # Evitamos dividir por cero. Asegurar al menos 1
        team_events = max(1, self.team_total_events.get(team_id, 1))
        player_events = stats.get('total_events', 0)
        
        relevo = 0.0
        breakdown = {
            'relevo_participation_pts': 0.0,
            'relevo_passes_pts': 0.0,
            'relevo_opp_half_pts': 0.0,
            'relevo_shots_pts': 0.0,
            'relevo_duels_pts': 0.0,
            'relevo_aerials_pts': 0.0,
            'relevo_takeons_pts': 0.0
        }
        
        # 1. PARTICIPACIÓN (% de eventos del equipo)
        pct_participacion = (player_events / team_events) * 100
        step = rules.get('participation_step_percent', 10)
        p_pts = int(pct_participacion // step) * rules.get('participation_points_per_step', 1)
        breakdown['relevo_participation_pts'] = float(p_pts)
        relevo += p_pts
        
        # 2. PASES (% de acierto global)
        passes_att = stats.get('passes_attempted', 0)
        if passes_att >= rules.get('min_passes', 10):
            pass_acc = (stats.get('passes_completed', 0) / passes_att) * 100
            pts = 0
            if pass_acc >= rules.get('pass_accuracy_excel', 92): pts = 2
            elif pass_acc >= rules.get('pass_accuracy_high', 85): pts = 1
            elif pass_acc < rules.get('pass_accuracy_low', 65): pts = -1
            breakdown['relevo_passes_pts'] = float(pts)
            relevo += pts
            
        # 3. PASES CAMPO RIVAL (% de acierto)
        opp_att = stats.get('pass_opp_half_attempted', 0)
        if opp_att >= rules.get('min_opp_half_passes', 10):
            opp_acc = (stats.get('pass_opp_half_completed', 0) / opp_att) * 100
            if opp_acc >= rules.get('opp_half_accuracy_high', 75):
                breakdown['relevo_opp_half_pts'] = 1.0
                relevo += 1
            
        # 4. TIROS (% a puerta)
        total_shots = stats.get('shots_total', 0)
        if total_shots >= rules.get('min_shots', 2):
            on_target_total = stats.get('shots_on_target', 0) + stats.get('goals', 0)
            shot_acc = (on_target_total / total_shots) * 100
            pts = 0
            if shot_acc >= rules.get('shot_accuracy_high', 50): pts = 1
            elif shot_acc == 0: pts = -1
            breakdown['relevo_shots_pts'] = float(pts)
            relevo += pts
            
        # 5. DUELOS (Ganados vs Perdidos)
        duels_won = stats.get('tackles_won', 0) + stats.get('takeons_won', 0) + stats.get('fouls_won', 0)
        duels_lost = stats.get('tackles_lost', 0) + stats.get('takeons_lost', 0) + stats.get('fouls_committed', 0) + stats.get('dispossessed', 0) + stats.get('challenges_lost', 0)
        total_duels = duels_won + duels_lost
        if total_duels >= rules.get('min_duels', 5):
            duel_acc = (duels_won / total_duels) * 100
            d_step = rules.get('duels_step_percent', 10)
            d_pts_per_step = rules.get('duels_points_per_step', 0.2)
            pts = float(int(duel_acc // d_step) * d_pts_per_step)
            breakdown['relevo_duels_pts'] = pts
            relevo += pts
            
        # 6. DUELOS AÉREOS
        aerials_total = stats.get('aerials_won', 0) + stats.get('aerials_lost', 0)
        if aerials_total >= rules.get('min_aerials', 3):
            aer_acc = (stats.get('aerials_won', 0) / aerials_total) * 100
            pts = 0
            if aer_acc >= rules.get('aerials_won_high', 60): pts = 1
            elif aer_acc < rules.get('aerials_won_low', 30): pts = -1
            breakdown['relevo_aerials_pts'] = float(pts)
            relevo += pts

        # 7. REGATES INTENTADOS (>50% de éxito)
        takeons_won = stats.get('takeons_won', 0)
        takeons_lost = stats.get('takeons_lost', 0)
        takeons_total = takeons_won + takeons_lost
        if takeons_total > 0 and (takeons_won / takeons_total) > 0.5:
            breakdown['relevo_takeons_pts'] = 1.0
            relevo += 1

        breakdown['total'] = max(0.0, relevo) # Podemos quitar el max(4) si queremos que escale o dejarlo. Mejor dejar max(0) mínimo.
        return breakdown

    def recalculate_player_points(self, player_id, current_min):
        """Motor que calcula los puntos totales del jugador en tiempo real usando las reglas del JSON."""
        stats = self.stats[player_id]
        pos = self.player_positions_map.get(player_id, 'MED')

        mins_played = self.total_minutes.get(player_id, 0)
        if player_id in self.on_pitch:
            mins_played += max(0, current_min - self.entry_minutes.get(player_id, current_min))

        points = 0
        rules = self.events_rules
        part_rules = self.participation_rules

        # --- PARTICIPACIÓN ---
        if mins_played > 0:
            threshold = part_rules.get('minutes_threshold', 60)
            if mins_played > threshold:
                points += part_rules.get('starter_bonus', 2)
            else:
                points += part_rules.get('substitute_bonus', 1)

        # --- GOLES ---
        goals = stats.get('goals', 0)
        if goals > 0:
            points += goals * self.get_position_points('goal', pos)

        # Gol en propia puerta
        own_goals = stats.get('own_goals', 0)
        if own_goals > 0:
            points += own_goals * self.get_position_points('own_goal', pos)

        # --- ASISTENCIAS ---
        assists = stats.get('assists', 0)
        if assists > 0:
            points += assists * self.get_position_points('assist_goal', pos)

        fantasy_assists = stats.get('fantasy_assist', 0)
        if fantasy_assists > 0:
            points += fantasy_assists * self.get_position_points('assist_no_goal', pos)

        # --- PORTERÍA A CERO ---
        goals_conc = stats.get('goals_conceded', 0)
        clean_sheet_min = rules.get('clean_sheet', {}).get('min_minutes', 60)

        if mins_played > clean_sheet_min and goals_conc == 0:
            points += self.get_position_points('clean_sheet', pos)

        # --- GOLES RECIBIDOS (por gol) ---
        if goals_conc > 0:
            gc_rule = self.get_position_points('goal_conceded', pos)
            points += goals_conc * gc_rule

        # --- PENALTIS ---
        pen_missed = stats.get('penalties_missed', 0)
        if pen_missed > 0:
            points += pen_missed * self.get_position_points('penalty_missed', pos)

        pen_saved = stats.get('penalties_saved', 0)
        if pen_saved > 0:
            points += pen_saved * self.get_position_points('penalty_save', pos)

        pen_won = stats.get('penalties_won', 0)
        if pen_won > 0:
            points += pen_won * self.get_position_points('penalty_won', pos)
            
        pen_conceded = stats.get('penalties_conceded', 0)
        if pen_conceded > 0:
            points += pen_conceded * self.get_position_points('penalty_conceded', pos)

        # --- TARJETAS ---
        yellow = stats.get('yellow_cards', 0)
        if yellow > 0:
            points += yellow * self.get_position_points('yellow_card', pos)

        second_yellow = stats.get('second_yellow_cards', 0)
        if second_yellow > 0:
            points += second_yellow * self.get_position_points('second_yellow_card', pos)

        red = stats.get('red_cards', 0)
        if red > 0:
            points += red * self.get_position_points('red_card', pos)

        # --- PARADAS PORTERO Y ACCIONES NUEVAS ---
        saves = stats.get('saves', 0)
        points += saves * self.get_position_points('save', pos)
        
        points += stats.get('punches_ok', 0) * self.get_position_points('punch_ok', pos)
        points += stats.get('punches_fail', 0) * self.get_position_points('punch_fail', pos)
        points += stats.get('claims', 0) * self.get_position_points('claim', pos)
        points += stats.get('sweepers', 0) * self.get_position_points('sweeper', pos)

        # ============================================
        # === BONUS ATAQUE y DEFENSIVOS (Desde JSON) ===
        # ============================================
        bonuses = self.scoring_rules.get('bonuses_per_X', {})
        
        def apply_bonus(stat_name, bonus_config):
            val = stats.get(stat_name, 0)
            # Como ahora req es 1, multiplicamos directo por los puntos decimales
            return val * bonus_config.get('points', 0.0)

        points += apply_bonus('passes_completed', bonuses.get('passes_completed', {}))
        points += apply_bonus('shots_on_target', bonuses.get('shots_on_target', {}))
        points += apply_bonus('takeons_won', bonuses.get('takeons_won', {}))
        points += apply_bonus('box_entries', bonuses.get('box_entries', {}))
        points += apply_bonus('recoveries_high', bonuses.get('recoveries_high', {}))
        points += apply_bonus('recoveries_med', bonuses.get('recoveries_med', {}))
        points += apply_bonus('recoveries_low', bonuses.get('recoveries_low', {}))
        points += apply_bonus('interceptions_high', bonuses.get('interceptions_high', {}))
        points += apply_bonus('interceptions_med', bonuses.get('interceptions_med', {}))
        points += apply_bonus('interceptions_low', bonuses.get('interceptions_low', {}))
        points += apply_bonus('clearances', bonuses.get('clearances', {}))
        points += apply_bonus('forward_passes', bonuses.get('forward_passes', {}))
        points += apply_bonus('set_pieces_taken', bonuses.get('set_pieces_taken', {}))
        points += apply_bonus('successful_crosses', bonuses.get('successful_crosses', {}))
        points += apply_bonus('long_balls_completed', bonuses.get('long_balls_completed', {}))

        # ============================================
        # === PENALIZACIONES POSICIONALES ===
        # ============================================
        lost_balls = stats.get('dispossessed', 0) + stats.get('bad_touches', 0)
        penalties_rules = self.scoring_rules.get('penalties_per_X', {}).get('lost_balls', {})
        
        rule_pos = penalties_rules.get(pos, {"points": -0.2})
        points += lost_balls * rule_pos.get('points', -0.2)

        # ============================================
        # === APLICAR PUNTOS RELEVO AL TOTAL ===
        # ============================================
        relevo_breakdown = self.calculate_relevo_points(player_id)
        relevo_points = relevo_breakdown['total']
        # Guardamos en stats para subirlo opcionalmente a base de datos
        self.stats[player_id]['relevo_points'] = relevo_points 
        self.stats[player_id].update(relevo_breakdown)
        
        # Sumar los puntos Relevo al total
        points += relevo_points

        self.points[player_id] = round(points, 2)

    def init_player(self, player_id, team_id, current_min):
        self.on_pitch.add(player_id)
        self.players_team[player_id] = team_id
        self.entry_minutes[player_id] = current_min
        self.apply_points(player_id, 'MIN_PLAYED', 0, current_min)

    def remove_player(self, player_id, current_min):
        if player_id in self.on_pitch:
            self.on_pitch.remove(player_id)
            # Asegurar que el jugador está inicializado antes de acceder
            self.init_player_stats_if_none(player_id)
            mins_played = max(0, current_min - self.entry_minutes.get(player_id, current_min))
            self.total_minutes.setdefault(player_id, 0)
            self.total_minutes[player_id] += mins_played
            self.apply_points(player_id, 'MIN_PLAYED', 0, current_min)

    def process_event(self, event, current_min):
        event_id = event.get('id')
        if event_id in self.processed_events: return False
        self.processed_events.add(event_id)

        type_id = event.get('typeId')
        player_id = event.get('playerId')
        if player_id and event.get('playerName'):
            self.player_names[player_id] = event['playerName']

        # Procesar lineup primero para tener los equipos y jugadores cargados
        if type_id == 34:
            result = self._handle_lineup(event, current_min)
            return result

        # Si no hay equipos cargados aún, intentar cargarlos desde el evento
        if not self.teams and self.home_team_id and self.away_team_id:
            self.teams.add(self.home_team_id)
            self.teams.add(self.away_team_id)
            self.team_goals_conceded.setdefault(self.home_team_id, 0)
            self.team_goals_conceded.setdefault(self.away_team_id, 0)
            self.team_goals_scored.setdefault(self.home_team_id, 0)
            self.team_goals_scored.setdefault(self.away_team_id, 0)
            print(f"   📋 Equipos cargados desde BD: {self.home_team_id}, {self.away_team_id}")

        if type_id == 18: return self._handle_sub_off(event, current_min)
        if type_id == 19: return self._handle_sub_on(event, current_min)

        if not player_id: return False

        # --- Contabilizador de eventos para % de participación ---
        self.init_player_stats_if_none(player_id)
        self.stats[player_id]['total_events'] += 1
        team_id = event.get('contestantId') or self.players_team.get(player_id)
        if team_id:
            self.team_total_events[team_id] = self.team_total_events.get(team_id, 0) + 1
        # ---------------------------------------------------------

        handlers = {
            1: self._handle_pass,
            3: self._handle_takeon,
            4: self._handle_foul,
            7: self._handle_tackle,
            8: self._handle_interception,
            10: self._handle_save,
            11: self._handle_claim,    
            12: self._handle_clearance,
            13: self._handle_shot_miss,
            14: self._handle_shot_post,
            15: self._handle_shot_target,
            16: self._handle_goal,
            17: self._handle_card,
            41: self._handle_punch,    
            44: self._handle_aerial,
            49: self._handle_recovery,
            50: self._handle_dispossessed,
            58: self._handle_penalty_faced,
            59: self._handle_sweeper,  
            61: self._handle_ball_touch,
        }
        handler = handlers.get(type_id)
        if handler:
            handler(event, current_min)
            return True
        return False

    def _handle_lineup(self, event, current_min):
        team_id = event.get('contestantId')
        if team_id:
            self.teams.add(team_id)
            self.team_goals_conceded.setdefault(team_id, 0)
            self.team_goals_scored.setdefault(team_id, 0)
        q30 = self.get_qualifier(event, Q_PLAYERS_INVOLVED)
        if q30 and isinstance(q30, str):
            for pid in [p.strip() for p in q30.split(',')][:11]:
                self.init_player(pid, team_id, 0)
        return True

    def _handle_sub_off(self, event, current_min):
        pid = event.get('playerId')
        if pid: self.remove_player(pid, event.get('timeMin', current_min))
        return True

    def _handle_sub_on(self, event, current_min):
        pid = event.get('playerId')
        team_id = event.get('contestantId')
        if pid: self.init_player(pid, team_id, event.get('timeMin', current_min))
        return True

    def _handle_recovery(self, event, current_min):
        pid = event.get('playerId')
        x_coord = event.get('x', 0)
        
        # Lógica de zonas para recuperaciones
        if x_coord > 66.6:
            self.apply_points(pid, 'recoveries_high', 1, current_min)
        elif 33.3 <= x_coord <= 66.6:
            self.apply_points(pid, 'recoveries_med', 1, current_min)
        else:
            self.apply_points(pid, 'recoveries_low', 1, current_min)
        
        # Sumamos también al contador general por si hace falta para otras cosas
        self.apply_points(pid, 'ball_recoveries', 1, current_min)

    def _handle_pass(self, event, current_min):
        pid = event.get('playerId')
        outcome = event.get('outcome', 1)
        x_coord = event.get('x', 0)
        y_coord = event.get('y', 0)
        is_opp_half = x_coord >= 50
        is_long = self.has_qualifier(event, Q_LONG_BALL)

        self.apply_points(pid, 'passes_attempted', 1, current_min)
        if is_opp_half: self.apply_points(pid, 'pass_opp_half_attempted', 1, current_min)
        if self.has_qualifier(event, Q_CROSS): self.apply_points(pid, 'crosses_attempted', 1, current_min)

        # Lógica Balón Parado
        is_corner = self.has_qualifier(event, Q_CORNER)
        is_free_kick = self.has_qualifier(event, Q_FREE_KICK)

        # Falta (si X > 60) o Córner
        if is_corner or (is_free_kick and x_coord > 60):
            self.apply_points(pid, 'set_pieces_taken', 1, current_min)

        if outcome == 1:
            self.apply_points(pid, 'passes_completed', 1, current_min)
            if is_opp_half: self.apply_points(pid, 'pass_opp_half_completed', 1, current_min)

            end_x = self.get_qualifier_float(event, Q_PASS_END_X)
            end_y = self.get_qualifier_float(event, Q_PASS_END_Y)

            if end_x is not None and end_y is not None:
                # Pase hacia adelante: End_x es 10 unidades mayor que X, y la desviación de Y es entre -10 y 10
                if end_x >= (x_coord + 10) and -10 <= (end_y - y_coord) <= 10:
                    self.apply_points(pid, 'forward_passes', 1, current_min)

                if end_x >= 50:
                    self.apply_points(pid, 'pass_opp_half', 1, current_min)

                # Llegadas al área rival
                if end_x > 83 and 21.1 <= end_y <= 78.9:
                    self.apply_points(pid, 'box_entries', 1, current_min)

            if is_long:
                self.apply_points(pid, 'long_balls_completed', 1, current_min)

            if self.has_qualifier(event, Q_CROSS):
                self.apply_points(pid, 'crosses_completed', 1, current_min)
                # Solo suma 'successful_crosses' si NO es córner y NO es falta
                if not is_corner and not is_free_kick:
                    self.apply_points(pid, 'successful_crosses', 1, current_min)

            assist_val = self.get_qualifier(event, Q_ASSIST)
            if assist_val is not False:
                if str(assist_val) == '16': self.apply_points(pid, 'assists', 1, current_min)
                else: self.apply_points(pid, 'fantasy_assist', 1, current_min)
        else:
            self.apply_points(pid, 'dispossessed', 1, current_min)

    def _handle_takeon(self, event, current_min):
        pid = event.get('playerId')
        if event.get('outcome', 0) == 1:
            self.apply_points(pid, 'takeons_won', 1, current_min)
        else:
            self.apply_points(pid, 'takeons_lost', 1, current_min)

    def _handle_dispossessed(self, event, current_min):
        self.apply_points(event.get('playerId'), 'dispossessed', 1, current_min)

    def _handle_ball_touch(self, event, current_min):
        if event.get('outcome', 1) == 0:
            self.apply_points(event.get('playerId'), 'bad_touches', 1, current_min)

    def _handle_foul(self, event, current_min):
        pid = event.get('playerId')
        if event.get('outcome', 0) == 1:
            self.apply_points(pid, 'fouls_won', 1, current_min)
            if self.has_qualifier(event, Q_PENALTY):
                self.apply_points(pid, 'penalties_won', 1, current_min)
        else:
            self.apply_points(pid, 'fouls_committed', 1, current_min)
            if self.has_qualifier(event, Q_PENALTY):
                self.apply_points(pid, 'penalties_conceded', 1, current_min)

    def _handle_tackle(self, event, current_min):
        pid = event.get('playerId')
        if event.get('outcome', 0) == 1:
            self.apply_points(pid, 'tackles_won', 1, current_min)
        else:
            self.apply_points(pid, 'tackles_lost', 1, current_min)

    def _handle_interception(self, event, current_min):
        pid = event.get('playerId')
        x_coord = event.get('x', 0)

        # Lógica de zonas para interceptaciones (igual que recuperaciones)
        if x_coord > 66.6:
            self.apply_points(pid, 'interceptions_high', 1, current_min)
        elif 33.3 <= x_coord <= 66.6:
            self.apply_points(pid, 'interceptions_med', 1, current_min)
        else:
            self.apply_points(pid, 'interceptions_low', 1, current_min)

        # Contador agregado (para estadísticas)
        self.apply_points(pid, 'interceptions', 1, current_min)

    def _handle_recovery(self, event, current_min):
        pid = event.get('playerId')
        x_coord = event.get('x', 0)
        
        # Lógica de zonas para recuperaciones
        if x_coord > 66.6:
            self.apply_points(pid, 'recoveries_high', 1, current_min)
        elif 33.3 <= x_coord <= 66.6:
            self.apply_points(pid, 'recoveries_med', 1, current_min)
        else:
            self.apply_points(pid, 'recoveries_low', 1, current_min)
        
        # Sumamos también al contador general por si hace falta para otras cosas
        self.apply_points(pid, 'ball_recoveries', 1, current_min)


    def _handle_clearance(self, event, current_min):
        self.apply_points(event.get('playerId'), 'clearances', 1, current_min)

    def _handle_aerial(self, event, current_min):
        pid = event.get('playerId')
        self.apply_points(pid, 'aerials_total', 1, current_min)
        if event.get('outcome', 0) == 1:
            self.apply_points(pid, 'aerials_won', 1, current_min)
        else:
            self.apply_points(pid, 'aerials_lost', 1, current_min)

    def _handle_save(self, event, current_min):
        if not self.has_qualifier(event, Q_DEF_BLOCK):
            self.apply_points(event.get('playerId'), 'saves', 1, current_min)
    
    def _handle_claim(self, event, current_min):
        self.apply_points(event.get('playerId'), 'claims', 1, current_min)

    def _handle_punch(self, event, current_min):
        if event.get('outcome', 0) == 1:
            self.apply_points(event.get('playerId'), 'punches_ok', 1, current_min)
        else:
            self.apply_points(event.get('playerId'), 'punches_fail', 1, current_min)

    def _handle_sweeper(self, event, current_min):
        self.apply_points(event.get('playerId'), 'sweepers', 1, current_min)

    def _handle_penalty_faced(self, event, current_min):
        if self.has_qualifier(event, Q_PEN_SAVED):
            self.apply_points(event.get('playerId'), 'penalties_saved', 1, current_min)

    def _handle_shot_target(self, event, current_min):
        self.apply_points(event.get('playerId'), 'shots_total', 1, current_min)
        self.apply_points(event.get('playerId'), 'shots_on_target', 1, current_min)
        # typeId 15 = "Attempt Saved": si es un penalti a puerta (no gol), lo ha
        # parado el portero -> cuenta como penalti fallado para el lanzador.
        if self.has_qualifier(event, Q_PENALTY):
            self.apply_points(event.get('playerId'), 'penalties_missed', 1, current_min)

    def _handle_shot_miss(self, event, current_min):
        self.apply_points(event.get('playerId'), 'shots_total', 1, current_min)
        if self.has_qualifier(event, Q_PENALTY):
            self.apply_points(event.get('playerId'), 'penalties_missed', 1, current_min)

    def _handle_shot_post(self, event, current_min):
        self.apply_points(event.get('playerId'), 'shots_total', 1, current_min)
        if self.has_qualifier(event, Q_PENALTY):
            self.apply_points(event.get('playerId'), 'penalties_missed', 1, current_min)

    def _handle_goal(self, event, current_min):
        pid = event.get('playerId')
        team_id = event.get('contestantId')
        player_name = event.get('playerName', 'Unknown')
        is_own_goal = self.has_qualifier(event, Q_OWN_GOAL)
        
        # Todo gol cuenta como tiro total (excepto si es propia puerta)
        if not is_own_goal:
            self.apply_points(pid, 'shots_total', 1, current_min)

        if is_own_goal:
            self.apply_points(pid, 'own_goals', 1, current_min)
            # En propia meta: el equipo que marca es el rival del que hizo la propia
            scoring_team = next((t for t in self.teams if t != team_id), None)
            if scoring_team:
                self.team_goals_scored[scoring_team] = self.team_goals_scored.get(scoring_team, 0) + 1
                print(f"   ⚽ GOLE EN PROPIA: {player_name} ({team_id}) → Gol para {scoring_team}")
            else:
                print(f"   ⚠️ GOLE EN PROPIA: No se encontró scoring_team. team_id={team_id}, teams={self.teams}")
            # El equipo que hizo la propia recibe el gol en contra
            self.team_goals_conceded[team_id] = self.team_goals_conceded.get(team_id, 0) + 1
        else:
            self.apply_points(pid, 'goals', 1, current_min)
            # Gol normal: el equipo que marca es el del jugador
            self.team_goals_scored[team_id] = self.team_goals_scored.get(team_id, 0) + 1
            print(f"   ⚽ GOL: {player_name} ({team_id}) → Goles marcados: {self.team_goals_scored[team_id]}")
            # El equipo rival recibe el gol en contra
            conceding_team = next((t for t in self.teams if t != team_id), None)
            if conceding_team:
                self.team_goals_conceded[conceding_team] = self.team_goals_conceded.get(conceding_team, 0) + 1

        # Actualizar puntos de todos los jugadores del equipo que recibe el gol
        conceding_team = team_id if is_own_goal else next((t for t in self.teams if t != team_id), None)
        if conceding_team:
            for p_on in list(self.on_pitch):
                if self.players_team.get(p_on) == conceding_team:
                    self.apply_points(p_on, 'goals_conceded', 1, current_min)

    def _handle_card(self, event, current_min):
        pid = event.get('playerId')
        t_min = event.get('timeMin', current_min)
        if self.has_qualifier(event, Q_RED):
            self.apply_points(pid, 'red_cards', 1, current_min)
            self.remove_player(pid, t_min)
        elif self.has_qualifier(event, Q_SECOND_YELLOW):
            self.apply_points(pid, 'second_yellow_cards', 1, current_min)
            self.remove_player(pid, t_min)
        elif self.has_qualifier(event, Q_YELLOW):
            self.apply_points(pid, 'yellow_cards', 1, current_min)

    def get_player_position(self, player_id):
        return self.player_positions_map.get(player_id, 'MED')

    def find_player_id(self, api_player_id: str, team_id: str, player_name: str):
        """
        Busca el ID del jugador en la tabla players por ID (Opta ID = ID en BD).
        No usa coincidencia por nombre para evitar mapeos incorrectos.
        """
        # Estrategia 0: Si el api_player_id empieza por 'cult_', buscar por external_id
        if api_player_id.startswith('cult_'):
            response = self.supabase.table('players').select('id').eq('id', api_player_id).execute()
            if response.data:
                return api_player_id
            response = self.supabase.table('players').select('id').eq('external_id', api_player_id.replace('cult_', '')).execute()
            if response.data:
                return response.data[0]['id']

        # Estrategia principal: buscar directamente por Opta ID en la BD
        response_direct = self.supabase.table('players').select('id').eq('id', api_player_id).execute()
        if response_direct.data:
            return api_player_id

        # No encontrado por ID — omitir este jugador
        print(f"      ⚠️ Jugador no encontrado en BD por ID: {api_player_id} ({player_name})")
        return api_player_id

    def update_match_score(self, match_ended=False, current_minute=0):
        """Actualiza el marcador del partido en la tabla fixtures.

        match_ended=True solo cuando la API ha emitido el evento de tiempo
        completo. Mientras el partido sigue en juego dejamos status='live'
        para que el sincronizador automático lo siga refrescando cada pocos
        minutos; al terminar lo marcamos 'finished' y el cron deja de tocarlo.
        """
        print("\n📊 Actualizando marcador del partido...")

        if not self.home_team_id or not self.away_team_id:
            print("⚠️ No se pueden calcular goles: faltan IDs de equipos")
            return

        # Los goles de cada equipo son los que MARCÓ (no los que recibió)
        home_goals = self.team_goals_scored.get(self.home_team_id, 0)
        away_goals = self.team_goals_scored.get(self.away_team_id, 0)

        new_status = 'finished' if match_ended else 'live'
        print(f"   Marcador calculado: Local ({self.home_team_id}) {home_goals} - {away_goals} Visitante ({self.away_team_id})")
        print(f"   (Local marcó: {home_goals}, Visitante marcó: {away_goals}) → status='{new_status}'")

        # Actualizar la tabla fixtures
        try:
            response = self.supabase.table('fixtures').update({
                'home_score': home_goals,
                'away_score': away_goals,
                'status': new_status,
                'current_minute': current_minute
            }).eq('id', self.fixture_id).execute()

            if response.data:
                print(f"   ✅ Marcador actualizado en fixtures")
            else:
                print(f"   ⚠️ No se pudo actualizar el marcador")
        except Exception as e:
            print(f"   ❌ Error actualizando marcador: {e}")

    def upload_to_supabase(self):
        """Sube los player_scores a Supabase usando los nombres de columnas correctos."""
        print("\n📤 Subiendo datos a Supabase...")

        for player_id, total_points in self.points.items():
            team_id = self.players_team.get(player_id)
            if not team_id: continue

            # Buscar el ID real del jugador en la BD
            db_player_id = self.find_player_id(player_id, team_id, self.player_names.get(player_id, ''))

            # Si no se encontró el jugador, saltar este registro
            if db_player_id == player_id:
                # Verificar que el jugador existe en la BD (solo por ID, sin restricción de equipo:
                # un jugador puede estar en BD con team_id de club pero jugar en selección nacional)
                exists = self.supabase.table('players').select('id').eq('id', player_id).execute()
                if not exists.data:
                    print(f"   ⚠️ Saltando {self.player_names.get(player_id, player_id)}: no encontrado en BD")
                    continue
                print(f"   ✓ Usando mismo ID: {player_id}")

            stats = self.stats.get(player_id, {})
            pos = self.get_player_position(player_id)
            mins_played = self.total_minutes.get(player_id, 0)

            # Pases: pass_ok -> passes_completed, pass_total -> passes_attempted
            passes_completed = stats.get('passes_completed', 0)
            passes_attempted = stats.get('passes_attempted', 0)
            pass_accuracy = (passes_completed / passes_attempted * 100) if passes_attempted > 0 else 0

            # Duelos aéreos
            aerials_won = stats.get('aerials_won', 0)
            aerials_lost = stats.get('aerials_lost', 0)
            aerials_total = aerials_won + aerials_lost
            aerial_success_rate = (aerials_won / aerials_total * 100) if aerials_total > 0 else 0

            is_starter = self.entry_minutes.get(player_id, 999) == 0
            clean_sheet = mins_played > 60 and stats.get('goals_conceded', 0) == 0

            player_score_data = {
                'player_id': db_player_id,  # Usar ID local mapeado
                'fixture_id': self.fixture_id,
                'match_id': self.match_id,
                'matchday': self.matchday,
                'team_id': team_id,
                'position': pos,
                'is_starter': is_starter,
                'minutes_played': mins_played,
                'total_points': total_points,
                

                # Goles
                'goals': stats.get('goals', 0),
                'own_goals': stats.get('own_goals', 0),
                'goals_conceded': stats.get('goals_conceded', 0),
                'clean_sheet': clean_sheet,

                # Asistencias
                'assists': stats.get('assists', 0),
                'intent_assists': stats.get('fantasy_assist', 0),
                'second_assists': stats.get('second_assists', 0),
                'key_passes': stats.get('key_passes', 0),

                # Tiros
                'shots_on_target': stats.get('shots_on_target', 0),
                'shots_off_target': stats.get('shots_off_target', 0),
                'shots_hit_woodwork': stats.get('shots_hit_woodwork', 0),
                'big_chances_created': stats.get('big_chances_created', 0),
                'big_chances_missed': stats.get('big_chances_missed', 0),

                # Penaltis
                'penalties_scored': stats.get('penalties_scored', 0),
                'penalties_missed': stats.get('penalties_missed', 0),
                'penalties_won': stats.get('penalties_won', 0),
                'penalties_conceded': stats.get('penalties_conceded', 0),

                # Portero
                'saves': stats.get('saves', 0),
                'penalty_saves': stats.get('penalties_saved', 0),
                'claims_ok': stats.get('claims_ok', 0),
                'claims_fail': stats.get('claims_fail', 0),
                'fumbles': stats.get('fumbles', 0),
                'crosses_not_claimed': stats.get('crosses_not_claimed', 0),
                'punches_ok': stats.get('punches_ok', 0),
                'punches_fail': stats.get('punches_fail', 0),
                'smothers': stats.get('smothers', 0),
                'sweepers_ok': stats.get('sweepers_ok', 0),
                'sweepers_fail': stats.get('sweepers_fail', 0),
                'parries_safe': stats.get('parries_safe', 0),
                'parries_danger': stats.get('parries_danger', 0),

                # Defensa
                'clearances': stats.get('clearances', 0),
                'clearances_last_line': stats.get('clearances_last_line', 0),
                'blocked_crosses': stats.get('blocked_crosses', 0),
                'interceptions': stats.get('interceptions', 0),
                'interceptions_high': stats.get('interceptions_high', 0),
                'interceptions_med': stats.get('interceptions_med', 0),
                'interceptions_low': stats.get('interceptions_low', 0),
                'tackles_won': stats.get('tackles_won', 0),
                'tackles_lost': stats.get('tackles_lost', 0),
                'blocked_shots': stats.get('blocked_shots', 0),
                'blocked_passes': stats.get('blocked_passes', 0),
                'ball_recoveries': stats.get('ball_recoveries', 0),
                'recoveries_high': stats.get('recoveries_high', 0),
                'recoveries_med': stats.get('recoveries_med', 0),
                'recoveries_low': stats.get('recoveries_low', 0),
                'offsides_provoked': stats.get('offsides_provoked', 0),
                'challenges_lost': stats.get('challenges_lost', 0),
                'errors_leading_to_shot': stats.get('errors_leading_to_shot', 0),
                'errors_leading_to_goal': stats.get('errors_leading_to_goal', 0),

                # Pases
                'passes_completed': passes_completed,
                'passes_attempted': passes_attempted,
                'pass_accuracy': round(pass_accuracy, 2),
                'progressive_passes': stats.get('progressive_passes', 0),
                'passes_into_final_third': stats.get('passes_into_final_third', 0),
                'passes_into_box': stats.get('passes_into_box', 0),
                'through_balls': stats.get('through_balls', 0),
                'crosses_completed': stats.get('crosses_completed', 0),
                'crosses_attempted': stats.get('crosses_attempted', 0),
                'switch_plays': stats.get('switch_plays', 0),
                'pull_backs': stats.get('pull_backs', 0),
                'long_balls_completed': stats.get('long_balls_completed', 0),
                'lay_offs': stats.get('lay_offs', 0),
                'offside_passes': stats.get('offside_passes', 0),
                # Nuevas métricas v3.0 RELEVO
                'forward_passes': stats.get('forward_passes', 0),
                'set_pieces_taken': stats.get('set_pieces_taken', 0),
                'successful_crosses': stats.get('successful_crosses', 0),
                'box_entries': stats.get('box_entries', 0),

                # Regates
                'takeons_won': stats.get('takeons_won', 0),
                'takeons_lost': stats.get('takeons_lost', 0),
                'takeons_overrun': stats.get('takeons_overrun', 0),
                'good_skills': stats.get('good_skills', 0),
                'dispossessed': stats.get('dispossessed', 0),
                'bad_touches': stats.get('bad_touches', 0),

                # Duelos aéreos
                'aerials_won': aerials_won,
                'aerials_lost': aerials_lost,
                'aerial_success_rate': round(aerial_success_rate, 2),

                # Faltas y tarjetas
                'fouls_committed': stats.get('fouls_committed', 0),
                'fouls_won': stats.get('fouls_won', 0),
                'yellow_cards': stats.get('yellow_cards', 0),
                'second_yellow_cards': stats.get('second_yellow_cards', 0),
                'red_cards': stats.get('red_cards', 0),
                
                # RELEVO Points
                'relevo_points': stats.get('relevo_points', 0),
                'relevo_participation_pts': stats.get('relevo_participation_pts', 0.0),
                'relevo_passes_pts': stats.get('relevo_passes_pts', 0.0),
                'relevo_opp_half_pts': stats.get('relevo_opp_half_pts', 0.0),
                'relevo_shots_pts': stats.get('relevo_shots_pts', 0.0),
                'relevo_duels_pts': stats.get('relevo_duels_pts', 0.0),
                'relevo_aerials_pts': stats.get('relevo_aerials_pts', 0.0),
                'relevo_takeons_pts': stats.get('relevo_takeons_pts', 0.0),
            }

            try:
                existing = self.supabase.table('player_scores').select('id').eq('player_id', db_player_id).eq('fixture_id', self.fixture_id).execute()
                if existing.data:
                    response = self.supabase.table('player_scores').update(player_score_data).eq('player_id', db_player_id).eq('fixture_id', self.fixture_id).execute()
                else:
                    response = self.supabase.table('player_scores').insert(player_score_data).execute()

                if response.data:
                    player_name = self.player_names.get(player_id, player_id)
                    relevo_pts = stats.get('relevo_points', 0)
                    print(f"  ✅ {player_name}: {int(total_points)} pts (Relevo: {relevo_pts}) ({mins_played}')")

            except Exception as e:
                print(f"  ❌ Error subiendo {player_id}: {e}")

    def run(self):
        print(f"\n{'='*60}")
        print(f"📥 DESCARGA DE EVENTOS - Partido {self.match_id}")
        print(f"{'='*60}")

        if not self.download_squads(): print("⚠️ No se pudieron descargar los squads, continuando...")
        self.load_positions_from_squads()
        headers = self.load_headers()

        print(f"\n⏳ Obteniendo eventos del partido...")
        current_minute = 0
        match_ended = False

        url = (f"https://api.performfeeds.com/soccerdata/matchevent/{SDAPI_OUTLET_KEY}/{self.match_id}?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback")

        try:
            res = requests.get(url, headers=headers, timeout=30)
            content = res.text
            start = content.find('{')
            end = content.rfind('}')
            if start == -1 or end == -1: return

            data = json.loads(content[start:end+1])
            if "errorCode" in data: return

            events_dir = BASE_OUTPUT_PATH / self.match_id / "events"
            events_dir.mkdir(parents=True, exist_ok=True)
            archivo_salida = events_dir / f"{self.match_id}.json"

            with open(archivo_salida, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)

            events = data.get('liveData', {}).get('event', [])
            # IMPORTANTE: los eventos de alineación (typeId 34) llegan con
            # periodId 16 (pre-partido). Si se ordena solo por periodId numérico,
            # quedan DESPUÉS de la 1ª/2ª parte y los goles se procesan con
            # on_pitch vacío -> nadie recibe gol encajado -> portería a cero
            # falsa para todos. Forzamos que el pre-partido (16) vaya primero.
            events.sort(key=lambda x: (
                -1 if x.get('periodId') == 16 else x.get('periodId', 0),
                x.get('timeMin', 0), x.get('timeSec', 0), x.get('id', 0)
            ))

            for event in events:
                t_min = event.get('timeMin', 0)
                if t_min > current_minute: current_minute = t_min
                self.process_event(event, current_minute)
                if event.get('typeId') == 37:
                    match_ended = True
            
            for pid in list(self.on_pitch):
                self.remove_player(pid, current_minute)

            self.upload_to_supabase()

            # Actualizar marcador del partido (solo 'finished' si llegó el tiempo completo)
            self.update_match_score(match_ended=match_ended, current_minute=current_minute)

            print(f"\n{'='*60}")
            print(f"✅ Descarga completada - Minuto {current_minute}'")
            if match_ended: print("🏁 Partido finalizado")
            print(f"{'='*60}")

        except Exception as e:
            import traceback
            print(f"❌ Error: {e}")
            print(f"   Traceback: {traceback.format_exc()}")

def main():
    if len(sys.argv) < 3:
        print("❌ Uso: python trigger_descarga_eventos.py <fixture_id> <match_id>")
        sys.exit(1)

    downloader = MatchEventDownloader(sys.argv[1], sys.argv[2])
    downloader.run()

if __name__ == "__main__":
    main()