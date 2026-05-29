#!/usr/bin/env python3
"""
Scheduler para ejecutar la sincronización de partidos en vivo.
Se ejecuta cada minuto y busca partidos que empiezan en los próximos 2 minutos.

Para usar:
1. Ejecutar en segundo plano: python scheduler.py &
2. O usar con systemd/supervisor para producción
3. O añadir al crontab: * * * * * cd /path/to/Liga_Marca && python scheduler.py
"""

import os
import sys
import time
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

CHECK_INTERVAL = 60  # Segundos entre comprobaciones
LOG_FILE = Path("logs/scheduler.log")


def log(message: str):
    """Escribe un mensaje en el log y en consola"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_msg = f"[{timestamp}] {message}"
    print(log_msg)

    # Asegurar que el directorio logs existe
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Escribir en el archivo de log
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(log_msg + '\n')


def check_upcoming_matches():
    """Busca partidos que empiezan en menos de 5 minutos"""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    now = datetime.now()
    five_minutes_from_now = now + timedelta(minutes=5)

    # Buscar partidos que empiezan en los próximos 5 minutos y no tengan match_id
    result = supabase.table('fixtures').select('*').gte('start_time', now.isoformat()).lte('start_time', five_minutes_from_now.isoformat()).execute()

    return result.data or []


def start_sync(fixture_id: str, match_id: str):
    """Inicia el script de sincronización para un partido"""
    log(f"🔴 INICIANDO sincronización para partido {match_id}")

    try:
        # Ejecutar en segundo plano
        process = subprocess.Popen(
            ['python', 'sync_live_matches.py', fixture_id, match_id],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True
        )
        log(f"✅ Proceso iniciado con PID {process.pid}")
        return True
    except Exception as e:
        log(f"❌ Error iniciando sincronización: {e}")
        return False


def get_active_sync_processes():
    """Obtiene los procesos de sincronización activos"""
    try:
        result = subprocess.run(
            ['pgrep', '-f', 'sync_live_matches.py'],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return result.stdout.strip().split('\n')
        return []
    except Exception:
        return []


def main():
    """Bucle principal del scheduler"""
    log("=" * 60)
    log("🕐 Scheduler de Partidos en Vivo INICIADO")
    log("=" * 60)

    running_matches = set()  # Track de partidos que ya se están sincronizando

    while True:
        try:
            # Comprobar partidos próximos
            upcoming = check_upcoming_matches()

            for match in upcoming:
                fixture_id = match['id']
                match_id = match.get('match_id') or match['id']

                # Saltar si ya se está sincronizando
                if fixture_id in running_matches:
                    continue

                # Verificar si el proceso ya existe
                active_processes = get_active_sync_processes()
                if len(active_processes) > 0:
                    log(f"⚠️ Ya hay procesos de sincronización activos: {active_processes}")

                # Iniciar sincronización
                if start_sync(fixture_id, match_id):
                    running_matches.add(fixture_id)
                    log(f"➡️ Partido {match['home_team_id']} vs {match['away_team_id']} añadido a seguimiento")

            # Limpiar partidos finalizados (más de 2 horas desde su inicio)
            now = datetime.now()
            to_remove = set()
            for fixture_id in running_matches:
                # Podríamos verificar en Supabase si el partido terminó
                # Por ahora, los mantenemos hasta reiniciar el scheduler
                pass

            log(f"📊 Estado: {len(running_matches)} partido(s) en seguimiento, {len(get_active_sync_processes())} proceso(s) activo(s)")

        except Exception as e:
            log(f"❌ Error en el bucle principal: {e}")

        # Esperar antes de la próxima comprobación
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()
