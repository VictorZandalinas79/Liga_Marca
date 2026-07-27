-- Jugadores provisionales: los que Biwenger ya publica pero la API de Opta
-- todavía no. merge_players_data.py los da de alta con el nombre de Biwenger y
-- un id con prefijo 'bw-', y los sustituye por la ficha real en cuanto aparece.
--
-- NADA de esta migración es imprescindible: el script identifica a los
-- provisionales por el prefijo del id y, si los tipos nuevos de notificación no
-- están permitidos, los guarda con un tipo antiguo equivalente. Aplicarla solo
-- mejora el detalle (columna consultable + notificaciones con su tipo real).

-- 1. Marca explícita, para poder filtrarlos desde el frontend sin parsear el id.
ALTER TABLE players
    ADD COLUMN IF NOT EXISTS is_provisional BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN players.is_provisional IS
    'TRUE si el jugador viene solo de Biwenger y aún no tiene ficha en la API. Su nombre es provisional.';

-- Los que ya estuvieran dados de alta antes de existir la columna.
UPDATE players SET is_provisional = TRUE WHERE id LIKE 'bw-%' AND is_provisional = FALSE;

CREATE INDEX IF NOT EXISTS idx_players_is_provisional
    ON players(is_provisional) WHERE is_provisional;

-- 2. Tipos nuevos de notificación. Se repite la lista completa porque el CHECK
-- se reemplaza entero (ver 012, donde ya pasó esto).
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
        'transfer',             -- histórico: lo emitía el merge antes de separar los tipos
        'unmatched',            -- errores de sincronización, solo visibles para admin
        'provisional_player',   -- alta con datos de Biwenger, pendiente de ficha oficial
        'player_promoted'       -- el provisional ya tiene ficha en la API
    ));
