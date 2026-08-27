#!/usr/bin/env python3
"""
Script para aplicar la migración 005 que añade las columnas v4.0 RELEVO a player_scores.
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

print("🚀 Aplicando migración 005: Añadir columnas v4.0 RELEVO...")

migration_sql = """
-- Migración 005: Añadir nuevas columnas v4.0 RELEVO a player_scores

ALTER TABLE player_scores
    ADD COLUMN IF NOT EXISTS saves_gte_07 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS def_actions_12_8_49_42_7 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS def_actions_opp_half_12_8_49_42_7 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS off_actions_3_4_outcome_1 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS off_actions_opp_half_outcome_1 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS intercept_recup_3_4 integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS recoveries_49 integer NOT NULL DEFAULT 0;
"""

try:
    # Ejecutar la migración usando la función RPC de Supabase
    result = supabase.rpc('exec_sql', {'sql': migration_sql}).execute()
    print("✅ Migración 005 aplicada correctamente:")
    print("   - saves_gte_07")
    print("   - def_actions_12_8_49_42_7")
    print("   - def_actions_opp_half_12_8_49_42_7")
    print("   - off_actions_3_4_outcome_1")
    print("   - off_actions_opp_half_outcome_1")
    print("   - intercept_recup_3_4")
    print("   - recoveries_49")
except Exception as e:
    print(f"⚠️ Error al aplicar migración: {e}")
    print("\n💡 Puedes ejecutar el SQL manualmente en Supabase SQL Editor:")
    print(migration_sql)
