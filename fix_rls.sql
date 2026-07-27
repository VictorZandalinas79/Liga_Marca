ALTER TABLE sync_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read notifications" ON sync_notifications;

CREATE POLICY "Authenticated users can read notifications"
    ON sync_notifications FOR SELECT
    TO authenticated
    USING (true);
