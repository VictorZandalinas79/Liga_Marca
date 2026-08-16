-- La página de Partidos muestra "Última actualización" con la hora real del
-- último dato escrito en Supabase (no la hora del fetch del navegador).
--
-- player_scores ya tenía updated_at con trigger (003_create_game_tables.sql),
-- pero el sync en vivo también toca solo fixtures (marcador, status,
-- current_minute) sin escribir puntuaciones. Sin esta columna esos cambios
-- eran invisibles para el sello de "última actualización".
--
-- La página funciona con o sin esta migración: si la columna no existe,
-- el sello se calcula únicamente con player_scores.updated_at.

ALTER TABLE fixtures
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Función compartida (ya creada en migraciones anteriores; se deja idempotente)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_fixtures_updated_at ON fixtures;
CREATE TRIGGER update_fixtures_updated_at
    BEFORE UPDATE ON fixtures
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Los sellos se leen como MAX(updated_at) sobre los fixtures de una jornada
CREATE INDEX IF NOT EXISTS idx_fixtures_matchday ON fixtures(matchday);
