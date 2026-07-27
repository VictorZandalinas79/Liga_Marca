"""Repone las plantillas guardadas por reset_players.py sobre los jugadores nuevos.

Se ejecuta al final del reset, cuando `players` ya está repoblada por API Core y
el merge de Biwenger. Para cada fila del snapshot busca al jugador equivalente:

  1. El mismo id. Opta reutiliza sus ids, así que este caso cubre casi todo y es
     el único emparejamiento con garantía total.
  2. Mismo equipo + misma fecha de nacimiento (desempatando por nombre si hay
     varios), que es la misma regla que usa el merge.
  3. Mismo equipo + nombre normalizado idéntico, para el jugador cuya ficha
     cambió de fecha entre fuentes.

Lo que no encaja en ninguno de los tres NO se inventa: la fila se descarta y se
deja una notificación de tipo 'unmatched' para revisarlo a mano. Mejor un hueco
en la plantilla que un jugador que no es.

Uso:
    python restore_team_players.py
"""

import difflib
import json
import os
import sys
import unicodedata

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SNAPSHOT_FILE = "team_players_backup.json"


def get_client():
    url = os.environ.get("SUPABASE_URL", "").strip().strip('"').strip("'")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip().strip('"').strip("'")
    if not url or not key:
        print("Faltan credenciales de Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).")
        sys.exit(1)
    return create_client(url, key)


def normalize_name(name):
    """Nombre comparable: sin acentos, sin puntuación, en minúsculas."""
    if not name:
        return ""
    sin_acentos = "".join(
        c for c in unicodedata.normalize("NFD", str(name))
        if unicodedata.category(c) != "Mn"
    )
    limpio = "".join(c if c.isalnum() or c.isspace() else " " for c in sin_acentos.lower())
    return " ".join(limpio.split())


def display_name(player):
    return player.get("short_name") or (
        f"{player.get('first_name') or ''} {player.get('last_name') or ''}".strip()
    )


def fetch_all(supabase, table, columns="*", page_size=1000):
    filas = []
    page = 0
    while True:
        resp = supabase.table(table).select(columns).range(page * page_size, (page + 1) * page_size - 1).execute()
        lote = resp.data or []
        filas.extend(lote)
        if len(lote) < page_size:
            return filas
        page += 1


def find_equivalent(viejo, nuevos_por_id, nuevos_por_equipo):
    """(jugador_nuevo, motivo) o (None, motivo del fallo)."""
    if viejo["id"] in nuevos_por_id:
        return nuevos_por_id[viejo["id"]], "mismo id"

    candidatos = nuevos_por_equipo.get(viejo.get("team_id"), [])
    if not candidatos:
        return None, "su equipo no tiene jugadores nuevos"

    fecha = viejo.get("date_of_birth")
    if fecha:
        por_fecha = [p for p in candidatos if p.get("date_of_birth") == fecha]
        if len(por_fecha) == 1:
            return por_fecha[0], "misma fecha de nacimiento"
        if len(por_fecha) > 1:
            objetivo = normalize_name(display_name(viejo))
            mejor, mejor_score = None, 0.0
            for p in por_fecha:
                score = difflib.SequenceMatcher(None, objetivo, normalize_name(display_name(p))).ratio()
                if score > mejor_score:
                    mejor, mejor_score = p, score
            return mejor, f"fecha compartida, desempate por nombre ({mejor_score:.2f})"

    objetivo = normalize_name(display_name(viejo))
    exactos = [p for p in candidatos if normalize_name(display_name(p)) == objetivo]
    if len(exactos) == 1:
        return exactos[0], "nombre idéntico"

    return None, "sin equivalente por fecha ni por nombre"


def main():
    if not os.path.exists(SNAPSHOT_FILE):
        print(f"No existe {SNAPSHOT_FILE}: no hay plantillas que restaurar.")
        return

    with open(SNAPSHOT_FILE, "r", encoding="utf-8") as f:
        snapshot = json.load(f)

    filas = snapshot.get("team_players") or []
    identidades = snapshot.get("players") or {}
    if not filas:
        print("El snapshot no tiene filas. Nada que restaurar.")
        return

    print(f"1. Snapshot del {snapshot.get('created_at')}: {len(filas)} filas, {len(identidades)} fichas.")

    supabase = get_client()

    nuevos = fetch_all(supabase, "players", "id, short_name, first_name, last_name, team_id, date_of_birth, is_provisional")
    print(f"2. {len(nuevos)} jugadores en la BD nueva.")
    if not nuevos:
        print("La tabla de jugadores está vacía: se aborta para no perder el snapshot.")
        sys.exit(1)

    nuevos_por_id = {p["id"]: p for p in nuevos}
    nuevos_por_equipo = {}
    for p in nuevos:
        nuevos_por_equipo.setdefault(p.get("team_id"), []).append(p)

    # Lo que ya haya en team_players (no debería haber nada tras el reset) manda:
    # la tabla tiene UNIQUE(team_id, player_id) y un choque tumbaría el insert.
    ya_existen = {
        (f["team_id"], f["player_id"])
        for f in fetch_all(supabase, "team_players", "team_id, player_id")
    }

    print("3. Buscando el equivalente de cada jugador fichado...")
    a_insertar = []
    perdidas = []
    motivos = {}

    for fila in filas:
        viejo_id = fila.get("player_id")
        viejo = identidades.get(viejo_id)
        if not viejo:
            perdidas.append((fila, viejo_id, "su ficha ya no estaba en players al hacer el snapshot"))
            continue

        nuevo, motivo = find_equivalent(viejo, nuevos_por_id, nuevos_por_equipo)
        nombre_viejo = display_name(viejo)
        if not nuevo:
            perdidas.append((fila, nombre_viejo, motivo))
            continue

        clave = (fila["team_id"], nuevo["id"])
        if clave in ya_existen:
            # Dos jugadores viejos que apuntan al mismo nuevo, o una fila que ya
            # se restauró en una pasada anterior: no se duplica.
            print(f"   · {nombre_viejo}: ya había una fila para ese jugador en la plantilla, se omite.")
            continue
        ya_existen.add(clave)

        nueva_fila = dict(fila)
        nueva_fila["player_id"] = nuevo["id"]
        a_insertar.append(nueva_fila)

        if motivo != "mismo id":
            motivos.setdefault(motivo, []).append(f"{nombre_viejo} -> {display_name(nuevo)}")

    directas = len(a_insertar) - sum(len(v) for v in motivos.values())
    print(f"-> {directas} filas conservan el mismo jugador (mismo id).")
    for motivo, ejemplos in motivos.items():
        print(f"-> {len(ejemplos)} reasignadas por {motivo}:")
        for e in ejemplos:
            print(f"   · {e}")

    if not a_insertar:
        print("4. No hay nada que insertar.")
    else:
        print(f"4. Insertando {len(a_insertar)} filas en team_players...")
        insertadas = 0
        for i in range(0, len(a_insertar), 100):
            lote = a_insertar[i:i + 100]
            try:
                supabase.table("team_players").upsert(lote).execute()
                insertadas += len(lote)
            except Exception as e:
                print(f"-> Lote de {len(lote)} rechazado ({e}). Reintentando fila a fila...")
                for fila in lote:
                    try:
                        supabase.table("team_players").upsert(fila).execute()
                        insertadas += 1
                    except Exception as e2:
                        perdidas.append((fila, fila.get("player_id"), f"insert rechazado: {e2}"))
        print(f"-> {insertadas} filas restauradas.")

    if perdidas:
        print(f"\n5. {len(perdidas)} filas NO restauradas:")
        avisos = []
        for fila, nombre, motivo in perdidas:
            print(f"   · {nombre} (plantilla {fila.get('team_id')}): {motivo}")
            avisos.append({
                "type": "unmatched",
                "title": "Jugador no recuperado tras el reset",
                "body": f"{nombre} estaba fichado y no se ha podido reasignar: {motivo}.",
                "player_id": None,
                "player_name": str(nombre),
                "team_id": None,
                "team_name": None,
                "message": f"Plantilla {fila.get('team_id')}, jornada {fila.get('matchday')}. Hay que ficharlo de nuevo a mano.",
            })
        try:
            supabase.table("sync_notifications").insert(avisos).execute()
            print(f"-> {len(avisos)} notificaciones creadas para revisarlo.")
        except Exception as e:
            print(f"-> Aviso: no se pudieron guardar las notificaciones ({e}).")
    else:
        print("\n5. Todas las filas restauradas.")


if __name__ == "__main__":
    main()
