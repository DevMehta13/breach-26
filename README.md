# RecruitAI — AI-Powered Recruitment Platform

A unified recruitment hub that ingests candidate data from **Resumes**, **Gmail**, **HRMS (BambooHR)**, and **LinkedIn PDFs**, extracts structured data using LLMs, intelligently deduplicates candidates, and provides **natural language search** — all in real-time.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend                         │
│  Dashboard │ Upload │ Search │ Candidates │ Dedup │ Shortlists  │
│                    WebSocket (real-time)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST + WS
┌──────────────────────────▼──────────────────────────────────────┐
│                       FastAPI Backend                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              LangGraph Ingestion Pipeline                 │   │
│  │                                                           │   │
│  │  Extract Text ──► Parse (Gemini/Groq) ──► Embed (768d)   │   │
│  │       │                                        │          │   │
│  │       ▼                                        ▼          │   │
│  │  PDF/DOCX             Structured Data     pgvector        │   │
│  │  pdfplumber           (name, skills,      embedding       │   │
│  │  + pdfminer           education, exp)                     │   │
│  │       │                    │                   │          │   │
│  │       └────────────────────┼───────────────────┘          │   │
│  │                            ▼                              │   │
│  │                     Dedup Engine                           │   │
│  │              (block → score → classify)                    │   │
│  │                            │                              │   │
│  │            ┌───────────────┼───────────────┐              │   │
│  │            ▼               ▼               ▼              │   │
│  │       AUTO_MERGE     MANUAL_REVIEW    NEW_CANDIDATE       │   │
│  │       (score≥0.85)   (0.50–0.84)      (score<0.50)       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │   NLP Search         │  │   Data Sources                   │  │
│  │                      │  │                                  │  │
│  │  Groq query analysis │  │  Resume Upload (PDF/DOCX)        │  │
│  │  → SearchIntent      │  │  Gmail API (OAuth2 + sync)       │  │
│  │  → pgvector search   │  │  BambooHR (HRMS sync)            │  │
│  │  → composite scoring │  │  LinkedIn (PDF export parser)    │  │
│  └─────────────────────┘  └──────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │  Supabase PostgreSQL     │
              │  + pgvector (768-dim)    │
              └─────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript, TailwindCSS 4, shadcn/ui |
| **Backend** | Python, FastAPI, SQLAlchemy (async), Pydantic |
| **AI/Orchestration** | LangChain, LangGraph (stateful pipelines) |
| **LLMs** | Gemini 2.0 Flash (resume parsing) with Groq Llama 3.3 70B fallback |
| **Embeddings** | Google text-embedding-004 (768 dimensions) |
| **Search** | Groq (query analysis) + pgvector (semantic similarity) |
| **Database** | Supabase PostgreSQL + pgvector extension |
| **Auth** | JWT + Google OAuth 2.0 (with Gmail API scope) |
| **Real-time** | WebSocket (broadcast + personal channels) |

---

## Features

### Multi-Source Ingestion
- **Resume Upload** — Drag-and-drop PDF/DOCX with per-file progress tracking, batch upload (up to 20 files)
- **Gmail Sync** — OAuth2 integration fetches resume attachments from your inbox automatically
- **HRMS Sync** — BambooHR connector pulls employee/candidate data (mock mode with 8 realistic candidates + dedup triggers)
- **LinkedIn PDF** — Specialized parser for LinkedIn "Save to PDF" exports with company-grouped role handling

### Intelligent Deduplication
- **3-stage pipeline**: Blocking (narrow candidates) → Scoring (5 weighted signals) → Classification
- **Scoring signals**: Email match (35%), Phone match (20%), Fuzzy name (20%), LinkedIn URL (15%), Embedding similarity (10%)
- **Auto-merge** at 85%+ score, **manual review queue** at 50-84%, new record below 50%
- **Field-level merge** with conflict resolution and full audit trail

### Natural Language Search
- Query: *"3 years of python experience based in new york"*
- Groq parses into structured intent: `{skills: ["Python"], location: "New York", min_experience: 3}`
- Combined semantic (pgvector cosine distance) + structured SQL filters
- Composite relevance scoring: Skill match (40%) + Title relevance (25%) + Experience proximity (20%) + Summary coverage (15%)
- City aliases (*"NYC"* → New York), seniority inference (*"senior"* → 5yr min), disambiguation (*"in python"* ≠ location)

### Real-Time Dashboard
- WebSocket push notifications for every ingestion/merge event
- Source-specific contextual toasts (Resume/LinkedIn/Gmail/HRMS)
- Live candidate counter that increments without page refresh
- Connection status indicator (Live/Offline)

### Account Linking
- Email/password users can link their Google account for Gmail sync
- OAuth callback detects logged-in users and links tokens instead of creating new accounts
- Gmail card shows "Connect Gmail" or "Sync Gmail" based on connection state

---

## Project Structure

```
├── backend/
│   ├── main.py                          # FastAPI app + CORS + router registration
│   ├── .env                             # Environment config
│   ├── requirements.txt                 # Python dependencies
│   ├── api/                             # Route handlers
│   │   ├── auth.py                      #   JWT login, register, Google OAuth
│   │   ├── ingest.py                    #   Single + batch resume upload
│   │   ├── sources.py                   #   Gmail/HRMS/LinkedIn sync endpoints
│   │   ├── search.py                    #   NLP search endpoint
│   │   ├── candidates.py               #   Candidate CRUD
│   │   ├── dedup.py                     #   Dedup queue + merge actions
│   │   ├── shortlists.py               #   Favorites lists
│   │   ├── analytics.py                #   Dashboard stats
│   │   ├── activity.py                 #   Audit logs
│   │   └── ws.py                        #   WebSocket handler
│   ├── core/                            # Infrastructure
│   │   ├── auth.py                      #   JWT + password hashing
│   │   ├── config.py                    #   Pydantic Settings
│   │   ├── database.py                  #   SQLAlchemy async engine
│   │   ├── oauth.py                     #   Google OAuth2 flow
│   │   └── websocket_manager.py         #   WS broadcast manager
│   ├── models/                          # SQLAlchemy ORM
│   │   ├── candidate.py                 #   Candidate + merge history
│   │   ├── user.py                      #   User + Google OAuth tokens
│   │   ├── dedup.py                     #   Dedup queue entries
│   │   ├── shortlist.py                 #   Shortlist + members
│   │   └── activity_log.py             #   Audit trail
│   ├── schemas/                         # Pydantic request/response models
│   │   ├── ingest.py                    #   ParsedResume, UploadResponse
│   │   ├── search.py                    #   SearchIntent, SearchResponse
│   │   └── ...
│   └── services/                        # Business logic
│       ├── workflows/
│       │   ├── ingestion_graph.py       #   LangGraph: extract→parse→embed→dedup→save
│       │   └── search_graph.py          #   LangGraph: analyze→search
│       ├── parsing/
│       │   ├── extractor.py             #   PDF (pdfplumber+pdfminer) / DOCX extraction
│       │   ├── gemini_parser.py         #   Gemini→Groq fallback structured parsing
│       │   └── embedding.py             #   Google text-embedding-004
│       ├── dedup/
│       │   ├── blocker.py               #   Candidate blocking (email, phone, name, embedding)
│       │   ├── scorer.py                #   5-signal composite scoring
│       │   ├── engine.py                #   Orchestration: block→score→classify
│       │   └── merger.py                #   Field-level merge + audit
│       ├── search/
│       │   ├── query_analyzer.py        #   Groq NLP → SearchIntent
│       │   └── semantic_search.py       #   pgvector + SQL filters + scoring
│       ├── email/gmail_client.py        #   Real Gmail API + mock mode
│       ├── hrms/
│       │   ├── bamboohr_client.py       #   BambooHR sync + 8 mock candidates
│       │   └── field_mapper.py          #   HRMS field normalization
│       └── linkedin/linkedin_parser.py  #   LinkedIn PDF ingestion
│
├── frontend/
│   ├── app/                             # Next.js App Router
│   │   ├── page.tsx                     #   Landing page
│   │   ├── login/page.tsx               #   Login + Google OAuth button
│   │   ├── login/callback/page.tsx      #   OAuth redirect (login vs account linking)
│   │   ├── dashboard/page.tsx           #   Main dashboard
│   │   ├── upload/page.tsx              #   Upload & Sync (4 ingestion paths)
│   │   ├── search/page.tsx              #   NLP search interface
│   │   ├── candidates/page.tsx          #   Candidate list
│   │   ├── candidates/[id]/page.tsx     #   Candidate detail
│   │   ├── dedup/page.tsx               #   Dedup review queue
│   │   ├── shortlists/page.tsx          #   Shortlist management
│   │   ├── analytics/page.tsx           #   Charts & metrics
│   │   └── activity/page.tsx            #   Activity timeline
│   ├── components/
│   │   ├── layout/                      #   Sidebar, Topbar, Command Palette (Cmd+K)
│   │   └── ui/                          #   shadcn/ui components
│   ├── providers/
│   │   ├── auth-provider.tsx            #   Auth context (login, Google link, logout)
│   │   └── websocket-provider.tsx       #   WS context (messages, candidate counter)
│   └── lib/
│       ├── api.ts                       #   Fetch wrapper with JWT headers
│       └── types.ts                     #   TypeScript interfaces
│
└── docs/
    ├── PLAN.md                          # 5-phase development roadmap
    ├── progress.md                      # Implementation progress
    ├── requirements.md                  # Feature requirements
    └── demo-script.md                   # Demo walkthrough
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Supabase project with pgvector enabled
- API keys: Google (Gemini + OAuth), Groq

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

Create `backend/.env`:

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname

JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key

MOCK_HRMS_ENABLED=True
MOCK_GMAIL_ENABLED=False
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### 3. Database

Enable pgvector in Supabase SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Run migrations:

```bash
alembic upgrade head
```

Seed demo data:

```bash
python -m backend.scripts.seed
```

### 4. Run

**Backend:**
```bash
uvicorn backend.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo Credentials

```
Email:    demo@recruitai.com
Password: password123
```

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Email/password login |
| `GET` | `/api/auth/google/url` | Google OAuth consent URL |
| `POST` | `/api/auth/google/callback` | Exchange OAuth code (login or account linking) |
| `GET` | `/api/auth/me` | Current user (includes `google_connected` flag) |

### Ingestion
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest/upload` | Upload single resume (PDF/DOCX, max 10MB) |
| `POST` | `/api/ingest/upload/batch` | Upload up to 20 resumes at once |
| `POST` | `/api/ingest/linkedin` | Upload LinkedIn "Save to PDF" export |
| `POST` | `/api/ingest/hrms/sync` | Sync candidates from BambooHR |
| `POST` | `/api/ingest/gmail/sync` | Sync resume attachments from Gmail |

### Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search` | Natural language candidate search |

### Candidates
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/candidates` | List (paginated, filterable by source/status) |
| `GET` | `/api/candidates/{id}` | Full candidate detail |
| `PUT` | `/api/candidates/{id}` | Update candidate fields |
| `DELETE` | `/api/candidates/{id}` | Delete candidate |

### Deduplication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dedup/queue` | Pending duplicate pairs |
| `GET` | `/api/dedup/queue/{id}` | Pair detail (side-by-side comparison) |
| `POST` | `/api/dedup/queue/{id}/merge` | Merge duplicates |
| `POST` | `/api/dedup/queue/{id}/dismiss` | Not a duplicate |

### Shortlists
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/shortlists` | List shortlists |
| `POST` | `/api/shortlists` | Create shortlist |
| `GET` | `/api/shortlists/{id}` | Detail with candidates |
| `POST` | `/api/shortlists/{id}/candidates` | Add candidate |
| `DELETE` | `/api/shortlists/{id}` | Delete shortlist |

### Analytics & Activity
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/overview` | Dashboard stats & charts |
| `GET` | `/api/activity` | Audit trail |
| `WS` | `/ws/{token}` | Real-time WebSocket |

---

## LLM Fallback Strategy

```
Resume Text
    │
    ▼
  Gemini 2.0 Flash (structured output)
    │
    ├── Success → ParsedResume
    │
    └── 429 Rate Limit / Error
          │
          ▼
        Groq Llama 3.3 70B (structured output)
          │
          └── Success → ParsedResume
```

Both are free-tier compatible. Gemini provides best quality; Groq handles overflow with zero latency penalty.

---

## Search Query Examples

| Query | Parsed Intent | Result |
|-------|--------------|--------|
| *"3 years of python experience based in new york"* | skills=[Python], location=New York, min_exp=3 | NY-based Python devs, 3+ years |
| *"senior ML engineer"* | skills=[ML], min_exp=5 (inferred from "senior") | ML engineers with 5+ years |
| *"React developer in SF"* | skills=[React], location=San Francisco (alias) | SF-based React developers |
| *"AWS developer with less than 10 years"* | skills=[AWS], max_exp=10 | AWS devs with <10yr experience |
| *"frontend engineer"* | semantic_query="frontend engineer" | Title-weighted ranking |

---

## WebSocket Events

| Event | Fields | Trigger |
|-------|--------|---------|
| `INGESTION_COMPLETE` | `candidate_id`, `status`, `source`, `candidate_name` | Any candidate saved |
| `DEDUP_UPDATE` | `action`, `match_id`, `score` | Auto-merge or review queued |
| `GMAIL_SYNC_PROGRESS` | `synced`, `total` | During Gmail sync |
| `HRMS_SYNC_PROGRESS` | `candidate_name`, `synced`, `total` | During HRMS sync |
| `LINKEDIN_PARSED` | `candidate_name`, `filename` | LinkedIn PDF parsed |

---

## License

MIT