import csv
import json
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from difflib import SequenceMatcher
from collections import defaultdict

load_dotenv()

# Cargar configuración
with open('settings.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

ACTIVE_LEAGUE_ID = config['active_league']['id']
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def normalize_string(s):
    """Normaliza una cadena para comparación: minusculas, sin tildes ni caracteres especiales."""
    s = s.lower().strip()
    # Quitar tildes
    replacements = [
        ('á', 'a'), ('é', 'e'), ('í', 'i'), ('ó', 'o'), ('ú', 'u'),
        ('à', 'a'), ('è', 'e'), ('ì', 'i'), ('ò', 'o'), ('ù', 'u'),
        ('ä', 'a'), ('ë', 'e'), ('ï', 'i'), ('ö', 'o'), ('ü', 'u'),
        ('ñ', 'n'), ('ç', 'c'), ('ø', 'o'), ('å', 'a'), ('æ', 'ae'),
        ('ð', 'd'), ('þ', 'th'),
    ]
    for old, new in replacements:
        s = s.replace(old, new)
    # Quitar puntos y caracteres especiales
    s = s.replace('.', '').replace('-', ' ').replace("'", "")
    return s


def similarity_ratio(a, b):
    """Devuelve la ratio de similitud entre dos cadenas (0-1)."""
    return SequenceMatcher(None, normalize_string(a), normalize_string(b)).ratio()


def load_teams_from_supabase():
    """Carga los equipos desde real_teams en Supabase."""
    response = supabase.table("real_teams").select("id, name, short_name, code").execute()
    teams = {}
    for team in response.data:
        teams[team['id']] = {
            'name': team['name'],
            'short_name': team.get('short_name', ''),
            'code': team.get('code', '')
        }
    return teams


def load_players_from_supabase():
    """Carga los jugadores desde la tabla players en Supabase."""
    response = supabase.table("players").select("id, team_id, first_name, last_name, short_name").execute()
    players = []
    for p in response.data:
        players.append({
            'id': p['id'],
            'team_id': p['team_id'],
            'first_name': p.get('first_name', ''),
            'last_name': p.get('last_name', ''),
            'short_name': p.get('short_name', '')
        })
    return players


def load_biowenger_csv(filename="jugadores_biwenger.csv"):
    """Carga el CSV de biowenger."""
    biowenger_players = []
    with open(filename, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            biowenger_players.append({
                'nombre': row['Nombre'],
                'equipo': row['Equipo'],
                'precio': row['Precio']
            })
    return biowenger_players


def match_teams(biowenger_team_name, supabase_teams):
    """
    Encuentra el equipo en Supabase más parecido al nombre de biowenger.
    Usa matching por palabras clave primero, luego similitud de cadena.
    Devuelve el team_id o None si no hay match.
    """
    biowenger_norm = normalize_string(biowenger_team_name)

    # Mapping manual de nombres comunes de biowenger -> palabra clave para buscar en Supabase
    team_keywords = {
        'atletico': 'atletico',      # Atlético de Madrid
        'athletic': 'athletic',      # Athletic Club
        'barcelona': 'barcelona',
        'real madrid': 'real madrid',
        'real sociedad': 'real sociedad',
        'sevilla': 'sevilla',
        'valencia': 'valencia',
        'villarreal': 'villarreal',
        'osasuna': 'osasuna',
        'girona': 'girona',
        'levante': 'levante',
        'elche': 'elche',
        'alaves': 'alaves',
        'getafe': 'getafe',
        'rayo': 'rayo',
        'betis': 'betis',
        'celta': 'celta',
        'espanyol': 'espanyol',
        'mallorca': 'mallorca',
        'oviedo': 'oviedo',
    }

    # Primero intentar match exacto por palabra clave
    for keyword, supabase_keyword in team_keywords.items():
        if keyword == biowenger_norm or keyword in biowenger_norm:
            # Buscar el equipo que contiene esta palabra clave
            for team_id, team_data in supabase_teams.items():
                team_norm = normalize_string(team_data['name'])

                # Match especial para Atlético vs Athletic
                if 'atletico' in biowenger_norm and 'atletico' in team_norm:
                    return team_id, 1.0
                if 'athletic' in biowenger_norm and 'athletic' in team_norm and 'atletico' not in team_norm:
                    return team_id, 1.0

                # Match normal por palabra clave
                if supabase_keyword in team_norm:
                    return team_id, 0.95

    # Si no hay match por keyword, usar similitud de cadena
    best_match = None
    best_ratio = 0.5

    for team_id, team_data in supabase_teams.items():
        team_norm = normalize_string(team_data['name'])
        ratio = similarity_ratio(biowenger_norm, team_norm)

        if team_data.get('short_name'):
            short_norm = normalize_string(team_data['short_name'])
            ratio_short = similarity_ratio(biowenger_norm, short_norm)
            ratio = max(ratio, ratio_short)

        if ratio > best_ratio:
            best_ratio = ratio
            best_match = team_id

    return best_match, best_ratio


def find_best_player_match(biowenger_player_name, supabase_players):
    """
    Encuentra el jugador en Supabase más parecido al nombre de biowenger.
    Devuelve el player_id o None si no hay match.
    """
    biowenger_normalized = normalize_string(biowenger_player_name)

    best_match = None
    best_ratio = 0.5  # Umbral mínimo

    for player in supabase_players:
        # Construir nombre completo
        full_name = f"{player['first_name']} {player['last_name']}".strip()
        short_name = player.get('short_name', '')

        # Comparar con nombre completo
        ratio = similarity_ratio(biowenger_normalized, normalize_string(full_name))

        # Comparar con short_name si existe
        if short_name:
            ratio_short = similarity_ratio(biowenger_normalized, normalize_string(short_name))
            ratio = max(ratio, ratio_short)

        # Comparar solo con apellido (por si el CSV tiene solo el apellido)
        if player['last_name']:
            ratio_last = similarity_ratio(biowenger_normalized, normalize_string(player['last_name']))
            ratio = max(ratio, ratio_last)

        if ratio > best_ratio:
            best_ratio = ratio
            best_match = player['id']

    return best_match, best_ratio


def main():
    print("=" * 60)
    print("ASIGNACIÓN DE PRECIOS DE BIWENGER A JUGADORES DE SUPABASE")
    print("=" * 60)

    # Cargar datos
    print("\n[1] Cargando equipos desde Supabase...")
    supabase_teams = load_teams_from_supabase()
    print(f"    {len(supabase_teams)} equipos cargados")

    print("\n[2] Cargando jugadores desde Supabase...")
    supabase_players = load_players_from_supabase()
    print(f"    {len(supabase_players)} jugadores cargados")

    print("\n[3] Cargando CSV de biowenger...")
    biowenger_data = load_biowenger_csv()
    print(f"    {len(biowenger_data)} jugadores en biowenger")

    # Agrupar jugadores de Supabase por team_id
    players_by_team = defaultdict(list)
    for player in supabase_players:
        players_by_team[player['team_id']].append(player)

    # Mapeo de nombres de equipos de biowenger a Supabase
    print("\n[4] Matching de equipos...")
    biowenger_team_mapping = {}
    for biowenger_player in biowenger_data:
        biowenger_team = biowenger_player['equipo']
        if biowenger_team not in biowenger_team_mapping:
            team_id, ratio = match_teams(biowenger_team, supabase_teams)
            biowenger_team_mapping[biowenger_team] = (team_id, ratio)
            if team_id:
                team_name = supabase_teams[team_id]['name']
                print(f"    '{biowenger_team}' -> '{team_name}' (similitud: {ratio:.2f})")
            else:
                print(f"    '{biowenger_team}' -> SIN MATCH (mejor similitud: {ratio:.2f})")

    # Asignar precios
    print("\n[5] Asignando precios a jugadores...")
    matched_players = []
    unmatched_players = []

    for biowenger_player in biowenger_data:
        biowenger_name = biowenger_player['nombre']
        biowenger_team = biowenger_player['equipo']
        precio = biowenger_player['precio']

        # Obtener team_id mapeado
        team_result = biowenger_team_mapping.get(biowenger_team)
        if team_result is None or team_result[0] is None:
            unmatched_players.append({
                'biowenger_name': biowenger_name,
                'biowenger_team': biowenger_team,
                'precio': precio,
                'reason': 'Equipo no encontrado'
            })
            continue

        team_id = team_result[0]
        team_players = players_by_team.get(team_id, [])

        if not team_players:
            unmatched_players.append({
                'biowenger_name': biowenger_name,
                'biowenger_team': biowenger_team,
                'precio': precio,
                'reason': f'Equipo {team_id} sin jugadores en Supabase'
            })
            continue

        # Buscar mejor match de jugador
        player_id, ratio = find_best_player_match(biowenger_name, team_players)

        if player_id:
            matched_players.append({
                'biowenger_name': biowenger_name,
                'biowenger_team': biowenger_team,
                'supabase_player_id': player_id,
                'precio': precio,
                'similarity': ratio
            })
        else:
            unmatched_players.append({
                'biowenger_name': biowenger_name,
                'biowenger_team': biowenger_team,
                'precio': precio,
                'reason': 'Jugador no encontrado en el equipo'
            })

    # Mostrar resultados
    print(f"\n{'=' * 60}")
    print("RESULTADOS")
    print(f"{'=' * 60}")
    print(f"✅ Jugadores matcheados: {len(matched_players)}")
    print(f"❌ Jugadores sin match: {len(unmatched_players)}")

    # Guardar resultados matcheados
    if matched_players:
        print(f"\n[6] Guardando resultados matcheados en 'precios_asignados.csv'...")
        with open('precios_asignados.csv', 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['biowenger_name', 'biowenger_team', 'supabase_player_id', 'precio', 'similarity'])
            writer.writeheader()
            writer.writerows(matched_players)
        print(f"    ✅ {len(matched_players)} registros guardados")

    # Guardar jugadores sin match para revisión
    if unmatched_players:
        print(f"\n[7] Guardando jugadores sin match en 'jugadores_sin_match.csv'...")
        with open('jugadores_sin_match.csv', 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['biowenger_name', 'biowenger_team', 'precio', 'reason'])
            writer.writeheader()
            writer.writerows(unmatched_players)
        print(f"    ✅ {len(unmatched_players)} registros guardados para revisión")

    # Mostrar algunos ejemplos de matches
    print(f"\n{'=' * 60}")
    print("EJEMPLOS DE MATCHES (primeros 10):")
    print(f"{'=' * 60}")
    for mp in matched_players[:10]:
        print(f"  {mp['biowenger_name']} ({mp['biowenger_team']}) -> ID: {mp['supabase_player_id']} | Precio: {mp['precio']} | Similitud: {mp['similarity']:.2f}")

    # Mostrar jugadores sin match
    if unmatched_players:
        print(f"\n{'=' * 60}")
        print("JUGADORES SIN MATCH (para revisión manual):")
        print(f"{'=' * 60}")
        for up in unmatched_players[:20]:
            print(f"  {up['biowenger_name']} ({up['biowenger_team']}) - {up['reason']}")
        if len(unmatched_players) > 20:
            print(f"  ... y {len(unmatched_players) - 20} más. Ver 'jugadores_sin_match.csv'")

    print(f"\n{'=' * 60}")
    print("PROCESO COMPLETADO")
    print(f"{'=' * 60}")
    print("\nSiguientes pasos:")
    print("1. Revisar 'jugadores_sin_match.csv' para asignaciones manuales si es necesario")
    print("2. Ejecutar 'subir_precios_supabase.py' para actualizar la tabla players")


if __name__ == "__main__":
    main()
