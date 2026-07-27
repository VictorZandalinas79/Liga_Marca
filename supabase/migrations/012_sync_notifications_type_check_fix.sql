-- El CHECK de sync_notifications.type seguía en producción con la lista corta
-- de la 004/005 (fixture_changed, new_player, sync_complete, players_locked):
-- la 010 añadió las columnas de contexto pero su bloque de constraint no llegó
-- a aplicarse. Resultado: Biwenger Market Sync moría al final del merge con
--   23514 sync_notifications_type_check ... (team_changed)
-- después de haber escrito ya precios y borrado sobrantes.
--
-- Esta migración vuelve a dejar el CHECK alineado con los tipos que emiten
-- realmente los scripts (grep '"type": "' en los .py) y es idempotente.

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
