import os
import subprocess
from supabase import create_client
from dotenv import load_dotenv

load_dotenv("frontend-web/.env")
load_dotenv("frontend-web/.env.local", override=True)
load_dotenv(".env", override=True)

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Faltan credenciales de Supabase")
    exit(1)

sb = create_client(url, key)

fixtures = sb.table("fixtures").select("id").eq("status", "finished").execute().data

print(f"Encontrados {len(fixtures)} partidos finalizados.")

for f in fixtures:
    fixture_id = f['id']
    match_id = fixture_id
    print(f"Re-ejecutando partido: {fixture_id}")
    result = subprocess.run(["python3", "trigger_descarga_eventos.py", str(fixture_id), str(match_id)], cwd="frontend-web")
    if result.returncode != 0:
        print(f"Error procesando {fixture_id}")

print("Completado.")
