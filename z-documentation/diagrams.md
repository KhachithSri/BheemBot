# Bheem AI Interview Bot Diagrams

These diagrams are designed for A4 landscape presentation pages. They use compact left-to-right composition, short labels, and grouped system boundaries.

## 1. End-to-End Data Flow

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "32px", "nodePadding": "8", "rankSpacing": "34", "nodeSpacing": "18"}}}%%
flowchart LR
    C[Candidate] --> N

    subgraph B[Browser]
        direction TB
        N[Notice + device checks]
        I[Interview UI]
        A[Answers and optional media]
        N --> I --> A
    end

    A --> API

    subgraph APP[Bheem application]
        direction TB
        API[Next.js API + tRPC]
        P[PII masking + access control]
        O[Interview orchestration]
        API --> P --> O
    end

    O -->|question / follow-up| LIVE
    LIVE -->|next question| I
    O -->|session complete| REPORT

    subgraph AI[AI processing]
        direction TB
        LIVE[Live AI model]
        REPORT[Report AI model]
        JSON[Structured report JSON]
        REPORT --> JSON
    end

    JSON --> DB
    A -. recordings .-> FILES
    P -. privacy metadata .-> EVENTS

    subgraph STORE[Supabase]
        direction TB
        DB[(PostgreSQL<br/>sessions, messages, reports)]
        FILES[(Storage<br/>recordings, screenshots)]
        EVENTS[(Privacy events)]
    end

    DB --> RESULTS
    FILES -. media access .-> RESULTS

    subgraph REVIEW[Human review]
        direction TB
        RESULTS[Results + candidate views]
        HUMAN[Review, correction, and decision]
        RESULTS --> HUMAN
    end

    classDef person fill:#dbeafe,stroke:#2563eb,color:#172554
    classDef browser fill:#fef3c7,stroke:#d97706,color:#451a03
    classDef app fill:#dcfce7,stroke:#16a34a,color:#052e16
    classDef process fill:#fee2e2,stroke:#dc2626,color:#450a0a
    classDef data fill:#f3e8ff,stroke:#9333ea,color:#3b0764
    classDef review fill:#ccfbf1,stroke:#0f766e,color:#042f2e
    class C person
    class N,I,A browser
    class API,P,O app
    class LIVE,REPORT,JSON process
    class DB,FILES,EVENTS data
    class RESULTS,HUMAN review
```

### Flow legend

- **Browser:** candidate-facing notices, interview interaction, device checks, and optional evidence capture.
- **Bheem application:** authentication, API routing, PII masking, interview orchestration, and completion handling.
- **Processing:** local speech services plus hosted models for live interaction and final reporting.
- **Supabase:** structured records, protected media, and privacy-event metadata.
- **Review:** AI results are presented to a human reviewer before an organisation decision.

## 2. Evaluation and Score Path

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "15px", "nodePadding": "8", "rankSpacing": "42", "nodeSpacing": "24"}}}%%
flowchart TB
    E1[Transcript]
    E2[Interview objective<br/>questions + criteria]
    E3[Code / whiteboard evidence]

    subgraph GEN[Report generation]
        PR[Summary prompt]
        RM[Report AI model]
        JS[Structured JSON]
    end

    subgraph EVAL[Evaluation outputs]
        QE[Question evaluation<br/>quality, relevance, depth<br/>score 1-10]
        CE[Criterion evaluation<br/>criterion-specific reasoning<br/>score 1-10]
        OA[Other analysis<br/>summary, themes, tone, research]
    end

    subgraph SCORE[Displayed score]
        QS[Average valid question scores]
        CF[Criterion average fallback<br/>only when no valid question score]
        OS[Overall score<br/>shown in reports and lists]
    end

    HR[Human review]

    E1 --> PR
    E2 --> PR
    E3 --> PR
    PR --> RM --> JS
    JS --> QE --> QS --> OS
    JS --> CE --> CF --> OS
    JS --> OA
    OS --> HR
    OA --> HR

    classDef evidence fill:#dbeafe,stroke:#2563eb,color:#172554
    classDef generation fill:#fee2e2,stroke:#dc2626,color:#450a0a
    classDef evaluation fill:#fef3c7,stroke:#d97706,color:#451a03
    classDef score fill:#dcfce7,stroke:#16a34a,color:#052e16
    classDef review fill:#ccfbf1,stroke:#0f766e,color:#042f2e
    class E1,E2,E3 evidence
    class PR,RM,JS generation
    class QE,CE,OA evaluation
    class QS,CF,OS score
    class HR review
```

**Scoring rule:** the headline score is the arithmetic mean of valid per-question scores. Assessment-criterion scores are displayed separately and are used only as a fallback when no valid question score exists. Tone, sentiment, themes, duration, and anti-cheating events do not automatically change the score.

## 3. System Architecture

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontSize": "32px", "nodePadding": "8", "rankSpacing": "40", "nodeSpacing": "24"}}}%%
flowchart LR
    subgraph USERS[Users]
        direction TB
        CA[Candidate]
        RV[Recruiter / reviewer]
    end

    subgraph CLIENT[Web client]
        direction TB
        PUB[Public interview link]
        DASH[Authenticated dashboard]
        UI[Next.js UI<br/>React + TypeScript]
        WS[WebSocket voice channel]
    end

    subgraph SERVER[Application server]
        direction TB
        MW[Middleware + auth]
        API2[Route handlers + tRPC]
        REL[Voice relay]
        PRIV[PII masking + rate limits]
        PROMPTS[Prompt builders]
        SCORE[Score utility]
    end

    subgraph AI[AI and voice services]
        direction TB
        STT2[Local Faster Whisper]
        TTS2[Local Piper]
        MODELS[Groq / xAI models]
        PARSER[JSON extraction]
    end

    subgraph SUPA[Supabase platform]
        direction TB
        AUTH[Supabase Auth]
        SQL[(PostgreSQL + RLS)]
        STORE[(Storage)]
    end

    subgraph GOVERN[Governance]
        direction TB
        REPORT[Session report]
        CAND[Candidate management]
        HUMAN[Human review<br/>correction / override / decision]
    end

    CA --> PUB --> UI
    RV --> DASH --> UI
    UI --> MW
    UI --> WS --> REL
    MW --> AUTH
    MW --> API2
    API2 --> PRIV
    API2 --> PROMPTS
    API2 --> SCORE
    PRIV --> SQL
    PRIV --> STORE
    REL --> STT2 --> REL
    REL --> TTS2 --> REL
    REL --> API2
    PROMPTS --> MODELS --> PARSER --> SQL
    SQL --> REPORT
    SQL --> CAND
    STORE --> REPORT
    REPORT --> HUMAN
    CAND --> HUMAN

    classDef user fill:#dbeafe,stroke:#2563eb,color:#172554
    classDef client fill:#fef3c7,stroke:#d97706,color:#451a03
    classDef server fill:#dcfce7,stroke:#16a34a,color:#052e16
    classDef ai fill:#fee2e2,stroke:#dc2626,color:#450a0a
    classDef platform fill:#f3e8ff,stroke:#9333ea,color:#3b0764
    classDef governance fill:#ccfbf1,stroke:#0f766e,color:#042f2e
    class CA,RV user
    class PUB,DASH,UI,WS client
    class MW,API2,REL,PRIV,PROMPTS,SCORE server
    class STT2,TTS2,MODELS,PARSER ai
    class AUTH,SQL,STORE platform
    class REPORT,CAND,HUMAN governance
```

### Architecture responsibilities

| Boundary | Responsibility |
|---|---|
| Web client | Notices, interview interaction, device checks, media capture, and dashboards |
| Application server | Authentication, access control, routing, PII masking, prompts, persistence, and scoring |
| AI and voice services | Local speech processing and hosted live/report model calls |
| Supabase | Auth, PostgreSQL records with RLS, and protected media storage |
| Governance | Human interpretation, correction, override, and final organisation decision |
