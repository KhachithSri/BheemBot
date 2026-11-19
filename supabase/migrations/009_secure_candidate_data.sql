ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "encryptedData" text,
  ADD COLUMN IF NOT EXISTS "emailLookup" text,
  ADD COLUMN IF NOT EXISTS "inviteTokenHash" text;

ALTER TABLE candidates
  ALTER COLUMN name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_email_lookup
  ON candidates ("interviewId", "emailLookup")
  WHERE "emailLookup" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_invite_token_hash
  ON candidates ("inviteTokenHash")
  WHERE "inviteTokenHash" IS NOT NULL;

CREATE OR REPLACE FUNCTION public.can_access_interview(target_interview_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM interviews i
    JOIN projects p ON p.id = i."projectId"
    JOIN organization_members om ON om."workspaceId" = p."organizationId"
    WHERE i.id = target_interview_id
      AND om."userId" = auth.uid()
      AND (
        NOT EXISTS (
          SELECT 1 FROM project_members pm WHERE pm."projectId" = p.id
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm."projectId" = p.id AND pm."userId" = auth.uid()
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_interview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_interview(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_interview(target_interview_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM interviews i
    JOIN projects p ON p.id = i."projectId"
    JOIN organization_members om ON om."workspaceId" = p."organizationId"
    WHERE i.id = target_interview_id
      AND om."userId" = auth.uid()
      AND (
        om.role IN ('OWNER', 'ADMIN', 'MEMBER')
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm."projectId" = p.id
            AND pm."userId" = auth.uid()
            AND pm.role IN ('OWNER', 'ADMIN', 'MEMBER')
        )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM project_members pm WHERE pm."projectId" = p.id
        )
        OR EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm."projectId" = p.id AND pm."userId" = auth.uid()
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_interview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_interview(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_invite_session_secure(
  p_candidate_id uuid,
  p_mode_used "InterviewMode" DEFAULT 'CHAT',
  p_current_question_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate candidates;
  v_interview interviews;
  v_session sessions;
BEGIN
  SELECT * INTO v_candidate
  FROM candidates
  WHERE id = p_candidate_id
  FOR UPDATE;

  IF v_candidate.id IS NULL THEN
    RAISE EXCEPTION 'Candidate not found';
  END IF;

  IF v_candidate."sessionId" IS NOT NULL THEN
    SELECT * INTO v_session
    FROM sessions
    WHERE id = v_candidate."sessionId";
    IF v_session.id IS NOT NULL THEN
      RETURN row_to_json(v_session);
    END IF;
  END IF;

  SELECT * INTO v_interview
  FROM interviews
  WHERE id = v_candidate."interviewId"
    AND "isActive" = true;

  IF v_interview.id IS NULL THEN
    RAISE EXCEPTION 'Interview not found or inactive';
  END IF;

  INSERT INTO sessions (
    "interviewId",
    "participantName",
    "participantEmail",
    "modeUsed",
    "currentQuestionId"
  )
  VALUES (
    v_interview.id,
    NULL,
    NULL,
    coalesce(p_mode_used, v_interview.mode),
    p_current_question_id
  )
  RETURNING * INTO v_session;

  UPDATE candidates
  SET "sessionId" = v_session.id, "updatedAt" = now()
  WHERE id = v_candidate.id;

  RETURN row_to_json(v_session);
END;
$$;

REVOKE ALL ON FUNCTION public.create_invite_session_secure(uuid, "InterviewMode", uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invite_session_secure(uuid, "InterviewMode", uuid)
  TO service_role;

DO $$
BEGIN
  IF to_regprocedure(
    'public.create_invite_session(text, public."InterviewMode", uuid)'
  ) IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_invite_session(text, "InterviewMode", uuid) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure(
    'public.create_interview_session(uuid, text, text, public."InterviewMode", uuid)'
  ) IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_interview_session(uuid, text, text, "InterviewMode", uuid) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_interview_session(uuid, text, text, "InterviewMode", uuid) TO service_role';
  END IF;
END $$;

UPDATE sessions
SET "participantName" = NULL, "participantEmail" = NULL
WHERE id IN (
  SELECT "sessionId" FROM candidates WHERE "sessionId" IS NOT NULL
);

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('candidates', 'sessions', 'messages', 'privacy_events')
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  END LOOP;
END $$;

CREATE POLICY "candidate_org_member_read" ON candidates
  FOR SELECT TO authenticated
  USING (public.can_access_interview("interviewId"));

CREATE POLICY "candidate_member_insert" ON candidates
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_interview("interviewId"));

CREATE POLICY "candidate_member_update" ON candidates
  FOR UPDATE TO authenticated
  USING (public.can_manage_interview("interviewId"))
  WITH CHECK (public.can_manage_interview("interviewId"));

CREATE POLICY "candidate_member_delete" ON candidates
  FOR DELETE TO authenticated
  USING (public.can_manage_interview("interviewId"));

CREATE POLICY "session_org_member_read" ON sessions
  FOR SELECT TO authenticated
  USING (public.can_access_interview("interviewId"));

CREATE POLICY "session_org_member_update" ON sessions
  FOR UPDATE TO authenticated
  USING (public.can_manage_interview("interviewId"))
  WITH CHECK (public.can_manage_interview("interviewId"));

CREATE POLICY "message_org_member_read" ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = messages."sessionId"
        AND public.can_access_interview(s."interviewId")
    )
  );

CREATE POLICY "message_org_member_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = messages."sessionId"
        AND s.status = 'IN_PROGRESS'
        AND public.can_manage_interview(s."interviewId")
    )
  );

CREATE POLICY "privacy_events_deny_direct_access" ON privacy_events
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE candidates, sessions, messages, privacy_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE candidates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE sessions TO authenticated;
GRANT SELECT, INSERT ON TABLE messages TO authenticated;
REVOKE ALL ON TABLE privacy_events FROM authenticated;
GRANT ALL ON TABLE candidates, sessions, messages, privacy_events TO service_role;
