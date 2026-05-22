"""
Script para aplicar las migraciones de Supabase.
Lee los archivos SQL de la carpeta supabase/migrations y los ejecuta en orden.
"""
import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")  # Usar service role para crear tablas

print(f"Conectando a Supabase: {SUPABASE_URL}")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

migrations_dir = "supabase/migrations"
migration_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith('.sql')])

print(f"\n📁 Migraciones encontradas: {len(migration_files)}")
for f in migration_files:
    print(f"   - {f}")

print("\n" + "="*60)

for filename in migration_files:
    filepath = os.path.join(migrations_dir, filename)
    print(f"\n🔄 Ejecutando {filename}...")

    with open(filepath, 'r', encoding='utf-8') as f:
        sql_content = f.read()

    try:
        # Ejecutar el SQL usando la API REST de Supabase
        # Nota: Para crear tablas necesitamos usar el cliente directamente
        result = supabase.rpc('exec_sql', {'sql': sql_content})
        print(f"✅ {filename} completada")
    except Exception as e:
        # Si falla el RPC, intentamos con una alternativa
        print(f"⚠️  El método RPC no está disponible. Error: {e}")
        print("\n📋 INSTRUCCIONES MANUALES:")
        print("1. Ve a https://app.supabase.com")
        print("2. Selecciona tu proyecto")
        print("3. Ve a SQL Editor")
        print("4. Copia y pega el contenido de cada archivo de migración")
        print("5. Ejecuta en orden: 001, 002, 003")
        break
else:
    print("\n" + "="*60)
    print("✅ ¡Todas las migraciones se aplicaron correctamente!")
