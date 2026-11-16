# Bheem EU AI Act Implementation Roadmap

**Assessment date:** 2026-09-17  
**Scope:** Immediate implementation requirements for the AI interview bot, limited to privacy, data minimisation, transparency, human review, and essential high-risk controls.

> This is a technical implementation roadmap, not legal advice. Confirm the final EU AI Act classification, lawful basis, retention periods, and deployment model with qualified EU counsel.

## Current Position

Bheem uses AI to conduct interviews and generate candidate summaries, criterion scores, question scores, sentiment, and tone analysis. When used for recruitment or candidate evaluation, this is likely an Annex III employment high-risk use case.

The immediate product requirement is to ensure that candidates understand the AI and data processing, that unnecessary personal data is not sent to models, that recordings and transcripts are controlled, and that AI output cannot become an unchecked employment decision.

## Scope For This Implementation

### Keep and implement now

1. Candidate-facing AI and data-use transparency.
2. Explicit acknowledgement before the interview starts.
3. Data minimisation before hosted AI processing.
4. No unnecessary sensitive or protected data in prompts or reports.
5. Recording, camera, screen-capture, and anti-cheating notices.
6. Strict access control for candidate data and privacy events.
7. Retention and deletion for transcripts, recordings, screenshots, and logs.
8. Human review, correction, and override of AI-generated scores.
9. Basic AI invocation and decision traceability.
10. Removal or disabling of emotion-style analysis for recruitment use.

### Defer until the foundation is complete

- Full conformity assessment and CE/registration analysis.
- Formal post-market monitoring programme.
- Complete provider quality-management system.
- Extensive model-card and supplier documentation.
- Broad fairness benchmarking across all markets.

These remain important, but they should follow the privacy and decision-control work below.

## Roadmap

### Phase 1: Candidate transparency and consent

**Status: UI started**

- [x] Show that the candidate is interacting with an AI interviewer.
- [x] Explain that answers may be transcribed and analysed for an interview report.
- [x] Explain conditional audio, camera, screen, and integrity collection.
- [x] Warn candidates not to provide unnecessary sensitive information.
- [x] State that AI output should not be the sole basis for a decision.
- [x] Require acknowledgement before onboarding continues.
- [ ] Persist the acknowledgement server-side with timestamp, session, interview, and notice version.
- [ ] Add links to the applicable privacy notice and contact for data rights.
- [ ] Record separate consent or legal-basis state for optional audio, video, screenshots, and screen capture.

Implemented UI locations:

- [public interview start](src/app/i/[slug]/page.tsx)
- [interview onboarding](src/components/session/interviewee-onboarding.tsx)

### Phase 2: Data minimisation at every AI boundary

**Status: Partial**

Existing foundations:

- [x] Common direct-identifier minimisation helper exists: [minimize.ts](src/lib/privacy/minimize.ts).
- [x] PII minimisation has a focused test: [privacy-minimize.test.ts](tests/privacy-minimize.test.ts).
- [x] PII detection and masking exist: [pii-detector.ts](src/lib/privacy/pii-detector.ts).

Implement next:

- [ ] Apply one shared minimisation pipeline to chat, summaries, resume parsing, voice transcripts, and refinement.
- [ ] Never send raw email, phone, address, payment, identity numbers, or URLs to hosted models unless strictly required.
- [ ] Remove gender and birthday extraction from recruitment parsing unless there is a documented lawful and necessary purpose.
- [ ] Do not place raw PII in privacy-event logs.
- [ ] Define allowed input fields for every prompt and reject unnecessary fields at the API boundary.
- [ ] Add tests proving raw identifiers do not reach each hosted-model request.
- [ ] Add prompt rules to ignore protected characteristics and irrelevant personal details.

Relevant AI boundaries:

- [chat route](src/app/api/ai/chat/route.ts)
- [generation route](src/app/api/ai/generate/route.ts)
- [resume parser](src/app/api/ai/parse-resume/route.ts)
- [voice save route](src/app/api/voice/save/route.ts)
- [summary prompt](src/lib/ai/prompts/summary.ts)

### Phase 3: Remove prohibited or unsafe evaluation signals

**Status: Not started**

- [ ] Disable tone, confidence, hesitation, enthusiasm, sentiment, and emotion-style analysis for employment/recruitment interviews.
- [ ] Do not infer personality, mental state, disability, or protected characteristics from voice, face, language, or behaviour.
- [ ] Keep evaluation tied only to predefined job-relevant answers and observable work products.
- [ ] Add a configuration guard that prevents recruitment projects from enabling emotion-style analysis.
- [ ] Add a regression test proving those fields are absent from recruitment reports.

Relevant implementation:

- [summary prompt](src/lib/ai/prompts/summary.ts)
- [session scoring](src/lib/session-score.ts)

### Phase 4: Human review and candidate rights

**Status: Not started**

- [ ] Make AI scores advisory only.
- [ ] Require a qualified human reviewer before rejection, ranking, or other adverse action.
- [ ] Add reviewer identity, timestamp, decision, rationale, and override fields.
- [ ] Add a correction workflow for inaccurate transcript or candidate data.
- [ ] Add a candidate complaint/appeal route and organisation response record.
- [ ] Prevent API consumers from treating an AI score as an automatic decision.
- [ ] Show reviewers the evidence supporting each score and its limitations.

### Phase 5: Privacy, storage, and access controls

**Status: Partial, remediation required**

- [ ] Restrict `privacy_events` RLS; remove unrestricted `USING (true)` and `WITH CHECK (true)` policies.
- [ ] Stop storing `original_content` in privacy events, or encrypt it with strictly limited access.
- [ ] Verify session ownership before upload, read, update, or download of recordings and screenshots.
- [ ] Replace one-year signed URLs with short-lived URLs.
- [ ] Add retention periods per data type: candidate profile, transcript, audio, screenshot, and audit log.
- [ ] Add scheduled deletion and deletion-on-request workflows.
- [ ] Add candidate export and correction workflows.
- [ ] Review Supabase storage policies for recordings and screenshots.
- [ ] Log access to recordings, screenshots, transcripts, and reports.

Relevant files:

- [privacy events migration](supabase/migrations/007_privacy_events.sql)
- [session upload route](src/app/api/session/upload/route.ts)
- [analysis router](src/server/routers/analysis.ts)
- [initial RLS policies](supabase/migrations/001_initial_schema.sql)

### Phase 6: Minimal traceability and governance

**Status: Not started**

- [ ] Create an AI system inventory identifying each AI feature, purpose, provider, model, and risk classification.
- [ ] Record provider, model, prompt version, input minimisation version, and output version for every report or score.
- [ ] Add an AI invocation log linked to session and reviewer actions.
- [ ] Document intended purpose, prohibited uses, limitations, human-oversight instructions, and known failure modes.
- [ ] Add incident reporting and model/prompt change review.
- [ ] Train administrators and reviewers on AI limitations, privacy, bias, and override duties.
- [ ] Complete a GDPR DPIA and, where applicable, the AI Act fundamental-rights impact assessment.

## Priority Order

### P0: Do before EU recruitment use

1. Disable emotion-style analysis for recruitment.
2. Finish candidate disclosure and persist acknowledgement.
3. Apply data minimisation to every hosted AI call, especially resume parsing and summaries.
4. Fix privacy-event RLS and upload/session ownership checks.
5. Implement retention and deletion for recordings, screenshots, transcripts, and candidate data.
6. Make scores advisory and require documented human review.

### P1: Do before customer-scale deployment

1. Add candidate correction, export, complaint, and appeal workflows.
2. Add AI invocation and reviewer audit logs.
3. Add provider/model/prompt version tracking.
4. Add accuracy, robustness, accessibility, and bias tests.
5. Complete DPIA, fundamental-rights assessment, supplier review, and reviewer training.

### P2: Formal compliance package

1. Confirm Bheem's provider/deployer role for each product configuration.
2. Confirm conformity-assessment and registration obligations.
3. Maintain technical documentation, risk records, incident records, and change history.

## Current Readiness

- **Candidate transparency:** Partial; UI implemented, server-side evidence still required.
- **Data minimisation:** Partial; shared helpers exist but are not applied consistently.
- **Emotion-recognition risk:** High until recruitment analysis is disabled or redesigned.
- **Human oversight:** Not implemented as an enforceable workflow.
- **Privacy and storage controls:** Partial with material access-control and retention gaps.
- **AI Act readiness for EU recruitment:** Not ready.

## Sources

- [European Commission: AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [AI Act Service Desk: Article 6](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-6)
- [AI Act Service Desk: Article 26](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-26)
- [AI Act Service Desk: Article 27](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-27)
- [AI Act Service Desk: Article 50](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50)
- [EUR-Lex: Regulation (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)

The AI Act Service Desk notes that some displayed provisions may be affected by Digital Omnibus amendments. Confirm final deadlines and transitional rules with EU regulatory counsel.
