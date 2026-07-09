#!/usr/bin/env python3
"""
Script que se ejecuta cada poco tiempo (ej. cada 5 min junto con la sincronización en directo).
Detecta si una jornada acaba de empezar (el primer partido de esa jornada ya ha comenzado).
Si es así, calcula las posibles sanciones en base a las alineaciones fijadas y envía un email.
Para no enviar el correo múltiples veces, comprueba si la jornada ya fue inicializada en `matchday_payments`.
"""

import os
import sys
import subprocess
from datetime import datetime, timezone
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

def _clean(v):
    return v.strip().strip('"').strip("'").strip() if v else v

SUPABASE_URL = _clean(os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL"))
SUPABASE_KEY = _clean(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY"))

def get_client():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def _parse_ts(ts_str):
    if not ts_str:
        return None
    try:
        ts = ts_str.replace("Z", "+00:00")
        return datetime.fromisoformat(ts)
    except ValueError:
        return None

def main():
    sb = get_client()
    now = datetime.now(timezone.utc)
    
    # 1. Obtener todos los partidos para encontrar el inicio de cada jornada
    try:
        resp = sb.table("fixtures").select("id, matchday, start_time").execute()
        fixtures = resp.data or []
    except Exception as e:
        print(f"⚠️ Error al obtener fixtures: {e}")
        return

    matchday_starts = {}
    for f in fixtures:
        md = f.get("matchday")
        st = _parse_ts(f.get("start_time"))
        if md and md > 0 and st:
            if md not in matchday_starts or st < matchday_starts[md]:
                matchday_starts[md] = st

    # 2. Buscar qué jornada ha empezado ya, y si no ha sido procesada aún
    # Solo miramos jornadas cuyo inicio es en el pasado (ya han empezado)
    started_matchdays = [md for md, st in matchday_starts.items() if st <= now]
    if not started_matchdays:
        print("ℹ️ Ninguna jornada ha empezado aún.")
        return
        
    # La jornada actual es la más reciente (máximo número de jornada) que ya ha empezado
    current_matchday = max(started_matchdays)
    
    # 3. Comprobar si ya fue inicializada. 
    # Utilizamos matchday_payments como flag: si hay pagos (aunque sean 0), ya se procesó.
    try:
        resp = sb.table("matchday_payments").select("id").eq("matchday", current_matchday).limit(1).execute()
        if resp.data:
            print(f"ℹ️ La jornada {current_matchday} ya fue inicializada previamente.")
            return
    except Exception as e:
        print(f"⚠️ Error al comprobar matchday_payments: {e}")
        return

    print("=" * 60)
    print(f"🚀 DETECTADO INICIO DE JORNADA {current_matchday}")
    print("=" * 60)
    
    # 4. Calcular posibles sanciones
    print(f"Calculando posibles sanciones para la jornada {current_matchday}...")
    env_vars = os.environ.copy()
    env_vars["SANCTION_MATCHDAY"] = str(current_matchday)
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    try:
        subprocess.run([sys.executable, os.path.join(script_dir, "3. calcular_sanciones_y_pagos.py")], env=env_vars, check=True, cwd=script_dir)
    except Exception as e:
        print(f"❌ Error al calcular sanciones: {e}")
        return
        
    # 5. Enviar correos
    print(f"Enviando correos de inicio de jornada {current_matchday}...")
    try:
        subprocess.run([sys.executable, os.path.join(script_dir, "4. enviar_email_jornada.py"), str(current_matchday)], env=env_vars, check=True, cwd=script_dir)
    except Exception as e:
        print(f"❌ Error al enviar correos: {e}")
        return
        
    print(f"✅ Inicio de jornada {current_matchday} procesado correctamente.")

if __name__ == "__main__":
    main()
