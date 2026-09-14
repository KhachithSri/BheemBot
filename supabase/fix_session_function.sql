-- Fix missing create_interview_session function
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION create_interview_session(
  p_interview_id       uuid,
  p_participant_name   text DEFAULT NULL,
  p_participant_email  text DEFAULT NULL,
  p_mode_used          "InterviewMode" DEFAULT 'CHAT',
  p_current_question_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session sessions;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM interviews
    WHERE id = p_interview_id
      AND "publicSlug" IS NOT NULL
      AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'Interview not found or inactive';
  END IF;

  INSERT INTO sessions ("interviewId", "participantName", "participantEmail", "modeUsed", "currentQuestionId")
  VALUES (p_interview_id, p_participant_name, p_participant_email, p_mode_used, p_current_question_id)
  RETURNING * INTO v_session;

  RETURN row_to_json(v_session);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_interview_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_interview_session TO anon;

-- Verify function was created
SELECT 
  routine_name,
  routine_type,
  specific_schema
FROM information_schema.routines
WHERE routine_name = 'create_interview_session'
  AND specific_schema = 'public';