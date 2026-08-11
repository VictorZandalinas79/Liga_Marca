CREATE TABLE IF NOT EXISTS extra_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  collected_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE extra_payments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow select for all" ON extra_payments FOR SELECT USING (true);
CREATE POLICY "Allow insert for all" ON extra_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update for all" ON extra_payments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for all" ON extra_payments FOR DELETE USING (true);
