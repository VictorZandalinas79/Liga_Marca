import os
import sys
from supabase import create_client
from dotenv import load_dotenv
from mailer import send_email_real, render_template

load_dotenv()

def _clean_env(value):
    if value is None: return None
    return value.strip().strip('"').strip("'").strip()

SUPABASE_URL = _clean_env(os.environ.get("SUPABASE_URL"))
SUPABASE_KEY = _clean_env(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY"))

def send_matchday_start_emails(matchday):
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    try:
        profiles_resp = supabase.table("profiles").select("id, email, full_name, division").execute()
        profiles = profiles_resp.data or []

        penalties_resp = supabase.table("penalties").select("user_id, description, points, division").eq("matchday", matchday).execute()
        penalties = penalties_resp.data or []
    except Exception as e:
        print(f"⚠️ No se pudieron obtener los datos: {e}")
        return

    user_names = {p['id']: p.get('full_name') or p.get('email', '').split('@')[0] for p in profiles if p.get('id')}

    # Cada división es una liga independiente, así que a cada usuario solo le
    # interesan (y solo le afectan) las sanciones de su propia tabla.
    penalties_by_division = {}
    for p in penalties:
        penalties_by_division.setdefault(p.get("division"), []).append(p)

    def build_sanctions_html(division_penalties):
        if not division_penalties:
            return "<div style='background-color: #dcfce7; padding: 10px; border-left: 4px solid #16a34a; margin: 20px 0;'><p style='color: #166534; margin: 0;'>✅ <strong>¡Sin sanciones!</strong> Ningún equipo de tu división ha cometido infracciones en esta jornada.</p></div>"

        html = "<h3 style='color: #991b1b; margin-top: 20px;'>⚖️ Posibles Sanciones de la Jornada</h3>"
        html += "<p style='color: #4b5563; font-size: 14px;'><i>Las alineaciones han sido bloqueadas. Estas son las posibles sanciones por infracciones en tu alineación. Se te restarán puntos al finalizar la jornada.</i></p>"
        html += "<ul style='color: #7f1d1d;'>"
        grouped = {}
        for p in division_penalties:
            grouped.setdefault(p.get('user_id'), []).append(p)

        for uid, user_penalties in grouped.items():
            uname = user_names.get(uid, "Un usuario")
            html += f"<li style='margin-bottom: 5px;'><strong>{uname}:</strong><ul>"
            for pen in user_penalties:
                html += f"<li>{pen.get('description')} (<strong>se restarán los puntos al final de la jornada</strong>)</li>"
            html += "</ul></li>"
        html += "</ul>"
        return html

    sanctions_html_by_division = {
        div: build_sanctions_html(penalties_by_division.get(div, []))
        for div in (1, 2, 3)
    }

    sent_count = 0
    for p in profiles:
        email = p.get("email")
        if not email:
            continue

        name = p.get("full_name") or email.split("@")[0]
        division = p.get("division")

        # Sin división asignada no se compite en ninguna tabla: no hay sanciones
        # que mostrar (el admin las asigna antes de la primera jornada).
        sanctions_html = sanctions_html_by_division.get(division, "")

        context = {
            "name": name,
            "matchday": matchday,
            "sanctions_html": sanctions_html,
            "app_url": "http://localhost:3000" # Cambiar en producción
        }
        
        final_html = render_template("inicio_jornada.html", context)
        subject = f"⚽ ¡Comienza la Jornada {matchday}!"
        
        if send_email_real(email, subject, final_html):
            sent_count += 1
            
    print(f"📧 Se enviaron {sent_count} correos de inicio de la Jornada {matchday}.")

if __name__ == "__main__":
    md = os.environ.get("SANCTION_MATCHDAY")
    if not md and len(sys.argv) > 1:
        md = sys.argv[1]
        
    if md:
        send_matchday_start_emails(md)
    else:
        print("❌ No se especificó la jornada (SANCTION_MATCHDAY o argumento).")
