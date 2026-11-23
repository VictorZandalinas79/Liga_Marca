#!/usr/bin/env python3
"""
Runner de sincronización en vivo para GitHub Actions.

Decide qué partidos hay que sincronizar y lanza, para cada uno,
`trigger_descarga_eventos.py <fixture_id> <match_id>` (el motor único de
puntuación). Se ejecuta con working-directory = frontend-web.

Modos (por variables de entorno, en orden de prioridad):
  1. SYNC_FIXTURE_IDS="id1,id2"  -> sincroniza exactamente esos fixtures.
  2. SYNC_MATCHDAY="7"           -> sincroniza TODOS los fixtures de esa jornada.
  3. (ninguna)                   -> modo cron: partidos que empiezan pronto
                                    o que están en juego (status != finished).

En fixtures, el id del fixture coincide con el match_id de Opta, así que
pasamos el mismo valor como ambos argumentos.
"""

import os
import sys
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()


def _clean(value):
    """Quita espacios y comillas envolventes que se cuelan al pegar secrets."""
    if value is None:
        return None
    return value.strip().strip('"').strip("'").strip()


SUPABASE_URL = _clean(os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL"))
SUPABASE_KEY = _clean(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY"))
SDAPI_OUTLET_KEY = _clean(os.environ.get("SDAPI_OUTLET_KEY"))

SCRIPT = "trigger_descarga_eventos.py"

# Ventanas de tiempo (minutos)
UPCOMING_WINDOW = 30    # empieza dentro de los próximos 30 min (alineaciones)
# 90' + descanso + descuento + retrasos de kick-off. Solo actúa como tope para
# los partidos que nunca llegaron a marcarse 'live'; los que sí lo están se
# siguen refrescando por la red de seguridad (b) hasta pasar a 'finished'.
LIVE_WINDOW = 180

TERMINAL_STATUSES = {"finished", "cancelled"}

# Re-sync post-partido (migración 046): Opta corrige eventos después del pitido
# final (p.ej. la roja a Fermín López en el Barça-Villarreal de la J13, metida
# horas después). Cada partido 'finished' se vuelve a sincronizar UNA vez
# cuando su start_time tiene entre POST_MATCH_DELAY y POST_MATCH_MAX_AGE de
# antigüedad (4 h desde el inicio ≈ 2 h desde el final). Al terminar bien se
# rellena fixtures.post_match_resynced_at y no vuelve a entrar.
POST_MATCH_DELAY = timedelta(hours=4)
POST_MATCH_MAX_AGE = timedelta(hours=24)


def post_match_due(fixture, now=None):
    """¿Le toca a este fixture su re-sync post-partido?"""
    if (fixture.get("status") or "").lower() != "finished":
        return False
    if fixture.get("post_match_resynced_at"):
        return False
    start = fixture.get("start_time")
    if not start:
        return False
    try:
        st = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
    except ValueError:
        return False
    if st.tzinfo is None:
        st = st.replace(tzinfo=timezone.utc)
    age = (now or datetime.now(timezone.utc)) - st
    return POST_MATCH_DELAY <= age <= POST_MATCH_MAX_AGE
# Un partido aplazado o suspendido a medias NO es terminal: cuando Opta publica
# la nueva fecha, el sync de calendario mueve su start_time y entra otra vez en
# la ventana de tiempo, así que se vuelve a sincronizar y el motor lo pasa a
# 'live' al ver matchStatus = Playing. Mientras no haya fecha nueva, su
# start_time es el antiguo (pasado) y queda fuera de la ventana.


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def get_client():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def execute_with_retry(query, attempts=3, delay=5):
    """Ejecuta una consulta de PostgREST reintentando ante cortes de conexión.

    Supabase a veces cierra la conexión HTTP/2 sin responder
    (httpx.RemoteProtocolError: Server disconnected). Es un fallo transitorio:
    sin reintento tumbaba la pasada entera antes de lanzar ningún partido.
    Solo se reintentan errores de transporte; los errores de la API se propagan.
    """
    for attempt in range(1, attempts + 1):
        try:
            return query.execute()
        except httpx.TransportError as e:
            if attempt == attempts:
                raise
            log(f"⚠️ Error de conexión con Supabase ({e}); reintento {attempt}/{attempts - 1} en {delay}s")
            time.sleep(delay)


def fixtures_to_sync(sb):
    """Devuelve la lista de fixtures a sincronizar según el modo."""
    ids_env = os.environ.get("SYNC_FIXTURE_IDS", "").strip()
    matchday_env = os.environ.get("SYNC_MATCHDAY", "").strip()

    # Modo 1: ids explícitos (botón "sincronizar partido")
    if ids_env:
        ids = [i.strip() for i in ids_env.split(",") if i.strip()]
        log(f"🎯 Modo IDs explícitos: {ids}")
        res = execute_with_retry(sb.table("fixtures").select("*").in_("id", ids))
        return res.data or []

    # Modo 2: jornada completa (botón "sincronizar jornada")
    if matchday_env:
        log(f"🎯 Modo jornada completa: {matchday_env}")
        try:
            md = int(matchday_env)
            res = execute_with_retry(sb.table("fixtures").select("*").eq("matchday", md))
        except ValueError:
            # Puede ser un "momento" (ej. "Fase Final") en vez de número
            res = execute_with_retry(sb.table("fixtures").select("*").eq("momento", matchday_env))
        return res.data or []

    # Modo 3: cron automático
    now = datetime.now(timezone.utc)
    upcoming_to = (now + timedelta(minutes=UPCOMING_WINDOW)).isoformat()
    live_from = (now - timedelta(minutes=LIVE_WINDOW)).isoformat()

    # (a) Ventana de tiempo: partidos a punto de empezar o recién empezados.
    # start_time se guarda en UTC sin zona (ej. 2026-06-06T18:00:00); comparamos
    # como string ISO, que es ordenable lexicográficamente.
    res = execute_with_retry(
        sb.table("fixtures")
        .select("*")
        .gte("start_time", live_from)
        .lte("start_time", upcoming_to)
    )
    rows = list(res.data or [])

    # (b) Red de seguridad: cualquier fixture ya marcado como 'live', aunque su
    # start_time quede fuera de la ventana de LIVE_WINDOW (prórrogas, retrasos o
    # un partido que se quedó "colgado" en vivo porque nunca llegó el evento de
    # fin). Así nunca deja de refrescarse hasta pasar a 'finished'.
    res_live = execute_with_retry(sb.table("fixtures").select("*").eq("status", "live"))
    rows += list(res_live.data or [])

    # Deduplica por id y descarta los terminales.
    selected = {}
    for f in rows:
        status = (f.get("status") or "").lower()
        if status in TERMINAL_STATUSES:
            continue
        selected[f["id"]] = f

    # (c) Re-sync post-partido. Si la migración 046 no está aplicada la consulta
    # falla: se avisa y se sigue con el sync en vivo, que es lo importante.
    try:
        res_post = execute_with_retry(
            sb.table("fixtures")
            .select("*")
            .eq("status", "finished")
            .is_("post_match_resynced_at", "null")
            .gte("start_time", (now - POST_MATCH_MAX_AGE).isoformat())
            .lte("start_time", (now - POST_MATCH_DELAY).isoformat())
        )
        post = [f for f in (res_post.data or []) if post_match_due(f, now)]
        for f in post:
            selected[f["id"]] = f
        if post:
            log(f"🔁 Re-sync post-partido: {[f['id'] for f in post]}")
    except Exception as e:
        log(f"⚠️ No se pudo consultar el re-sync post-partido (¿falta la migración 046?): {e}")

    selected = list(selected.values())
    log(f"🔎 Cron: {len(selected)} partido(s) seleccionados")
    return selected


def mark_post_match_resynced(sb, fixture):
    """Rellena post_match_resynced_at para que no vuelva a entrar."""
    try:
        execute_with_retry(
            sb.table("fixtures")
            .update({"post_match_resynced_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", fixture["id"])
        )
        log(f"🔁 Re-sync post-partido hecho: fixture={fixture['id']}")
    except Exception as e:
        log(f"⚠️ No se pudo marcar el re-sync post-partido de {fixture['id']}: {e}")


# Ids de fixtures cuyo motor llegó al final ("Descarga completada"). El motor
# sale con código 0 aunque falle la descarga de Opta (captura la excepción),
# así que el código de salida no basta para dar por hecho el re-sync post-partido.
COMPLETED = set()


def sync_one(fixture):
    fixture_id = fixture["id"]
    match_id = fixture.get("match_id") or fixture_id
    log(f"⚽ Sincronizando fixture={fixture_id} match={match_id} (status={fixture.get('status')})")
    # Reinyecta los valores ya saneados para que el script de puntuación reciba
    # la URL/keys sin comillas ni espacios sobrantes.
    child_env = {**os.environ}
    child_env["SUPABASE_URL"] = SUPABASE_URL or ""
    child_env["SUPABASE_SERVICE_ROLE_KEY"] = SUPABASE_KEY or ""
    if SDAPI_OUTLET_KEY:
        child_env["SDAPI_OUTLET_KEY"] = SDAPI_OUTLET_KEY
    try:
        result = subprocess.run(
            [sys.executable, SCRIPT, str(fixture_id), str(match_id)],
            capture_output=True, text=True, timeout=300, env=child_env,
        )
        if result.returncode == 0:
            if "Descarga completada" in result.stdout:
                COMPLETED.add(fixture_id)
            log(f"✅ OK fixture={fixture_id}")
            tail = [l for l in result.stdout.splitlines() if any(k in l for k in ("✅", "🏁", "status="))]
            for l in tail[-6:]:
                print("   " + l)
            return True
        log(f"❌ Falló fixture={fixture_id}: {result.stderr[-500:]}")
        return False
    except subprocess.TimeoutExpired:
        log(f"❌ Timeout fixture={fixture_id}")
        return False
    except Exception as e:
        log(f"❌ Error fixture={fixture_id}: {e}")
        return False


def main():
    log("=" * 60)
    log("🚀 Runner de sincronización (motor: trigger_descarga_eventos.py)")
    if not Path(SCRIPT).exists():
        log(f"❌ No se encuentra {SCRIPT} en {Path.cwd()} (¿working-directory mal?)")
        sys.exit(1)

    sb = get_client()
    matches = fixtures_to_sync(sb)

    if not matches:
        log("ℹ️ Nada que sincronizar ahora mismo")
        return

    ok = 0
    for f in matches:
        # Se evalúa antes del sync: el motor no cambia start_time ni el estado
        # de un partido ya terminado.
        due = post_match_due(f)
        if sync_one(f):
            ok += 1
            if due and f["id"] in COMPLETED:
                mark_post_match_resynced(sb, f)
    log("=" * 60)
    log(f"📊 Resumen: {ok}/{len(matches)} sincronizados correctamente")


if __name__ == "__main__":
    main()
