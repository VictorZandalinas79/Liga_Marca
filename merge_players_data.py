import os
import csv
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
    }
    if bw_foto:
        row["photo"] = bw_foto
    # Solo si la migración 013 está aplicada; si no, el prefijo del id basta.
    if "is_provisional" in extra_columns:
        row["is_provisional"] = True
    return row


def find_real_counterpart(prov, api_players):
    """Busca en la API al jugador que ya teníamos como provisional.

    Conservador a propósito: una promoción equivocada movería la plantilla de un
    usuario a otro jugador. Con fecha de nacimiento se exige coincidencia exacta
    de fecha y un parecido mínimo de nombre; sin fecha se exige mismo equipo y
    un nombre casi idéntico.
    """
    prov_name = normalize_name(api_display_name(prov))
    prov_date = prov.get("date_of_birth")

    candidatos = [p for p in api_players if not is_provisional(p) and p["id"] != prov["id"]]

    if prov_date:
        mismos = [p for p in candidatos if p.get("date_of_birth") == prov_date]

        if len(mismos) == 1:
            unico = mismos[0]
            score = difflib.SequenceMatcher(
                None, prov_name, normalize_name(api_display_name(unico))
            ).ratio()
            # Fecha exacta + mismo equipo es lo que el propio cruce principal ya
            # considera concluyente, y aquí hace falta: Biwenger da el nombre
            # largo donde la API usa el apodo ('Yuri Berchiche' -> 'Yuri'), así
            # que exigir parecido de nombre dejaría duplicados para siempre.
            if unico.get("team_id") == prov.get("team_id") or score >= 0.45:
                return unico, score
            return None, score

        # Varias fechas iguales: ahí sí decide el nombre.
        mejor, mejor_score = None, 0.0
        for p in mismos:
            score = difflib.SequenceMatcher(None, prov_name, normalize_name(api_display_name(p))).ratio()
            if score > mejor_score:
                mejor, mejor_score = p, score
        if mejor and mejor_score >= 0.6:
            return mejor, mejor_score
        return None, mejor_score

    mismo_equipo = [p for p in candidatos if p.get("team_id") == prov.get("team_id")]
    mejor, mejor_score = None, 0.0
    for p in mismo_equipo:
        score = difflib.SequenceMatcher(None, prov_name, normalize_name(api_display_name(p))).ratio()
        if score > mejor_score:
            mejor, mejor_score = p, score
    if mejor and mejor_score >= 0.9:
        return mejor, mejor_score
    return None, mejor_score


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


def descartar_por_fecha(candidatos, bw_name, bw_date):
    """Filtra los candidatos de un cruce por nombre usando la fecha de nacimiento.

    Con dos fechas conocidas y distintas casi nunca son la misma persona: así se
    emparejaba 'Miguel Sierra' con 'Miguel Morro' y se le escribía encima el
    precio y la foto. Pero las fuentes discrepan en algunas fechas ('Jon
    Gorrotxategi' es 02/09 en una y 09/02 en la otra, 'Javi Rodríguez' un día),
    y ahí partir al jugador en dos sería peor. La excepción es que el nombre
    normalizado coincida exactamente: eso ya identifica a la persona.
    """
    if not bw_date:
        return candidatos
    objetivo = normalize_name(bw_name)
    return [
        p for p in candidatos
        if not p.get("date_of_birth")
        or p["date_of_birth"] == bw_date
        or normalize_name(api_display_name(p)) == objetivo
    ]


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
    }
    if bw_foto:
        update["photo"] = bw_foto
    return update

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


def build_sync_summary(notifications, stats):
    """Notificación única con el balance del sync, para la campana.

    Los 'unmatched' individuales solo los ve un admin (son ruido para el resto),
    así que sin este resumen un sync con 37 jugadores fuera no dejaba ni un
    aviso visible para el usuario normal.
    """
    counts = {}
    for n in notifications:
        counts[n["type"]] = counts.get(n["type"], 0) + 1

    trozos = []
    for tipo, singular, plural in [
        ("new_player", "jugador nuevo", "jugadores nuevos"),
        ("provisional_player", "alta provisional", "altas provisionales"),
        ("player_promoted", "ficha confirmada", "fichas confirmadas"),
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
        body += f" {stats['deleted']} eliminados por sobrantes."
    if stats.get("protected"):
        body += f" {stats['protected']} sobrantes conservados por estar fichados."

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
            f"Eliminados: {stats.get('deleted', 0)} | Protegidos: {stats.get('protected', 0)}"
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
            
    print("-> Limpiando notificaciones de jugadores no encontrados anteriores...")
    supabase.table("sync_notifications").delete().eq("type", "unmatched").execute()

    # Columnas opcionales que solo existen si la migración 013 está aplicada.
    extra_columns = set(all_api_players[0].keys()) if all_api_players else set()

    provisionales_previos = sum(1 for p in all_api_players if is_provisional(p))
    print(f"-> {len(all_api_players)} jugadores en la BD ({provisionales_previos} provisionales).")

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
    notifications = list(promotion_notifications)
    new_provisionals = []

    match_by_date = 0
    match_by_name = 0
    not_found = []

    print("3. Cruzando datos...")
    
    POS_MAPPING = {
        "DEL": "Forward",
        "MED": "Midfielder",
        "DEF": "Defender",
        "POR": "Goalkeeper"
    }
    
    for bw in biwenger_players:
        team_name = bw.get('Equipo', '').strip()
        bw_name = bw.get('Nombre', '').strip()
        bw_date_raw = bw.get('Fecha_Nacimiento', '').strip()
        bw_date = parse_date(bw_date_raw)
        bw_pos_raw = bw.get('Posicion', '').strip()
        bw_pos = POS_MAPPING.get(bw_pos_raw, bw_pos_raw)
        bw_foto = bw.get('Foto', '').strip()
        
        try:
            bw_precio = int(bw.get('Valor', 0))
        except:
            bw_precio = 0
            
        bw_price = bw_precio * 1000000

        team_id = TEAM_MAPPING.get(team_name)
        if not team_id:
            print(f"  Aviso: Equipo '{team_name}' no mapeado para el jugador {bw_name}.")
            not_found.append(bw)
            # Se queda fuera de la BD igual que un jugador sin match, así que
            # tiene que verse en el panel de admin y no solo en el log.
            notifications.append({
                "type": "unmatched",
                "title": "Error de Sincronización",
                "body": f"Equipo no mapeado: {team_name}",
                "player_id": None,
                "player_name": bw_name,
                "team_id": None,
                "team_name": team_name,
                "message": f"Equipo '{team_name}' no está en TEAM_MAPPING. Fecha: {bw_date}, Pos: {bw_pos_raw}"
            })
            continue

        team_api_players = api_players_by_team.get(team_id, [])
        match = None

        # 1. Match by Date
        if bw_date:
            date_matches = [p for p in team_api_players if p.get('date_of_birth') == bw_date and p['id'] not in matched_api_ids]
            if len(date_matches) == 1:
                match = date_matches[0]
            elif len(date_matches) > 1:
                # Disambiguate by name
                api_names = [p.get('short_name', '') or p.get('first_name', '') + ' ' + p.get('last_name', '') for p in date_matches]
                best_match = difflib.get_close_matches(bw_name, api_names, n=1, cutoff=0.3)
                if best_match:
                    best_name = best_match[0]
                    for p in date_matches:
                        p_name = p.get('short_name', '') or p.get('first_name', '') + ' ' + p.get('last_name', '')
                        if p_name == best_name:
                            match = p
                            break
                if not match:
                    match = date_matches[0]

        # 2. Match by Name (Fallback)
        if not match:
            # let's find by name in the same team among unmatched players
            unmatched_team_players = [p for p in team_api_players if p['id'] not in matched_api_ids]
            # Con dos fechas conocidas y distintas no son la misma persona, por
            # mucho que el nombre se parezca: 'Miguel Sierra' se emparejaba con
            # 'Miguel Morro' (cutoff 0.5) y le escribía encima precio y foto,
            # dejando además al Morro real sin emparejar.
            unmatched_team_players = descartar_por_fecha(unmatched_team_players, bw_name, bw_date)
            api_names = [p.get('short_name', '') or p.get('first_name', '') + ' ' + p.get('last_name', '') for p in unmatched_team_players]
            best_match = difflib.get_close_matches(bw_name, api_names, n=1, cutoff=0.5)
            if best_match:
                best_name = best_match[0]
                for p in unmatched_team_players:
                    p_name = p.get('short_name', '') or p.get('first_name', '') + ' ' + p.get('last_name', '')
                    if p_name == best_name:
                        match = p
                        break
            
            if match:
                match_by_name += 1
        else:
            match_by_date += 1

        if match:
            if match['id'] in matched_api_ids:
                print(f"  Aviso: Jugador {bw_name} saltado porque su match API ya fue asignado.")
                continue
                
            matched_api_ids.add(match['id'])

            # Nuevo en el mercado: la API lo dio de alta pero nunca se había
            # cruzado con Biwenger, así que aún no tiene precio.
            is_new = match.get('precio') is None

            old_pos = match.get('position')
            pos_changed = bool(old_pos) and old_pos != bw_pos and not is_new

            old_photo = match.get('photo')
            photo_changed = (
                bool(bw_foto)
                and bool(old_photo)
                and photo_key(old_photo) != photo_key(bw_foto)
                and not is_new
            )

            if is_new:
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

            # Queue update
            updates.append(build_update(match['id'], team_id, bw_pos, bw_precio, bw_price, bw_foto))
        else:
            # Let's check if the player exists in another team! (Team change)
            all_other_players = [p for p in all_api_players if p['id'] not in matched_api_ids and p.get('team_id') != team_id]
            if bw_date:
                date_matches = [p for p in all_other_players if p.get('date_of_birth') == bw_date]
                if len(date_matches) == 1:
                    p = date_matches[0]
                    p_name = p.get('short_name', '') or p.get('first_name', '') + ' ' + p.get('last_name', '')
                    if difflib.SequenceMatcher(None, bw_name.lower(), p_name.lower()).ratio() > 0.4:
                        match = p
                elif len(date_matches) > 1:
                    api_names = [p.get('short_name', '') or p.get('first_name', '') + ' ' + p.get('last_name', '') for p in date_matches]
                    best_match = difflib.get_close_matches(bw_name, api_names, n=1, cutoff=0.4)
                    if best_match:
                        best_name = best_match[0]
                        for p in date_matches:
                            p_name = p.get('short_name', '') or p.get('first_name', '') + ' ' + p.get('last_name', '')
                            if p_name == best_name:
                                match = p
                                break
            
            if not match:
                # Misma guarda que en el cruce por nombre dentro del equipo.
                all_other_players = descartar_por_fecha(all_other_players, bw_name, bw_date)
                other_names = [p.get('short_name', '') or p.get('first_name', '') + ' ' + p.get('last_name', '') for p in all_other_players]
                best_match = difflib.get_close_matches(bw_name, other_names, n=1, cutoff=0.7)
                if best_match:
                    best_name = best_match[0]
                    for p in all_other_players:
                        p_name = p.get('short_name', '') or p.get('first_name', '') + ' ' + p.get('last_name', '')
                        if p_name == best_name:
                            match = p
                            break
            
            if match:
                if match['id'] in matched_api_ids:
                    print(f"  Aviso: Jugador {bw_name} saltado porque su match API ya fue asignado.")
                    continue
                    
                matched_api_ids.add(match['id'])
                if bw_date and match.get('date_of_birth') == bw_date:
                    match_by_date += 1
                else:
                    match_by_name += 1

                old_team_name = TEAM_NAME_BY_ID.get(match.get('team_id'))
                desde = f" (venía del {old_team_name})" if old_team_name else ""
                notifications.append({
                    "type": "team_changed",
                    "title": "Cambio de Equipo",
                    "body": f"{bw_name} se une al {team_name}{desde}.",
                    "player_id": match['id'],
                    "player_name": bw_name,
                    "team_id": team_id,
                    "team_name": team_name,
                    "message": f"Fichaje: se une al {team_name}"
                })

                updates.append(build_update(match['id'], team_id, bw_pos, bw_precio, bw_price, bw_foto))
            else:
                # La API todavía no tiene a este jugador. Antes se quedaba fuera
                # de la app; ahora entra como provisional con lo de Biwenger y
                # ya se corregirá cuando Opta publique su ficha.
                nuevo = build_provisional_player(
                    bw_name, team_id, bw_pos, bw_precio, bw_price, bw_foto, bw_date, extra_columns
                )
                if nuevo["id"] in matched_api_ids:
                    # Dos filas de Biwenger con el mismo nombre y fecha.
                    print(f"  Aviso: {bw_name} duplicado en el CSV de Biwenger, se ignora la segunda fila.")
                    continue

                new_provisionals.append(nuevo)
                matched_api_ids.add(nuevo["id"])
                not_found.append(bw)
                notifications.append({
                    "type": "provisional_player",
                    "title": "Nuevo Jugador (provisional)",
                    "body": f"{bw_name} ({team_name}) entra como {POS_LABEL.get(bw_pos, bw_pos)} con datos de Biwenger.",
                    "player_id": nuevo["id"],
                    "player_name": bw_name,
                    "team_id": team_id,
                    "team_name": team_name,
                    "message": (
                        f"Alta provisional: aún no está en la API. "
                        f"Fecha: {bw_date}, Pos: {bw_pos_raw}, Precio: {bw_precio}"
                    ),
                })

    print(f"-> Emparejados por Fecha: {match_by_date}")
    print(f"-> Emparejados por Nombre: {match_by_name}")
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

    # 5. Culling (Deleting non-Biwenger players)
    print("5. Eliminando jugadores sobrantes de la API...")
    to_delete_ids = [p['id'] for p in all_api_players if p['id'] not in matched_api_ids]

    # team_players.player_id no es ON DELETE CASCADE: borrar un jugador que
    # alguien tiene fichado reventaría el sync entero. Se deja en la BD y se
    # avisa al admin para que decida.
    protegidos = set()
    if to_delete_ids:
        for i in range(0, len(to_delete_ids), 100):
            lote = to_delete_ids[i:i+100]
            try:
                filas = supabase.table("team_players").select("player_id").in_("player_id", lote).execute().data or []
                protegidos.update(f["player_id"] for f in filas)
            except Exception as e:
                print(f"-> Aviso: no se pudo comprobar team_players ({e}). No se borra nada por precaución.")
                protegidos.update(to_delete_ids)
                break

    if protegidos:
        nombres_por_id = {p["id"]: api_display_name(p) for p in all_api_players}
        print(f"-> {len(protegidos)} sobrantes NO se borran porque están en alguna plantilla:")
        for pid in sorted(protegidos):
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
                "message": "No se ha borrado para no romper las plantillas. Revisar a mano.",
            })

    borrables = [pid for pid in to_delete_ids if pid not in protegidos]
    if borrables:
        print(f"-> Se van a eliminar {len(borrables)} jugadores sobrantes.")
        for i in range(0, len(borrables), 100):
            batch_ids = borrables[i:i+100]
            supabase.table("players").delete().in_("id", batch_ids).execute()
    else:
        print("-> No hay jugadores sobrantes que eliminar.")

    # 6. Notifications
    stats = {
        "biwenger_total": len(biwenger_players),
        "api_total": len(all_api_players),
        "matched": len(matched_api_ids) - len(new_provisionals),
        "provisional": provisionals_saved,
        "promoted": len(promotion_notifications),
        "unmatched": len(not_found) - len(new_provisionals),
        "deleted": len(borrables),
        "protected": len(protegidos),
    }

    summary = build_sync_summary(notifications, stats)
    print(f"-> Resumen: {summary['body']}")

    print(f"6. Guardando {len(notifications) + 1} notificaciones...")
    saved, failed = save_notifications(notifications)
    # En un insert aparte para que su created_at quede por detrás del resto y el
    # resumen encabece la campana (la API corta a las 50 más recientes).
    saved_summary, failed_summary = save_notifications([summary])
    saved += saved_summary
    failed += failed_summary
    print(f"-> {saved} notificaciones guardadas, {failed} descartadas.")

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
