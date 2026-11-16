ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS "contentPurgedAt" timestamptz;

CREATE INDEX IF NOT EXISTS idx_sessions_content_retention
  ON sessions ("lastActivityAt")
  WHERE "contentPurgedAt" IS NULL
    AND status IN ('COMPLETED', 'ABANDONED');

UPDATE privacy_events
SET original_content = NULL
WHERE original_content IS NOT NULL;

DROP POLICY IF EXISTS "privacy_events_select" ON privacy_events;
DROP POLICY IF EXISTS "privacy_events_insert" ON privacy_events;

CREATE POLICY "privacy_events_select" ON privacy_events
  FOR SELECT USING (false);

CREATE POLICY "privacy_events_insert" ON privacy_events
  FOR INSERT WITH CHECK (false);
