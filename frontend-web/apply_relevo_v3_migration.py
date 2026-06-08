#!/usr/bin/env python3
"""
Script para aplicar la migración 003 que añade las columnas v3.0 RELEVO a player_scores.
"""

import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: Falta SUPABASE_URL o SUPABASE_KEY en las variables de entorno")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🚀 Aplicando migración 003: Añadir columnas v3.0 RELEVO...")

migration_sql = """
-- Migración 003: Añadir nuevas columnas v3.0 RELEVO a player_scores

-- Añadir nuevas columnas para las métricas v3.0 RELEVO
ALTER TABLE player_scores
ADD COLUMN IF NOT EXISTS forward_passes INTEGER DEFAULT 0;

ALTER TABLE player_scores
ADD COLUMN IF NOT EXISTS set_pieces_taken INTEGER DEFAULT 0;

ALTER TABLE player_scores
ADD COLUMN IF NOT EXISTS successful_crosses INTEGER DEFAULT 0;

-- Añadir índices para consultas de nuevas métricas
CREATE INDEX IF NOT EXISTS idx_player_scores_forward_passes ON player_scores(forward_passes);
CREATE INDEX IF NOT EXISTS idx_player_scores_set_pieces ON player_scores(set_pieces_taken);
CREATE INDEX IF NOT EXISTS idx_player_scores_successful_crosses ON player_scores(successful_crosses);
"""

try:
    # Ejecutar la migración usando la función RPC de Supabase
    result = supabase.rpc('exec_sql', {'sql': migration_sql}).execute()
    print("✅ Migración 003 aplicada correctamente")
    print("   - forward_passes")
    print("   - set_pieces_taken")
    print("   - successful_crosses")
except Exception as e:
    print(f"⚠️ Error al aplicar migración: {e}")
    print("\n💡 Puedes ejecutar el SQL manualmente en Supabase SQL Editor:")
    print(migration_sql)
