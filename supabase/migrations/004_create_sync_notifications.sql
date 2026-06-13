-- Tabla para notificaciones del sistema de sincronización semanal
CREATE TABLE IF NOT EXISTS sync_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('fixture_changed', 'new_player', 'sync_complete')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_notifications_read_at ON sync_notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_sync_notifications_created_at ON sync_notifications(created_at DESC);

ALTER TABLE sync_notifications ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer y marcar como leído
CREATE POLICY "Authenticated users can read notifications"
    ON sync_notifications FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can mark as read"
    ON sync_notifications FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Solo el service role puede insertar (desde los scripts Python)
CREATE POLICY "Service role can insert notifications"
    ON sync_notifications FOR INSERT
    TO service_role
    WITH CHECK (true);
