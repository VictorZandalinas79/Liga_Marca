#!/usr/bin/env python3
"""
Script para actualizar los marcadores de TODOS los partidos que tienen eventos descargados.
Recorre la carpeta data/Partidos_Individuales/, procesa los eventos de cada partido
y actualiza el marcador en la tabla fixtures de Supabase.
"""

import os
import sys
import json
from pathlib import Path
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Configuración
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
BASE_OUTPUT_PATH = Path("./data/Partidos_Individuales")

# Qualifier IDs
Q_OWN_GOAL = 28

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_fixture_id_for_match(match_id: str) -> str | None:
    """Busca el fixture_id en la BD que corresponde a un match_id de API."""
    # Primero intentar por ID exacto
    response = supabase.table('fixtures').select('id').eq('id', match_id).execute()
    if response.data:
        return response.data[0]['id']

    # Buscar por home_team_id y away_team_id
    response = supabase.table('fixtures').select('id, home_team_id, away_team_id').execute()
    if response.data:
        # Obtener equipos del partido desde eventos
        events_path = BASE_OUTPUT_PATH / match_id / "events" / f"{match_id}.json"
        if events_path.exists():
            with open(events_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                match_info = data.get('match', {})
                home_id = match_info.get('home', {}).get('id')
                away_id = match_info.get('away', {}).get('id')

                if home_id and away_id:
                    for fixture in response.data:
                        if fixture.get('home_team_id') == home_id and fixture.get('away_team_id') == away_id:
                            return fixture['id']

    return None

def process_match_events(match_id: str) -> tuple[int, int] | None:
    """Procesa los eventos de un partido y devuelve (home_goals, away_goals)."""
    events_path = BASE_OUTPUT_PATH / match_id / "events" / f"{match_id}.json"

    if not events_path.exists():
        return None

    try:
        with open(events_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"   ❌ Error leyendo {match_id}.json: {e}")
        return None

    # Obtener equipos del partido
    match_info = data.get('matchInfo', {})
    contestants = match_info.get('contestant', [])
    home_team_id = contestants[0].get('id') if len(contestants) > 0 else None
    away_team_id = contestants[1].get('id') if len(contestants) > 1 else None

    if not home_team_id or not away_team_id:
        print(f"   ⚠️ No se encontraron equipos en {match_id}")
        return None

    # Contar goles
    home_goals = 0
    away_goals = 0

    events = data.get('liveData', {}).get('event', [])
    goals = [e for e in events if e.get('typeId') == 16]  # typeId 16 = goal

    for goal_event in goals:
        team_id = goal_event.get('contestantId')
        is_own_goal = any(q.get('qualifierId') == Q_OWN_GOAL for q in goal_event.get('qualifier', []))

        if is_own_goal:
            # Gol en propia: el gol es para el equipo rival
            if team_id == home_team_id:
                away_goals += 1
            elif team_id == away_team_id:
                home_goals += 1
        else:
            # Gol normal
            if team_id == home_team_id:
                home_goals += 1
            elif team_id == away_team_id:
                away_goals += 1

    return (home_goals, away_goals)

def update_fixture_score(fixture_id: str, home_score: int, away_score: int):
    """Actualiza el marcador de un fixture en Supabase."""
    try:
        response = supabase.table('fixtures').update({
            'home_score': home_score,
            'away_score': away_score,
            'status': 'finished'
        }).eq('id', fixture_id).execute()

        return response.data is not None
    except Exception as e:
        print(f"   ❌ Error actualizando fixture: {e}")
        return False

def main():
    print("=" * 60)
    print("📊 ACTUALIZACIÓN MASIVA DE MARCADORES")
    print("=" * 60)

    # Obtener todos los partidos con eventos
    match_folders = [
        f for f in BASE_OUTPUT_PATH.iterdir()
        if f.is_dir() and not f.name.startswith('.') and f.name != '123'
    ]

    # Obtener todos los fixtures de la BD
    print("\n📥 Cargando fixtures desde Supabase...")
    all_fixtures = supabase.table('fixtures').select('id, home_team_id, away_team_id, home_score, away_score, status').execute()
    fixtures_map = {f['id']: f for f in all_fixtures.data}

    print(f"   ✅ {len(fixtures_map)} fixtures en la base de datos")

    updated = 0
    skipped = 0
    errors = 0

    for match_folder in match_folders:
        match_id = match_folder.name
        events_path = match_folder / "events" / f"{match_id}.json"

        if not events_path.exists():
            continue

        print(f"\n📋 Procesando {match_id}...")

        # Procesar eventos y obtener marcador
        result = process_match_events(match_id)
        if result is None:
            errors += 1
            continue

        home_goals, away_goals = result

        # Buscar el fixture correspondiente
        fixture_id = None

        # Intentar 1: ID exacto
        if match_id in fixtures_map:
            fixture_id = match_id
        else:
            # Intentar 2: Buscar por equipos
            with open(events_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                match_info = data.get('matchInfo', {})
                contestants = match_info.get('contestant', [])
                api_home_id = contestants[0].get('id') if len(contestants) > 0 else None
                api_away_id = contestants[1].get('id') if len(contestants) > 1 else None

                if api_home_id and api_away_id:
                    for fid, fixture in fixtures_map.items():
                        if fixture.get('home_team_id') == api_home_id and fixture.get('away_team_id') == api_away_id:
                            fixture_id = fid
                            break

        if not fixture_id:
            print(f"   ⚠️ No se encontró fixture correspondiente en la BD")
            skipped += 1
            continue

        fixture = fixtures_map.get(fixture_id, {})
        current_home = fixture.get('home_score')
        current_away = fixture.get('away_score')

        # Verificar si necesita actualización
        if current_home == home_goals and current_away == away_goals:
            print(f"   ✓ Ya actualizado: {home_goals}-{away_goals}")
            skipped += 1
            continue

        # Actualizar marcador
        if update_fixture_score(fixture_id, home_goals, away_goals):
            home_team = supabase.table('real_teams').select('name').eq('id', fixture.get('home_team_id')).single().execute()
            away_team = supabase.table('real_teams').select('name').eq('id', fixture.get('away_team_id')).single().execute()

            home_name = home_team.data.get('name', 'Local') if home_team.data else 'Local'
            away_name = away_team.data.get('name', 'Visitante') if away_team.data else 'Visitante'

            print(f"   ✅ Actualizado: {home_name} {home_goals} - {away_goals} {away_name}")
            updated += 1
        else:
            errors += 1

    print("\n" + "=" * 60)
    print("📊 RESUMEN")
    print("=" * 60)
    print(f"   Actualizados: {updated}")
    print(f"   Saltados (ya ok): {skipped}")
    print(f"   Errores: {errors}")
    print(f"   Total procesados: {updated + skipped + errors}")

if __name__ == "__main__":
    main()
