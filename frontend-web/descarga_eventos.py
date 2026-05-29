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
    # === MINUTOS Y BASE ===
    'MIN_PLAYED':         {'POR': 0.02, 'DEF': 0.02, 'MED': 0.02, 'DEL': 0.02},

    # === GOLES ===
    'GOAL':               {'POR': 12.0, 'DEF': 10.0, 'MED': 8.0,  'DEL': 6.0},
    'GOAL_HEADER_BONUS':  {'POR': 0.5,  'DEF': 0.5,  'MED': 0.5,  'DEL': 0.5},
    'GOAL_FREEKICK_BONUS':{'POR': 1.0,  'DEF': 1.0,  'MED': 1.0,  'DEL': 1.0},
    'OWN_GOAL':           {'POR': -4.0, 'DEF': -4.0, 'MED': -4.0, 'DEL': -4.0},
    'GOAL_CONCEDED':      {'POR': -1.5, 'DEF': -1.0, 'MED': -0.2, 'DEL': 0.0},
    'CLEAN_SHEET':        {'POR': 4.0,  'DEF': 4.0,  'MED': 1.0,  'DEL': 0.0},

    # === ASISTENCIAS Y PASES CLAVE ===
    'ASSIST':             {'POR': 4.0,  'DEF': 4.0,  'MED': 4.0,  'DEL': 4.0},
    'KEY_PASS':           {'POR': 1.0,  'DEF': 1.2,  'MED': 1.5,  'DEL': 1.2},
    'SECOND_ASSIST':      {'POR': 1.0,  'DEF': 1.5,  'MED': 1.5,  'DEL': 1.2},
    'INTENT_ASSIST':      {'POR': 0.5,  'DEF': 0.6,  'MED': 0.8,  'DEL': 0.6},

    # === TIROS ===
    'SHOT_TARGET':        {'POR': 1.0,  'DEF': 1.0,  'MED': 1.0,  'DEL': 1.0},
    'SHOT_OFF':           {'POR': 0.2,  'DEF': 0.2,  'MED': 0.2,  'DEL': 0.2},
    'SHOT_POST':          {'POR': 1.5,  'DEF': 1.5,  'MED': 1.5,  'DEL': 1.5},
    'BIG_CHANCE_CREATED': {'POR': 0.5,  'DEF': 0.5,  'MED': 0.5,  'DEL': 0.5},
    'BIG_CHANCE_MISSED':  {'POR': -0.5, 'DEF': -0.5, 'MED': -0.5, 'DEL': -0.5},
    'PENALTY_MISSED':     {'POR': -2.0, 'DEF': -2.0, 'MED': -2.0, 'DEL': -2.0},

    # === PENALTIS ===
    'PENALTY_WON':        {'POR': 3.0,  'DEF': 3.0,  'MED': 3.0,  'DEL': 3.0},
    'PENALTY_CONC':       {'POR': -3.0, 'DEF': -3.0, 'MED': -3.0, 'DEL': -3.0},

    # === PORTERO ===
    'SAVE':               {'POR': 0.6,  'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'PENALTY_SAVED':      {'POR': 6.0,  'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'CLAIM_OK':           {'POR': 0.4,  'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'CLAIM_FAIL':         {'POR': -0.5, 'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'FUMBLE':             {'POR': -0.5, 'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'CROSS_NOT_CLAIMED':  {'POR': -0.3, 'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'PUNCH_OK':           {'POR': 0.3,  'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'PUNCH_FAIL':         {'POR': -0.5, 'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'SMOTHER':            {'POR': 0.5,  'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'SWEEPER_OK':         {'POR': 0.4,  'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'SWEEPER_FAIL':       {'POR': -0.6, 'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'PARRY_SAFE':         {'POR': 0.2,  'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},
    'PARRY_DANGER':       {'POR': -0.2, 'DEF': 0.0,  'MED': 0.0,  'DEL': 0.0},

    # === DEFENSA ===
    'CLEARANCE':          {'POR': 0.1,  'DEF': 0.3,  'MED': 0.1,  'DEL': 0.1},
    'CLEARANCE_LAST_LINE':{'POR': 0.5,  'DEF': 0.8,  'MED': 0.6,  'DEL': 0.4},
    'BLOCKED_CROSS':      {'POR': 0.1,  'DEF': 0.3,  'MED': 0.2,  'DEL': 0.1},
    'INTERCEPTION':       {'POR': 0.1,  'DEF': 0.3,  'MED': 0.3,  'DEL': 0.1},
    'TACKLE_WON':         {'POR': 0.1,  'DEF': 0.4,  'MED': 0.4,  'DEL': 0.2},
    'TACKLE_LOST':        {'POR': 0.0,  'DEF': -0.1, 'MED': -0.1, 'DEL': 0.0},
    'BLOCK_SHOT':         {'POR': 0.2,  'DEF': 0.5,  'MED': 0.4,  'DEL': 0.2},
    'BLOCK_PASS':         {'POR': 0.1,  'DEF': 0.2,  'MED': 0.2,  'DEL': 0.1},
    'BALL_RECOVERY':      {'POR': 0.1,  'DEF': 0.2,  'MED': 0.2,  'DEL': 0.1},
    'OFFSIDE_PROVOKED':   {'POR': 0.0,  'DEF': 0.2,  'MED': 0.1,  'DEL': 0.0},
    'CHALLENGE_LOST':     {'POR': 0.0,  'DEF': -0.1, 'MED': -0.1, 'DEL': 0.0},

    # === ERRORES ===
    'ERROR_LED_SHOT':     {'POR': -1.5, 'DEF': -1.0, 'MED': -1.0, 'DEL': -0.5},
    'ERROR_LED_GOAL':     {'POR': -4.0, 'DEF': -3.0, 'MED': -3.0, 'DEL': -2.0},

    # === PASES (granular) ===
    'PASS_OK':            {'POR': 0.02, 'DEF': 0.02, 'MED': 0.02, 'DEL': 0.02},
    'PASS_FAIL':          {'POR': -0.02,'DEF': -0.02,'MED': -0.02,'DEL': -0.02},
    'PASS_PROGRESSIVE':   {'POR': 0.1,  'DEF': 0.2,  'MED': 0.2,  'DEL': 0.15},
    'PASS_FINAL_THIRD':   {'POR': 0.05, 'DEF': 0.15, 'MED': 0.15, 'DEL': 0.1},
    'PASS_INTO_BOX':      {'POR': 0.1,  'DEF': 0.3,  'MED': 0.3,  'DEL': 0.2},
    'THROUGH_BALL':       {'POR': 0.2,  'DEF': 0.4,  'MED': 0.5,  'DEL': 0.4},
    'CROSS_OK':           {'POR': 0.1,  'DEF': 0.3,  'MED': 0.4,  'DEL': 0.3},
    'CROSS_FAIL':         {'POR': 0.0,  'DEF': -0.05,'MED': -0.1, 'DEL': -0.05},
    'SWITCH_PLAY':        {'POR': 0.1,  'DEF': 0.3,  'MED': 0.3,  'DEL': 0.1},
    'PULL_BACK':          {'POR': 0.1,  'DEF': 0.3,  'MED': 0.4,  'DEL': 0.3},
    'LONG_BALL_OK':       {'POR': 0.1,  'DEF': 0.15, 'MED': 0.15, 'DEL': 0.05},
    'LAY_OFF':            {'POR': 0.05, 'DEF': 0.1,  'MED': 0.2,  'DEL': 0.2},
    'PASS_BLOCKED':       {'POR': -0.05,'DEF': -0.1, 'MED': -0.1, 'DEL': -0.05},
    'OFFSIDE_PASS':       {'POR': -0.05,'DEF': -0.1, 'MED': -0.1, 'DEL': -0.1},

    # === REGATES / TÉCNICA ===
    'TAKEON_WON':         {'POR': 0.3,  'DEF': 0.4,  'MED': 0.5,  'DEL': 0.6},
    'TAKEON_LOST':        {'POR': -0.1, 'DEF': -0.2, 'MED': -0.2, 'DEL': -0.2},
    'TAKEON_OVERRUN':     {'POR': -0.2, 'DEF': -0.3, 'MED': -0.3, 'DEL': -0.3},
    'GOOD_SKILL':         {'POR': 0.1,  'DEF': 0.2,  'MED': 0.2,  'DEL': 0.2},
    'DISPOSSESSED':       {'POR': -0.2, 'DEF': -0.2, 'MED': -0.2, 'DEL': -0.2},
    'BAD_TOUCH':          {'POR': -0.1, 'DEF': -0.1, 'MED': -0.1, 'DEL': -0.1},

    # === DUELOS AÉREOS ===
    'AERIAL_WON':         {'POR': 0.2,  'DEF': 0.3,  'MED': 0.2,  'DEL': 0.3},
    'AERIAL_LOST':        {'POR': -0.1, 'DEF': -0.1, 'MED': -0.1, 'DEL': -0.1},

    # === FALTAS ===
    'FOUL_COMMITTED':     {'POR': -0.1, 'DEF': -0.1, 'MED': -0.1, 'DEL': -0.1},
    'FOUL_WON':           {'POR': 0.05, 'DEF': 0.05, 'MED': 0.05, 'DEL': 0.05},

    # === TARJETAS ===
    'YELLOW_CARD':        {'POR': -1.0, 'DEF': -1.0, 'MED': -1.0, 'DEL': -1.0},
    'SECOND_YELLOW':      {'POR': -3.0, 'DEF': -3.0, 'MED': -3.0, 'DEL': -3.0},
    'RED_CARD':           {'POR': -5.0, 'DEF': -5.0, 'MED': -5.0, 'DEL': -5.0},
}

# === QUALIFIER IDs (constantes legibles) ===
Q_LONG_BALL        = 1
Q_CROSS            = 2
Q_THROUGH_BALL     = 4
Q_PLAYERS_INVOLVED = 30
Q_YELLOW           = 31
Q_SECOND_YELLOW    = 32
Q_RED              = 33
Q_OWN_GOAL         = 28
Q_PENALTY          = 9
Q_HEAD             = 15
Q_FREE_KICK_SHOT   = 26
Q_LAST_LINE        = 14
Q_DEF_BLOCK        = 94
Q_LAY_OFF          = 156
Q_INTENT_ASSIST    = 154
Q_BIG_CHANCE       = 214
Q_PULL_BACK        = 195
Q_SWITCH_PLAY      = 196
Q_ASSIST           = 210
Q_SECOND_ASSIST    = 218
Q_PASS_END_X       = 140
Q_PASS_END_Y       = 141
Q_BLOCKED_PASS_QF  = 236
Q_BLOCKED_CROSS    = 185
Q_PARRIED_SAFE     = 173
Q_PARRIED_DANGER   = 174
Q_FUMBLE           = 381
Q_PEN_SCORED       = 186
Q_PEN_SAVED        = 187
Q_PEN_MISSED       = 188
Q_ERROR_LED_SHOT   = 169
Q_ERROR_LED_GOAL   = 170
Q_OVERRUN          = 211


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
        self.team_goals_conceded = {}  # team_id -> count

    # ================== POSICIONES ==================
    def _pos_map(self):
        return {
            'goalkeeper': 'POR', 'portero': 'POR', 'g': 'POR', 'gk': 'POR',
            'defender': 'DEF', 'defensa': 'DEF', 'd': 'DEF', 'df': 'DEF',
            'midfielder': 'MED', 'centrocampista': 'MED', 'm': 'MED', 'mf': 'MED',
            'attacker': 'DEL', 'striker': 'DEL', 'forward': 'DEL',
            'delantero': 'DEL', 'a': 'DEL', 'f': 'DEL', 'fw': 'DEL'
        }

    def load_positions_from_squads(self, match_id):
        pos_map = self._pos_map()
        squads_path = BASE_OUTPUT_PATH / "Partidos_Individuales" / match_id / "squads"
        if not squads_path.exists():
            print(f"⚠️ No se encontró la carpeta de squads: {squads_path}")
            return False

        loaded = 0
        for squad_file in squads_path.glob("*.json"):
            try:
                with open(squad_file, 'r', encoding='utf-8') as f:
                    squad_data = json.load(f)
                for player in squad_data.get('players', []):
                    pid = player.get('id')
                    raw_pos = player.get('position', '').lower().strip()
                    if pid:
                        self.positions_table[pid] = pos_map.get(raw_pos, 'MED')
                        loaded += 1
            except Exception as e:
                print(f"⚠️ Error al leer {squad_file}: {e}")

        if loaded > 0:
            print(f"✅ {loaded} jugadores cargados desde squads (demarcaciones disponibles)")
            return True
        return False

    def load_positions_from_match(self, data):
        pos_map = self._pos_map()
        lineups = data.get('liveData', {}).get('lineUp', [])
        for team in lineups:
            for p in team.get('player', []):
                pid = str(p.get('playerId', p.get('id')))
                raw_pos = p.get('position', '').lower().strip()
                if pid not in self.positions_table:
                    self.positions_table[pid] = pos_map.get(raw_pos, 'MED')

    def get_player_pos(self, player_id):
        return self.positions_table.get(str(player_id), 'MED')

    # ================== HELPERS ==================
    def get_qualifier(self, event, qual_id):
        for q in event.get('qualifier', []):
            if q.get('qualifierId') == qual_id:
                return q.get('value', True)
        return False

    def has_qualifier(self, event, qual_id):
        return any(q.get('qualifierId') == qual_id for q in event.get('qualifier', []))

    def get_qualifier_float(self, event, qual_id, default=None):
        val = self.get_qualifier(event, qual_id)
        if val is False or val is True:
            return default
        try:
            return float(val)
        except (TypeError, ValueError):
            return default

    def init_player(self, player_id, team_id, current_min):
        self.on_pitch.add(player_id)
        self.players_team[player_id] = team_id
        self.entry_minutes[player_id] = current_min
        if player_id not in self.points:
            self.points[player_id] = BASE_SCORE
            self.total_minutes[player_id] = 0
            self.stats[player_id] = {'pass_ok': 0, 'pass_total': 0,
                                     'aerial_won': 0, 'aerial_total': 0}

    def remove_player(self, player_id, current_min):
        if player_id in self.on_pitch:
            self.on_pitch.remove(player_id)
            mins_played = max(0, current_min - self.entry_minutes.get(player_id, current_min))
            self.total_minutes[player_id] += mins_played
            self.apply_points(player_id, 'MIN_PLAYED', multiplier=mins_played)

    def apply_points(self, player_id, action_key, multiplier=1):
        if player_id not in self.points:
            # Inicialización defensiva: el jugador apareció en un evento antes que en lineup
            self.points[player_id] = BASE_SCORE
            self.total_minutes[player_id] = 0
            self.stats[player_id] = {'pass_ok': 0, 'pass_total': 0,
                                     'aerial_won': 0, 'aerial_total': 0}

        pos = self.get_player_pos(player_id)
        pts = POINTS.get(action_key, {}).get(pos, 0.0) * multiplier
        if pts != 0:
            self.points[player_id] += pts
            if action_key not in ['MIN_PLAYED', 'PASS_OK', 'PASS_FAIL',
                                  'AERIAL_WON', 'AERIAL_LOST']:
                self.stats[player_id][action_key] = self.stats[player_id].get(action_key, 0) + 1

    # ================== HELPERS DE PASE (coordenadas) ==================
    def _is_progressive_pass(self, event):
        x = event.get('x')
        end_x = self.get_qualifier_float(event, Q_PASS_END_X)
        if x is None or end_x is None:
            return False
        return (end_x - x) >= 25 and end_x >= 50

    def _enters_final_third(self, event):
        x = event.get('x')
        end_x = self.get_qualifier_float(event, Q_PASS_END_X)
        if x is None or end_x is None:
            return False
        return end_x >= 66 and x < 66

    def _pass_into_box(self, event):
        end_x = self.get_qualifier_float(event, Q_PASS_END_X)
        end_y = self.get_qualifier_float(event, Q_PASS_END_Y)
        if end_x is None or end_y is None:
            return False
        return end_x >= 83 and 21 <= end_y <= 79

    # ================== DISPATCHER ==================
    def process_event(self, event, current_min):
        event_id = event.get('id')
        if event_id in self.processed_events:
            return False
        self.processed_events.add(event_id)

        type_id = event.get('typeId')
        player_id = event.get('playerId')
        if player_id and event.get('playerName'):
            self.player_names[player_id] = event['playerName']

        # Lifecycle (incluso sin playerId en el caso de team set up)
        if type_id == 34:
            return self._handle_lineup(event)
        if type_id == 18:
            return self._handle_sub_off(event, current_min)
        if type_id == 19:
            return self._handle_sub_on(event, current_min)

        if not player_id:
            return False

        # Resto de eventos
        handlers = {
            1:  self._handle_pass,
            2:  self._handle_offside_pass,
            3:  self._handle_takeon,
            4:  self._handle_foul,
            7:  self._handle_tackle,
            8:  self._handle_interception,
            10: self._handle_save,
            11: self._handle_claim,
            12: self._handle_clearance,
            13: self._handle_shot_miss,
            14: self._handle_shot_post,
            15: self._handle_shot_target,
            16: self._handle_goal,
            17: self._handle_card,
            41: self._handle_punch,
            42: self._handle_good_skill,
            44: self._handle_aerial,
            45: self._handle_challenge,
            49: self._handle_recovery,
            50: self._handle_dispossessed,
            51: self._handle_error,
            54: self._handle_smother,
            55: self._handle_offside_provoked,
            58: self._handle_penalty_faced,
            59: self._handle_sweeper,
            61: self._handle_ball_touch,
            74: self._handle_blocked_pass,
        }
        handler = handlers.get(type_id)
        if handler:
            handler(event)
            return True
        return False

    # ================== LIFECYCLE ==================
    def _handle_lineup(self, event):
        team_id = event.get('contestantId')
        if team_id:
            self.teams.add(team_id)
            self.team_goals_conceded.setdefault(team_id, 0)
        q30 = self.get_qualifier(event, Q_PLAYERS_INVOLVED)
        if q30 and isinstance(q30, str):
            players = [p.strip() for p in q30.split(',')]
            for pid in players[:11]:
                self.init_player(pid, team_id, 0)
        return True

    def _handle_sub_off(self, event, current_min):
        pid = event.get('playerId')
        if pid:
            self.remove_player(pid, current_min)
        return True

    def _handle_sub_on(self, event, current_min):
        pid = event.get('playerId')
        team_id = event.get('contestantId')
        if pid:
            self.init_player(pid, team_id, current_min)
        return True

    # ================== PASE ==================
    def _handle_pass(self, event):
        pid = event.get('playerId')
        if pid not in self.stats:
            self.init_player(pid, event.get('contestantId'), 0)
        outcome = event.get('outcome', 1)
        self.stats[pid]['pass_total'] += 1

        is_cross = self.has_qualifier(event, Q_CROSS)
        is_long  = self.has_qualifier(event, Q_LONG_BALL)
        is_through = self.has_qualifier(event, Q_THROUGH_BALL)
        is_pull_back = self.has_qualifier(event, Q_PULL_BACK)
        is_switch = self.has_qualifier(event, Q_SWITCH_PLAY)
        is_lay_off = self.has_qualifier(event, Q_LAY_OFF)
        is_blocked = self.has_qualifier(event, Q_BLOCKED_PASS_QF)

        if outcome == 1:
            self.stats[pid]['pass_ok'] += 1
            self.apply_points(pid, 'PASS_OK')

            # Asistencia / pase clave
            assist_q = self.get_qualifier(event, Q_ASSIST)
            if assist_q:
                # Si el shot relacionado fue gol (qualifier value 16) → asistencia plena
                if str(assist_q) == '16':
                    self.apply_points(pid, 'ASSIST')
                else:
                    self.apply_points(pid, 'KEY_PASS')

            if self.has_qualifier(event, Q_SECOND_ASSIST):
                self.apply_points(pid, 'SECOND_ASSIST')

            if self.has_qualifier(event, Q_INTENT_ASSIST):
                self.apply_points(pid, 'INTENT_ASSIST')

            # Tipos especiales
            if is_through:
                self.apply_points(pid, 'THROUGH_BALL')
            if is_cross:
                self.apply_points(pid, 'CROSS_OK')
            if is_pull_back:
                self.apply_points(pid, 'PULL_BACK')
            if is_switch:
                self.apply_points(pid, 'SWITCH_PLAY')
            if is_lay_off:
                self.apply_points(pid, 'LAY_OFF')
            if is_long:
                self.apply_points(pid, 'LONG_BALL_OK')

            # Ubicación del pase
            if self._pass_into_box(event):
                self.apply_points(pid, 'PASS_INTO_BOX')
            elif self._enters_final_third(event):
                self.apply_points(pid, 'PASS_FINAL_THIRD')

            if self._is_progressive_pass(event):
                self.apply_points(pid, 'PASS_PROGRESSIVE')

        else:
            self.apply_points(pid, 'PASS_FAIL')
            if is_cross:
                self.apply_points(pid, 'CROSS_FAIL')
            if is_blocked:
                self.apply_points(pid, 'PASS_BLOCKED')

    def _handle_offside_pass(self, event):
        pid = event.get('playerId')
        self.apply_points(pid, 'OFFSIDE_PASS')

    # ================== REGATES Y TÉCNICA ==================
    def _handle_takeon(self, event):
        pid = event.get('playerId')
        outcome = event.get('outcome', 0)
        if outcome == 1:
            self.apply_points(pid, 'TAKEON_WON')
        else:
            if self.has_qualifier(event, Q_OVERRUN):
                self.apply_points(pid, 'TAKEON_OVERRUN')
            else:
                self.apply_points(pid, 'TAKEON_LOST')

    def _handle_good_skill(self, event):
        self.apply_points(event.get('playerId'), 'GOOD_SKILL')

    def _handle_dispossessed(self, event):
        self.apply_points(event.get('playerId'), 'DISPOSSESSED')

    def _handle_ball_touch(self, event):
        if event.get('outcome', 1) == 0:
            self.apply_points(event.get('playerId'), 'BAD_TOUCH')

    # ================== FALTAS Y PENALTIS ==================
    def _handle_foul(self, event):
        pid = event.get('playerId')
        outcome = event.get('outcome', 0)
        is_penalty = self.has_qualifier(event, Q_PENALTY)

        if outcome == 1:
            self.apply_points(pid, 'FOUL_WON')
            if is_penalty:
                self.apply_points(pid, 'PENALTY_WON')
        else:
            self.apply_points(pid, 'FOUL_COMMITTED')
            if is_penalty:
                self.apply_points(pid, 'PENALTY_CONC')

    # ================== DEFENSA ==================
    def _handle_tackle(self, event):
        pid = event.get('playerId')
        if event.get('outcome', 0) == 1:
            self.apply_points(pid, 'TACKLE_WON')
        else:
            self.apply_points(pid, 'TACKLE_LOST')

    def _handle_interception(self, event):
        self.apply_points(event.get('playerId'), 'INTERCEPTION')

    def _handle_clearance(self, event):
        pid = event.get('playerId')
        if self.has_qualifier(event, Q_LAST_LINE):
            self.apply_points(pid, 'CLEARANCE_LAST_LINE')
        elif self.has_qualifier(event, Q_BLOCKED_CROSS):
            self.apply_points(pid, 'BLOCKED_CROSS')
        else:
            self.apply_points(pid, 'CLEARANCE')

    def _handle_blocked_pass(self, event):
        self.apply_points(event.get('playerId'), 'BLOCK_PASS')

    def _handle_recovery(self, event):
        self.apply_points(event.get('playerId'), 'BALL_RECOVERY')

    def _handle_challenge(self, event):
        self.apply_points(event.get('playerId'), 'CHALLENGE_LOST')

    def _handle_offside_provoked(self, event):
        self.apply_points(event.get('playerId'), 'OFFSIDE_PROVOKED')

    def _handle_error(self, event):
        pid = event.get('playerId')
        if self.has_qualifier(event, Q_ERROR_LED_GOAL):
            self.apply_points(pid, 'ERROR_LED_GOAL')
        elif self.has_qualifier(event, Q_ERROR_LED_SHOT):
            self.apply_points(pid, 'ERROR_LED_SHOT')

    # ================== DUELO AÉREO ==================
    def _handle_aerial(self, event):
        pid = event.get('playerId')
        if pid not in self.stats:
            self.init_player(pid, event.get('contestantId'), 0)
        self.stats[pid]['aerial_total'] += 1
        if event.get('outcome', 0) == 1:
            self.stats[pid]['aerial_won'] += 1
            self.apply_points(pid, 'AERIAL_WON')
        else:
            self.apply_points(pid, 'AERIAL_LOST')

    # ================== PORTERO ==================
    def _handle_save(self, event):
        pid = event.get('playerId')
        # Bloqueo de tiro por jugador de campo
        if self.has_qualifier(event, Q_DEF_BLOCK):
            self.apply_points(pid, 'BLOCK_SHOT')
            return

        self.apply_points(pid, 'SAVE')
        if self.has_qualifier(event, Q_PARRIED_SAFE):
            self.apply_points(pid, 'PARRY_SAFE')
        if self.has_qualifier(event, Q_PARRIED_DANGER):
            self.apply_points(pid, 'PARRY_DANGER')
        if self.has_qualifier(event, Q_FUMBLE):
            self.apply_points(pid, 'FUMBLE')

    def _handle_claim(self, event):
        pid = event.get('playerId')
        if event.get('outcome', 0) == 1:
            self.apply_points(pid, 'CLAIM_OK')
        else:
            self.apply_points(pid, 'CLAIM_FAIL')

    def _handle_punch(self, event):
        pid = event.get('playerId')
        if event.get('outcome', 0) == 1:
            self.apply_points(pid, 'PUNCH_OK')
        else:
            self.apply_points(pid, 'PUNCH_FAIL')

    def _handle_smother(self, event):
        self.apply_points(event.get('playerId'), 'SMOTHER')

    def _handle_sweeper(self, event):
        pid = event.get('playerId')
        if event.get('outcome', 0) == 1:
            self.apply_points(pid, 'SWEEPER_OK')
        else:
            self.apply_points(pid, 'SWEEPER_FAIL')

    def _handle_penalty_faced(self, event):
        pid = event.get('playerId')
        if self.has_qualifier(event, Q_PEN_SAVED):
            self.apply_points(pid, 'PENALTY_SAVED')
        # Penalty scored / missed lo gestionamos del lado del tirador

    # ================== TIROS ==================
    def _handle_shot_target(self, event):
        pid = event.get('playerId')
        self.apply_points(pid, 'SHOT_TARGET')
        if self.has_qualifier(event, Q_BIG_CHANCE):
            self.apply_points(pid, 'BIG_CHANCE_CREATED')

    def _handle_shot_miss(self, event):
        pid = event.get('playerId')
        self.apply_points(pid, 'SHOT_OFF')
        if self.has_qualifier(event, Q_PENALTY):
            self.apply_points(pid, 'PENALTY_MISSED')
        if self.has_qualifier(event, Q_BIG_CHANCE):
            self.apply_points(pid, 'BIG_CHANCE_MISSED')

    def _handle_shot_post(self, event):
        pid = event.get('playerId')
        self.apply_points(pid, 'SHOT_POST')
        if self.has_qualifier(event, Q_PENALTY):
            self.apply_points(pid, 'PENALTY_MISSED')

    # ================== GOL ==================
    def _handle_goal(self, event):
        pid = event.get('playerId')
        team_id = event.get('contestantId')
        is_own_goal = self.has_qualifier(event, Q_OWN_GOAL)

        if is_own_goal:
            self.apply_points(pid, 'OWN_GOAL')
        else:
            self.apply_points(pid, 'GOAL')
            if self.has_qualifier(event, Q_HEAD):
                self.apply_points(pid, 'GOAL_HEADER_BONUS')
            if self.has_qualifier(event, Q_FREE_KICK_SHOT):
                self.apply_points(pid, 'GOAL_FREEKICK_BONUS')

        # Equipo que encaja
        conceding_team = team_id if is_own_goal else next(
            (t for t in self.teams if t != team_id), None)

        if conceding_team:
            self.team_goals_conceded[conceding_team] = \
                self.team_goals_conceded.get(conceding_team, 0) + 1
            for p_on in list(self.on_pitch):
                if self.players_team.get(p_on) == conceding_team:
                    self.apply_points(p_on, 'GOAL_CONCEDED')

    # ================== TARJETAS ==================
    def _handle_card(self, event):
        pid = event.get('playerId')
        if self.has_qualifier(event, Q_RED):
            self.apply_points(pid, 'RED_CARD')
            # Asumimos que sale del campo aunque no haya sub event
            # Usamos el minuto del propio evento
            self.remove_player(pid, event.get('timeMin', 0))
        elif self.has_qualifier(event, Q_SECOND_YELLOW):
            self.apply_points(pid, 'SECOND_YELLOW')
            self.remove_player(pid, event.get('timeMin', 0))
        elif self.has_qualifier(event, Q_YELLOW):
            self.apply_points(pid, 'YELLOW_CARD')

    # ================== PORTERÍA A CERO ==================
    def compute_clean_sheets(self, min_minutes_for_def=60):
        """Aplica bonus de portería a cero al finalizar el partido."""
        for pid in list(self.points.keys()):
            team_id = self.players_team.get(pid)
            if not team_id:
                continue
            if self.team_goals_conceded.get(team_id, 0) == 0:
                pos = self.get_player_pos(pid)
                # Para defensas exigir minutos jugados
                if pos == 'DEF' and self.total_minutes.get(pid, 0) < min_minutes_for_def:
                    continue
                if pos == 'MED' and self.total_minutes.get(pid, 0) < min_minutes_for_def:
                    continue
                self.apply_points(pid, 'CLEAN_SHEET')


# ================== DASHBOARD ==================
def print_dashboard(engine, current_min):
    os.system('cls' if os.name == 'nt' else 'clear')
    print(f"\n🏆 FANTASY LIVE PRO | MINUTO: {current_min}' | {datetime.now().strftime('%H:%M:%S')}")
    print("=" * 130)
    print(f"{'JUGADOR':<25} | {'POS':<3} | {'MIN':<3} | {'PTS':<5} | {'PASES %':<11} | {'AÉREO %':<11} | {'MÉTRICAS'}")
    print("-" * 130)

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

    metric_emojis = {
        'GOAL': '⚽', 'GOAL_HEADER_BONUS': '🗣️', 'GOAL_FREEKICK_BONUS': '🎯',
        'ASSIST': '🅰️', 'KEY_PASS': '🔑', 'SECOND_ASSIST': '🥈',
        'SAVE': '🧤', 'PENALTY_SAVED': '💪🧤', 'CLAIM_OK': '🙌',
        'SMOTHER': '🛬', 'PUNCH_OK': '👊', 'SWEEPER_OK': '🚀',
        'FUMBLE': '🫳', 'CLAIM_FAIL': '😱', 'CROSS_NOT_CLAIMED': '❓',
        'YELLOW_CARD': '🟨', 'SECOND_YELLOW': '🟧', 'RED_CARD': '🟥',
        'OWN_GOAL': '🤦', 'GOAL_CONCEDED': '🥅',
        'SHOT_TARGET': '🏹', 'SHOT_OFF': '💨', 'SHOT_POST': '🪵',
        'BIG_CHANCE_MISSED': '😭', 'BIG_CHANCE_CREATED': '✨',
        'PENALTY_MISSED': '❌',
        'CLEARANCE': '🛡️', 'CLEARANCE_LAST_LINE': '🦸',
        'BLOCKED_CROSS': '🚫', 'BLOCK_SHOT': '🧱', 'BLOCK_PASS': '🚧',
        'INTERCEPTION': '🧲', 'BALL_RECOVERY': '♻️', 'OFFSIDE_PROVOKED': '🚩',
        'TACKLE_WON': '⚔️', 'TACKLE_LOST': '🗡️',
        'PENALTY_WON': '🎁', 'PENALTY_CONC': '💔',
        'TAKEON_WON': '🌀', 'TAKEON_LOST': '💫', 'GOOD_SKILL': '🪄',
        'DISPOSSESSED': '😵', 'BAD_TOUCH': '👟',
        'THROUGH_BALL': '🎯', 'CROSS_OK': '↗️', 'CROSS_FAIL': '↘️',
        'PULL_BACK': '↩️', 'SWITCH_PLAY': '🔄', 'LONG_BALL_OK': '🏹',
        'PASS_PROGRESSIVE': '⏩', 'PASS_INTO_BOX': '📦', 'PASS_FINAL_THIRD': '➡️',
        'LAY_OFF': '🔁',
        'ERROR_LED_SHOT': '😬', 'ERROR_LED_GOAL': '🚨',
        'FOUL_COMMITTED': '🚫', 'FOUL_WON': '🎯',
        'CLEAN_SHEET': '🔒',
    }

    for pid, score, mins in live_scores:
        pos = engine.get_player_pos(pid)
        st = engine.stats.get(pid, {})
        name = engine.player_names.get(pid, str(pid))
        display_name = (name[:22] + '...') if len(name) > 25 else name

        p_tot, p_ok = st.get('pass_total', 0), st.get('pass_ok', 0)
        p_str = f"{p_ok}/{p_tot} ({int(p_ok/p_tot*100)}%)" if p_tot > 0 else "-"

        a_tot, a_ok = st.get('aerial_total', 0), st.get('aerial_won', 0)
        a_str = f"{a_ok}/{a_tot} ({int(a_ok/a_tot*100)}%)" if a_tot > 0 else "-"

        metrics = []
        for key, emoji in metric_emojis.items():
            if st.get(key):
                metrics.append(f"{emoji}{st[key]}")
        m_str = " ".join(metrics) if metrics else ""

        playing_icon = "🟢" if pid in engine.on_pitch else "🔴"
        print(f"{playing_icon} {display_name:<23} | {pos:<3} | {mins:>3}' | {score:>5.1f} | {p_str:<11} | {a_str:<11} | {m_str}")

    print("=" * 130)
    print("🟢 En el campo | 🔴 Sustituido/Expulsado\n")


# ================== HEADERS ==================
def load_headers():
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


# ================== DESCARGA SQUADS ==================
def descargar_squads_para_partido(match_id, headers):
    print("\n📥 Obteniendo información del partido para descargar squads...")

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

        match_info = data.get('match', {})
        home_team = match_info.get('home', {})
        away_team = match_info.get('away', {})

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

    print(f"\n👥 Descargando squads de la temporada...")
    squads_dir = BASE_OUTPUT_PATH / "Partidos_Individuales" / match_id / "squads"
    squads_dir.mkdir(parents=True, exist_ok=True)

    if not season_id:
        print("⚠️ No se pudo obtener el season_id, fallback con teamId...")
        season_id = teams[0]['id']

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

            items = []
            for key in ['squad', 'person', 'contestant', 'teams']:
                if key in squad_data:
                    items = squad_data[key]
                    break

            if not items:
                print(f"   ⚠️ No se encontró lista. Claves: {list(squad_data.keys())}")
                break

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

                players = []
                for key in ['squad', 'person', 'players', 'athlete']:
                    if key in item:
                        players = item[key]
                        break

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
        with open(squads_dir / f"match_{match_id}.json", 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ {downloaded} squads descargados en: {squads_dir}")
    return downloaded > 0


# ================== MAIN ==================
def main():
    print("⚽ FANTASY LIVE TRACKER PRO")
    print("=" * 40)

    match_id = input("👉 Introduce el ID del partido (Ej: 8m6p1z...): ").strip()
    if not match_id:
        print("❌ Debes introducir un ID válido.")
        return

    carpeta_events = BASE_OUTPUT_PATH / "Partidos_Individuales" / match_id / "events"
    carpeta_events.mkdir(parents=True, exist_ok=True)
    archivo_salida = carpeta_events / f"{match_id}.json"

    headers = load_headers()

    # PASO 1: Descargar squads primero
    if not descargar_squads_para_partido(match_id, headers):
        print("⚠️ No se pudieron descargar los squads, continuando sin ellos...")

    # PASO 2: Inicializar motor y cargar posiciones
    engine = FantasyEngine()

    if not engine.load_positions_from_squads(match_id):
        print("⚠️ No se pudieron cargar las demarcaciones desde squads. Se usará MED por defecto.")

    current_minute = 0
    match_ended = False

    print(f"\n⏳ Conectando a la API de events. Datos en: {carpeta_events}")

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

                    engine.load_positions_from_match(data)

                    events = data.get('liveData', {}).get('event', [])
                    events.sort(key=lambda x: (x.get('periodId', 0),
                                               x.get('timeMin', 0),
                                               x.get('timeSec', 0),
                                               x.get('id', 0)))

                    updated = False
                    for event in events:
                        t_min = event.get('timeMin', 0)
                        if t_min > current_minute:
                            current_minute = t_min

                        if engine.process_event(event, current_minute):
                            updated = True

                        # Detección de fin de partido (typeId 30 con qualifier 209 Game end)
                        if event.get('typeId') == 30 and engine.has_qualifier(event, 209):
                            match_ended = True

                    if updated:
                        # Si el partido ha terminado, aplicar clean sheet una sola vez
                        if match_ended:
                            engine.compute_clean_sheets()
                        print_dashboard(engine, current_minute)

                        if match_ended:
                            print("🏁 Partido finalizado. Bonus de portería a cero aplicados.")
                            print("⏹️ Cerrando tracker...")
                            break

            except requests.exceptions.RequestException as e:
                print(f"\n⚠️ Fallo de conexión: {e}. Reintentando en 15s...")

            time.sleep(15)

    except KeyboardInterrupt:
        print("\n\n⏹️ Tracker detenido por el usuario. ¡Hasta la próxima!")


if __name__ == "__main__":
    main()
