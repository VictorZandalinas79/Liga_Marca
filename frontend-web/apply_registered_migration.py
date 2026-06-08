#!/usr/bin/env python3
"""
Aplica la migración para añadir columna matchday a team_players
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("❌ Error: Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

migration_sql = """
-- ============================================
-- AÑADIR COLUMNA matchday A team_players (si no existe)
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'team_players' AND column_name = 'matchday'
    ) THEN
        ALTER TABLE team_players ADD COLUMN matchday INTEGER DEFAULT 0;
    END IF;
END
$$;

-- Eliminar restricción UNIQUE antigua si existe
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'team_players_team_id_player_id_key'
    ) THEN
        ALTER TABLE team_players DROP CONSTRAINT team_players_team_id_player_id_key;
    END IF;
END
$$;

-- Crear nueva restricción UNIQUE que incluya matchday
ALTER TABLE team_players
ADD CONSTRAINT team_players_team_player_matchday_unique
UNIQUE (team_id, player_id, matchday);
"""

print("🚀 Aplicando migración a Supabase...")

try:
    # Ejecutar el SQL directamente usando la API de Supabase
    result = supabase.rpc('exec_sql', {'sql': migration_sql}).execute()
    print("✅ Migración aplicada correctamente")
except Exception as e:
    print(f"⚠️ Error al aplicar migración (puede que ya exista): {e}")
    print("\n📝 Puedes aplicar este SQL manualmente en el Supabase SQL Editor")

# Verificar que la columna existe
print("\n📋 Verificando estructura de team_players...")
try:
    result = supabase.from_('team_players').select('matchday').limit(1).execute()
    print("✅ La columna 'matchday' existe correctamente")
except Exception as e:
    print(f"❌ La columna 'matchday' no existe: {e}")
