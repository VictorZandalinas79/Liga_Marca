import os
import csv
import json
import re
import difflib
import hashlib
import unicodedata
import requests
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv

# Load env
load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip().strip('"').strip("'")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip().strip('"').strip("'")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Faltan credenciales de Supabase.")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Mapeo de equipos Biwenger a team_id de la API
TEAM_MAPPING = {
    "Espanyol": "c8llrezkm3b3op4afrou6b487",
    "Real Sociedad": "63f5h8t5e9qm1fqmvfkb23ghh",
    "Alavés": "4dtdjgnpdq9uw4sdutti0vaar",
    "Sevilla": "10eyb18v5puw4ez03ocaug09m",
    "Athletic": "3czravw89omgc9o4s0w3l1bg5",
    "Valencia": "ba5e91hjacvma2sjvixn00pjo",
    "Getafe": "1n1j0wsl763lq7ee1k0c11c02",
    "Atlético": "4ku8o6uf87yd8iecdalipo6wd",
    "Betis": "ah8dala7suqqkj04n2l8xz4zd",
    "Barcelona": "agh9ifb2mw3ivjusgedj7c3fe",
    "Celta": "6f27yvbqcngegwsg2ozxxdj4",
    "Osasuna": "2l0ldgiwsgb8d6y3z0sfgjzyj",
    "Rayo": "3budh3j9xivsid3ptm8ptpy4k",
    "Real Madrid": "3kq9cckrnlogidldtdie2fkbl",
    "Villarreal": "74mcjsm72vr3l9pw2i4qfjchj",
    "Elche": "4yg9ttzw0m51048doksv8uq5r",
    "Levante": "4grc9qgcvusllap8h5j6gc5h5",
    "Racing": "bzkwzatvwahmbzok1ymm5vqa1",
    "Málaga": "7012hpp3p5vg4fzyn3h0yvf09",
    "Deportivo": "1r541mega6d838hi0p44sv0h2"
}

# Nombre del equipo a partir del team_id, para poder decir de dónde viene un
# jugador cuando cambia de equipo.
TEAM_NAME_BY_ID = {v: k for k, v in TEAM_MAPPING.items()}

# Solo para el texto de las notificaciones; en BD la posición sigue en inglés.
POS_LABEL = {
    "Goalkeeper": "portero",
    "Defender": "defensa",
    "Midfielder": "centrocampista",
    "Forward": "delantero",
}

# La CDN de las fotos mete un cache-buster que cambia en cada scraping aunque la
# imagen sea la misma:
#   .../thumb/400x400/v202607201517/uploads/images/jugadores/ficha/5050.png
_PHOTO_VERSION_RE = re.compile(r"/v\d{6,}/")


def photo_key(url):
    """Identidad real de una foto, ignorando el cache-buster de la CDN."""
    if not url:
        return ""
    return _PHOTO_VERSION_RE.sub("/", url.strip())


# --------------------------------------------------------------------------
# Jugadores provisionales
#
# Biwenger publica antes que la API de Opta (canteranos que suben al primer
# equipo, fichajes recién cerrados). Antes esos jugadores se quedaban fuera de
# la app entera; ahora se dan de alta con lo que sí sabemos de ellos (nombre de
# Biwenger, foto, precio, posición, equipo) y un id propio con prefijo 'bw-'.
# Cuando la API los publica, promote_provisional_players() traspasa sus
# referencias al id real de Opta y borra la fila provisional, así que el jugador
# hereda el nombre y la ficha completa sin que nadie pierda su plantilla.
#
# El prefijo del id es lo que marca la fila como provisional: así la feature no
# depende de aplicar ninguna migración.
# --------------------------------------------------------------------------
PROVISIONAL_PREFIX = "bw-"

# Tablas que apuntan a players(id) y hay que repuntar al promocionar. La FK no
# es ON DELETE CASCADE, así que sin esto un borrado revienta el sync.
PLAYER_FK_TABLES = ("team_players", "player_scores", "match_events")

# Tope de bajas por sincronización, como fracción de los jugadores de la BD.
# En condiciones normales las bajas son un puñado (un fichaje a otra liga); que
# sobre un cuarto de la plantilla de la liga solo puede significar que el
# scraping de Biwenger salió incompleto. Ver el paso 5.
MAX_DELETE_RATIO = 0.25


def is_provisional(player):
    return str(player.get("id") or "").startswith(PROVISIONAL_PREFIX)


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


def provisional_id(nombre, fecha_iso):
    """Id determinista para un jugador que solo está en Biwenger.

    Determinista para que dos sincronizaciones seguidas no creen dos filas del
    mismo jugador. Aun así, el emparejamiento normal por fecha encuentra la fila
    provisional que ya existe, así que esto solo se usa al crearla.
    """
    base = f"{normalize_name(nombre)}|{fecha_iso or ''}"
    return PROVISIONAL_PREFIX + hashlib.sha1(base.encode("utf-8")).hexdigest()[:20]


def api_display_name(player):
    """Nombre de un jugador de la API tal y como lo compara el resto del script."""
    return player.get("short_name") or (
        f"{player.get('first_name') or ''} {player.get('last_name') or ''}".strip()
    )


def split_name(nombre):
    """Biwenger da un único campo 'Nombre'. Se parte por el primer espacio para
    rellenar first_name/last_name, que es lo que leen algunas vistas."""
    partes = (nombre or "").split()
    if not partes:
        return None, None
    if len(partes) == 1:
        return None, partes[0]
    return partes[0], " ".join(partes[1:])


def build_provisional_player(bw_name, team_id, bw_pos, bw_precio, bw_price, bw_foto, bw_date, extra_columns):
    first_name, last_name = split_name(bw_name)
    row = {
        "id": provisional_id(bw_name, bw_date),
        "team_id": team_id,
        "first_name": first_name,
        "last_name": last_name,
        "short_name": bw_name,
        "position": bw_pos,
        "status": "active",
        "precio": bw_precio,
        "price": bw_price,
        "date_of_birth": bw_date or None,
        "is_in_biwenger": True,
    }
    if bw_foto:
        row["photo"] = bw_foto
    # Solo si la migración 013 está aplicada; si no, el prefijo del id basta.
    if "is_provisional" in extra_columns:
        row["is_provisional"] = True
    return row


def best_by_name(nombre, candidatos):
    """El candidato con el nombre más parecido, y su score."""
    objetivo = normalize_name(nombre)
    mejor, mejor_score = None, -1.0
    for p in candidatos:
        score = difflib.SequenceMatcher(None, objetivo, normalize_name(api_display_name(p))).ratio()
        if score > mejor_score:
            mejor, mejor_score = p, score
    return mejor, max(mejor_score, 0.0)


def find_real_counterpart(prov, api_players):
    """Busca en la API al jugador que ya teníamos como provisional.

    Misma regla que el cruce principal (equipo + fecha de nacimiento exacta, y el
    nombre solo para desempatar), porque el error a evitar es el mismo: una
    promoción equivocada movería la plantilla de un usuario a otro jugador.
    Sin fecha se exige mismo equipo y nombre idéntico, que es lo único
    concluyente que queda.
    """
    prov_name = api_display_name(prov)
    prov_date = prov.get("date_of_birth")
    equipo = prov.get("team_id")

    candidatos = [
        p for p in api_players
        if not is_provisional(p) and p["id"] != prov["id"] and p.get("team_id") == equipo
    ]
    if not candidatos:
        return None, 0.0

    if prov_date:
        mismos = [p for p in candidatos if p.get("date_of_birth") == prov_date]
        if len(mismos) == 1:
            # Biwenger da el nombre largo donde la API usa el apodo ('Yuri
            # Berchiche' -> 'Yuri'), así que aquí el nombre no puede vetar nada:
            # equipo + fecha exacta ya identifica a la persona.
            return mismos[0], difflib.SequenceMatcher(
                None, normalize_name(prov_name), normalize_name(api_display_name(mismos[0]))
            ).ratio()
        if len(mismos) > 1:
            return best_by_name(prov_name, mismos)
        return None, 0.0

    objetivo = normalize_name(prov_name)
    exactos = [p for p in candidatos if normalize_name(api_display_name(p)) == objetivo]
    if len(exactos) == 1:
        return exactos[0], 1.0
    return None, 0.0


def repoint_player_references(prov_id, real_id):
    """Traspasa al id real las filas que apuntan al provisional.

    team_players tiene UNIQUE(team_id, player_id): si el usuario ya tenía al
    jugador real fichado, la fila provisional se borra en lugar de actualizarse.
    Las tablas que no existan en este despliegue se ignoran.
    """
    movidas = 0
    for tabla in PLAYER_FK_TABLES:
        try:
            filas = supabase.table(tabla).select("*").eq("player_id", prov_id).execute().data or []
        except Exception:
            continue  # la tabla no existe en este proyecto

        for fila in filas:
            try:
                if tabla == "team_players":
                    ya = supabase.table(tabla).select("id") \
                        .eq("team_id", fila["team_id"]).eq("player_id", real_id).execute().data
                    if ya:
                        supabase.table(tabla).delete().eq("id", fila["id"]).execute()
                        continue
                supabase.table(tabla).update({"player_id": real_id}).eq("id", fila["id"]).execute()
                movidas += 1
            except Exception as e:
                print(f"   Aviso: no se pudo mover {tabla}.{fila.get('id')} a {real_id}: {e}")
    return movidas


def table_missing(error):
    """Si el error es 'esa tabla no existe en este proyecto'.

    Hay que reconocerlo bien: cuando falla se da por referenciado TODO el lote
    —el lado seguro—, así que confundir 'la tabla no existe' con 'la consulta
    falló' blindaba a la liga entera y el borrado de jugadores fuera de Biwenger
    no llegaba a borrar a nadie. PostgREST no devuelve el 42P01 de Postgres para
    esto, sino su propio PGRST205 ('Could not find the table ... in the schema
    cache'), que es justo lo que pasaba con `match_events`.
    """
    msg = str(error)
    return (
        "does not exist" in msg
        or "42P01" in msg
        or "PGRST205" in msg
        or "Could not find the table" in msg
    )


def referenced_player_ids(player_ids):
    """Qué ids de `player_ids` están en uso en las tablas que apuntan a players.

    Ninguna de esas FK es ON DELETE CASCADE, así que borrar un jugador
    referenciado revienta; y aunque lo fuera, no queremos: team_players es la
    plantilla de alguien y player_scores es el historial de jornadas ya jugadas.
    Si una consulta falla se dan por referenciados, que es el lado seguro.
    """
    referencias = {tabla: set() for tabla in PLAYER_FK_TABLES}
    if not player_ids:
        return referencias

    for tabla in PLAYER_FK_TABLES:
        for i in range(0, len(player_ids), 100):
            lote = player_ids[i:i + 100]
            try:
                filas = supabase.table(tabla).select("player_id").in_("player_id", lote).execute().data or []
            except Exception as e:
                # La tabla no existe en este despliegue: no protege a nadie.
                if table_missing(e):
                    break
                print(f"-> Aviso: no se pudo comprobar {tabla} ({e}). Se conservan esos {len(lote)} por seguridad.")
                referencias[tabla].update(lote)
                continue
            referencias[tabla].update(f["player_id"] for f in filas)

    return referencias


def backup_signed_player_ids(path="team_players_backup.json"):
    """Ids fichados según la copia de plantillas que deja reset_players.py.

    En el reset la tabla team_players está vacía cuando llega este script, así
    que team_players no protege a nadie: sin esto, un jugador que alguien tiene
    fichado y que Biwenger ya no lista se borraría aquí y
    restore_team_players.py no podría devolverlo a su plantilla. Los ids de Opta
    son estables entre reconstrucciones, así que comparar por id basta.
    """
    if not os.path.exists(path):
        return set()
    try:
        with open(path, "r", encoding="utf-8") as f:
            snapshot = json.load(f)
    except Exception as e:
        print(f"-> Aviso: no se pudo leer {path} ({e}). Se sigue sin esa protección.")
        return set()

    ids = {fila.get("player_id") for fila in (snapshot.get("team_players") or [])}
    ids.discard(None)
    return ids


def promote_provisional_players(all_api_players, extra_columns):
    """Sustituye cada provisional por su ficha real en cuanto la API la publica.

    Devuelve (jugadores_restantes, notificaciones). Se ejecuta antes del cruce
    para que el jugador real entre en el emparejamiento normal y el provisional
    ya no exista cuando llegue el borrado de sobrantes.
    """
    provisionales = [p for p in all_api_players if is_provisional(p)]
    if not provisionales:
        return all_api_players, []

    print(f"-> {len(provisionales)} jugadores provisionales en la BD. Comprobando si la API ya los tiene...")

    notificaciones = []
    promovidos = set()

    for prov in provisionales:
        real, score = find_real_counterpart(prov, all_api_players)
        if not real:
            continue

        nombre_prov = api_display_name(prov)
        nombre_real = api_display_name(real)
        movidas = repoint_player_references(prov["id"], real["id"])
        try:
            supabase.table("players").delete().eq("id", prov["id"]).execute()
        except Exception as e:
            print(f"   Aviso: no se pudo borrar el provisional {nombre_prov}: {e}")
            continue

        promovidos.add(prov["id"])
        print(f"  ✔ Promovido: '{nombre_prov}' -> '{nombre_real}' ({real['id']}, score {score:.2f}, {movidas} refs movidas)")

        notificaciones.append({
            "type": "player_promoted",
            "title": "Jugador confirmado",
            "body": f"{nombre_prov} ya tiene ficha oficial: ahora aparece como {nombre_real}.",
            "player_id": real["id"],
            "player_name": nombre_real,
            "team_id": real.get("team_id"),
            "team_name": TEAM_NAME_BY_ID.get(real.get("team_id")),
            "message": (
                f"Provisional {prov['id']} promovido a {real['id']} "
                f"(score {score:.2f}, {movidas} referencias movidas)"
            ),
        })

    if not promovidos:
        print("-> Ninguno tiene ficha en la API todavía.")

    return [p for p in all_api_players if p["id"] not in promovidos], notificaciones


def parse_date(date_str):
    if not date_str:
        return ""
    try:
        # Biwenger date format is DD/MM/YYYY
        return datetime.strptime(date_str.strip(), "%d/%m/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return ""


def match_in_team(bw_name, bw_date, candidatos):
    """El jugador de la API que corresponde a una fila de Biwenger, o None.

    La única regla de emparejamiento es la fecha de nacimiento dentro del equipo
    que dice Biwenger. El nombre NO empareja por su cuenta, solo desempata entre
    varios con la misma fecha: emparejar por parecido de nombre es justamente lo
    que metía en la tabla jugadores que no existen ('Miguel Sierra' cazando a
    'Miguel Morro' y escribiéndole encima precio y foto). Si la fecha no cuadra
    con nadie se prefiere dar el jugador de alta como provisional antes que
    adivinar.
    """
    if not bw_date:
        return None, "la fila de Biwenger no trae fecha de nacimiento"

    por_fecha = [p for p in candidatos if p.get("date_of_birth") == bw_date]
    if not por_fecha:
        return None, "ningún jugador de su equipo tiene esa fecha de nacimiento"

    # Un provisional de una pasada anterior no debe ganarle a la ficha real: su
    # nombre es literalmente el de Biwenger, así que desempataría siempre él.
    reales = [p for p in por_fecha if not is_provisional(p)]
    if reales:
        por_fecha = reales

    if len(por_fecha) == 1:
        return por_fecha[0], "fecha de nacimiento"

    mejor, score = best_by_name(bw_name, por_fecha)
    return mejor, f"fecha compartida por {len(por_fecha)}, desempate por nombre ({score:.2f})"


# Emparejar solo por nombre, sin que la fecha respalde nada, exige un parecido
# casi total y encima dentro del mismo equipo. Es para las discrepancias de
# fecha entre fuentes, que son reales y frecuentes: 'Jon Gorrotxategi' es 02/09
# en Opta y 09/02 en Biwenger, 'Javi Rodríguez' se lleva un día, 'Ángel Pérez' y
# 'Nacho Pérez' varios meses. Los cuatro dan 1.00 de nombre, y el siguiente
# candidato de toda la liga se queda en 0.73 ('Toni Fernández' contra 'Carlos
# Fernández'), así que 0.90 separa de sobra. Bajarlo es lo que emparejaba
# 'Miguel Sierra' con 'Miguel Morro' (0.72) y le escribía encima precio y foto.
NAME_ONLY_MIN = 0.90


def match_by_name_only(bw_name, candidatos):
    """El jugador del mismo equipo cuyo nombre es prácticamente idéntico."""
    if not candidatos:
        return None, 0.0

    # Un provisional lleva literalmente el nombre de Biwenger, así que puntúa
    # 1.00 y le ganaría a la ficha real de Opta, que suele usar el apodo. Si hay
    # ficha oficial es la que manda: quedarse con el provisional dejaría al
    # jugador sin id de la API y borraría su ficha buena por sobrante.
    reales = [p for p in candidatos if not is_provisional(p)]
    if reales:
        candidatos = reales

    mejor, score = best_by_name(bw_name, candidatos)
    if score < NAME_ONLY_MIN:
        return None, score
    return mejor, score


# Un fichaje solo se acepta con la fecha exacta Y el nombre por encima de esto.
# La fecha sola no basta fuera del equipo: dentro de un equipo dos jugadores
# rara vez comparten cumpleaños, pero en una liga de ~530 las coincidencias son
# constantes y la fecha dejaría de identificar a nadie. El nombre aquí no
# empareja por su cuenta, descarta: los fichajes reales rondan 0.80-1.00 y dos
# desconocidos que comparten fecha no pasan de 0.45.
TRANSFER_NAME_MIN = 0.6


def find_transfer(bw_name, bw_date, team_id, all_api_players, matched_api_ids):
    """El jugador que Biwenger pone en otro equipo del que le tiene la API.

    Biwenger publica los fichajes antes que Opta, así que durante unos días la
    ficha real sigue colgando del equipo anterior. Se acepta como fichaje si
    coincide la fecha (y nombre >= 0.60) O si el nombre es casi exacto (>= 0.90)
    aunque la fecha baile.
    """
    candidatos = [
        p for p in all_api_players
        if p['id'] not in matched_api_ids
        and not is_provisional(p)
        and p.get('team_id') != team_id
    ]
    if not candidatos:
        return None, 0.0

    # 1. Primero la fecha, y el nombre solo para confirmar (>= 0.60).
    #    El orden importa: buscar antes el mejor nombre de toda la liga y
    #    comprobarle la fecha después perdía fichajes reales, porque Opta usa el
    #    apodo donde Biwenger pone el nombre largo ('Yuri' / 'Yuri Berchiche',
    #    0.44) y ganaba cualquier desconocido con más parecido. El jugador se
    #    daba de alta como provisional y su ficha buena se quedaba huérfana.
    if bw_date:
        por_fecha = [p for p in candidatos if p.get('date_of_birth') == bw_date]
        if por_fecha:
            mejor, score = best_by_name(bw_name, por_fecha)
            if mejor and score >= TRANSFER_NAME_MIN:
                return mejor, score

    # 2. No coincide la fecha (o no hay), pero el nombre es idéntico (>= 0.90).
    mejor, score = best_by_name(bw_name, candidatos)
    if mejor and score >= NAME_ONLY_MIN:
        return mejor, score

    return None, score


def build_update(player_id, team_id, bw_pos, bw_precio, bw_price, bw_foto):
    """Payload de actualización. La foto solo se toca si el scraping trajo una:
    si viene vacía (fallo puntual al leer la ficha) se conserva la que había en
    lugar de borrarla."""
    update = {
        "id": player_id,
        "position": bw_pos,
        "precio": bw_precio,
        "price": bw_price,
        # Enforce team_id just in case
        "team_id": team_id,
        "is_in_biwenger": True,
    }
    if bw_foto:
        update["photo"] = bw_foto
    return update


def freeze_previous_position(player_id, old_pos):
    """Antes de aplicar un cambio de posición, congela `old_pos` en las filas
    de team_players de ese jugador que todavía no tengan snapshot propio
    (position IS NULL = jornadas guardadas antes de que existiera esta
    columna, o heredadas sin tocar). Así lo pasado no se mueve con el cambio,
    y solo las alineaciones que se guarden/hereden a partir de ahora recogerán
    la posición nueva."""
    if not old_pos:
        return
    try:
        supabase.table("team_players") \
            .update({"position": old_pos}) \
            .eq("player_id", player_id) \
            .is_("position", "null") \
            .execute()
    except Exception as e:
        print(f"  -> Aviso: no se pudo congelar la posición anterior de {player_id}: {e}")

# Tipos nuevos que el CHECK de sync_notifications solo acepta con la migración
# 013 aplicada. Mientras no lo esté, la notificación se guarda con un tipo
# antiguo equivalente en vez de perderse.
TYPE_FALLBACK = {
    "provisional_player": "new_player",
    "player_promoted": "squad_changed",
}


def save_notifications(notifications, chunk_size=100):
    """Inserta las notificaciones sin poder tumbar el sync.

    Los datos de players ya están escritos cuando llegamos aquí (updates y
    borrado de sobrantes), así que un fallo insertando avisos no debe marcar
    el workflow como fallido ni obligar a repetir 20 minutos de scraping.
    Si un lote falla (típicamente por el CHECK de `type` desactualizado en la
    BD) se reintenta fila a fila para salvar las que sí son válidas.
    """
    saved = 0
    failed = 0
    for i in range(0, len(notifications), chunk_size):
        batch = notifications[i:i + chunk_size]
        try:
            supabase.table("sync_notifications").insert(batch).execute()
            saved += len(batch)
            continue
        except Exception as e:
            print(f"-> Aviso: lote de {len(batch)} notificaciones rechazado ({e}). Reintentando una a una...")

        for notif in batch:
            try:
                supabase.table("sync_notifications").insert(notif).execute()
                saved += 1
                continue
            except Exception as e:
                fallback = TYPE_FALLBACK.get(notif.get("type"))
                if not fallback:
                    failed += 1
                    print(f"   Descartada notificación '{notif.get('type')}' de {notif.get('player_name')}: {e}")
                    continue

            try:
                supabase.table("sync_notifications").insert({**notif, "type": fallback}).execute()
                saved += 1
                print(f"   Notificación '{notif.get('type')}' guardada como '{fallback}' (falta la migración 013).")
            except Exception as e:
                failed += 1
                print(f"   Descartada notificación '{notif.get('type')}' de {notif.get('player_name')}: {e}")
    return saved, failed


def purge_previous_notifications():
    """Borra los avisos de sincronizaciones anteriores a la actual.

    La campana enseña las novedades de la ejecución en curso, no un histórico.
    Si este script se lanza suelto (workflow_dispatch) limpiamos la tabla para
    que no se acumulen notificaciones (incluso las de runs fallidos).
    
    Usamos un margen de 2 horas para NO borrar los avisos que haya emitido API
    Core (si es que se acaba de ejecutar en cadena justo antes que nosotros).
    """
    try:
        from datetime import datetime, timedelta, timezone
        corte = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        res = supabase.table("sync_notifications").delete().lt("created_at", corte).execute()
        print(f"-> Campana vaciada: notificaciones antiguas eliminadas.")
    except Exception as e:
        print(f"-> Aviso: no se pudieron borrar las notificaciones anteriores ({e}).")


def build_sync_summary(notifications, stats, cold_start=False):
    """Notificación única con el balance del sync, para la campana.

    Los 'unmatched' individuales solo los ve un admin (son ruido para el resto),
    así que sin este resumen un sync con 37 jugadores fuera no dejaba ni un
    aviso visible para el usuario normal.
    """
    counts = {}
    for n in notifications:
        counts[n["type"]] = counts.get(n["type"], 0) + 1

    if cold_start:
        # Reconstrucción desde cero: no hay estado anterior, así que el balance
        # es "cuántos han quedado bien y cuántos hay que mirar", no "qué cambió".
        sin_ficha = counts.get("provisional_player", 0)
        body = f"Lista de jugadores reconstruida desde cero: {stats['matched']} con ficha oficial de la API"
        body += f" y {sin_ficha} solo con datos de Biwenger." if sin_ficha else "."
        if stats.get("unmatched"):
            body += f" {stats['unmatched']} filas descartadas por equipo desconocido."
        return {
            "type": "sync_complete",
            "title": "Jugadores reconstruidos",
            "body": body,
            "player_id": None,
            "player_name": None,
            "team_id": None,
            "team_name": None,
            "message": (
                f"Arranque en frío. Biwenger: {stats['biwenger_total']} | "
                f"Emparejados por fecha: {stats['matched']} | Sin id de la API: {sin_ficha}"
            ),
        }

    trozos = []
    for tipo, singular, plural in [
        ("new_player", "jugador nuevo", "jugadores nuevos"),
        ("provisional_player", "alta provisional", "altas provisionales"),
        ("player_promoted", "ficha confirmada", "fichas confirmadas"),
        # Los fichajes que detecta la pasada 3 (Biwenger le pone en un equipo
        # distinto del que le tiene la API). Faltaban en este recuento, así que
        # ni el resumen —la línea que siempre encabeza la campana— los mencionaba.
        ("team_changed", "fichaje", "fichajes"),
        ("position_changed", "cambio de posición", "cambios de posición"),
        ("photo_changed", "foto nueva", "fotos nuevas"),
    ]:
        c = counts.get(tipo, 0)
        if c:
            trozos.append(f"{c} {singular if c == 1 else plural}")

    cambios = ", ".join(trozos) if trozos else "sin cambios en las fichas"
    body = f"{stats['matched']} jugadores sincronizados: {cambios}."

    sin_match = stats.get("unmatched", 0)
    if sin_match:
        body += f" {sin_match} jugadores de Biwenger no se han podido dar de alta."
    if stats.get("deleted"):
        borrados = stats["deleted"]
        body += f" {borrados} jugador{'es' if borrados != 1 else ''} fuera del mercado: se {'han' if borrados != 1 else 'ha'} eliminado."
    if stats.get("protected"):
        body += f" {stats['protected']} jugadores fichados ya no están en Biwenger."

    return {
        "type": "sync_complete",
        "title": "Mercado actualizado",
        "body": body,
        "player_id": None,
        "player_name": None,
        "team_id": None,
        "team_name": None,
        "message": (
            f"Biwenger: {stats['biwenger_total']} | BD: {stats['api_total']} | "
            f"Emparejados: {stats['matched']} | Provisionales: {stats.get('provisional', 0)} | "
            f"Promovidos: {stats.get('promoted', 0)} | Sin dar de alta: {sin_match} | "
            f"Fuera de Biwenger: {stats.get('sobrantes', 0)} (borrados: {stats.get('deleted', 0)}, "
            f"con historial: {stats.get('kept_history', 0)}, fichados: {stats.get('protected', 0)})"
        ),
    }


def admin_emails():
    """Correos a los que va el resumen. SYNC_SUMMARY_EMAIL manda si está puesta;
    si no, los perfiles marcados como admin en la base de datos."""
    raw = os.environ.get("SYNC_SUMMARY_EMAIL", "")
    configured = [e.strip() for e in raw.split(",") if e.strip()]
    if configured:
        return configured
    try:
        resp = supabase.table("profiles").select("email").eq("is_admin", True).execute()
        return [p["email"] for p in (resp.data or []) if p.get("email")]
    except Exception as e:
        print(f"-> Aviso: no se pudieron leer los emails de admin ({e}).")
        return []


def main():
    print("1. Obteniendo jugadores actuales de Supabase (API)...")
    # Paginación para traer todos los jugadores de Supabase
    all_api_players = []
    page = 0
    size = 1000
    while True:
        resp = supabase.table("players").select("*").range(page*size, (page+1)*size - 1).execute()
        if not resp.data:
            break
        all_api_players.extend(resp.data)
        page += 1
        if len(resp.data) < size:
            break
            
    print("-> Limpiando la campana de la ejecución anterior...")
    purge_previous_notifications()

    # Columnas opcionales que solo existen si la migración 013 está aplicada.
    extra_columns = set(all_api_players[0].keys()) if all_api_players else set()

    provisionales_previos = sum(1 for p in all_api_players if is_provisional(p))
    print(f"-> {len(all_api_players)} jugadores en la BD ({provisionales_previos} provisionales).")

    # Arranque en frío: la tabla se acaba de reconstruir desde cero y ningún
    # jugador tiene todavía datos de Biwenger (el precio es lo que pone este
    # script). Sin un estado anterior no hay cambios que anunciar, y emitir
    # 'nuevo jugador' para la liga entera solo llena la campana de ruido; se
    # emiten únicamente los avisos que no comparan con nada (jugadores sin ficha
    # oficial y errores de sincronización) más el resumen final.
    cold_start = not any(p.get("precio") is not None for p in all_api_players)
    if cold_start:
        print("-> Arranque en frío (no hay datos previos de Biwenger): solo se avisará de lo que haya que revisar.")

    print("1.5 Promocionando provisionales que ya están en la API...")
    all_api_players, promotion_notifications = promote_provisional_players(all_api_players, extra_columns)

    print("2. Leyendo jugadores de Biwenger desde CSV...")
    biwenger_players = []
    with open('jugadores_biwenger.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            biwenger_players.append(row)

    print(f"-> {len(biwenger_players)} jugadores en Biwenger.")

    # Convert API players to a more accessible structure
    api_players_by_team = {}
    for p in all_api_players:
        tid = p.get('team_id')
        if tid not in api_players_by_team:
            api_players_by_team[tid] = []
        api_players_by_team[tid].append(p)

    matched_api_ids = set()
    updates = []
    notifications = list(promotion_notifications) if not cold_start else []
    new_provisionals = []

    match_by_date = 0
    match_by_name = 0
    not_found = []

    print("3. Cruzando datos (equipo -> fecha de nacimiento -> nombre solo como desempate)...")

    POS_MAPPING = {
        "DEL": "Forward",
        "MED": "Midfielder",
        "DEF": "Defender",
        "POR": "Goalkeeper"
    }
    
    def parse_row(bw):
        """Los campos de una fila del CSV, ya normalizados."""
        try:
            precio = int(bw.get('Valor', 0))
        except (TypeError, ValueError):
            precio = 0
        pos_raw = bw.get('Posicion', '').strip()
        return {
            "row": bw,
            "team_name": bw.get('Equipo', '').strip(),
            "name": bw.get('Nombre', '').strip(),
            "date": parse_date(bw.get('Fecha_Nacimiento', '').strip()),
            "pos_raw": pos_raw,
            "pos": POS_MAPPING.get(pos_raw, pos_raw),
            "foto": bw.get('Foto', '').strip(),
            "precio": precio,
            "price": precio * 1000000,
            "team_id": TEAM_MAPPING.get(bw.get('Equipo', '').strip()),
        }

    def aplicar_match(match, d, viene_de=None):
        """Escribe los datos de Biwenger sobre una ficha de la API y emite los
        avisos de lo que haya cambiado. `viene_de` es el equipo anterior cuando
        el emparejamiento ha sido un fichaje."""
        matched_api_ids.add(match['id'])
        bw_name, team_name, team_id = d["name"], d["team_name"], d["team_id"]
        bw_pos, bw_foto = d["pos"], d["foto"]

        # Nuevo en el mercado: la API lo dio de alta pero nunca se había cruzado
        # con Biwenger, así que aún no tiene precio. En arranque en frío eso lo
        # cumple TODA la liga, y avisar de 500 altas no informa de nada: ahí no
        # hay contra qué comparar.
        is_new = match.get('precio') is None and not cold_start

        old_pos = match.get('position')
        pos_changed = bool(old_pos) and old_pos != bw_pos and not is_new and not cold_start

        old_photo = match.get('photo')
        photo_changed = (
            bool(bw_foto)
            and bool(old_photo)
            and photo_key(old_photo) != photo_key(bw_foto)
            and not is_new
            and not cold_start
        )

        if viene_de is not None:
            # Un fichaje sí se avisa en arranque en frío: no compara con ningún
            # estado anterior nuestro, es una discrepancia real entre lo que dice
            # Biwenger hoy y el equipo que le tiene asignado la API.
            desde = f" (venía del {viene_de})" if viene_de else ""
            notifications.append({
                "type": "team_changed",
                "title": "Fichaje",
                "body": f"{bw_name} se une al {team_name}{desde}.",
                "player_id": match['id'],
                "player_name": bw_name,
                "team_id": team_id,
                "team_name": team_name,
                "message": f"Fichaje: se une al {team_name}. La API aún le tenía en {viene_de or 'otro equipo'}.",
            })
        elif is_new:
            notifications.append({
                "type": "new_player",
                "title": "Nuevo Jugador en el Mercado",
                "body": f"{bw_name} ({team_name}) ya está disponible en {POS_LABEL.get(bw_pos, bw_pos)}.",
                "player_id": match['id'],
                "player_name": bw_name,
                "team_id": team_id,
                "team_name": team_name,
                "message": "Nuevo jugador disponible en el mercado"
            })
        elif pos_changed:
            notifications.append({
                "type": "position_changed",
                "title": "Cambio de Posición",
                "body": f"{bw_name} ({team_name}) pasa de {POS_LABEL.get(old_pos, old_pos)} a {POS_LABEL.get(bw_pos, bw_pos)}.",
                "player_id": match['id'],
                "player_name": bw_name,
                "team_id": team_id,
                "team_name": team_name,
                "message": f"Ha cambiado de posición: {bw_pos}"
            })
            # Congelar la posición antigua en las alineaciones ya guardadas: las
            # sanciones y puntos de jornadas pasadas se calculan con la posición
            # vigente en su momento, no con la nueva. Solo se rellenan las filas
            # que aún no tengan snapshot propio (position IS NULL); las jornadas
            # futuras se snapshotearán con la posición nueva al guardarse.
            freeze_previous_position(match['id'], old_pos)

        # La foto es independiente: puede cambiar a la vez que la posición.
        if photo_changed:
            notifications.append({
                "type": "photo_changed",
                "title": "Foto Actualizada",
                "body": f"{bw_name} ({team_name}) tiene foto nueva.",
                "player_id": match['id'],
                "player_name": bw_name,
                "team_id": team_id,
                "team_name": team_name,
                "message": f"Foto actualizada: {bw_foto}"
            })

        updates.append(build_update(match['id'], team_id, bw_pos, d["precio"], d["price"], bw_foto))

    # --- Pasada 1: cada jugador contra su propio equipo ---------------------
    pendientes = []
    for bw in biwenger_players:
        d = parse_row(bw)

        if not d["team_id"]:
            print(f"  Aviso: Equipo '{d['team_name']}' no mapeado para el jugador {d['name']}.")
            not_found.append(bw)
            # Se queda fuera de la BD igual que un jugador sin match, así que
            # tiene que verse en el panel de admin y no solo en el log.
            notifications.append({
                "type": "unmatched",
                "title": "Error de Sincronización",
                "body": f"Equipo no mapeado: {d['team_name']}",
                "player_id": None,
                "player_name": d["name"],
                "team_id": None,
                "team_name": d["team_name"],
                "message": f"Equipo '{d['team_name']}' no está en TEAM_MAPPING. Fecha: {d['date']}, Pos: {d['pos_raw']}"
            })
            continue

        # El equipo de Biwenger acota la búsqueda: solo se compara contra los
        # jugadores que la API tiene en ese equipo y que aún no ha cogido otra
        # fila del CSV.
        candidatos = [p for p in api_players_by_team.get(d["team_id"], []) if p['id'] not in matched_api_ids]
        match, motivo = match_in_team(d["name"], d["date"], candidatos)

        if not match:
            pendientes.append((d, motivo))
            continue

        if motivo == "fecha de nacimiento":
            match_by_date += 1
        else:
            match_by_name += 1
            print(f"  · {d['name']}: {motivo} -> {api_display_name(match)}")
        aplicar_match(match, d)

    # --- Pasada 2: mismo equipo, nombre casi idéntico ------------------------
    # La fecha no cuadra, pero en su propio equipo hay un nombre que coincide al
    # 90% o más: es la misma persona con la fecha mal en una de las dos fuentes,
    # no un jugador nuevo. Se emparejan con su id de la API para no partirlos en
    # dos fichas ni perderles las puntuaciones. Va después de agotar las fechas
    # para que un nombre parecido nunca le quite la ficha a quien sí cuadra.
    sin_nombre = []
    if pendientes:
        print(f"3.5 Buscando nombres casi idénticos en su equipo entre los {len(pendientes)} sin emparejar...")
    for d, motivo in pendientes:
        libres = [p for p in api_players_by_team.get(d["team_id"], []) if p['id'] not in matched_api_ids]
        match, score = match_by_name_only(d["name"], libres)
        if not match:
            sin_nombre.append((d, motivo))
            continue

        match_by_name += 1
        print(
            f"  · Por nombre: {d['name']} -> {api_display_name(match)} ({score:.2f}), "
            f"fechas {d['date'] or 'sin fecha'} / {match.get('date_of_birth') or 'sin fecha'}"
        )
        aplicar_match(match, d)

    # --- Pasada 3: fichajes -------------------------------------------------
    # Solo ahora, cuando todos los equipos ya han cogido a los suyos: si se
    # buscara sobre la marcha, un jugador podría llevarse la ficha que le
    # correspondía a una fila del CSV todavía sin procesar.
    resto = []
    if sin_nombre:
        print(f"3.6 Buscando fichajes entre los {len(sin_nombre)} que siguen sin emparejar...")
    for d, motivo in sin_nombre:
        fichaje, score = find_transfer(d["name"], d["date"], d["team_id"], all_api_players, matched_api_ids)
        if not fichaje:
            resto.append((d, motivo))
            continue

        viene_de = TEAM_NAME_BY_ID.get(fichaje.get('team_id'))
        match_by_date += 1
        print(f"  · Fichaje: {d['name']} {viene_de or '?'} -> {d['team_name']} (nombre {score:.2f})")
        aplicar_match(fichaje, d, viene_de=viene_de or "")

    # --- Pasada 4: los que no están en la API -------------------------------
    for d, motivo in resto:
        # Ni fecha en su equipo, ni un nombre casi idéntico, ni un fichaje. El
        # jugador entra con lo que sabemos de Biwenger, sin id de la API, y se
        # avisa para revisarlo: inventar un emparejamiento con lo que queda es
        # justo lo que metía en la tabla jugadores que no existen.
        nuevo = build_provisional_player(
            d["name"], d["team_id"], d["pos"], d["precio"], d["price"], d["foto"], d["date"], extra_columns
        )
        if nuevo["id"] in matched_api_ids:
            # Dos filas de Biwenger con el mismo nombre y fecha.
            print(f"  Aviso: {d['name']} duplicado en el CSV de Biwenger, se ignora la segunda fila.")
            continue

        new_provisionals.append(nuevo)
        matched_api_ids.add(nuevo["id"])
        not_found.append(d["row"])
        print(f"  · Sin id de la API: {d['name']} ({d['team_name']}) — {motivo}.")
        # Este aviso sí se emite en arranque en frío: no compara con nada
        # anterior, es la lista de jugadores que hay que revisar a mano.
        notifications.append({
            "type": "provisional_player",
            "title": "Jugador sin ficha oficial",
            "body": f"{d['name']} ({d['team_name']}) entra como {POS_LABEL.get(d['pos'], d['pos'])} solo con datos de Biwenger.",
            "player_id": nuevo["id"],
            "player_name": d["name"],
            "team_id": d["team_id"],
            "team_name": d["team_name"],
            "message": (
                f"Sin id de la API: {motivo}. "
                f"Fecha: {d['date'] or 'sin fecha'}, Pos: {d['pos_raw']}, Precio: {d['precio']}"
            ),
        })

    print(f"-> Emparejados por fecha de nacimiento (incluidos fichajes): {match_by_date}")
    print(f"-> Emparejados por nombre en su equipo (desempate o fecha discrepante): {match_by_name}")
    print(f"-> Altas provisionales (solo en Biwenger): {len(new_provisionals)}")
    print(f"-> Sin emparejar y sin poder darlos de alta: {len(not_found) - len(new_provisionals)}")

    # 4. Updates
    if updates:
        print("4. Actualizando base de datos con los datos de Biwenger...")
        # Supabase update has to be done one by one or via upsert
        for i in range(0, len(updates), 100):
            batch = updates[i:i+100]
            supabase.table("players").upsert(batch).execute()

    # 4.5 Alta de los jugadores que solo están en Biwenger
    provisionals_saved = 0
    if new_provisionals:
        print(f"4.5 Dando de alta {len(new_provisionals)} jugadores provisionales...")
        for i in range(0, len(new_provisionals), 100):
            batch = new_provisionals[i:i+100]
            try:
                supabase.table("players").upsert(batch).execute()
                provisionals_saved += len(batch)
            except Exception as e:
                print(f"-> Aviso: lote de {len(batch)} provisionales rechazado ({e}). Reintentando uno a uno...")
                for row in batch:
                    try:
                        supabase.table("players").upsert(row).execute()
                        provisionals_saved += 1
                    except Exception as e2:
                        print(f"   No se pudo dar de alta a {row.get('short_name')}: {e2}")
        print(f"-> {provisionals_saved} provisionales en la BD.")

    # 5. Jugadores que estaban en la BD y Biwenger ya no lista
    #
    # Biwenger es el mercado: quien sale de su lista sale del juego, así que se
    # borra. Esto ya no reabre el ciclo perpetuo de altas y borrados que hubo en
    # agosto (los mismos ~50 anunciados como 'nuevo jugador' cada pasada), porque
    # "2. descarga_fixtures_y_sync.py" dejó de dar de alta a los jugadores que
    # solo están en la API: ahora únicamente actualiza a los que ya existen y
    # admite altas cuando vienen a confirmar un provisional.
    #
    # Excepción: los que tienen historial. Si alguien los tiene fichados
    # (team_players) o tienen puntuaciones/eventos, borrarlos rompe la FK —no hay
    # ON DELETE CASCADE— y se llevaría por delante plantillas y jornadas ya
    # jugadas. Esos se conservan y se avisa para mirarlos a mano.
    print("5. Borrando jugadores que ya no están en Biwenger...")
    sobrantes_ids = [p['id'] for p in all_api_players if p['id'] not in matched_api_ids]
    print(f"-> {len(sobrantes_ids)} jugadores de la BD fuera de Biwenger.")

    referencias = referenced_player_ids(sobrantes_ids)
    fichados_fuera = referencias["team_players"] | (backup_signed_player_ids() & set(sobrantes_ids))
    con_historial = set().union(*referencias.values()) - fichados_fuera
    borrables = [pid for pid in sobrantes_ids if pid not in fichados_fuera and pid not in con_historial]

    nombres_por_id = {p["id"]: api_display_name(p) for p in all_api_players}

    # Freno de mano: el CSV lo acaba de generar el scraping, y si ese scraping se
    # dejó equipos por el camino (timeout, cambio de HTML) sus jugadores parecen
    # bajas del mercado. Borrar media BD por eso no se puede deshacer, así que
    # por encima de este porcentaje no se toca nada y se avisa.
    if borrables and len(borrables) > MAX_DELETE_RATIO * len(all_api_players):
        print(
            f"-> ABORTADO el borrado: {len(borrables)} de {len(all_api_players)} jugadores "
            f"(más del {MAX_DELETE_RATIO:.0%}). El CSV de Biwenger parece incompleto."
        )
        notifications.append({
            "type": "unmatched",
            "title": "Borrado cancelado",
            "body": f"{len(borrables)} jugadores no están en Biwenger: demasiados para borrarlos sin revisar.",
            "player_id": None,
            "player_name": None,
            "team_id": None,
            "team_name": None,
            "message": (
                f"El CSV traía {len(biwenger_players)} jugadores y sobran {len(borrables)} "
                f"de {len(all_api_players)} en la BD. Revisar el scraping antes de repetir."
            ),
        })
        borrables = []

    borrados = 0
    if borrables:
        print(f"-> Borrando {len(borrables)} sin plantilla ni historial.")
        for i in range(0, len(borrables), 100):
            lote = borrables[i:i + 100]
            try:
                supabase.table("players").delete().in_("id", lote).execute()
                borrados += len(lote)
            except Exception as e:
                print(f"   Aviso: lote de {len(lote)} rechazado ({e}). Reintentando uno a uno...")
                for pid in lote:
                    try:
                        supabase.table("players").delete().eq("id", pid).execute()
                        borrados += 1
                    except Exception as e2:
                        print(f"   No se pudo borrar {nombres_por_id.get(pid, pid)}: {e2}")
        print(f"-> {borrados} jugadores retirados del mercado.")

    if con_historial:
        print(f"-> {len(con_historial)} se conservan por tener puntuaciones o eventos de jornadas jugadas.")

    # Que alguien tenga fichado a un jugador que ha desaparecido del mercado hay
    # que mirarlo a mano: no se le puede borrar sin romperle la plantilla.
    if fichados_fuera:
        print(f"-> {len(fichados_fuera)} están en alguna plantilla y no se borran:")
        for pid in sorted(fichados_fuera):
            nombre = nombres_por_id.get(pid, pid)
            print(f"   · {nombre} ({pid})")
            notifications.append({
                "type": "unmatched",
                "title": "Jugador fichado pero fuera de Biwenger",
                "body": f"{nombre} ya no está en Biwenger pero sigue en alguna plantilla.",
                "player_id": pid,
                "player_name": nombre,
                "team_id": None,
                "team_name": None,
                "message": "No se borra para no romper la plantilla. Revisar a mano.",
            })

    conservados = list(con_historial | fichados_fuera)
    if conservados:
        print(f"-> Ocultando {len(conservados)} jugadores conservados del mercado (is_in_biwenger = False)...")
        for i in range(0, len(conservados), 100):
            lote = conservados[i:i + 100]
            try:
                supabase.table("players").update({"is_in_biwenger": False}).in_("id", lote).execute()
            except Exception as e:
                print(f"   Aviso: fallo al ocultar lote de {len(lote)} ({e}).")

    # 6. Notifications
    stats = {
        "biwenger_total": len(biwenger_players),
        "api_total": len(all_api_players),
        "matched": len(matched_api_ids) - len(new_provisionals),
        "provisional": provisionals_saved,
        "promoted": len(promotion_notifications),
        # Lo único que queda fuera de la BD es una fila cuyo equipo no está en
        # TEAM_MAPPING; el resto de no-emparejados entran como provisionales.
        "unmatched": len(not_found) - len(new_provisionals),
        "sobrantes": len(sobrantes_ids),
        "deleted": borrados,
        "kept_history": len(con_historial),
        "protected": len(fichados_fuera),
    }

    summary = build_sync_summary(notifications, stats, cold_start=cold_start)
    print(f"-> Resumen: {summary['body']}")

    print(f"6. Guardando {len(notifications) + 1} notificaciones...")
    saved, failed = save_notifications(notifications)
    # En un insert aparte para que su created_at quede por detrás del resto y el
    # resumen encabece la campana (la API corta a las 50 más recientes).
    saved_summary, failed_summary = save_notifications([summary])
    saved += saved_summary
    failed += failed_summary
    print(f"-> {saved} notificaciones guardadas, {failed} descartadas.")

    # La purga de 7 días ya no hace falta: la campana se vacía al empezar cada
    # ejecución, así que nunca quedan avisos de sincronizaciones pasadas.

    print("7. Enviando email resumen...")
    destinatarios = admin_emails()
    if not destinatarios:
        print("-> Sin destinatarios (ni SYNC_SUMMARY_EMAIL ni perfiles admin). Se omite el email.")
    else:
        try:
            import mailer
            # El email lleva el detalle nombre a nombre; el titular ya lo pone
            # el propio asunto, así que la fila 'sync_complete' no va en la lista.
            if mailer.send_summary_email(notifications, stats, destinatarios):
                print(f"-> Email enviado a: {', '.join(destinatarios)}")
            else:
                print("-> El email no se pudo enviar a todos los destinatarios.")
        except Exception as e:
            print(f"-> Error enviando email: {e}")

    print("¡Proceso completado con éxito!")

if __name__ == "__main__":
    main()
