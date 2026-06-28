import os
from mailer import send_email_real, render_template

def test_email(to_email):
    print(f"Probando envío de correo a: {to_email}...")
    
    # Contexto de prueba
    context = {
        "name": "Usuario de Prueba",
        "matchday": "Prueba",
        "app_url": "http://localhost:3000"
    }
    
    # Prueba: Correo de inicio de jornada
    final_html = render_template("inicio_jornada.html", context)
    success = send_email_real(to_email, "⚽ ¡Prueba de Configuración Liga Marca!", final_html)
    
    if success:
        print("🎉 ¡Prueba exitosa! El correo ha sido enviado.")
    else:
        print("❌ La prueba ha fallado. Revisa tus credenciales en el archivo .env.")

if __name__ == "__main__":
    email_destino = input("Introduce el correo electrónico donde quieres recibir la prueba: ")
    if email_destino:
        test_email(email_destino)
    else:
        print("No se introdujo un correo válido.")
