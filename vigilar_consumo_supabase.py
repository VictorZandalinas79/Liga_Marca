"""
Vigilante diario del consumo del plan Free de Supabase.

Llama a public.admin_usage_report() (migración 037) y, SOLO si hay avisos
(base de datos/Storage/usuarios por encima del 70 % o logs que piden limpieza),
manda un email a la cuenta de administración. Si todo está bien no envía nada.

Nunca borra nada: los avisos de logs incluyen el SQL de limpieza para que se
ejecute a mano si se decide hacerlo.
"""
import os
import sys

from dotenv import load_dotenv
from supabase import create_client

from mailer import _esc, render_template, send_email_real

load_dotenv()

ADMIN_EMAIL = os.environ.get("USAGE_ALERT_EMAIL", "vilafranca.fantasy2026@gmail.com")


def _mb(value) -> str:
    return f"{(value or 0) / 1024 / 1024:.1f} MB"


def build_html(report: dict) -> str:
    alerts = report.get("alerts") or []
    db = report["database"]
    storage = report["storage"]
    users = report["users"]

    parts = ["<h2>⚠️ Avisos de consumo Supabase</h2><ul>"]
    for a in alerts:
        icon = "🔴" if a.get("level") == "critical" else "🟠"
        parts.append(f"<li>{icon} {_esc(a.get('message'))}</li>")
    parts.append("</ul>")

    parts.append("<h3>Resumen</h3><ul>")
    parts.append(f"<li>Base de datos: {_mb(db['bytes'])} de 500 MB</li>")
    parts.append(f"<li>Storage: {_mb(storage['bytes'])} de 1 GB ({storage['files']} archivos)</li>")
    parts.append(f"<li>Usuarios activos 30 días: {users['mau']} de 50.000</li>")
    parts.append("</ul>")

    parts.append("<h3>Tablas más pesadas</h3><ul>")
    for t in (report.get("tables") or [])[:5]:
        parts.append(f"<li>{_esc(t['schema'])}.{_esc(t['name'])}: {_mb(t['total_bytes'])} ({t['rows']} filas)</li>")
    parts.append("</ul>")

    parts.append("<p>Detalle completo en el panel de administración → Consumo Supabase.</p>")
    return "\n".join(parts)


def main() -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
        return 1

    report = create_client(url, key).rpc("admin_usage_report").execute().data
    alerts = report.get("alerts") or []

    print(f"Base de datos: {_mb(report['database']['bytes'])} / 500 MB")
    print(f"Storage: {_mb(report['storage']['bytes'])} / 1 GB")
    print(f"Usuarios activos 30 días: {report['users']['mau']} / 50.000")
    for a in alerts:
        print(f"[{a.get('level')}] {a.get('message')}")

    if not alerts:
        print("✅ Sin avisos, no se envía email.")
        return 0

    critical = any(a.get("level") == "critical" for a in alerts)
    subject = ("🔴 Supabase cerca del límite" if critical else "🟠 Aviso de consumo Supabase") + f" — {len(alerts)} aviso(s)"
    html = render_template("", {"name": "Admin", "body_html": build_html(report)})
    send_email_real(ADMIN_EMAIL, subject, html)
    return 0


if __name__ == "__main__":
    sys.exit(main())
