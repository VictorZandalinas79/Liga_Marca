import os
import csv
import re
import difflib
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


def parse_date(date_str):
    if not date_str:
        return ""
    try:
        # Biwenger date format is DD/MM/YYYY
        return datetime.strptime(date_str.strip(), "%d/%m/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return ""


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

    print(f"-> {len(all_api_players)} jugadores en la API.")

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
    notifications = []
    
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
                match_by_date += 1 if bw_date and match.get('date_of_birth') == bw_date else match_by_name + 1

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
                not_found.append(bw)
                notifications.append({
                    "type": "unmatched",
                    "title": "Error de Sincronización",
                    "body": f"Jugador no encontrado en API: {bw_name}",
                    "player_id": None,
                    "player_name": bw_name,
                    "team_id": team_id,
                    "team_name": team_name,
                    "message": f"No encontrado en API. Fecha: {bw_date}, Pos: {bw_pos_raw}"
                })

    print(f"-> Emparejados por Fecha: {match_by_date}")
    print(f"-> Emparejados por Nombre: {match_by_name}")
    print(f"-> No encontrados en la API (Ignorados): {len(not_found)}")
    
    # 4. Updates
    if updates:
        print("4. Actualizando base de datos con los datos de Biwenger...")
        # Supabase update has to be done one by one or via upsert
        for i in range(0, len(updates), 100):
            batch = updates[i:i+100]
            supabase.table("players").upsert(batch).execute()

    # 5. Culling (Deleting non-Biwenger players)
    print("5. Eliminando jugadores sobrantes de la API...")
    to_delete_ids = [p['id'] for p in all_api_players if p['id'] not in matched_api_ids]
    if to_delete_ids:
        print(f"-> Se van a eliminar {len(to_delete_ids)} jugadores sobrantes.")
        for i in range(0, len(to_delete_ids), 100):
            batch_ids = to_delete_ids[i:i+100]
            supabase.table("players").delete().in_("id", batch_ids).execute()
    else:
        print("-> No hay jugadores sobrantes que eliminar.")

    # 6. Notifications
    if notifications:
        print(f"6. Guardando {len(notifications)} notificaciones...")
        supabase.table("sync_notifications").insert(notifications).execute()
        
        print("7. Enviando email resumen...")
        try:
            import mailer
            mailer.send_summary_email()
            print("-> Email enviado correctamente.")
        except Exception as e:
            print(f"-> Error enviando email: {e}")

    print("¡Proceso completado con éxito!")

if __name__ == "__main__":
    main()
