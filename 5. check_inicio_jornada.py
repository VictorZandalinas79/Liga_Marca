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
from datetime import datetime, timedelta, timezone
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

def _is_unresolved_out_of_order_matchday(fixtures, matchday):
    """¿Tiene esta jornada un partido descolocado (adelantado/aplazado) sin
    resolver? Mismo criterio (mediana de start_time por jornada) que
    `matchdaysWithOutOfOrderFixtures` en locked-teams-core.ts: una jornada
    normal (viernes a lunes, sin partidos de otra jornada entre medio) nunca
    se considera descolocada, aunque le queden partidos por jugar.
    """
    numeric = [f for f in fixtures if f.get("matchday") and f.get("start_time")]
    by_md = {}
    for f in numeric:
        by_md.setdefault(f["matchday"], []).append(f)
    if matchday not in by_md:
        return False

    rep = {}
    for md, fs in by_md.items():
        times = sorted(_parse_ts(f["start_time"]) for f in fs)
        rep[md] = times[len(times) // 2]

    threshold = timedelta(days=5)

    def slot_for(t, own):
        if abs(t - rep[own]) <= threshold:
            return own
        others = [md for md in rep if md != own]
        return min(others, key=lambda md: abs(t - rep[md])) if others else own

    is_out_of_order = any(
        slot_for(_parse_ts(f["start_time"]), matchday) != matchday
        for f in by_md[matchday]
    )
    if not is_out_of_order:
        return False

    all_finished = all((f.get("status") or "").lower() == "finished" for f in by_md[matchday])
    return not all_finished

def main():
    sb = get_client()
    now = datetime.now(timezone.utc)
    
    # 1. Obtener todos los partidos para encontrar el inicio de cada jornada
    try:
        resp = sb.table("fixtures").select("id, matchday, start_time, status").execute()
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

    # 2. Buscar qué jornadas han empezado ya, y cuáles no han sido procesadas
    # Solo miramos jornadas cuyo inicio es en el pasado (ya han empezado)
    started_matchdays = sorted(md for md, st in matchday_starts.items() if st <= now)
    if not started_matchdays:
        print("ℹ️ Ninguna jornada ha empezado aún.")
        return

    # Un partido adelantado hace que la jornada a la que pertenece "empiece"
    # mucho antes que jornadas anteriores con número menor (p.ej. el
    # adelantado de la J6 puede jugarse antes que el primer partido de la
    # J4). Si solo miráramos la jornada con el número más alto que ya
    # empezó, la J4 se quedaría bloqueada para siempre en cuanto el
    # adelantado de la J6 arrancara, porque el "máximo" quedaría fijado en 6.
    # Por eso recorremos TODAS las jornadas ya empezadas y sin procesar, en
    # orden, y procesamos cada una que ya esté lista (sin partidos
    # descolocados pendientes).
    current_matchday = None
    for md in started_matchdays:
        # 3. Comprobar si ya fue inicializada.
        # Utilizamos matchday_payments como flag: si hay pagos (aunque sean 0), ya se procesó.
        try:
            resp = sb.table("matchday_payments").select("id").eq("matchday", md).limit(1).execute()
            if resp.data:
                continue  # esta jornada ya se procesó, seguimos con la siguiente
        except Exception as e:
            print(f"⚠️ Error al comprobar matchday_payments de la jornada {md}: {e}")
            return

        # 3b. Si esta jornada tiene un partido descolocado (adelantado/aplazado)
        # todavía sin resolver, no se calculan sanciones ni se avisa por email
        # todavía: hay que esperar a que se complete del todo. Se volverá a
        # comprobar en la siguiente ejecución (no se marca nada en
        # matchday_payments, así no se pierde el disparo cuando sí termine).
        if _is_unresolved_out_of_order_matchday(fixtures, md):
            print(f"ℹ️ La jornada {md} tiene un partido descolocado sin resolver. Se espera a que se complete.")
            continue

        current_matchday = md
        break  # procesamos una jornada por ejecución; el resto se revisan en la siguiente pasada

    if current_matchday is None:
        print("ℹ️ No hay ninguna jornada empezada pendiente de procesar en este momento.")
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
