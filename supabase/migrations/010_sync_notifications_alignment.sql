-- Alinea sync_notifications con lo que realmente escriben los scripts de sync
-- y con lo que lee la campana de notificaciones.
--
-- 1) Columnas de contexto que merge_players_data.py ya envía (player_id,
--    player_name, team_id, team_name, message) y read_at, que la API usa para
--    marcar como leído. En algunos despliegues la tabla se creó sin ellas.
-- 2) El CHECK de `type` se quedó corto: faltaban los tipos que emite el merge
--    de Biwenger (nuevo jugador, cambio de posición, de equipo y de foto) y
--    'unmatched', que alimenta el panel de admin.

ALTER TABLE sync_notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE sync_notifications ADD COLUMN IF NOT EXISTS player_id TEXT;
ALTER TABLE sync_notifications ADD COLUMN IF NOT EXISTS player_name TEXT;
ALTER TABLE sync_notifications ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE sync_notifications ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE sync_notifications ADD COLUMN IF NOT EXISTS message TEXT;

CREATE INDEX IF NOT EXISTS idx_sync_notifications_read_at ON sync_notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_sync_notifications_created_at ON sync_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_notifications_type ON sync_notifications(type);

ALTER TABLE sync_notifications DROP CONSTRAINT IF EXISTS sync_notifications_type_check;

ALTER TABLE sync_notifications
    ADD CONSTRAINT sync_notifications_type_check
    CHECK (type IN (
        'fixture_changed',
        'new_player',
        'sync_complete',
        'players_locked',
        'squad_changed',
        'position_changed',
        'team_changed',
        'photo_changed',
        'transfer',   -- histórico: lo emitía el merge antes de separar los tipos
        'unmatched'   -- errores de sincronización, solo visibles para admin
    ));
