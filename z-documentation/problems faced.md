# Problems I Faced During the Bheem Project

These are the main problems I faced while implementing Bheem, and how I handled them. I would explain them in an interview like this.

## 1. Connecting several services together

The first major challenge was that Bheem was not a simple frontend application. It used Next.js, Supabase, PostgreSQL, tRPC, a WebSocket voice relay, a Python speech service, and external AI APIs. A problem in one service could look like a problem in another service.

I overcame this by separating the system into clear responsibilities. Next.js handled the application and API routes, Supabase handled authentication and storage, the WebSocket relay handled live voice communication, and the Python service handled speech-to-text and text-to-speech. I also added separate health checks and prefixed process logs so I could identify which service was failing.

## 2. Setting up the local voice system

The local voice feature required several things to work together: microphone input from the browser, audio conversion, Faster Whisper, Piper, the Python service, and the WebSocket relay. Initially, it was difficult to know whether a failure came from the browser audio format, the speech model, the Python environment, or the relay.

I overcame this by testing the services independently. I added `/health`, `/transcribe`, and `/synthesize` endpoints to the Python service and tested those before testing the complete interview flow. I also documented the required ports, environment variables, model paths, and audio format. This made it much easier to isolate failures.

## 3. Handling real-time audio correctly

The voice interview had to process audio continuously while also receiving AI responses and playing audio back to the candidate. Audio chunks could be incomplete, delayed, or left in a buffer when the candidate stopped speaking. This sometimes caused missing words or delayed responses.

I handled this by adding buffering and flush logic in the voice hook and relay. I made sure the remaining speech buffer was processed when the candidate stopped speaking or completed the session. I also added playback buffering so small timing differences would not immediately interrupt the spoken response.

## 4. Preventing data loss when a session ended

A candidate could close the browser, lose the network connection, reach the time limit, or click complete. These different events could happen close together, and I needed to avoid losing the final messages or creating duplicate completion records.

I addressed this by using session lifecycle states, heartbeats, activity segments, and a completion safety-net endpoint. Before completing a session, the application saves remaining messages and then marks the session as complete. I also made the completion logic tolerate repeated requests instead of assuming the browser would always send only one request.

## 5. Handling unreliable AI responses

The AI model did not always return exactly the response format I requested. It could omit fields, return invalid JSON, produce incomplete streamed content, or return an invalid score. This was a problem because the UI and database expected structured report data.

I overcame this by validating AI output before storing it. I added structured extraction and fallback behavior, and I made the scoring utility accept only valid scores. The overall score uses valid question scores first and only falls back to criterion scores when necessary. This prevents one malformed field from breaking the complete report.

## 6. Parsing streamed AI responses

The interview-generation and refinement features stream data using Server-Sent Events. Some models included `<think>` and `</think>` markers, and those markers could be split across two separate network chunks. Processing each chunk independently could show unwanted content or lose part of the response.

I solved this by keeping a remaining text buffer between chunks. The parser waits until it has enough text to identify the opening or closing marker, separates internal model content from user-visible content, and then continues streaming the clean result. I also validate the final content before using it.

## 7. Protecting personal information before AI calls

Interview answers and resumes can contain names, email addresses, phone numbers, URLs, and other personal information. Sending that information directly to an external AI provider would create an unnecessary privacy risk.

I implemented PII detection and a minimization helper. Common values are replaced with placeholders such as `[EMAIL]`, `[PHONE]`, and `[URL]` before the content is added to an AI prompt. I applied this to chat messages, voice transcripts, conversation history, and the current question. I also added tests for email, phone, and URL redaction.

One limitation I would mention honestly is that this protection still needs to be applied consistently to every AI endpoint and the privacy logs need further review. I would not claim that pattern-based detection catches every possible personal identifier.

## 8. Designing privacy logging without creating another risk

I wanted to record when personal information was detected so the system could be audited. However, storing the original unmasked content in a privacy event could create another copy of the sensitive data.

I handled the first part by creating a `privacy_events` table containing the session, message, PII types, detection count, masked content, threshold, and timestamp. I also added tests and indexes for audit queries. During review, I identified that original content should not be retained unnecessarily, so I marked removal or strict protection of raw content as a follow-up security improvement.

## 9. Keeping authentication and authorization consistent

Bheem supports normal Supabase cookie sessions, Bearer tokens for API requests, public interview links, and invite tokens. The difficult part was ensuring that a user could access their own organization and project data without exposing another candidate's session, recording, or report.

I handled this by centralizing common authentication and role checks for tRPC procedures and by checking organization, project, interview, and session ownership where data is accessed. I also added API-key authentication and rate limiting for the versioned API. During implementation, I found that some public session and upload routes still need stronger explicit ownership checks, so I recorded that as an important security follow-up rather than assuming the public token alone was enough.

## 10. Resolving database setup differences

The project had an ordered migration path and a separate `create_all.sql` setup script. They did not create exactly the same functions, storage policies, or RLS rules. This caused confusion when application code worked against one database setup but failed against another.

I overcame this by comparing the migration files with the bootstrap script and documenting the differences. I also added repair scripts for organization setup and session creation functions, plus a setup-check script for verifying the required database objects. The lesson was to maintain one clearly documented canonical schema setup and use repair scripts only when they are genuinely necessary.

## 11. Handling recordings and storage securely

The platform can store audio recordings, screenshots, and other interview evidence. Uploading a file was not enough; I also had to consider who could read it, how long a signed URL remained valid, and whether the session belonged to the requesting user.

I used Supabase Storage, protected database access with RLS, and used signed URLs for media access. I also documented that long-lived URLs and missing ownership checks are risks that must be tightened before production recruitment use. This helped separate what was implemented from what still required security hardening.

## 12. Making the application work across browsers and devices

Microphone, camera, screen-sharing, audio playback, and recording APIs do not behave identically in every browser. Mobile screens also created layout problems for timers, voice controls, whiteboards, and the code editor.

I handled this by adding onboarding device checks, responsive layouts, mobile-specific behavior, permission error handling, and clear fallback states. I tested the most important interview flows on different viewport sizes. Hardware-specific failures are still harder to reproduce automatically, so I kept the browser and device assumptions documented.

## 13. Testing external and real-time behavior

Normal unit tests were not enough for this project. The most important flows depended on a browser, WebSocket connection, Supabase, speech models, microphone permissions, and external AI providers. Those dependencies made tests slow, expensive, or nondeterministic.

I separated deterministic logic into testable utilities and added focused tests for rate limiting, scoring, session lifecycle, voice saving, playback buffering, interview templates, API-key authentication, and PII minimization. For external services, I tested the boundaries and error handling separately. This gave me reliable regression tests without requiring every test run to call a real AI provider.

## 14. Addressing fairness and human oversight

Because Bheem is intended for interviews, I had to consider the risk that AI might judge a candidate using tone, confidence, sentiment, personality, or other signals that are not directly related to the job.

I designed the scoring path around predefined questions and assessment criteria, and I treated the AI score as an advisory result rather than an automatic hiring decision. I also documented the need to disable emotion-style analysis for recruitment and require human review, correction, and override. These are important safeguards, but the full enforceable reviewer workflow is still a remaining implementation task.

## 15. Managing scope and documentation

The project grew to include chat, voice, recordings, whiteboards, code answers, candidate management, API keys, reports, privacy controls, and compliance requirements. Keeping the source code, database schema, diagrams, setup instructions, and progress notes synchronized became difficult.

I handled this by maintaining separate architecture, data-flow, database, privacy, and compliance documents, and by recording environment-dependent behavior explicitly. I also documented known limitations instead of presenting unfinished safeguards as complete. This made the project easier to explain and gave me a clear list of the next improvements.

## Short interview summary

The most difficult part of the project was coordinating real-time voice processing with AI, database persistence, privacy protection, and secure access control at the same time. I overcame the main issues by separating services, testing each boundary independently, adding buffering and recovery logic, validating AI output, minimizing PII before external calls, and writing focused tests. I also learned that security and compliance features need to be designed into the architecture from the beginning, because adding them only at the end leaves gaps between different routes and services.
