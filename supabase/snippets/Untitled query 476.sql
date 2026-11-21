SELECT
  count(*) AS total_candidates,
  count(*) FILTER (
    WHERE "encryptedData" IS NOT NULL
      AND name IS NULL
      AND email IS NULL
      AND phone IS NULL
      AND gender IS NULL
      AND birthday IS NULL
      AND notes IS NULL
      AND education IS NULL
      AND school IS NULL
      AND major IS NULL
      AND "graduationYear" IS NULL
      AND "workExperience" IS NULL
      AND "inviteToken" IS NULL
  ) AS encrypted_candidates
FROM public.candidates;