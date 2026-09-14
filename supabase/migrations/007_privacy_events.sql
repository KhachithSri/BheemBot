-- Privacy Events Table for tracking PII detection and masking
CREATE TABLE IF NOT EXISTS privacy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  pii_types text[] NOT NULL DEFAULT '{}',
  pii_count int NOT NULL DEFAULT 0,
  original_content text,
  masked_content text,
  confidence_threshold float NOT NULL DEFAULT 0.7,
  timestamp timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_privacy_events_session ON privacy_events (session_id);
CREATE INDEX IF NOT EXISTS idx_privacy_events_message ON privacy_events (message_id);
CREATE INDEX IF NOT EXISTS idx_privacy_events_timestamp ON privacy_events (timestamp);

-- Enable RLS
ALTER TABLE privacy_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "privacy_events_select" ON privacy_events;
DROP POLICY IF EXISTS "privacy_events_insert" ON privacy_events;

CREATE POLICY "privacy_events_select" ON privacy_events FOR SELECT USING (true);
CREATE POLICY "privacy_events_insert" ON privacy_events FOR INSERT WITH CHECK (true);