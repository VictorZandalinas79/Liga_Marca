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
from datetime import datetime, timedelta, timezone
from pathlib import Path

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
UPCOMING_WINDOW = 6     # empieza dentro de los próximos 6 min
LIVE_WINDOW = 140       # empezó hace menos de 140 min y sigue en juego

TERMINAL_STATUSES = {"finished", "cancelled", "postponed"}


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def get_client():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fixtures_to_sync(sb):
    """Devuelve la lista de fixtures a sincronizar según el modo."""
    ids_env = os.environ.get("SYNC_FIXTURE_IDS", "").strip()
    matchday_env = os.environ.get("SYNC_MATCHDAY", "").strip()

    # Modo 1: ids explícitos (botón "sincronizar partido")
    if ids_env:
        ids = [i.strip() for i in ids_env.split(",") if i.strip()]
        log(f"🎯 Modo IDs explícitos: {ids}")
        res = sb.table("fixtures").select("*").in_("id", ids).execute()
        return res.data or []

    # Modo 2: jornada completa (botón "sincronizar jornada")
    if matchday_env:
        log(f"🎯 Modo jornada completa: {matchday_env}")
        try:
            md = int(matchday_env)
            res = sb.table("fixtures").select("*").eq("matchday", md).execute()
        except ValueError:
            # Puede ser un "momento" (ej. "Fase Final") en vez de número
            res = sb.table("fixtures").select("*").eq("momento", matchday_env).execute()
        return res.data or []

    # Modo 3: cron automático
    now = datetime.now(timezone.utc)
    upcoming_to = (now + timedelta(minutes=UPCOMING_WINDOW)).isoformat()
    live_from = (now - timedelta(minutes=LIVE_WINDOW)).isoformat()
    now_iso = now.isoformat()

    # start_time se guarda en UTC sin zona (ej. 2026-06-06T18:00:00); comparamos
    # como string ISO, que es ordenable lexicográficamente.
    res = (
        sb.table("fixtures")
        .select("*")
        .gte("start_time", live_from)
        .lte("start_time", upcoming_to)
        .execute()
    )
    rows = res.data or []

    selected = []
    for f in rows:
        status = (f.get("status") or "").lower()
        if status in TERMINAL_STATUSES:
            continue
        st = (f.get("start_time") or "")
        # Próximo (aún no empieza pero dentro de ventana) o en juego (ya empezó)
        if st <= now_iso or st <= upcoming_to:
            selected.append(f)
    log(f"🔎 Cron: {len(selected)} partido(s) próximos/en vivo de {len(rows)} en ventana")
    return selected


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

    ok = sum(1 for f in matches if sync_one(f))
    log("=" * 60)
    log(f"📊 Resumen: {ok}/{len(matches)} sincronizados correctamente")


if __name__ == "__main__":
    main()
