# Bheem AI Interview Bot

## 1. Problem Statement
Recruiters often spend significant time conducting repetitive screening interviews and comparing large numbers of candidate responses.
Candidates may not clearly understand when AI is being used, what information is collected, or how their responses will be evaluated.
Interview platforms can send unnecessary personal information to AI providers and retain sensitive recordings, transcripts, and screenshots without clear controls.
Automated scores can also introduce unfairness when they rely on tone, confidence, personality, or other signals that are not directly related to job requirements.
Bheem addresses these challenges through structured AI interviews, data minimisation, privacy notices, secure storage, and human review of AI-generated results.

### Key Problem Points
1. **Repetitive screening:** Bheem conducts structured chat and voice interviews consistently, reducing manual screening effort.
2. **Unclear AI use:** Bheem displays AI, data-use, recording, and sensitive-data notices before the interview begins.
3. **Excessive data exposure:** Bheem uses PII detection and masking to minimise unnecessary personal data before AI processing.
4. **Privacy and fairness risks:** Bheem is designed to secure interview data and keep recruitment evaluation focused on job-relevant evidence.
5. **Uncontrolled automated decisions:** Bheem treats AI scores as advisory results that require human review before a hiring decision.

## 2. Objectives
1. Provide clear candidate-facing transparency about AI use, data collection, recording, and analysis.
2. Minimise personal data before it reaches hosted AI models or privacy logs.
3. Protect interview data through access control, retention, deletion, and candidate-rights workflows.
4. Ensure recruitment decisions are based on relevant evidence and human oversight rather than unchecked AI output.

## 3. Tools and Technology Stack
### Application and frontend

- Next.js 14 with App Router
- React 18
- TypeScript
- Tailwind CSS
- Radix UI components
- Lucide React icons

### Backend and APIs

- Next.js route handlers
- tRPC
- Zod validation
- Node.js
- WebSocket voice relay

### AI and voice processing

- Groq and xAI model providers through OpenAI-compatible APIs
- OpenAI SDK client
- Local Faster Whisper speech-to-text service
- Local Piper text-to-speech service
- PII detection and masking utilities
- Structured JSON extraction for AI reports

### Database, authentication, and storage

- Supabase Auth
- PostgreSQL
- Supabase Storage
- Row Level Security policies
- Supabase Realtime configuration

### Testing and development

- Node.js test runner
- TypeScript compiler
- ESLint
- Playwright functional tests
- Supabase local development environment
- Git and GitHub repository workflow

## 4. Implemented Features

- Chat and voice interviews with configurable AI interviewers.
- Question generation, resume parsing, summaries, and candidate scoring.
- Candidate onboarding with microphone, camera, and screen checks.
- AI-use, data-use, recording, and sensitive-data notices.
- PII detection, masking, access control, signed URLs, authentication, and rate limiting.

## 5. Features Yet To Be Implemented

- Persist candidate acknowledgement and privacy-notice version.
- Apply shared PII minimisation to every AI request and remove raw PII from privacy logs.
- Disable emotion, personality, confidence, and sentiment analysis for recruitment.
- Make AI scores advisory and require human review, correction, and override.
- Fix storage access, ownership checks, retention, deletion, export, and appeal workflows.
- Add AI invocation logs, model and prompt tracking, incident handling, and reviewer training.

## 6. Data Flow Explanation

```mermaid
%%{init: {"themeVariables": {"fontSize": "18px"}}}%%
flowchart TB
	Candidate([Candidate])

	subgraph CLIENT[Candidate browser: collection and interaction]
		Notice[AI use, data use, recording, and sensitive-data notices]
		Consent{Candidate continues<br/>after notice}
		InterviewUI[Chat / voice / video interview UI]
		DeviceChecks[Microphone, camera, screen, and anti-cheating checks]
		Capture[Optional audio, camera, screen, whiteboard, and code capture]
		Answer[Candidate answer<br/>text, transcript, choice, code, or drawing]
	end

	subgraph APP[Bheem application boundary]
		Auth[Supabase Auth + session access checks]
		SessionAPI[Next.js route handlers / tRPC]
		VoiceRelay[WebSocket voice relay]
		PIIBoundary[PII detection and masking boundary]
		Interviewer[Interviewer prompt<br/>question order + follow-up rules]
		Completion[Session completion event]
		ReportAPI[Report generation endpoint]
	end

	subgraph LOCAL[Local voice services]
		STT[Local Faster Whisper<br/>speech to text]
		TTS[Local Piper<br/>text to speech]
	end

	subgraph DATA[Supabase data boundary]
		DB[(PostgreSQL<br/>interviews, questions, sessions, messages, reports)]
		Files[(Supabase Storage<br/>recordings and screenshots)]
		Privacy[(Privacy events<br/>PII type, count, masked content)]
	end

	subgraph AI[Hosted AI provider boundary]
		LiveModel[Interviewer model<br/>conversation and follow-ups]
		ReportModel[Report model<br/>summary and evaluations]
		JSON[Structured JSON extraction]
	end

	subgraph REVIEW[Organisation review boundary]
		Results[Results page / candidate manager]
		Evaluation[Question scores, criterion scores,<br/>strengths, improvements, tone, themes]
		Human[Human reviewer]
		Decision[Hiring or organisation decision]
	end

	Candidate --> Notice
	Notice --> Consent
	Consent -->|continue| InterviewUI
	Consent -->|leave| End[No interview data processed]
	InterviewUI --> DeviceChecks
	DeviceChecks --> Answer
	DeviceChecks --> Capture

	Answer --> SessionAPI
	InterviewUI -->|voice stream| VoiceRelay
	VoiceRelay --> STT
	STT -->|transcript| SessionAPI
	SessionAPI --> Auth
	Auth --> PIIBoundary
	PIIBoundary -->|masked answer / transcript| DB
	PIIBoundary -->|PII event metadata| Privacy
	PIIBoundary --> Interviewer
	Interviewer --> LiveModel
	LiveModel -->|next question or follow-up| InterviewUI
	InterviewUI -->|audio response| TTS
	TTS -->|spoken interviewer reply| InterviewUI

	Answer -->|message metadata| DB
	Capture -->|media metadata| DB
	Capture --> Files
	InterviewUI -->|progress / heartbeat| SessionAPI
	SessionAPI --> DB
	InterviewUI -->|complete| Completion
	Completion --> DB
	Completion --> ReportAPI

	ReportAPI -->|load transcript, objective,<br/>criteria, questions, code, drawings| DB
	ReportAPI --> Files
	ReportAPI -->|report input| ReportModel
	ReportModel --> JSON
	JSON -->|summary, themes, sentiment,<br/>questionEvaluations, criteriaEvaluations,<br/>toneAnalysis, researchFindings| DB

	DB --> Results
	Files --> Results
	Results --> Evaluation
	Evaluation --> Human
	Human --> Decision

	classDef actor fill:#e0f2fe,stroke:#0369a1,color:#082f49
	classDef process fill:#fef3c7,stroke:#b45309,color:#451a03
	classDef storage fill:#f3e8ff,stroke:#7e22ce,color:#3b0764
	classDef ai fill:#fee2e2,stroke:#b91c1c,color:#450a0a
	classDef review fill:#dcfce7,stroke:#15803d,color:#052e16
	class Candidate,Human,Decision actor
	class Notice,Consent,InterviewUI,DeviceChecks,Capture,Answer,SessionAPI,VoiceRelay,PIIBoundary,Interviewer,Completion,ReportAPI,STT,TTS,Results,Evaluation process
	class Auth,DB,Files,Privacy storage
	class LiveModel,ReportModel,JSON ai
	class End review
```

### Data flow steps

1. The candidate sees the AI-use, data-use, recording, and sensitive-data notices. Continuing starts the interview; leaving stops the flow before interview answers are collected.
2. The browser performs device and anti-cheating checks, then collects text, voice, video, choice answers, whiteboard drawings, code, and optional recordings according to the interview configuration.
3. Text and voice answers enter the Bheem application through Next.js APIs or the WebSocket voice relay. Local Faster Whisper transcribes voice, and local Piper speaks interviewer responses.
4. Authentication and project/session access checks run before persistence or review access. Candidate messages are passed through PII detection and masking, with privacy-event metadata recorded separately.
5. The interviewer model receives the interview script, current question, conversation context, and permitted answer data. It returns the next question or a follow-up according to the configured follow-up depth.
6. PostgreSQL stores interview configuration, questions, sessions, messages, progress, and generated reports. Supabase Storage holds recordings and screenshots; signed URLs are used for protected media access.
7. On completion, report generation loads the transcript, objective, assessment criteria, questions, code, and whiteboard context and sends the report input to the hosted report model.
8. Structured JSON extraction stores the summary, themes, sentiment, question evaluations, criterion evaluations, tone analysis, and research findings in the session report.
9. The results and candidate-management views display the report and scores. A human reviewer must interpret the advisory AI output before making an organisation or hiring decision.

### 6.1 Evaluation path inside the data flow

```mermaid
%%{init: {"themeVariables": {"fontSize": "18px"}}}%%
flowchart LR
	Transcript[Stored candidate transcript]
	Config[Interview objective + questions + assessment criteria]
	Evidence[Code snippets + whiteboard drawings + answer context]
	Prompt[Report prompt<br/>expert interview analyst]
	LLM[Hosted report model<br/>temperature 0.3]
	Parsed[Structured JSON extraction]
	QEval[Per-question evaluation<br/>quality, relevance, depth,<br/>strengths, improvements, score 1-10]
	CEval[Per-criterion evaluation<br/>criterion-specific reasoning,<br/>score 1-10]
	Other[Summary, themes, sentiment,<br/>tone, insights, research findings]
	Average[Overall score<br/>average valid question scores]
	Fallback[Fallback only when no valid<br/>question score exists:<br/>average criterion scores]
	Report[Session report + candidate list score]
	Human[Human review and decision]

	Transcript --> Prompt
	Config --> Prompt
	Evidence --> Prompt
	Prompt --> LLM --> Parsed
	Parsed --> QEval --> Average
	Parsed --> CEval --> Fallback
	Average --> Report
	Fallback --> Report
	Parsed --> Other --> Report
	Report --> Human

	classDef input fill:#e0f2fe,stroke:#0369a1,color:#082f49
	classDef model fill:#fee2e2,stroke:#b91c1c,color:#450a0a
	classDef score fill:#fef3c7,stroke:#b45309,color:#451a03
	classDef output fill:#dcfce7,stroke:#15803d,color:#052e16
	class Transcript,Config,Evidence input
	class Prompt,LLM,Parsed model
	class QEval,CEval,Average,Fallback score
	class Other,Report,Human output
```

The headline score is not a weighted combination of every signal. It is calculated as the arithmetic mean of valid per-question scores; criterion scores are only used as a legacy fallback when no valid question score exists. Tone, sentiment, themes, duration, anti-cheating events, and human review do not change the numeric score automatically.

## 6.2 System architecture

```mermaid
%%{init: {"themeVariables": {"fontSize": "18px"}}}%%
flowchart TB
	subgraph USERS[Users]
		CandidateUser[Candidate]
		ReviewerUser[Recruiter / reviewer]
	end

	subgraph EDGE[Browser and network edge]
		NextUI[Next.js App Router UI<br/>React + TypeScript + Tailwind]
		PublicInterview[Public interview link]
		Dashboard[Authenticated dashboard<br/>results, candidates, reports]
		WebSocket[WebSocket voice connection]
	end

	subgraph SERVER[Application server]
		Middleware[Middleware + authentication]
		Routes[Next.js route handlers<br/>AI, voice save, v1 API]
		TRPC[tRPC routers<br/>interviews, sessions, analysis]
		Relay[Local voice relay]
		PrivacyLib[PII detector, masking,<br/>rate limiting, API-key checks]
		PromptLib[Interviewer, generator,<br/>summary prompt builders]
		ScoreLib[Session score utility]
	end

	subgraph SERVICES[Processing services]
		Whisper[Faster Whisper<br/>local STT]
		Piper[Piper<br/>local TTS]
		AIProviders[Groq / xAI<br/>OpenAI-compatible hosted models]
		JSONParser[JSON extraction boundary]
	end

	subgraph SUPA[Supabase platform]
		SupaAuth[Supabase Auth]
		Postgres[(PostgreSQL + RLS)]
		Storage[(Supabase Storage<br/>recordings / screenshots)]
		Realtime[Supabase Realtime configuration]
	end

	subgraph GOVERNANCE[Review and governance boundary]
		ReportView[Session report]
		CandidateView[Candidate management]
		HumanReview[Human review, correction,<br/>override, and decision]
	end

	CandidateUser --> PublicInterview --> NextUI
	ReviewerUser --> Dashboard
	NextUI --> Middleware
	Dashboard --> Middleware
	NextUI --> WebSocket --> Relay

	Middleware --> SupaAuth
	Middleware --> Routes
	Middleware --> TRPC
	Routes --> PrivacyLib
	TRPC --> PrivacyLib
	Routes --> PromptLib
	TRPC --> PromptLib
	PrivacyLib --> Postgres
	PrivacyLib --> Storage
	Relay --> Whisper
	Whisper --> Relay
	Relay --> Piper
	Piper --> Relay
	Relay --> Routes
	PromptLib --> AIProviders
	AIProviders --> JSONParser
	JSONParser --> Postgres
	Routes --> ScoreLib
	TRPC --> ScoreLib
	Postgres --> ReportView
	Postgres --> CandidateView
	Storage --> ReportView
	ReportView --> HumanReview
	CandidateView --> HumanReview
	Realtime -. optional configured channel .-> NextUI

	classDef user fill:#e0f2fe,stroke:#0369a1,color:#082f49
	classDef app fill:#fef3c7,stroke:#b45309,color:#451a03
	classDef service fill:#fee2e2,stroke:#b91c1c,color:#450a0a
	classDef platform fill:#f3e8ff,stroke:#7e22ce,color:#3b0764
	classDef governance fill:#dcfce7,stroke:#15803d,color:#052e16
	class CandidateUser,ReviewerUser user
	class NextUI,PublicInterview,Dashboard,WebSocket,Middleware,Routes,TRPC,Relay,PrivacyLib,PromptLib,ScoreLib app
	class Whisper,Piper,AIProviders,JSONParser service
	class SupaAuth,Postgres,Storage,Realtime platform
	class ReportView,CandidateView,HumanReview governance
```

### Architecture responsibilities

- **Browser:** presents notices, runs interview interaction and device checks, captures configured media, and displays candidate or reviewer views.
- **Application server:** authenticates requests, enforces project/session access, saves messages and progress, coordinates voice, builds prompts, and stores generated reports.
- **Local voice services:** keep speech-to-text and text-to-speech processing on the local service path when voice mode is enabled.
- **Hosted AI providers:** generate interviewer turns and post-interview analysis from the data included in each prompt.
- **Supabase:** provides authentication, PostgreSQL persistence with RLS, protected media storage, and optional realtime configuration.
- **Scoring utility:** averages valid question scores and uses criterion scores only as a fallback; it does not make the hiring decision.
- **Human review:** interprets the AI output and remains the required decision boundary for recruitment use.

## 7. Conclusion

Bheem already provides the core AI interview experience and has useful privacy foundations, including PII utilities, access controls, signed URLs, tests, and candidate-facing notices.

The next implementation focus is to complete the privacy boundary around the AI interview. The highest-priority work is to persist candidate acknowledgement, apply minimisation consistently to every AI request, remove unsafe emotion-style evaluation, secure storage and privacy-event access, define retention and deletion, and require human review of AI-generated scores.

After these controls are implemented, Bheem will have a clearer, safer, and more transparent foundation for further EU AI Act, GDPR, security, and governance work.
