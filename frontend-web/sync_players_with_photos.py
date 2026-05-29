import os
import json
import csv
from supabase import create_client, Client
from pathlib import Path
from dotenv import load_dotenv
from difflib import SequenceMatcher

load_dotenv()

# Cargar configuración
with open('settings.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

ACTIVE_LEAGUE_ID = config['active_league']['id']
SEASON_ID = config['active_league']['season_id']

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BASE_PATH = Path("./data/LaLiga/2025/2026")

# Mapeo de nombres de equipos entre CSV y JSON
TEAM_NAME_MAP = {
    "Alavés": ["Deportivo Alavés"],
    "Athletic": ["Athletic Club"],
    "Atlético": ["Club Atlético de Madrid"],
    "Barcelona": ["FC Barcelona"],
    "Betis": ["Real Betis Balompié"],
    "Celta": ["Real Club Celta de Vigo"],
    "Elche": ["Elche CF"],
    "Espanyol": ["Reial Club Deportiu Espanyol de Barcelona"],
    "Getafe": ["Getafe CF"],
    "Girona": ["Girona FC"],
    "Levante": ["Levante UD"],
    "Mallorca": ["Real Club Deportivo Mallorca"],
    "Osasuna": ["CA Osasuna"],
    "Rayo": ["Rayo Vallecano de Madrid"],
    "Real Madrid": ["Real Madrid CF"],
    "Real Oviedo": ["Real Oviedo"],
    "Real Sociedad": ["Real Sociedad de Fútbol"],
    "Sevilla": ["Sevilla FC"],
    "Valencia": ["Valencia CF"],
    "Villarreal": ["Villarreal CF"],
}

# Mapeo inverso: nombre JSON -> nombre CSV
JSON_TO_CSV_TEAM = {}
for csv_name, json_names in TEAM_NAME_MAP.items():
    for json_name in json_names:
        JSON_TO_CSV_TEAM[json_name] = csv_name


def normalize_name(name):
    """Normaliza un nombre para comparación: lowercase, sin acentos, sin caracteres especiales"""
    if not name:
        return ""
    name = name.lower()
    # Quitar acentos
    name = name.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
    name = name.replace('ñ', 'n')
    # Quitar caracteres especiales
    name = ''.join(c for c in name if c.isalnum() or c.isspace())
    # Quitar espacios múltiples
    name = ' '.join(name.split())
    return name.strip()


def similarity_score(s1, s2):
    """Calcula score de similitud entre dos strings"""
    return SequenceMatcher(None, normalize_name(s1), normalize_name(s2)).ratio()


def find_player_match(player_json, csv_players_by_team):
    """
    Busca coincidencia de un jugador del JSON con los jugadores del CSV.
    Prioridad:
    1. matchName exacto o muy similar (>0.9)
    2. firstName + lastName combinados
    3. firstName solo
    4. lastName solo

    Retorna el jugador del CSV o None si no hay coincidencia clara.
    """
    match_name = player_json.get('matchName', '')
    first_name = player_json.get('firstName', '')
    last_name = player_json.get('lastName', '')

    best_match = None
    best_score = 0.0

    for csv_player in csv_players_by_team:
        csv_name = csv_player['player_name']

        # Prioridad 1: matchName
        if match_name:
            score = similarity_score(match_name, csv_name)
            if score > best_score:
                best_score = score
                best_match = csv_player

        # Prioridad 2: firstName + lastName
        if first_name and last_name:
            combined = f"{first_name} {last_name}"
            score = similarity_score(combined, csv_name)
            if score > best_score:
                best_score = score
                best_match = csv_player

        # Prioridad 3: solo firstName (para casos como "Nico" -> "Nico Williams")
        if first_name:
            score = similarity_score(first_name, csv_name.split()[0] if csv_name else '')
            if score > best_score and score > 0.85:
                best_score = score
                best_match = csv_player

    # Umbral de confianza: solo retornar si score > 0.75
    if best_score > 0.75:
        return best_match, best_score

    return None, best_score


def load_csv_players():
    """Carga todos los jugadores del CSV agrupados por equipo"""
    players_by_team = {}
    with open('jugadores_optimizados.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            team = row['team_name']
            if team not in players_by_team:
                players_by_team[team] = []
            players_by_team[team].append(row)
    return players_by_team


def get_team_badge_url(team_id):
    """Genera la URL del escudo del equipo"""
    return f"https://omo.akamai.opta.net/image.php?secure=true&h=omo.akamai.opta.net&sport=football&entity=team&description=badges&dimensions=150&id={team_id}"


def sync_teams_and_badges(squad_files):
    """Sincroniza equipos y sus escudos en Supabase"""
    print("\n=== Sincronizando equipos y escudos ===")

    for file_path in squad_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        team_info = data.get('team', {})
        team_id = team_info.get('id')
        team_name = team_info.get('name')

        if not team_id:
            continue

        # Sincronizar equipo en real_teams
        team_payload = {
            "id": team_id,
            "name": team_name,
            "short_name": team_info.get('shortName', ''),
            "code": team_info.get('code', '')
        }

        supabase.table("real_teams").upsert(team_payload).execute()

        # Sincronizar escudo en team_badges
        badge_url = get_team_badge_url(team_id)
        badge_payload = {
            "team_id": team_id,
            "badge_url": badge_url
        }

        supabase.table("team_badges").upsert(badge_payload).execute()
        print(f"  Equipo: {team_name} ({team_id})")

    print("✅ Equipos y escudos sincronizados\n")


def sync_players_with_photos():
    """Sincroniza jugadores con sus fotos"""
    print("=== Sincronizando jugadores con fotos ===")

    # Cargar jugadores del CSV
    csv_players = load_csv_players()
    print(f"Cargados {sum(len(v) for v in csv_players.values())} jugadores del CSV")

    # Obtener archivos de squads
    squad_files = list((BASE_PATH / "squads").glob("*.json"))

    if not squad_files:
        print(f"❌ No se encontraron archivos de squads en {BASE_PATH / 'squads'}")
        return

    print(f"Encontrados {len(squad_files)} archivos de equipos")

    total_synced = 0
    total_matched = 0
    total_no_match = 0

    for file_path in squad_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        team_info = data.get('team', {})
        team_id = team_info.get('id')
        team_name = team_info.get('name')

        if not team_id:
            continue

        # Obtener nombre CSV del equipo
        csv_team_name = JSON_TO_CSV_TEAM.get(team_name)
        csv_players_for_team = csv_players.get(csv_team_name, [])

        if not csv_players_for_team:
            print(f"  ⚠️  {team_name}: no hay jugadores en CSV para {csv_team_name}")

        players = data.get('players', [])
        players_payload = []

        for p in players:
            # Solo jugadores activos que no sean staff
            if p.get('type') != 'player' or p.get('active') != 'yes':
                continue

            # Buscar coincidencia en CSV
            matched_csv, score = find_player_match(p, csv_players_for_team)

            photo_base64 = None
            if matched_csv:
                photo_base64 = matched_csv['image_base64']
                total_matched += 1
                print(f"  ✓ {p.get('matchName') or p.get('firstName')} -> {matched_csv['player_name']} (score: {score:.2f})")
            else:
                total_no_match += 1
                print(f"  ✗ {p.get('matchName') or p.get('firstName')} {p.get('lastName')} - no match (best: {score:.2f})")

            # Mapear posición
            raw_pos = p.get('position', 'Forward')
            pos_map = {
                "Goalkeeper": "Goalkeeper",
                "Defender": "Defender",
                "Midfielder": "Midfielder",
                "Forward": "Forward",
                "Attacker": "Forward"
            }

            player_payload = {
                "id": p.get('id'),
                "team_id": team_id,
                "first_name": p.get('firstName'),
                "last_name": p.get('lastName'),
                "short_name": p.get('matchName') or p.get('shortLastName', ''),
                "position": pos_map.get(raw_pos, "Forward"),
                "status": p.get('status', 'active'),
                "photo": photo_base64,  # None si no hay match, usará escudo
                # Datos adicionales del JSON
                "date_of_birth": p.get('dateOfBirth'),
                "nationality": p.get('nationality'),
                "height": p.get('height'),
                "weight": p.get('weight'),
                "foot": p.get('foot'),
                "shirt_number": p.get('shirtNumber'),
            }

            players_payload.append(player_payload)
            total_synced += 1

        if players_payload:
            # Upsert de jugadores
            result = supabase.table("players").upsert(players_payload).execute()
            print(f"  ✅ {team_name}: {len(players_payload)} jugadores sincronizados")

    print(f"\n=== Resumen ===")
    print(f"Total jugadores sincronizados: {total_synced}")
    print(f"Con foto matching: {total_matched} ({100*total_matched/total_synced:.1f}%)")
    print(f"Sin match (usarán escudo): {total_no_match} ({100*total_no_match/total_synced:.1f}%)")


if __name__ == "__main__":
    # Primero sincronizar equipos y escudos
    squad_files = list((BASE_PATH / "squads").glob("*.json"))
    sync_teams_and_badges(squad_files)

    # Luego sincronizar jugadores con fotos
    sync_players_with_photos()
