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
import json
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
            [sys.executable, 'sync_live_matches.py', fixture_id, match_id],
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
STATE_FILE = Path(".processed_matchdays.json")


def get_processed_state():
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_processed_state(state):
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        log(f"⚠️ Error al guardar estado de jornadas: {e}")


def check_and_run_sanctions():
    """
    Verifica si hay jornadas que requieren calcular sanciones/pagos.
    1. Cálculo Inicial: Al cerrar el mercado (is_open = False), si no se ha ejecutado antes.
    2. Cálculo Final: Cuando terminan todos los partidos de la jornada (status = finished).
    """
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        state = get_processed_state()
        
        # Obtener estado de las jornadas
        res_status = supabase.table("matchday_status").select("*").execute()
        matchdays_status = res_status.data or []
        
        state_changed = False
        
        for md_status in matchdays_status:
            matchday = md_status["matchday"]
            is_open = md_status["is_open"]
            md_key = f"J{matchday}"
            
            if md_key not in state:
                state[md_key] = {"initial_run": False, "final_run": False}
            
            # 1. Si el mercado está cerrado (deadline pasado) y no se ha ejecutado el cálculo inicial
            if not is_open and not state[md_key]["initial_run"]:
                log(f"⚡ Mercado cerrado para Jornada {matchday}. Ejecutando cálculo inicial de sanciones...")
                script_path = "../3. calcular_sanciones_y_pagos.py"
                env = os.environ.copy()
                env["SANCTION_MATCHDAY"] = str(matchday)
                
                # Ejecutar script
                res = subprocess.run([sys.executable, script_path], env=env, capture_output=True, text=True)
                log(res.stdout)
                if res.returncode == 0:
                    state[md_key]["initial_run"] = True
                    state_changed = True
                    log(f"✅ Cálculo inicial de sanciones completado para Jornada {matchday}")
                    
                    # Disparar emails de inicio de jornada
                    email_script_path = "../4. enviar_email_jornada.py"
                    res_email = subprocess.run([sys.executable, email_script_path], env=env, capture_output=True, text=True)
                    if res_email.returncode == 0:
                        log(f"✅ Emails de inicio de jornada enviados.")
                        log(res_email.stdout)
                    else:
                        log(f"❌ Error enviando emails de inicio de jornada: {res_email.stderr}")
                else:
                    log(f"❌ Error en cálculo inicial para Jornada {matchday}: {res.stderr}")
            
            # 2. Si el mercado está cerrado y no se ha ejecutado el cálculo final
            if not is_open and not state[md_key]["final_run"]:
                # Verificar si todos los partidos de la jornada han terminado
                res_fixtures = supabase.table("fixtures").select("status").eq("matchday", matchday).execute()
                fixtures = res_fixtures.data or []
                
                if fixtures:
                    all_finished = all((f.get("status") or "").lower() == "finished" for f in fixtures)
                    if all_finished:
                        log(f"🏁 Todos los partidos de la Jornada {matchday} han terminado. Ejecutando liquidación final de sanciones y pagos...")
                        script_path = "../3. calcular_sanciones_y_pagos.py"
                        env = os.environ.copy()
                        env["SANCTION_MATCHDAY"] = str(matchday)
                        
                        res = subprocess.run([sys.executable, script_path], env=env, capture_output=True, text=True)
                        log(res.stdout)
                        if res.returncode == 0:
                            state[md_key]["final_run"] = True
                            state_changed = True
                            log(f"✅ Liquidación final completada para Jornada {matchday}")
                            
                            # Disparar automáticamente la sincronización semanal de fixtures/squads al acabar la jornada
                            log(f"🔄 Disparando sincronización semanal de fixtures y squads al terminar la jornada {matchday}...")
                            sync_script_path = "../2. descarga_fixtures_y_sync.py"
                            res_sync = subprocess.run([sys.executable, sync_script_path], env=env, capture_output=True, text=True)
                            if res_sync.returncode == 0:
                                log("✅ Sincronización semanal de fixtures y squads completada tras fin de jornada")
                            else:
                                log(f"❌ Error en sincronización semanal tras fin de jornada: {res_sync.stderr}")
                        else:
                            log(f"❌ Error en liquidación final para Jornada {matchday}: {res.stderr}")
                            
        if state_changed:
            save_processed_state(state)
            
    except Exception as e:
        log(f"⚠️ Error al verificar sanciones automáticas: {e}")


def main():
    """Bucle principal del scheduler"""
    log("=" * 60)
    log("🕐 Scheduler de Partidos en Vivo INICIADO")
    log("=" * 60)

    running_matches = set()  # Track de partidos que ya se están sincronizando

    while True:
        try:
            # Verificar y ejecutar cálculo de sanciones/pagos (al inicio y al final de jornada)
            check_and_run_sanctions()

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
