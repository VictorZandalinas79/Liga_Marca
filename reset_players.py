"""Vacía la tabla de jugadores para reconstruirla desde cero.

Por qué existe: el cruce Biwenger <-> API venía emparejando por parecido de
nombre y acabó metiendo en `players` jugadores que no existen (fichas mezcladas,
provisionales duplicados). Arreglar el algoritmo no basta, porque la basura ya
está escrita y el merge solo actualiza lo que encuentra: hace falta partir de
una tabla limpia y dejar que API Core (Opta) + merge (Biwenger) la repueblen con
las reglas nuevas.

Lo que hace, en orden:

  1. Copia `team_players` a un JSON, guardando junto a cada fila la identidad del
     jugador al que apunta (nombre, fecha de nacimiento, equipo). El player_id
     viejo se conserva tal cual: casi siempre el id de Opta vuelve a ser el mismo
     y la restauración es directa; la identidad es el plan B.
  2. Borra `team_players` (la FK a players NO es ON DELETE CASCADE, así que sin
     esto el borrado de jugadores falla).
  3. Borra `players` y `sync_notifications`.

Las plantillas se reponen luego con restore_team_players.py, ya con los ids
definitivos. NO ejecutes este script suelto: el flujo completo está en
.github/workflows/reset-players.yml.

Uso:
    python reset_players.py --confirm BORRAR
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SNAPSHOT_FILE = "team_players_backup.json"

# Se copia entera para no perder is_starter / is_captain / order / matchday, que
# es lo que reconstruye la alineación. Solo `id` se descarta al restaurar.
PLAYER_IDENTITY_COLUMNS = "id, short_name, first_name, last_name, team_id, date_of_birth, position"


def get_client():
    url = os.environ.get("SUPABASE_URL", "").strip().strip('"').strip("'")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip().strip('"').strip("'")
    if not url or not key:
        print("Faltan credenciales de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).")
        sys.exit(1)
    return create_client(url, key)


def fetch_all(supabase, table, columns="*", page_size=1000):
    """Trae una tabla entera. PostgREST corta a 1000 filas por petición."""
    filas = []
    page = 0
    while True:
        resp = supabase.table(table).select(columns).range(page * page_size, (page + 1) * page_size - 1).execute()
        lote = resp.data or []
        filas.extend(lote)
        if len(lote) < page_size:
            return filas
        page += 1


def snapshot_team_players(supabase):
    """JSON con las plantillas y la identidad de cada jugador fichado."""
    team_players = fetch_all(supabase, "team_players")
    print(f"-> {len(team_players)} filas en team_players.")

    if not team_players:
        snapshot = {"created_at": datetime.now(timezone.utc).isoformat(), "team_players": [], "players": {}}
        with open(SNAPSHOT_FILE, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, ensure_ascii=False, indent=2)
        print(f"-> No hay plantillas que guardar. Snapshot vacío en {SNAPSHOT_FILE}.")
        return snapshot

    ids_fichados = sorted({f["player_id"] for f in team_players if f.get("player_id")})
    print(f"-> {len(ids_fichados)} jugadores distintos fichados.")

    # La identidad se lee AHORA, mientras las filas siguen existiendo: después
    # del borrado ya no habría forma de saber a quién apuntaba cada fila.
    identidades = {}
    for i in range(0, len(ids_fichados), 200):
        lote = ids_fichados[i:i + 200]
        resp = supabase.table("players").select(PLAYER_IDENTITY_COLUMNS).in_("id", lote).execute()
        for p in resp.data or []:
            identidades[p["id"]] = p

    huerfanos = [pid for pid in ids_fichados if pid not in identidades]
    if huerfanos:
        print(f"-> Aviso: {len(huerfanos)} jugadores fichados ya no existen en players. Sus filas no se podrán restaurar.")

    snapshot = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "team_players": team_players,
        "players": identidades,
    }
    with open(SNAPSHOT_FILE, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(f"-> Snapshot guardado en {SNAPSHOT_FILE} ({len(team_players)} filas, {len(identidades)} fichas).")
    return snapshot


def wipe_table(supabase, table, id_column="id"):
    """Vacía una tabla. Supabase exige un filtro en cada delete, así que se usa
    'id no es nulo' como filtro que siempre se cumple."""
    try:
        supabase.table(table).delete().not_.is_(id_column, "null").execute()
        restantes = len(fetch_all(supabase, table, id_column, page_size=1))
        print(f"-> {table}: vaciada ({restantes} filas restantes).")
        return True
    except Exception as e:
        print(f"-> ERROR vaciando {table}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Vacía players, team_players y sync_notifications.")
    parser.add_argument("--confirm", default="", help="Hay que pasar exactamente BORRAR para que se ejecute.")
    parser.add_argument("--snapshot-only", action="store_true", help="Solo guarda el JSON, no borra nada.")
    args = parser.parse_args()

    supabase = get_client()

    print("1. Guardando snapshot de las plantillas...")
    snapshot = snapshot_team_players(supabase)

    if args.snapshot_only:
        print("-> --snapshot-only: no se borra nada.")
        return

    if args.confirm != "BORRAR":
        print("\nAbortado: falta --confirm BORRAR. El snapshot sí se ha guardado.")
        sys.exit(1)

    total_players = len(fetch_all(supabase, "players", "id"))
    print(f"\n2. Borrando {len(snapshot['team_players'])} filas de team_players...")
    if not wipe_table(supabase, "team_players"):
        # Sin esto el borrado de players falla por la FK; parar aquí deja la BD
        # como estaba en vez de a medias.
        print("Abortado: no se puede borrar players con team_players apuntando a ella.")
        sys.exit(1)

    print(f"\n3. Borrando {total_players} jugadores...")
    if not wipe_table(supabase, "players"):
        sys.exit(1)

    print("\n4. Borrando notificaciones...")
    wipe_table(supabase, "sync_notifications")

    print("\nTabla limpia. Siguiente paso: API Core (Opta) y luego el merge de Biwenger.")


if __name__ == "__main__":
    main()
