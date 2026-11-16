# Project Progress: Privacy and Data Minimization

## Implemented safeguards

- `src/lib/privacy/pii-detector.ts` detects emails, formatted phone numbers,
  SSNs, card-like numbers, contextual names, street addresses, dates of birth,
  URLs, IPv4 addresses, IBANs, and common credential/token formats. Overlapping
  detections are prioritized to avoid partial masking.
- `src/lib/privacy/minimize.ts` provides shared category-specific redaction and
  a redaction count/category result.
- `src/lib/ai/sanitize.ts` sanitizes text in LLM messages and removes image
  parts. Groq and xAI provider adapters apply it for both streaming and
  non-streaming requests.
- The direct Groq resume parser minimizes locally extracted PDF text. Likely
  name, email, and phone values are extracted locally and returned to the
  browser separately from the hosted-model request.
- The local voice relay minimizes the latest transcript, conversation history,
  and question before its direct Groq call.
- Chat and voice transcript persistence minimize content. Privacy-event rows
  record categories/counts and masked text only; they no longer store raw input.
- Migration `008_session_content_retention.sql` clears historical raw privacy
  event content and restricts direct table access. The alternate
  `supabase/create_all.sql` setup path includes matching schema/policy updates.

## Retention and deletion

The implemented retention policy is 30 days for completed/abandoned session
content: `completedAt` is the baseline for completed sessions and
`lastActivityAt` for abandoned sessions without a completion time. The purge
removes message transcripts, privacy events, recording/screenshot objects and
metadata, participant identifiers, report-derived content, and anti-cheating
details. In-progress sessions are excluded; candidate records are managed
separately and are not deleted by this session-content policy.

The secured `POST /api/maintenance/purge-expired` endpoint is available. To
activate automatic retention, apply migration 008, configure
`RETENTION_JOB_SECRET`, and schedule a daily authenticated POST in the target
deployment. No scheduler is configured in this repository, so automatic
execution must not be assumed until deployment setup is complete.

Explicit session, interview, and account deletion paths remove media objects
from Storage. New content saves and report generation are blocked for purged
sessions.

## Tests and limitations

`tests/privacy-minimize.test.ts` covers common identifiers, expanded PII
categories, preservation of ordinary text, and stripping image parts before a
hosted call. Pattern-based detection can miss novel formats and is not a
substitute for a comprehensive DLP system. Whiteboard images are intentionally
omitted from hosted AI requests, so reports cannot reason over their visual
content.

See [privacy-controls.md](./privacy-controls.md) for the request/data-flow
details and deployment activation steps.
