-- Añade el tipo 'players_locked' a las notificaciones.
-- Se usa cuando un partido queda fuera del orden de su jornada (aplazado o
-- adelantado) y los jugadores de sus dos equipos quedan bloqueados.

ALTER TABLE sync_notifications DROP CONSTRAINT IF EXISTS sync_notifications_type_check;

ALTER TABLE sync_notifications
    ADD CONSTRAINT sync_notifications_type_check
    CHECK (type IN ('fixture_changed', 'new_player', 'sync_complete', 'players_locked'));
