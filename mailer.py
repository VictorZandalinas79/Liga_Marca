import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

SMTP_EMAIL = os.environ.get("SMTP_EMAIL", "vilafranca.fantasy2026@gmail.com")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")

def render_template(template_name: str, context: dict) -> str:
    """Lee una plantilla HTML y reemplaza las variables."""
    base_path = os.path.join(os.path.dirname(__file__), "templates", "base_email.html")
    template_path = os.path.join(os.path.dirname(__file__), "templates", template_name)
    
    # Cargar plantilla base
    with open(base_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
        
    # Cargar plantilla específica si se proporciona
    if template_name and os.path.exists(template_path):
        with open(template_path, 'r', encoding='utf-8') as f:
            specific_content = f.read()
            html_content = html_content.replace("{{CONTENT_BLOCK}}", specific_content)
    else:
        # Si no hay plantilla específica, asumimos que el context contiene el body HTML
        body = context.get('body_html', '')
        html_content = html_content.replace("{{CONTENT_BLOCK}}", body)

    # Reemplazar variables
    for key, value in context.items():
        html_content = html_content.replace(f"{{{{{key}}}}}", str(value))
        
    return html_content

def _esc(value) -> str:
    """Escapa lo mínimo para no romper el HTML con nombres tipo 'O'Neill'."""
    return (
        str(value if value is not None else "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


# Orden y título de cada bloque del resumen. Los tipos que no estén aquí se
# agrupan al final para que un tipo nuevo no desaparezca del informe.
SUMMARY_SECTIONS = [
    ("new_player", "🆕 Nuevos jugadores en el mercado"),
    ("provisional_player", "🕓 Altas provisionales (solo en Biwenger, pendientes de ficha oficial)"),
    ("player_promoted", "✅ Fichas confirmadas por la API (ya tienen nombre oficial)"),
    ("team_changed", "🔁 Cambios de equipo"),
    ("position_changed", "🧭 Cambios de posición"),
    ("photo_changed", "📸 Fotos actualizadas"),
    ("unmatched", "⚠️ Sin resolver (requieren repaso manual)"),
]


def build_summary_html(notifications: list, stats: dict | None = None) -> str:
    """Cuerpo HTML del resumen de sincronización del mercado.

    `notifications` son las mismas filas que se insertan en sync_notifications,
    así que el correo dice exactamente lo mismo que la campana pero con el
    detalle completo (nombre a nombre) que la campana no puede mostrar.
    """
    stats = stats or {}
    parts = []

    rows = [
        ("Jugadores en Biwenger (CSV)", stats.get("biwenger_total")),
        ("Jugadores en la base de datos", stats.get("api_total")),
        ("Emparejados y actualizados", stats.get("matched")),
        ("Altas provisionales (solo Biwenger)", stats.get("provisional")),
        ("Promovidos a ficha oficial", stats.get("promoted")),
        ("Sin resolver", stats.get("unmatched")),
        ("En la API pero no en Biwenger (se conservan)", stats.get("sobrantes")),
        ("Fichados que ya no están en Biwenger", stats.get("protected")),
    ]
    parts.append("<h3 style='color:#1e293b;margin:0 0 12px;'>📊 Resumen</h3>")
    parts.append("<table style='width:100%;border-collapse:collapse;font-size:14px;'>")
    for label, value in rows:
        if value is None:
            continue
        alerta = label.startswith(("Sin resolver", "Fichados que ya no"))
        color = "#b91c1c" if value and alerta else "#1e293b"
        parts.append(
            f"<tr><td style='padding:6px 0;color:#4b5563;'>{label}</td>"
            f"<td style='padding:6px 0;text-align:right;font-weight:700;color:{color};'>{value}</td></tr>"
        )
    parts.append("</table>")

    grouped = {}
    for n in notifications or []:
        grouped.setdefault(n.get("type"), []).append(n)

    known = {t for t, _ in SUMMARY_SECTIONS}
    sections = SUMMARY_SECTIONS + [
        (t, f"🔔 {t}") for t in grouped if t not in known
    ]

    for notif_type, title in sections:
        items = grouped.get(notif_type)
        if not items:
            continue
        border = "#dc2626" if notif_type == "unmatched" else "#3b82f6"
        parts.append(
            f"<h3 style='color:#1e293b;margin:28px 0 10px;border-left:4px solid {border};"
            f"padding-left:10px;'>{title} ({len(items)})</h3>"
        )
        parts.append("<ul style='color:#4b5563;font-size:14px;margin:0;padding-left:20px;'>")
        for n in items:
            name = _esc(n.get("player_name") or "")
            team = _esc(n.get("team_name") or "")
            detail = _esc(n.get("message") or n.get("body") or "")
            head = f"<strong>{name}</strong>" if name else _esc(n.get("body") or "")
            if team:
                head += f" <span style='color:#94a3b8;'>({team})</span>"
            parts.append(f"<li style='margin-bottom:4px;'>{head} — {detail}</li>")
        parts.append("</ul>")

    if not grouped:
        parts.append(
            "<p style='color:#166534;background:#dcfce7;padding:10px;border-left:4px solid #16a34a;'>"
            "✅ Sin cambios ni errores: todo el mercado se sincronizó limpiamente.</p>"
        )

    return "\n".join(parts)


def send_summary_email(notifications: list, stats: dict | None = None, to_emails=None) -> bool:
    """Envía el resumen del merge de Biwenger a quien administra la liga.

    Destinatarios: `to_emails`, o SYNC_SUMMARY_EMAIL (separada por comas), o
    como último recurso la propia cuenta SMTP. Nunca lanza: el merge ya ha
    escrito en base de datos cuando llega aquí y un fallo de correo no debe
    marcar el workflow como fallido.
    """
    if isinstance(to_emails, str):
        to_emails = [to_emails]
    if not to_emails:
        raw = os.environ.get("SYNC_SUMMARY_EMAIL", "")
        to_emails = [e.strip() for e in raw.split(",") if e.strip()]
    if not to_emails:
        to_emails = [SMTP_EMAIL]

    stats = stats or {}
    unmatched = stats.get("unmatched") or 0
    subject = "🔄 Sync mercado Biwenger"
    if unmatched:
        subject += f" — ⚠️ {unmatched} jugadores sin emparejar"
    else:
        subject += " — todo correcto"

    html = render_template("", {
        "name": "Admin",
        "body_html": build_summary_html(notifications, stats),
    })

    ok = True
    for email in to_emails:
        try:
            if not send_email_real(email, subject, html):
                ok = False
        except Exception as e:
            print(f"❌ Error enviando resumen a {email}: {e}")
            ok = False
    return ok


def send_email_real(to_email: str, subject: str, html_content: str) -> bool:
    """Envía un correo electrónico usando SMTP."""
    if not SMTP_PASSWORD:
        print("⚠️ SMTP_PASSWORD no está configurada en .env. Simulando envío.")
        print(f"✉️ [Simulado] Enviando correo a {to_email}: {subject}")
        return True

    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"] = f"Liga Marca Fantasy <{SMTP_EMAIL}>"
    msg["To"] = to_email

    msg_alternative = MIMEMultipart("alternative")
    msg.attach(msg_alternative)

    part_html = MIMEText(html_content, "html")
    msg_alternative.attach(part_html)

    # Adjuntar imagenes inline
    from email.mime.image import MIMEImage
    base_dir = os.path.dirname(__file__)
    public_dir = os.path.join(base_dir, "frontend-web", "public")
    
    images = [
        ("icono_lliga.png", "icono_lliga"),
        ("liga.png", "liga")
    ]
    
    for img_filename, cid in images:
        img_path = os.path.join(public_dir, img_filename)
        if os.path.exists(img_path):
            with open(img_path, "rb") as f:
                img_data = f.read()
            img = MIMEImage(img_data)
            img.add_header('Content-ID', f'<{cid}>')
            img.add_header('Content-Disposition', 'inline')
            msg.attach(img)

    try:
        # Conexión SMTP a Gmail
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.ehlo()
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        server.quit()
        print(f"✅ Correo enviado con éxito a {to_email}")
        return True
    except Exception as e:
        print(f"❌ Error al enviar correo a {to_email}: {e}")
        return False
