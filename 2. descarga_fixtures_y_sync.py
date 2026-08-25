#!/usr/bin/env python3
"""
Descarga fixtures y squads desde la API, y sincroniza DIRECTO con Supabase:
1. Descarga fixtures y squads desde performfeeds API en memoria.
2. Sube fixtures a la tabla 'fixtures'.
3. Sube los equipos a la tabla 'real_teams'.
4. Procesa el CSV jugadores_optimizados.csv y hace matching con la data en memoria.
5. Sube jugadores con precio_normalizado y foto a la tabla 'players'.
* NO guarda archivos JSON locales *
"""

import os
import json
import csv
import unicodedata
from difflib import SequenceMatcher
import requests
import time
from datetime import datetime
from supabase import create_client, Client
from pathlib import Path
from dotenv import load_dotenv
from difflib import SequenceMatcher
from deep_translator import GoogleTranslator

from mailer import send_email_real, render_template

load_dotenv()

# Cargar configuración
with open('settings.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

# ID de liga configurado por el usuario
ACTIVE_LEAGUE_ID = config['active_league']['id']
LEAGUE_NAME = config['active_league']['name']
SEASON_NAME = config['active_league']['season_name']
SEASON_ID = config['active_league'].get('season_id')

# Credenciales API
SDAPI_OUTLET_KEY = os.environ.get("SDAPI_OUTLET_KEY", "ft1tiv1inq7v1sk3y9tv12yh5")

# Supabase
def _clean_env(value):
    """Quita espacios y comillas envolventes que se cuelan al pegar secrets."""
    if value is None:
        return None
    return value.strip().strip('"').strip("'").strip()

SUPABASE_URL = _clean_env(os.environ.get("SUPABASE_URL"))
SUPABASE_KEY = _clean_env(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY"))
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

accumulated_notifications = []


def save_notifications(notifications: list):
    """Inserta notificaciones de cambios en sync_notifications."""
    if not notifications:
        return
    
    global accumulated_notifications
    accumulated_notifications.extend(notifications)

    try:
        supabase.table("sync_notifications").insert(notifications).execute()
        print(f"🔔 {len(notifications)} notificación(es) guardada(s)")
    except Exception as e:
        # Si el lote falla (p. ej. un tipo nuevo cuya migración aún no se aplicó),
        # insertamos una a una para no perder las notificaciones válidas.
        print(f"⚠️ Insert en lote falló ({e}); reintentando una a una...")
        ok = 0
        for n in notifications:
            try:
                supabase.table("sync_notifications").insert(n).execute()
                ok += 1
            except Exception as e2:
                print(f"   ⚠️ No se pudo guardar notificación {n.get('type')}: {e2}")
        print(f"🔔 {ok}/{len(notifications)} notificación(es) guardada(s)")


def purge_previous_notifications():
    """Vacía la campana antes de escribir las novedades de esta ejecución.

    La campana enseña lo que ha cambiado en la sincronización en curso, no un
    histórico: acumular semanas hacía que el límite de la API se llenara de
    avisos repetidos y dejara fuera lo importante (un fichaje quedaba enterrado
    bajo 50 'nuevo jugador' de la pasada anterior).

    Se limpia aquí, al arrancar API Core, porque el workflow de Biwenger se
    encadena a este: así los avisos de los dos scripts son los de la misma
    cadena. Si Biwenger se lanza suelto, merge_players_data.py hace su propia
    limpieza contra el último resumen.
    """
    try:
        ahora = datetime.now().astimezone().isoformat()
        res = supabase.table("sync_notifications").delete().lt("created_at", ahora).execute()
        print(f"🧹 Campana vaciada: {len(res.data or [])} aviso(s) de ejecuciones anteriores eliminados.")
    except Exception as e:
        print(f"⚠️ No se pudieron borrar las notificaciones anteriores: {e}")


def send_sync_summary_emails():
    """Consolida las notificaciones acumuladas durante la sincronización y envía un email resumen."""
    global accumulated_notifications
    if not accumulated_notifications:
        print("ℹ️ No hay notificaciones acumuladas para enviar por correo.")
        return

    # Separar por tipo para presentarlo ordenado y claro
    fixture_changes = []
    new_players = []
    other_notifs = []

    for n in accumulated_notifications:
        ntype = n.get("type")
        body = n.get("body", "")
        if ntype in ("fixture_changed", "players_locked"):
            fixture_changes.append(body)
        elif ntype == "new_player":
            new_players.append(body)
        else:
            other_notifs.append(body)

    if not fixture_changes and not new_players and not other_notifs:
        return

    # Construir cuerpo HTML del correo
    html_content = "<h2>Novedades de la Liga Marca 📢</h2>"
    html_content += "<p>Se ha realizado la sincronización semanal del sistema y se han detectado los siguientes cambios:</p>"

    if fixture_changes:
        html_content += """
        <div class="card">
            <h3 style="color: #1e3a8a; margin-top: 0; margin-bottom: 10px;">📅 Horarios y Bloqueos de Partidos</h3>
            <ul>
        """
        for item in fixture_changes:
            html_content += f"<li>{item}</li>"
        html_content += "</ul></div>"

    if new_players:
        html_content += """
        <div class="card" style="margin-top: 20px;">
            <h3 style="color: #1e3a8a; margin-top: 0; margin-bottom: 10px;">⚽ Nuevos Jugadores en el Mercado</h3>
            <ul>
        """
        for item in new_players:
            html_content += f"<li>{item}</li>"
        html_content += "</ul></div>"

    if other_notifs:
        html_content += """
        <div class="card" style="margin-top: 20px;">
            <h3 style="color: #1e3a8a; margin-top: 0; margin-bottom: 10px;">🔔 Otras Actualizaciones</h3>
            <ul>
        """
        for item in other_notifs:
            html_content += f"<li>{item}</li>"
        html_content += "</ul></div>"

    html_content += "<p style='margin-top: 20px;'>Para más detalles o para ajustar tu plantilla, accede a la web de la Liga Marca.</p>"

    # Obtener perfiles de usuarios registrados
    try:
        profiles_resp = supabase.table("profiles").select("email, full_name").execute()
        profiles = profiles_resp.data or []
    except Exception as e:
        print(f"⚠️ No se pudieron obtener los perfiles de la base de datos para enviar correos: {e}")
        return

    sent_count = 0
    for p in profiles:
        email = p.get("email")
        if not email:
            continue
        name = p.get("full_name") or email.split("@")[0]
        
        # Renderizar la plantilla base con el cuerpo personalizado
        context = {
            "name": name,
            "body_html": html_content,
            "app_url": "http://localhost:3000" # Ajustar a la URL de prod cuando se despliegue
        }
        final_html = render_template("", context)
        subject = "Novedades de la Liga Marca 🏆"
        
        if send_email_real(email, subject, final_html):
            sent_count += 1
            
    print(f"📧 Se enviaron {sent_count} correos de resumen de sincronización.")


def _parse_ts(s):
    try:
        return datetime.fromisoformat((s or "").replace("Z", ""))
    except Exception:
        return None


def detect_out_of_order(fixtures_payload):
    """Detecta partidos cuyo matchday NO coincide con su hueco cronológico real.

    Mismo algoritmo que el frontend (locked-teams.ts): el tiempo representativo
    de cada jornada es la mediana de sus start_time (robusta a un outlier), y el
    hueco cronológico de un partido es la jornada cuya mediana queda más cerca.

    Devuelve dict fixture_id -> (tipo, matchday), donde tipo es:
      'delayed'  -> pertenece a una jornada anterior pero se juega más tarde
      'advanced' -> pertenece a una jornada posterior pero se juega antes
    """
    rows = []
    for f in fixtures_payload:
        md = f.get("matchday")
        st = _parse_ts(f.get("start_time", ""))
        if md and md > 0 and st:
            rows.append((f["id"], md, st))
    if not rows:
        return {}

    by_md = {}
    for _, md, st in rows:
        by_md.setdefault(md, []).append(st)

    rep = {}
    for md, times in by_md.items():
        times.sort()
        rep[md] = times[len(times) // 2]

    # Umbral de 5 días en segundos (5 * 24 * 60 * 60 = 432000 segundos)
    OUT_OF_ORDER_THRESHOLD_SECS = 5 * 24 * 60 * 60

    def slot_for(t, ownMatchday):
        own_rep = rep.get(ownMatchday)
        if own_rep and abs((t - own_rep).total_seconds()) <= OUT_OF_ORDER_THRESHOLD_SECS:
            return ownMatchday
        
        closest_md = ownMatchday
        min_diff = float('inf')
        for md, r_val in rep.items():
            if md == ownMatchday:
                continue
            diff = abs((t - r_val).total_seconds())
            if diff < min_diff:
                min_diff = diff
                closest_md = md
        return closest_md

    result = {}
    for fid, md, st in rows:
        slot = slot_for(st, md)
        if slot != md:
            result[fid] = ("delayed" if md < slot else "advanced", md)
    return result


def load_headers():
    """Carga headers desde headers/headers.json si existe."""
    headers_path = Path('headers/headers.json')
    if headers_path.exists():
        try:
            with open(headers_path, 'r', encoding='utf-8') as f:
                headers = json.load(f)
            headers = {k: v for k, v in headers.items() if not k.startswith(':')}
            for k in ['Host', 'Authority', 'authority', 'host']:
                headers.pop(k, None)
            return headers
        except Exception as e:
            print(f"⚠️ Error al cargar headers: {e}")

    return {
        'Referer': 'https://www.scoresway.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

def get_season_id(league_id: str) -> str | None:
    """Obtiene el ID de la temporada actual para una liga."""
    url = "https://api.performfeeds.com/soccerdata/competitions/"
    url += f"{SDAPI_OUTLET_KEY}/?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"

    headers = load_headers()

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        content = response.text

        start_idx = content.find('{')
        end_idx = content.rfind('}')
        if start_idx == -1 or end_idx == -1:
            return None

        data = json.loads(content[start_idx:end_idx + 1])
        competitions = data.get('competition', [])

        for comp in competitions:
            if comp.get('id') == league_id:
                return comp.get('currentSeason', {}).get('id') or comp.get('seasons', [{}])[0].get('id')

        for comp in competitions:
            if LEAGUE_NAME.lower() in comp.get('name', '').lower():
                seasons = comp.get('seasons', [])
                if seasons:
                    for s in seasons:
                        if SEASON_NAME in s.get('name', ''):
                            return s.get('id')
        return None
    except Exception as e:
        print(f"⚠️ Error al obtener ID de temporada: {e}")
        return None

def descargar_fixtures(season_id: str):
    """Descarga los fixtures y los devuelve en memoria."""
    print(f"\n📥 Descargando fixtures de API (en memoria) para: {LEAGUE_NAME} ({SEASON_NAME})")
    print(f"   ID Temporada (tmcl): {season_id}")

    url = (
        f"https://api.performfeeds.com/soccerdata/match/"
        f"{SDAPI_OUTLET_KEY}/"
        f"?_fmt=jsonp&_rt=c&tmcl={season_id}&live=yes&_pgSz=400&_lcl=en"
        f"&sps=widgets&_clbk=callback"
    )

    headers = load_headers()

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        content = response.text

        start_idx = content.find('{')
        end_idx = content.rfind('}')

        if start_idx == -1 or end_idx == -1:
            print("❌ Respuesta malformada (no se halló JSON)")
            return False, []

        clean_json = content[start_idx:end_idx + 1]
        data = json.loads(clean_json)

        matches = data.get('match', [])

        if not matches:
            print("⚠️ No se encontraron partidos en la respuesta de la API")
            return False, []

        print(f"✅ ÉXITO: {len(matches)} partidos obtenidos en memoria")
        return True, matches

    except Exception as e:
        print(f"❌ Error: {e}")
        return False, []

def descargar_squads(season_id: str):
    """Descarga los planteles y los devuelve en memoria."""
    print(f"\n👥 Descargando squads de API (en memoria) para: {LEAGUE_NAME} ({SEASON_NAME})")

    headers = load_headers()
    
    base_url = (
        f"https://api.performfeeds.com/soccerdata/squads/"
        f"{SDAPI_OUTLET_KEY}/"
        f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback"
        f"&tmcl={season_id}"
        f"&detailed=yes"
    )

    page = 1
    page_size = 100
    all_squads_data = []

    while True:
        url = f"{base_url}&_pgSz={page_size}&_pgNm={page}"
        print(f"   🔄 Extrayendo página {page}...")

        try:
            response = requests.get(url, headers=headers, timeout=15)
            content = response.text
            start_idx = content.find('{')
            end_idx = content.rfind('}')

            if start_idx == -1 or end_idx == -1:
                print("   ❌ Error JSONP")
                break

            data = json.loads(content[start_idx:end_idx + 1])

            items = []
            for key in ['squad', 'person', 'contestant', 'teams']:
                if key in data:
                    items = data[key]
                    print(f"      -> Lista de equipos encontrada ('{key}')")
                    break

            if not items:
                print(f"   ⚠️ No se encontró lista de equipos en esta página.")
                break

            for item in items:
                team_name = "Unknown"
                team_id = None
                contestant_obj = {}

                # Buscar datos del equipo
                if 'contestant' in item and isinstance(item['contestant'], dict):
                    team_name = item['contestant'].get('name', 'Unknown')
                    team_id = item['contestant'].get('id')
                    contestant_obj = item['contestant']
                elif 'contestantName' in item:
                    team_name = item.get('contestantName')
                    team_id = item.get('contestantId')
                    contestant_obj = {'id': team_id, 'name': team_name}
                elif 'name' in item and 'id' in item:
                    team_name = item.get('name')
                    team_id = item.get('id')
                    contestant_obj = {'id': team_id, 'name': team_name}
                elif 'description' in item:
                    team_name = item.get('description')
                    team_id = item.get('id', 'no_id')
                    contestant_obj = {'id': team_id, 'name': team_name}

                # Buscar jugadores del equipo
                players = []
                player_key_found = None
                for key in ['player', 'players', 'squad', 'person', 'athlete']:
                    if key in item and isinstance(item[key], list):
                        players = item[key]
                        player_key_found = key
                        break

                if team_id and team_name != 'Unknown':
                    if not players and team_name != 'Unknown':
                        print(f"      ⚠️  {team_name}: sin jugadores. Claves disponibles: {[k for k in item.keys() if k not in ('contestant',)]}")
                    else:
                        print(f"      ✅  {team_name}: {len(players)} jugadores (clave='{player_key_found}')")
                    team_data = {"team": contestant_obj, "players": players}
                    all_squads_data.append(team_data)

            if len(items) < page_size:
                break

            page += 1
            time.sleep(0.5)

        except Exception as e:
            print(f"   ❌ Error procesando página {page}: {e}")
            break

    print(f"✅ ÉXITO: {len(all_squads_data)} squads obtenidos en memoria")
    return len(all_squads_data) > 0, all_squads_data

# Estados de Opta -> vocabulario propio de la tabla `fixtures`.
OPTA_STATUS_MAP = {
    "fixture": "scheduled",
    "playing": "live",
    "played": "finished",
    "postponed": "postponed",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "abandoned": "cancelled",
    "suspended": "postponed",
}

# Estados que NUNCA deben retroceder a 'scheduled' en un upsert de calendario:
# los escribe el motor de directo (trigger_descarga_eventos.py) y son la única
# señal que tiene la página Partidos para saber que hay partido en juego.
PROTECTED_STATUSES = {"live", "finished"}


def normalize_status(raw):
    """Traduce el estado de Opta. Si no viene o no se reconoce, 'scheduled'."""
    if not raw:
        return "scheduled"
    return OPTA_STATUS_MAP.get(str(raw).strip().lower(), "scheduled")


def upload_fixtures_to_supabase(matches):
    """Sube los fixtures a la tabla fixtures de Supabase."""
    print(f"\n📤 Subiendo fixtures a Supabase (tabla 'fixtures')...")

    fixtures_payload = []
    fixture_display_names = {}  # fixture_id -> "Home vs Away" para notificaciones
    for m in matches:
        info = m.get('matchInfo', {})
        comp_id = info.get('competition', {}).get('id')

        if comp_id != ACTIVE_LEAGUE_ID:
            continue

        start_date = info.get('date', '').replace('Z', '')
        start_time = info.get('time', '').replace('Z', '')
        if not start_time:
            start_time = '00:00:00'
        full_timestamp = f"{start_date}T{start_time}"

        contestants = info.get('contestant', [{}, {}])
        fixture_id = info.get('id')

        if fixture_id:
            home = (contestants[0].get('shortName') or contestants[0].get('name', '?')) if len(contestants) > 0 else '?'
            away = (contestants[1].get('shortName') or contestants[1].get('name', '?')) if len(contestants) > 1 else '?'
            fixture_display_names[fixture_id] = f"{home} vs {away}"

        # Capturamos el matchday (0 por defecto si no existe)
        raw_week = info.get('week')
        matchday = int(raw_week) if raw_week else 0

        fixtures_payload.append({
            "id": fixture_id,
            "matchday": matchday,
            "momento": info.get('stage', {}).get('name'),
            "home_team_id": contestants[0].get('id') if len(contestants) > 0 else None,
            "away_team_id": contestants[1].get('id') if len(contestants) > 1 else None,
            "start_time": full_timestamp,
            "status": normalize_status(info.get('status'))
        })

    if not fixtures_payload:
        print(f"⚠️ No hay fixtures para subir de la liga {ACTIVE_LEAGUE_ID}")
        return False

    # --- NUEVA LÓGICA: Corregir matchday = 0 ---
    # 1. Encontrar la jornada máxima actual
    max_matchday = max([f['matchday'] for f in fixtures_payload if f['matchday'] and f['matchday'] > 0], default=0)

    # 2. Filtrar los partidos que tienen matchday 0
    zero_matchdays = [f for f in fixtures_payload if not f['matchday'] or f['matchday'] == 0]

    if zero_matchdays:
        # Diccionario para guardar la fecha más temprana de cada "momento"
        momento_dates = {}
        for f in zero_matchdays:
            momento = f['momento'] or "Fase Desconocida"
            f['momento'] = momento # Asegurarnos de que no sea None
            
            # Formato YYYY-MM-DDTHH:MM:SS es perfectamente ordenable por string
            if momento not in momento_dates or f['start_time'] < momento_dates[momento]:
                momento_dates[momento] = f['start_time']

        # 3. Ordenar los momentos cronológicamente según su fecha de inicio más temprana
        sorted_momentos = sorted(momento_dates.keys(), key=lambda m: momento_dates[m])

        # 4. Crear un mapa para asignar el nuevo matchday a cada momento
        momento_to_matchday = {}
        current_new_matchday = max_matchday + 1
        for momento in sorted_momentos:
            momento_to_matchday[momento] = current_new_matchday
            current_new_matchday += 1

        # 5. Aplicar los nuevos matchdays al payload final
        for f in fixtures_payload:
            if not f['matchday'] or f['matchday'] == 0:
                f['matchday'] = momento_to_matchday[f['momento']]
                
        print(f"   🔄 Se asignaron jornadas {max_matchday + 1} a {current_new_matchday - 1} a fases eliminatorias.")
    # --- FIN NUEVA LÓGICA ---

    # Detectar cambios de horario antes del upsert
    try:
        existing_resp = supabase.table("fixtures").select("id,start_time,status").execute()
        existing_map = {r['id']: r['start_time'] for r in (existing_resp.data or [])}
        existing_status = {r['id']: (r.get('status') or '') for r in (existing_resp.data or [])}
    except Exception:
        existing_map = {}
        existing_status = {}

    # No pisar el estado del directo. Este upsert corre cada 2 días sobre TODO
    # el calendario y el feed de calendario no trae `status`, así que devolvía
    # todos los partidos a 'scheduled': los que el motor de directo había
    # marcado 'live' o 'finished' perdían el estado y la página Partidos no
    # llegaba a ver nunca un partido en juego.
    for f in fixtures_payload:
        prev = existing_status.get(f.get('id'))
        if prev in PROTECTED_STATUSES and f['status'] == 'scheduled':
            f['status'] = prev

    # Partidos que quedan fuera del orden de su jornada (aplazados/adelantados).
    out_of_order = detect_out_of_order(fixtures_payload)

    schedule_notifications = []
    for f in fixtures_payload:
        fid = f.get('id')
        old_time = existing_map.get(fid)
        new_time = f.get('start_time', '')
        if old_time and new_time:
            display = fixture_display_names.get(fid, fid)
            old_fmt = old_time[:16].replace('T', ' ')
            new_fmt = new_time[:16].replace('T', ' ')
            if old_fmt != new_fmt:
                schedule_notifications.append({
                    "type": "fixture_changed",
                    "title": "Cambio de horario",
                    "body": f"{display}: {old_fmt} → {new_fmt}"
                })
                # Si el nuevo horario deja el partido fuera de su jornada, los
                # jugadores de ambos equipos quedan bloqueados: avisamos en la campana.
                if fid in out_of_order:
                    tipo, md = out_of_order[fid]
                    motivo = ("aplazado a una jornada posterior" if tipo == "delayed"
                              else "adelantado a una jornada anterior")
                    schedule_notifications.append({
                        "type": "players_locked",
                        "title": "Jugadores bloqueados",
                        "body": (f"{display}: partido de la J{md} {motivo}. "
                                 f"Sus jugadores quedan bloqueados hasta que se resuelva.")
                    })

    # Subir a Supabase
    try:
        # Usamos UPSERT: Actualiza la fecha/jornada si ya existe, y crea si es nuevo.
        result = supabase.table("fixtures").upsert(fixtures_payload).execute()
        print(f"✅ {len(fixtures_payload)} fixtures actualizados/insertados en Supabase")
        save_notifications(schedule_notifications)
        return True
    except Exception as e:
        print(f"❌ Error insertando los nuevos fixtures: {e}")
        return False


def upload_teams_to_supabase(squads_data):
    """Sube los equipos a la tabla real_teams de Supabase con su escudo."""
    print(f"\n📤 Subiendo equipos a Supabase (tabla 'real_teams')...")

    teams_payload = []
    for squad in squads_data:
        team_info = squad.get('team', {})
        team_id = team_info.get('id')
        team_name = team_info.get('name', '')

        if not team_id:
            continue

        badge_url = f"https://omo.akamai.opta.net/image.php?secure=true&h=omo.akamai.opta.net&sport=football&entity=team&description=badges&dimensions=150&id={team_id}"

        teams_payload.append({
            "id": team_id,
            "name": team_name,
            "logo_url": badge_url
        })

    if teams_payload:
        result = supabase.table("real_teams").upsert(teams_payload).execute()
        print(f"✅ {len(teams_payload)} equipos subidos a real_teams")
        return True
    else:
        print(f"⚠️ No hay equipos para subir")
        return False


# --- Lógica de procesamiento CSV para Jugadores ---

def load_csv_players():
    """Carga jugadores del CSV agrupados por equipo."""
    players_by_team = {}
    csv_path = Path('jugadores_optimizados.csv')

    if not csv_path.exists():
        print(f"❌ No se encontró el archivo {csv_path}")
        return {}

    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            team = row['Equipo']
            if team not in players_by_team:
                players_by_team[team] = []
            players_by_team[team].append(row)

    return players_by_team

def normalize_name(name):
    if not name: return ""
    # Convertir guiones en espacios ANTES de limpiar (Heung-Min -> Heung Min)
    name = name.replace('-', ' ')
    # Quitar tildes y caracteres internacionales
    name = unicodedata.normalize('NFKD', name).encode('ASCII', 'ignore').decode('utf-8')
    name = name.lower()
    # Dejar solo letras, números y espacios
    name = ''.join(c for c in name if c.isalnum() or c.isspace())
    return ' '.join(name.split()).strip()

def similarity_score(s1, s2):
    return SequenceMatcher(None, normalize_name(s1), normalize_name(s2)).ratio()

def translate_to_english(text):
    """Traduce automáticamente cualquier idioma al inglés."""
    if not text: return ""
    try:
        return GoogleTranslator(source='auto', target='en').translate(text)
    except Exception as e:
        print(f"   ⚠️ Falló la traducción para '{text}': {e}")
        return text # Si falla internet, devuelve el original

def find_team_match(json_team_name, csv_teams):
    translated_json_name = translate_to_english(json_team_name)
    norm_json = normalize_name(translated_json_name)

    # Diccionario de equivalencias internacionales (Inglés API -> Español CSV)
    ALIASES = {
        "algeria": ["argelia"],
        "bosniaherzegovina": ["bosnia", "bosnia y herzegovina"],
        "brazil": ["brasil"],
        "cape verde": ["cabo verde"],
        "cabo verde": ["cape verde"], 
        "cote divoire": ["costa de marfil", "ivory coast"],
        "ivory coast": ["costa de marfil", "cote divoire"],
        "egypt": ["egipto"],
        "iraq": ["irak"],
        "japan": ["japon"],
        "jordan": ["jordania"],
        "korea republic": ["corea del sur", "corea", "south korea"],
        "south korea": ["corea del sur", "corea", "korea republic"],
        "morocco": ["marruecos"],
        "netherlands": ["paises bajos", "holanda"],
        "saudi arabia": ["arabia saudi", "arabia saudita"],
        "scotland": ["escocia"],
        "south africa": ["sudafrica"],
        "spain": ["espana"],
        "united states": ["usa", "estados unidos"],
        "czechia": ["republica checa", "czech republic", "chequia"],
        "czech republic": ["republica checa", "czechia"]
    }

    json_words = set(norm_json.split())

    # 1. Búsqueda por diccionario de países
    for csv_team in csv_teams:
        norm_csv = normalize_name(csv_team)
        if norm_json in ALIASES and norm_csv in ALIASES[norm_json]:
            return csv_team, 1.0

    # 2. Contención exacta
    for csv_team in csv_teams:
        norm_csv = normalize_name(csv_team)
        csv_words = set(norm_csv.split())
        
        if not csv_words or (len(csv_words) == 1 and list(csv_words)[0] in ['fc', 'cd', 'ud', 'real']):
            continue
            
        if csv_words.issubset(json_words) or json_words.issubset(csv_words):
            return csv_team, 1.0

    # 3. Fallback: Similitud
    best_match, best_score = None, 0.0
    for csv_team in csv_teams:
        norm_csv = normalize_name(csv_team)
        score = SequenceMatcher(None, norm_json, norm_csv).ratio()
        if score > best_score:
            best_score = score
            best_match = csv_team
            
    # UMBRAL SUBIDO A 0.75: Evita falsos positivos como enlazar Egypt con Getafe
    if best_score > 0.75: 
        return best_match, best_score
        
    return None, best_score

# --------------------------------------------------------------------------
# Quién entra en la tabla players
#
# La lista de Biwenger es el mercado del juego: un jugador que solo está en la
# API de Opta (reservas, canteranos, fichas que Biwenger no publica) NO se da de
# alta aquí. Antes se subían los ~590 de Opta y merge_players_data.py borraba
# los ~60 que Biwenger no lista, así que la siguiente pasada los volvía a crear
# y los anunciaba otra vez: un ciclo perpetuo de altas y borrados.
#
# Este script solo mantiene actualizados a los jugadores que YA están en la BD
# (los puso Biwenger a través del merge) y admite una alta nueva únicamente
# cuando viene a confirmar un alta provisional 'bw-', es decir, cuando Biwenger
# ya había dado de alta al jugador y Opta acaba de publicar su ficha. De ese
# emparejamiento se encarga después promote_provisional_players() en el merge,
# que traspasa plantilla e historial al id de Opta y borra la fila provisional.
#
# Excepción: si la tabla está vacía (reset_players.py) entran todos, porque si
# no la BD se quedaría sin ningún id de Opta con el que emparejar.
# --------------------------------------------------------------------------
PROVISIONAL_PREFIX = "bw-"

# Mismo umbral que NAME_ONLY_MIN en merge_players_data.py: por debajo de 0.90 se
# emparejaban jugadores distintos del mismo equipo ('Miguel Sierra' con 'Miguel
# Morro'), y aquí una confirmación equivocada daría de alta a un jugador que
# Biwenger no lista.
PROVISIONAL_NAME_MIN = 0.90


def matching_provisional(api_player, provisionals_by_team):
    """El alta provisional que este jugador de la API viene a confirmar, o None.

    Misma regla que el merge: mismo equipo y fecha de nacimiento exacta, y el
    nombre solo para desempatar o cuando no hay fecha que respalde nada.
    """
    candidatos = provisionals_by_team.get(api_player.get('team_id')) or []
    if not candidatos:
        return None

    dob = api_player.get('date_of_birth')
    if dob:
        por_fecha = [p for p in candidatos if p.get('date_of_birth') == dob]
        if len(por_fecha) == 1:
            # Equipo + fecha exacta ya identifica a la persona. El nombre no
            # puede vetar: Biwenger pone el nombre largo donde Opta usa el apodo
            # ('Yuri Berchiche' / 'Yuri').
            return por_fecha[0]
        if por_fecha:
            candidatos = por_fecha

    nombre = api_player.get('short_name') or ''
    mejor, mejor_score = None, 0.0
    for p in candidatos:
        score = similarity_score(nombre, p.get('short_name') or '')
        if score > mejor_score:
            mejor, mejor_score = p, score

    return mejor if mejor and mejor_score >= PROVISIONAL_NAME_MIN else None


def find_player_match_reversed(csv_player_row, indexed_api_players):
    csv_name = normalize_name(csv_player_row.get('Nombre', ''))
    if not csv_name:
        return None, 0.0, None

    csv_words = set(csv_name.split())
    csv_w_list = csv_name.split()

    # Colectamos todos los candidatos para elegir el mejor al final,
    # evitando falsos positivos por primer match greedy (ej: "alex" matchea
    # al primer jugador con "alex" en el nombre en lugar del correcto).
    candidates = []  # (score, full_name_sim, player, display_name)

    for p in indexed_api_players:
        match_name = normalize_name(p.get('matchName', ''))
        first_name = normalize_name(p.get('firstName', ''))
        last_name = normalize_name(p.get('lastName', ''))
        full_api = normalize_name(f"{first_name} {last_name}".strip())

        # Mapeo de apodos conocidos de la API
        PLAYER_ALIASES = {
            "alejandro sebastian romero gamarra": "kaku",
            "mostafa mohamed zaki abdelraouf": "zico",
        }
        if full_api in PLAYER_ALIASES:
            match_name = PLAYER_ALIASES[full_api]

        api_names = [match_name, full_api, last_name]
        api_names = [n for n in api_names if n]

        # Nombre representativo para el debug en el TXT
        display_name = p.get('matchName') or f"{p.get('firstName')} {p.get('lastName')}".strip()

        # 1. Match Exacto: retorno inmediato, no hay ambigüedad posible
        if csv_name in api_names:
            return p, 1.0, display_name

        best_score_for_p = 0.0

        # Tokens de todos los nombres API del jugador (calculado una vez)
        all_api_tokens = set()
        for an in api_names:
            all_api_tokens.update(an.split())

        # ✅ Una sola palabra del CSV: token exacto, fuzzy, o prefijo en cualquier nombre de la API
        # Cubre "Martinelli"→"Gabriel Martinelli", "Kadesh"→"Kadish", "Abde"→"Abdessamad"
        if len(csv_words) == 1:
            csv_word = csv_w_list[0]
            if len(csv_word) >= 4:
                if csv_word in all_api_tokens:
                    best_score_for_p = max(best_score_for_p, 0.88)
                else:
                    for api_token in all_api_tokens:
                        # Fuzzy (Kadesh/Kadish, Younis/Younus)
                        if len(api_token) >= 4 and SequenceMatcher(None, csv_word, api_token).ratio() >= 0.82:
                            best_score_for_p = max(best_score_for_p, 0.82)
                            break
                    for api_token in all_api_tokens:
                        # Prefijo (Abde → Abdessamad)
                        if len(api_token) >= 5 and api_token.startswith(csv_word):
                            best_score_for_p = max(best_score_for_p, 0.80)
                            break

        for api_name in api_names:
            api_words = set(api_name.split())
            api_w_list = api_name.split()

            # 2. Contención total
            if csv_words.issubset(api_words):
                if len(csv_words) >= 2 or (len(csv_words) == 1 and len(csv_w_list[0]) >= 3):
                    best_score_for_p = max(best_score_for_p, 0.95)

            # 3. Intersección de palabras
            intersection = csv_words.intersection(api_words)
            if len(intersection) >= 2:
                best_score_for_p = max(best_score_for_p, 0.90)

            # 4. Palabra clave única (>= 4 letras) y misma inicial
            if len(intersection) == 1:
                match_word = list(intersection)[0]
                if len(match_word) >= 4 and len(api_w_list) > 0 and len(csv_w_list) > 0:
                    if csv_w_list[0][0] == api_w_list[0][0]:
                        best_score_for_p = max(best_score_for_p, 0.85)

            # 5. Inicial y apellido coincidente
            if len(api_w_list) >= 2 and len(csv_w_list) >= 2:
                if csv_w_list[0][0] == api_w_list[0][0] and csv_w_list[-1] == api_w_list[-1]:
                    best_score_for_p = max(best_score_for_p, 0.85)

            # 5b. Orden inverso (convención asiática: API guarda Apellido-Nombre, CSV Nombre-Apellido)
            # "In-beom Hwang" (CSV) vs "Hwang Inbeom" (API)
            if len(csv_w_list) >= 2 and len(api_w_list) >= 2:
                if csv_w_list[-1] == api_w_list[0]:
                    csv_given = "".join(csv_w_list[:-1])
                    api_given = "".join(api_w_list[1:])
                    if SequenceMatcher(None, csv_given, api_given).ratio() >= 0.75:
                        best_score_for_p = max(best_score_for_p, 0.87)

            # 6. Ratios de similitud
            sorted_api = " ".join(sorted(api_w_list))
            sorted_csv = " ".join(sorted(csv_w_list))
            score_sorted = SequenceMatcher(None, sorted_api, sorted_csv).ratio()
            score_normal = SequenceMatcher(None, api_name, csv_name).ratio()
            best_score_for_p = max(best_score_for_p, score_sorted, score_normal)

        if best_score_for_p > 0:
            # Similitud del nombre completo como desempate entre candidatos con igual score
            full_name_sim = SequenceMatcher(None, csv_name, full_api).ratio()
            candidates.append((best_score_for_p, full_name_sim, p, display_name))

    if not candidates:
        return None, 0.0, None

    # Ordenar: mejor score primero, desempate por similitud nombre completo
    candidates.sort(key=lambda x: (-x[0], -x[1]))
    best_score, _, best_match, best_candidate_name = candidates[0]

    if best_score > 0.65:
        return best_match, best_score, best_candidate_name

    return None, best_score, best_candidate_name

def sync_players_with_csv(squads_data):
    """Actualiza con datos de la API a los jugadores del mercado, y usa el CSV
    solo para agregar foto y precio. Quién entra en la tabla lo dicta Biwenger:
    ver el comentario de matching_provisional()."""
    print(f"\n🔗 Sincronizando jugadores (Biwenger dicta quién entra, la API pone la ficha)...")

    csv_players_by_team = load_csv_players()
    csv_teams = list(csv_players_by_team.keys()) if csv_players_by_team else []

    if not csv_players_by_team:
        print("⚠️ No se encontró CSV o está vacío. Se subirán todos los jugadores de la API sin foto ni precio.")

    # 1. Mapear los equipos de la API con los del CSV
    csv_to_api_team_map = {}
    for squad in squads_data:
        team_info = squad.get('team', {})
        api_team_id = team_info.get('id')
        api_team_name = team_info.get('name', '')
        
        if not api_team_id: continue
        
        if csv_teams:
            csv_team_name, _ = find_team_match(api_team_name, csv_teams)
            if csv_team_name:
                csv_to_api_team_map[csv_team_name] = {
                    "team_id": api_team_id,
                    "players": squad.get('players', [])
                }

    # 2. Hacer los matches previamente y guardar la relación: API_ID -> DATOS_DEL_CSV
    # Reutilizamos tu función inteligente de match sin perder calidad.
    api_id_to_csv_data = {}
    
    for csv_team_name, csv_players_list in csv_players_by_team.items():
        api_team_data = csv_to_api_team_map.get(csv_team_name)
        if not api_team_data:
            continue

        api_players_pool = [p for p in api_team_data["players"] if p.get('type') == 'player']

        for csv_player in csv_players_list:
            matched_api, score, _ = find_player_match_reversed(csv_player, api_players_pool)
            if matched_api:
                player_id = matched_api.get('id')
                api_id_to_csv_data[player_id] = csv_player
                # Lo removemos del pool temporal
                api_players_pool = [x for x in api_players_pool if x.get('id') != player_id]

    # 3. Recorrer TODOS los jugadores de la API para armar el payload final (Entran todos)
    players_payload = []
    total_api_players = 0
    total_enriched = 0
    total_no_match = 0
    jugadores_sin_csv = []
    
    pos_map = {
        "Goalkeeper": "Goalkeeper", "Defender": "Defender",
        "Midfielder": "Midfielder", "Forward": "Forward", "Attacker": "Forward"
    }

    for squad in squads_data:
        team_id = squad.get('team', {}).get('id')
        api_team_name = squad.get('team', {}).get('name', '')
        
        if not team_id: continue
        
        # Iterar todos los jugadores del equipo en la API
        for api_player in squad.get('players', []):
            if api_player.get('type') != 'player': continue
            
            total_api_players += 1
            player_id = api_player.get('id')
            first_name = api_player.get('firstName')
            last_name = api_player.get('lastName')
            match_name = api_player.get('matchName') or api_player.get('shortLastName') or f"{first_name or ''} {last_name or ''}".strip()
            
            # Buscar si este ID de la API logró emparejarse con un CSV en el paso anterior
            csv_match = api_id_to_csv_data.get(player_id)
            
            # Por defecto: Vacíos si no hay match
            foto = None
            precio = None
            
            if csv_match:
                # Si hay match, le asignamos la foto y convertimos el precio
                total_enriched += 1
                foto = csv_match.get('Foto')
                raw_precio = csv_match.get('Precio_Normalizado')
                if raw_precio:
                    try:
                        precio = int(float(raw_precio))
                    except ValueError:
                        precio = None
            else:
                total_no_match += 1
                jugadores_sin_csv.append(f"- [{api_team_name}] {match_name} | Subido a BD pero sin foto ni precio (No encontrado en el CSV)")

            position = pos_map.get(api_player.get('position', 'Forward'), "Forward")

            players_payload.append({
                "id": player_id,
                "team_id": team_id,
                "first_name": first_name,
                "last_name": last_name,
                "short_name": match_name,
                "position": position,
                "status": api_player.get('status', 'active'),
                "photo": foto,
                "precio": precio,
                "date_of_birth": api_player.get('dateOfBirth'),
                "nationality": api_player.get('nationality'),
                "height": api_player.get('height'),
                "weight": api_player.get('weight'),
                "foot": api_player.get('foot'),
                "shirt_number": api_player.get('shirtNumber'),
            })

    # 4. Subir a Supabase TODOS los jugadores
    if players_payload:
        try:
            # Detectar jugadores nuevos o traspasados para las notificaciones
            db_read_ok = True
            existing_rows = []
            try:
                # Paginado: sin el .range() PostgREST corta en 1000 filas y los
                # jugadores de más allá parecerían altas nuevas en cada pasada.
                page, size = 0, 1000
                while True:
                    r = supabase.table("players") \
                        .select("id, team_id, precio, photo, position, date_of_birth, short_name") \
                        .range(page * size, (page + 1) * size - 1).execute()
                    if not r.data:
                        break
                    existing_rows.extend(r.data)
                    page += 1
                    if len(r.data) < size:
                        break
                existing_player_map = {r['id']: r for r in existing_rows}
                existing_player_ids = set(existing_player_map.keys())
            except Exception as e:
                print(f"   ⚠️  No se pudo leer la tabla players ({e}). No se filtran altas ni se avisa de cambios.")
                db_read_ok = False
                existing_rows = []
                existing_player_map = {}
                existing_player_ids = set()

            # El CSV de Comunio solo cubre una parte de la plantilla. Si un
            # jugador no está en él NO se borra su precio/foto: los pone
            # merge_players_data.py con datos de Biwenger justo después, y
            # machacarlos con None hacía que en la siguiente pasada el merge
            # los viera como "sin precio" y emitiera un 'new_player' para casi
            # toda la liga.
            preserved = 0
            respetados_biwenger = 0
            for p in players_payload:
                prev = existing_player_map.get(p.get('id'))
                if not prev:
                    continue
                if p.get('precio') is None and prev.get('precio') is not None:
                    p['precio'] = prev['precio']
                    preserved += 1
                if not p.get('photo') and prev.get('photo'):
                    p['photo'] = prev['photo']

                # Biwenger manda en posición y equipo para los jugadores que él
                # cubre (los que ya tienen precio suyo). Opta y Biwenger discrepan
                # de forma permanente en unos 50 jugadores —cedidos que Opta sigue
                # colgando del club dueño, extremos que uno llama delantero y el
                # otro centrocampista—, y como merge_players_data.py vuelve a
                # escribir el dato de Biwenger justo después, pisarlo aquí solo
                # producía un pimpón: cada sincronización anunciaba el mismo
                # 'traspaso' y el mismo 'cambio de posición' en sentido contrario.
                # Los jugadores que Biwenger no lista (sin precio) sí siguen a Opta.
                if prev.get('precio') is not None:
                    if prev.get('position'):
                        p['position'] = prev['position']
                    if prev.get('team_id') and p.get('team_id') != prev['team_id']:
                        p['team_id'] = prev['team_id']
                        respetados_biwenger += 1
            if preserved:
                print(f"   ♻️  Precio conservado de la BD para {preserved} jugadores sin match en el CSV.")
            if respetados_biwenger:
                print(f"   ♻️  Equipo de Biwenger respetado para {respetados_biwenger} jugadores (Opta discrepa).")

            # Arranque en frío: la tabla venía vacía (reset_players.py), así que
            # TODOS los jugadores son "nuevos" y todos los equipos son un
            # "traspaso". Avisar de eso son 500 notificaciones que no dicen nada:
            # no hay estado anterior con el que comparar. Y sin ningún id de Opta
            # en la BD tampoco se puede filtrar quién entra: entran todos y el
            # merge deja luego solo a los que Biwenger lista.
            cold_start = not existing_player_ids

            # Filtro de altas: solo entran los que ya están en la BD (los puso
            # Biwenger) y los que confirman un alta provisional 'bw-'.
            confirmados = set()
            descartados = 0
            if db_read_ok and not cold_start:
                provisionals_by_team = {}
                for r in existing_rows:
                    if str(r.get('id') or '').startswith(PROVISIONAL_PREFIX):
                        provisionals_by_team.setdefault(r.get('team_id'), []).append(r)

                admitidos = []
                for p in players_payload:
                    if p.get('id') in existing_player_ids:
                        admitidos.append(p)
                        continue
                    prov = matching_provisional(p, provisionals_by_team)
                    if prov:
                        confirmados.add(p.get('id'))
                        admitidos.append(p)
                        # Un provisional solo confirma a un jugador: si dos fichas
                        # de Opta cuadran con él, la segunda sería un alta que
                        # Biwenger no respalda.
                        provisionals_by_team[p.get('team_id')] = [
                            x for x in provisionals_by_team.get(p.get('team_id'), []) if x is not prov
                        ]
                        print(f"   ➕ {p.get('short_name')}: ficha de Opta para el provisional '{prov.get('short_name')}'.")
                    else:
                        descartados += 1
                players_payload = admitidos

                if descartados:
                    print(f"   🚫 {descartados} jugadores de la API no están en el mercado de Biwenger: no se dan de alta.")

            if not players_payload:
                print("   ℹ️  Nada que actualizar: ningún jugador de la API está en el mercado de Biwenger.")
                return True

            # IMPORTANTE: ignore_duplicates=False para que actualice fotos y precios
            # a jugadores que ya existían pero se les acaba de agregar data en el CSV.
            result = supabase.table("players").upsert(players_payload, ignore_duplicates=False).execute()

            new_player_notifications = []
            team_names = {s['team']['id']: s['team']['name'] for s in squads_data if 'team' in s and 'id' in s['team']}

            if cold_start:
                print("   ℹ️  La tabla de jugadores estaba vacía: no se generan notificaciones de altas ni traspasos.")

            for p in ([] if cold_start else players_payload):
                pid = p.get('id')
                name = p.get('short_name')
                new_team_id = p.get('team_id')

                # El que confirma un provisional no es un alta nueva para el
                # usuario: ya estaba en el mercado con los datos de Biwenger. El
                # merge emite su 'Jugador confirmado' justo después.
                if pid in confirmados:
                    continue

                if pid and pid not in existing_player_ids:
                    new_player_notifications.append({
                        "type": "new_player",
                        "title": "Nuevo jugador disponible",
                        "body": f"{name} ({p.get('position', '')}) ha sido añadido al juego"
                    })
                elif pid in existing_player_map:
                    old_team_id = existing_player_map[pid].get('team_id')
                    if old_team_id and new_team_id and old_team_id != new_team_id:
                        new_team_name = team_names.get(new_team_id, "otro equipo")
                        new_player_notifications.append({
                            "type": "squad_changed",
                            "title": "Cambio de Plantilla (Traspaso)",
                            "body": f"{name} ha sido traspasado a {new_team_name}"
                        })
            
            save_notifications(new_player_notifications)

            print(f"\n✅ Sincronización finalizada correctamente.")
            print(f"   Total jugadores en la API: {total_api_players}")
            print(f"   Subidos a Supabase: {len(players_payload)}"
                  + (f" ({len(confirmados)} altas que confirman un provisional)" if confirmados else ""))
            print(f"   Descartados por no estar en el mercado de Biwenger: {descartados}")
            print(f"   Enriquecidos (Encontraron Foto/Precio en CSV): {total_enriched}")
            print(f"   Básicos (Subidos SIN Foto ni Precio): {total_no_match}")
            
            # Actualizamos el reporte
            with open("reporte_sin_csv.txt", "w", encoding="utf-8") as f:
                f.write("=== JUGADORES DE LA API SUBIDOS SIN FOTO NI PRECIO (No match en CSV) ===\n")
                for line in jugadores_sin_csv:
                    f.write(line + "\n")
            print("   📄 Reporte actualizado en 'reporte_sin_csv.txt'")
            return True
        except Exception as e:
            print(f"❌ Error subiendo jugadores a Supabase: {e}")
            return False

    print("⚠️ No hay jugadores válidos en la API para subir a Supabase.")
    return False

def main():
    print("=" * 60)
    print(f"🏆 API -> DIRECTO A SUPABASE: {LEAGUE_NAME} - {SEASON_NAME}")
    print(f"   League ID: {ACTIVE_LEAGUE_ID}")
    print("=" * 60)

    # 1: Obtener season_id
    if SEASON_ID:
        season_id = SEASON_ID
        print(f"\n✅ Usando season_id de settings.json: {season_id}")
    else:
        print("\n🔍 Obteniendo ID de temporada...")
        season_id = get_season_id(ACTIVE_LEAGUE_ID)
        if not season_id:
            print(f"❌ No se pudo obtener season_id")
            exit(1)

    # 2: Descargar Todo (A RAM)
    fixtures_ok, fixtures_data = descargar_fixtures(season_id)
    squads_ok, squads_data = descargar_squads(season_id)

    # 3: Subir Todo a Supabase
    
    # La campana solo muestra lo de esta cadena de sincronización: se vacía
    # antes de emitir el primer aviso (los de horarios salen ya en los fixtures).
    purge_previous_notifications()

    # PRIMERO: Subimos los equipos (para que existan en la BD)
    if squads_ok:
        upload_teams_to_supabase(squads_data)

    # SEGUNDO: Subimos los fixtures (ahora los equipos ya existen)
    if fixtures_ok:
        upload_fixtures_to_supabase(fixtures_data)

    # TERCERO: Subimos los jugadores cruzados con el CSV
    if squads_ok:
        sync_players_with_csv(squads_data)

    # ENVIAR CORREOS DE RESUMEN DE SINCRONIZACIÓN
    send_sync_summary_emails()

    print("\n" + "=" * 60)
    print("📊 RESUMEN FINAL")
    print("=" * 60)
    print(f"   Fixtures (API -> Supabase): {'✅' if fixtures_ok else '❌'}")
    print(f"   Teams (API -> Supabase):    {'✅' if squads_ok else '❌'}")
    print(f"   Players (API+CSV -> Sup):   {'✅' if squads_ok else '❌'}")
    print("\n✅ Proceso completado sin escribir archivos locales!")


if __name__ == "__main__":
    main()