"""
Script para crear las tablas necesarias en Supabase.
Esto debe ejecutarse una sola vez para inicializar el esquema.
"""
import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def create_team_badges_table():
    """Crea la tabla team_badges para almacenar escudos de equipos"""
    print("Creando tabla team_badges...")

    # Nota: Supabase no permite crear tablas directamente desde la API REST
    # Las tablas deben crearse desde el dashboard o con la CLI
    # Este script verifica si la tabla existe y da instrucciones

    try:
        # Intentar hacer una query para ver si la tabla existe
        result = supabase.from_("team_badges").select("team_id").limit(1).execute()
        print("✅ La tabla team_badges ya existe")
        return True
    except Exception as e:
        print(f"⚠️  La tabla team_badges no existe o hay error: {e}")
        return False


def create_players_table():
    """Verifica si la tabla players existe con las columnas necesarias"""
    print("Verificando tabla players...")

    try:
        result = supabase.from_("players").select("id,photo").limit(1).execute()
        print("✅ La tabla players existe con la columna photo")
        return True
    except Exception as e:
        print(f"⚠️  La tabla players necesita la columna photo: {e}")
        return False


def print_instructions():
    """Imprime instrucciones para crear las tablas manualmente"""
    print("\n" + "="*60)
    print("INSTRUCCIONES PARA CREAR LAS TABLAS EN SUPABASE")
    print("="*60)
    print("""
1. Ve al dashboard de Supabase: https://app.supabase.com
2. Selecciona tu proyecto
3. Ve a SQL Editor
4. Ejecuta el siguiente SQL:

-- Tabla para escudos de equipos
CREATE TABLE IF NOT EXISTS team_badges (
    team_id TEXT PRIMARY KEY,
    badge_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla players actualizada
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    team_id TEXT REFERENCES real_teams(id),
    first_name TEXT,
    last_name TEXT,
    short_name TEXT,
    position TEXT,
    status TEXT,
    photo TEXT,
    date_of_birth DATE,
    nationality TEXT,
    height INTEGER,
    weight INTEGER,
    foot TEXT,
    shirt_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_short_name ON players(short_name);

5. Guarda el SQL como "001_create_team_badges_and_update_players"
6. Ejecuta el script sync_players_with_photos.py
""")
    print("="*60)


if __name__ == "__main__":
    print("=== Verificación de tablas Supabase ===\n")

    team_badges_ok = create_team_badges_table()
    players_ok = create_players_table()

    if not team_badges_ok or not players_ok:
        print_instructions()
    else:
        print("\n✅ Todas las tablas están listas para usar")
