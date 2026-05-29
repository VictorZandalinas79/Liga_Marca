#!/usr/bin/env python3
"""
Script para GitHub Actions - ejecuta la sincronización de partidos próximos.
Se ejecuta cada minuto y sincroniza partidos que empiezan en los próximos 5 minutos.
"""

import os
import sys
import json
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

# Añadir el directorio raíz al path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SDAPI_OUTLET_KEY = os.environ.get("SDAPI_OUTLET_KEY")

def log(message: str):
    """Escribe un mensaje en consola con timestamp"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {message}")

def get_upcoming_matches():
    """Busca partidos que empiezan en los próximos 5 minutos"""
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    now = datetime.utcnow()
    five_minutes_from_now = now + timedelta(minutes=5)

    # Buscar partidos que empiezan en los próximos 5 minutos
    result = supabase.table('fixtures').select('*').gte(
        'start_time', now.isoformat()
    ).lte(
        'start_time', five_minutes_from_now.isoformat()
    ).execute()

    return result.data or []

def get_live_matches():
    """Busca partidos que ya empezaron pero no han terminado"""
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    now = datetime.utcnow()

    # Buscar partidos que empezaron en los últimos 120 minutos y no están finalizados
    result = supabase.table('fixtures').select('*').gte(
        'start_time', (now - timedelta(minutes=120)).isoformat()
    ).lte(
        'start_time', now.isoformat()
    ).execute()

    # Filtrar solo los que no están finalizados
    live_matches = []
    for match in result.data or []:
        if match.get('status') not in ['finished', 'cancelled']:
            live_matches.append(match)

    return live_matches

def run_sync(fixture_id: str, match_id: str):
    """Ejecuta el script de sincronización para un partido"""
    log(f"🔴 Sincronizando partido {match_id} (fixture: {fixture_id})")

    try:
        # Ejecutar sync_live_matches.py con los parámetros
        env = os.environ.copy()
        env['SDAPI_OUTLET_KEY'] = SDAPI_OUTLET_KEY

        result = subprocess.run(
            ['python', 'sync_live_matches.py', fixture_id, match_id],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minutos timeout
            env=env
        )

        if result.returncode == 0:
            log(f"✅ Sincronización completada para {match_id}")
            if result.stdout:
                print(result.stdout)
        else:
            log(f"❌ Error en sincronización: {result.stderr}")
            return False

        return True
    except subprocess.TimeoutExpired:
        log(f"❌ Timeout en sincronización de {match_id}")
        return False
    except Exception as e:
        log(f"❌ Error ejecutando sync: {e}")
        return False

def main():
    """Función principal"""
    log("=" * 60)
    log("🚀 GitHub Actions Sync Runner")
    log("=" * 60)

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        log("❌ Faltan variables de entorno de Supabase")
        sys.exit(1)

    if not SDAPI_OUTLET_KEY:
        log("❌ Falta SDAPI_OUTLET_KEY")
        sys.exit(1)

    # 1. Buscar partidos próximos (empiezan en ≤5 min)
    upcoming = get_upcoming_matches()
    log(f"📅 Partidos próximos encontrados: {len(upcoming)}")

    # 2. Buscar partidos en vivo
    live = get_live_matches()
    log(f"🔴 Partidos en vivo encontrados: {len(live)}")

    # Combinar todos los partidos a sincronizar
    all_matches = upcoming + live

    if not all_matches:
        log("ℹ️ No hay partidos que sincronizar en este momento")
        return

    # 3. Ejecutar sincronización para cada partido
    success_count = 0
    error_count = 0

    for match in all_matches:
        fixture_id = match['id']
        match_id = match.get('match_id') or fixture_id

        if run_sync(fixture_id, match_id):
            success_count += 1
        else:
            error_count += 1

    # 4. Resumen final
    log("=" * 60)
    log(f"✅ Resumen: {success_count} exitosos, {error_count} con error")
    log("=" * 60)

if __name__ == "__main__":
    main()
