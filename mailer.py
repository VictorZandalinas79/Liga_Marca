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
