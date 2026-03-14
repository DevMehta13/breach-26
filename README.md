# RecruitAI — AI-Powered Recruitment Platform

A unified recruitment hub that ingests candidate data from **Resumes (PDF/DOCX)**, **Emails (Gmail)**, **HRMS (BambooHR)**, and **LinkedIn PDFs**. It extracts structured data using AI, deduplicates candidates with a multi-layer scoring engine, and provides natural language search, AI job matching, candidate comparison, employee referrals, and similar candidate discovery — all in real-time via WebSockets.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Frontend Pages](#frontend-pages)
- [AI/ML Pipeline](#aiml-pipeline)
- [Deduplication Engine](#deduplication-engine)
- [Job Matching Engine](#job-matching-engine)
- [Search Pipeline](#search-pipeline)
- [Real-Time WebSocket Events](#real-time-websocket-events)
- [Database Schema](#database-schema)
- [Project Structure](#project-structure)

---

## Features

### Multi-Source Ingestion
- **Resume Upload** — Single and batch (up to 20) PDF/DOCX upload with AI-powered parsing
- **Gmail Sync** — OAuth2 integration pulls resume attachments from recruiter inbox
- **HRMS Sync** — BambooHR connector with mock data (3 candidates including 1 duplicate pair)
- **LinkedIn PDF** — Specialized parser for LinkedIn "Save to PDF" exports

### Intelligent Deduplication
- **3-Layer Cascading Scorer** — Deterministic, Adaptive Weighted, and Semantic Bypass layers
- **Real-Time Queue** — WebSocket-driven live dedup updates with merge/dismiss actions
- **Single-Signal Cap** — Prevents false positives from one weak signal
- **Retroactive Scan** — Re-run dedup across all existing candidates on demand
- **Field-Level Merge** — Smart conflict resolution with full audit trail

### Natural Language Search
- Queries like *"3 years of Python experience based in New York"*
- Groq LLM extracts structured intent (skills, location, experience)
- Hybrid search: strict SQL pre-filters + pgvector semantic ranking
- City aliases (NYC → New York), seniority inference (senior → 5yr)

### Job Openings & AI Candidate Matching
- Create job openings with auto-generated pgvector embeddings
- **AI Matching** — Composite scoring: 50% semantic + 25% skill + 15% experience + 10% title
- **Top K Filtering** — Top 3/5/20/50/100 with minimum relevance threshold
- **Candidate Comparison** — Side-by-side metrics table for any job

### Similar Candidates
- **pgvector Cosine Similarity** — Find candidates with similar profiles
- Button-triggered search from candidate detail page with auto-scroll to results
- Threshold filtering (only candidates above 65% similarity)

### Employee Referral System
- **Full Workflow** — Employee → Candidate → Job linking with status pipeline
- **Auto-Create Candidates** — New candidates created from referral if not in system
- **Status Pipeline** — Referred → Under Review → Interview → Hired/Rejected
- **Analytics Dashboard** — Top referrers, success rate, department breakdown, funnel (Recharts)

### Shortlists & Activity
- Shortlist management with notes per candidate
- Full audit trail of all platform actions
- Analytics dashboard with source breakdown and ingestion trends

### Platform
- **Real-Time Updates** — WebSocket broadcasts for all major events
- **Google OAuth** — Single sign-on + Gmail API scope for email sync
- **Candidate Status Management** — Dropdown to change status (needs_review → completed, etc.)
- **Command Palette** — Cmd+K quick navigation across all pages

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.13, FastAPI 0.115, SQLAlchemy 2.0 (async), Pydantic v2 |
| **AI/Orchestration** | LangChain, LangGraph (stateful workflow graphs) |
| **LLMs** | Gemini 2.0 Flash (document parsing), Groq Llama3-8b (fast search routing) |
| **Embeddings** | Google `gemini-embedding-001` (768 dimensions, truncated from 3072) |
| **Database** | Supabase PostgreSQL + pgvector extension |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **UI** | TailwindCSS 4, Shadcn/ui (base-ui), Recharts, Lucide Icons |
| **Auth** | JWT (HS256) + Google OAuth 2.0 |
| **Real-Time** | WebSocket (native FastAPI, singleton ConnectionManager) |
| **PDF Parsing** | PyMuPDF (fitz), python-docx, pdfplumber, pdfminer |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 16)                       │
│                                                                     │
│  Dashboard │ Candidates │ Search │ Jobs │ Compare │ Referrals       │
│  Upload    │ Dedup      │ Shortlists │ Analytics │ Activity         │
│                                                                     │
│                    REST API + WebSocket (real-time)                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                        FastAPI Backend                              │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ Auth        │  │ Ingestion    │  │ Search     │  │ Jobs &    │ │
│  │ JWT+OAuth   │  │ LangGraph    │  │ NL→Intent  │  │ Matching  │ │
│  │             │  │ Pipeline     │  │ →SQL+Vec   │  │ AI Scorer │ │
│  └─────────────┘  └──────┬───────┘  └────────────┘  └───────────┘ │
│                           │                                         │
│  ┌────────────────────────▼────────────────────────────────────┐   │
│  │              LangGraph Workflow Engine                       │   │
│  │                                                             │   │
│  │  Extract Text → Parse (Gemini) → Embed (768d) → Dedup      │   │
│  │       │              │               │            │         │   │
│  │   PDF/DOCX    Structured JSON   pgvector     3-Layer        │   │
│  │   Extraction  (Gemini→Groq     Embedding    Cascade         │   │
│  │               fallback)                      Scorer         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Supabase PostgreSQL + pgvector                  │   │
│  │                                                             │   │
│  │  candidates │ jobs │ employees │ referrals │ dedup_queue    │   │
│  │  users │ shortlists │ activity_log │ referral_rewards       │   │
│  │                                                             │   │
│  │  Vector indexes: candidates.embedding, jobs.embedding (768d)│   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
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
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

### 3. Database

Enable pgvector in Supabase SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Tables are auto-created on first backend start via SQLAlchemy `create_all`.

### 4. Run

```bash
# Terminal 1: Backend
cd backend && uvicorn backend.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend && npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo Credentials

```
Email:    demo@recruitai.com
Password: password123
```

---

## Environment Variables

Create `backend/.env`:

```env
# Database (Supabase pooler URL for production)
DATABASE_URL=postgresql://postgres.xxx:password@aws-xxx.pooler.supabase.com:6543/postgres

# Authentication
JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Google OAuth (for login + Gmail sync)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# AI APIs
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key

# Optional: HRMS
BAMBOOHR_API_KEY=
BAMBOOHR_SUBDOMAIN=
MOCK_HRMS_ENABLED=True

# Optional: Gmail
MOCK_GMAIL_ENABLED=True
GMAIL_CREDENTIALS_JSON=
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login (returns JWT) |
| `POST` | `/api/auth/google` | Google OAuth login |
| `GET` | `/api/auth/me` | Current user profile |

### Candidates
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/candidates` | List candidates (paginated) |
| `GET` | `/api/candidates/{id}` | Candidate detail |
| `PUT` | `/api/candidates/{id}` | Update candidate (incl. status change) |
| `DELETE` | `/api/candidates/{id}` | Delete candidate |
| `GET` | `/api/candidates/{id}/similar` | Find similar candidates via pgvector |

### Ingestion
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest/upload` | Upload single resume (PDF/DOCX) |
| `POST` | `/api/ingest/upload/batch` | Batch upload (up to 20 files) |
| `POST` | `/api/ingest/linkedin` | Upload LinkedIn PDF |
| `POST` | `/api/ingest/hrms/sync` | Sync from BambooHR |
| `POST` | `/api/ingest/gmail/sync` | Sync from Gmail |

### Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search` | Natural language candidate search |

### Jobs & Matching
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs` | Create job opening (auto-embeds) |
| `GET` | `/api/jobs` | List all jobs |
| `GET` | `/api/jobs/{id}` | Job detail |
| `POST` | `/api/jobs/{id}/match` | AI candidate matching (top_k param) |
| `POST` | `/api/jobs/{id}/compare` | Side-by-side candidate comparison |

### Employees
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/employees` | Create employee |
| `GET` | `/api/employees` | List employees |

### Referrals
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/referrals` | Create referral (auto-creates candidate) |
| `GET` | `/api/referrals` | List referrals with joins |
| `GET` | `/api/referrals/{id}` | Referral detail |
| `PATCH` | `/api/referrals/{id}/status` | Update referral status |
| `GET` | `/api/referrals/analytics` | Referral analytics dashboard data |

### Deduplication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dedup/queue` | Dedup queue (filterable by status) |
| `GET` | `/api/dedup/queue/{id}` | Dedup pair detail |
| `POST` | `/api/dedup/queue/{id}/merge` | Merge duplicate pair |
| `POST` | `/api/dedup/queue/{id}/dismiss` | Dismiss duplicate pair |
| `POST` | `/api/dedup/scan` | Retroactive full scan |

### Shortlists
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/shortlists` | Create shortlist |
| `GET` | `/api/shortlists` | List shortlists |
| `GET` | `/api/shortlists/{id}` | Detail with candidates |
| `POST` | `/api/shortlists/{id}/candidates` | Add candidate |
| `DELETE` | `/api/shortlists/{id}/candidates/{cid}` | Remove candidate |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/overview` | Platform analytics |
| `GET` | `/api/activity` | Activity log |
| `GET` | `/health` | Health check |
| `WS` | `/ws/{token}` | WebSocket connection |

---

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/login` | Login + Google OAuth |
| `/dashboard` | Overview dashboard with stats |
| `/candidates` | Candidate list with pagination |
| `/candidates/[id]` | Profile detail + status dropdown + "Find Similar" button |
| `/search` | Natural language AI search |
| `/upload` | Resume upload (single/batch) + HRMS/Gmail sync cards |
| `/jobs` | Job openings list + create dialog |
| `/jobs/[id]` | Job detail + AI matching (Top 3/5/20/50/100) |
| `/compare` | Select job + candidates → side-by-side comparison table |
| `/referrals` | Referral data table + create dialog |
| `/referrals/analytics` | Recharts: top referrers, funnel, department pie chart |
| `/dedup` | Dedup queue with Pending/Merged/Dismissed tabs |
| `/shortlists` | Shortlist management |
| `/shortlists/[id]` | Shortlist detail with candidates |
| `/analytics` | Platform analytics (source breakdown, ingestion trends) |
| `/activity` | Activity timeline |

---

## AI/ML Pipeline

### Ingestion Workflow (LangGraph)

```
Upload/Sync
    ↓
Extract Text (PyMuPDF / python-docx)
    ↓
Parse with Gemini 2.0 Flash → Groq fallback
    ↓ (structured JSON: name, email, phone, skills, experience, education, summary)
Generate Embedding (gemini-embedding-001, 768d)
    ↓
Dedup Check (3-layer cascade against existing candidates)
    ↓
    ├── AUTO_MERGE (≥0.85) → merge into existing
    ├── MANUAL_REVIEW (0.60–0.84) → queue for human
    └── NEW_CANDIDATE (<0.60) → save as new
```

### LLM Fallback Strategy

```
Gemini 2.0 Flash (primary, best quality)
    │
    ├── Success → ParsedResume JSON
    │
    └── 429 Rate Limit / Error
          ↓
        Groq Llama3-8b (fallback, zero latency)
          └── Success → ParsedResume JSON
```

---

## Deduplication Engine

### 3-Layer Cascade

| Layer | Strategy | Score | Trigger |
|-------|----------|-------|---------|
| **Layer 1** | Deterministic | 1.00 | Exact email OR exact phone match |
| **Layer 2** | Adaptive Weighted | 0.0–1.0 | Email 30% + Name 25% + Embedding 20% + Phone 15% + LinkedIn 10% |
| **Layer 3** | Semantic Bypass | ≤0.90 | Embedding similarity ≥0.82 AND name fuzzy ≥0.75 |

### Classification Thresholds

| Classification | Score | Action |
|---------------|-------|--------|
| AUTO_MERGE | ≥ 0.85 | Automatically merged |
| MANUAL_REVIEW | 0.60 – 0.84 | Queued for human review |
| NEW_CANDIDATE | < 0.60 | Created as new entry |

### Safeguards
- **Single-Signal Cap** — One signal alone capped at 0.40 (prevents false positives)
- **Null-Safe Weights** — Missing fields redistribute weight proportionally to present signals
- **No Skills in Dedup** — Skills are excluded from dedup signals (too generic)

---

## Job Matching Engine

### Composite Scoring Formula

```
score = (0.50 × semantic_similarity)
      + (0.25 × skill_match)
      + (0.15 × experience_match)
      + (0.10 × title_relevance)
```

| Signal | Weight | Method |
|--------|--------|--------|
| **Semantic** | 50% | pgvector cosine distance between job & candidate embeddings |
| **Skill Match** | 25% | Fraction of required skills found (JSONB + raw_text + summary fallback) |
| **Experience** | 15% | Proximity: `max(0.2, 1.0 - abs(diff) × 0.08)` |
| **Title** | 10% | Fuzzy `token_sort_ratio` between job title and candidate title |

### Key Features
- **Two-Pass Matching** — Pass 1: semantic (candidates with embeddings via pgvector), Pass 2: fallback (all remaining candidates scored by skill/exp/title)
- **Minimum Relevance** — Candidates below 20% composite are excluded (no forced fits)
- **Embedding Persistence** — Job embeddings saved to DB after first generation
- **Merged Excluded** — Merged candidate profiles filtered out of results

---

## Search Pipeline

### Query Flow

```
"3 years of python experience based in new york"
    ↓
Groq LLM → SearchIntent {skills: ["Python"], location: "New York", min_exp: 3}
    ↓
SQL Pre-Filters (hard constraints: experience ≥ 3, location ILIKE '%New York%', skills contain 'python')
    ↓
pgvector Semantic Ranking (cosine distance on query embedding)
    ↓
Composite Relevance: Skill 40% + Title 25% + Experience 20% + Summary 15%
```

### Query Examples

| Query | Parsed Intent |
|-------|--------------|
| *"3 years of python in NYC"* | skills=[Python], location=New York, min_exp=3 |
| *"senior ML engineer"* | skills=[ML], min_exp=5 (inferred) |
| *"React developer in SF"* | skills=[React], location=San Francisco |
| *"AWS with less than 10 years"* | skills=[AWS], max_exp=10 |

---

## Real-Time WebSocket Events

| Event | Trigger |
|-------|---------|
| `INGESTION_COMPLETE` | Resume/document fully processed and saved |
| `DEDUP_UPDATE` | New duplicate found (auto-merge or manual review queued) |
| `JOB_CREATED` | New job opening created |
| `JOB_MATCH_COMPLETED` | AI candidate matching finished |
| `REFERRAL_CREATED` | New employee referral submitted |
| `REFERRAL_STATUS_UPDATED` | Referral status changed |
| `GMAIL_SYNC_PROGRESS` | Gmail sync in progress |
| `HRMS_SYNC_PROGRESS` | HRMS sync in progress |
| `LINKEDIN_PARSED` | LinkedIn PDF parsed |

All events are broadcast to all connected clients via a singleton `ConnectionManager`.

---

## Database Schema

### Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Platform users | email, hashed_password, auth_provider, google_tokens |
| `candidates` | All candidate profiles | full_name, email, skills (JSONB), embedding (Vector 768), ingestion_status |
| `jobs` | Job openings | title, skills_required (JSONB), embedding (Vector 768), status |
| `employees` | Referring employees | name, email, department, company |
| `referrals` | Employee referrals | employee_id → candidate_id → job_id, status |
| `referral_rewards` | Referral bonuses | employee_id, referral_id, amount, status |
| `dedup_queue` | Duplicate candidate pairs | candidate_a_id, candidate_b_id, composite_score, status |
| `candidate_merge_history` | Merge audit trail | primary_id, merged_id, field_resolutions (JSONB) |
| `shortlists` | Candidate lists | name, description, created_by |
| `shortlist_candidates` | Junction table | shortlist_id, candidate_id, notes |
| `activity_log` | Full audit trail | user_id, action, entity_type, metadata (JSONB) |

### pgvector Columns
- `candidates.embedding` — 768-dim vector (Google gemini-embedding-001)
- `jobs.embedding` — 768-dim vector (generated from title + description + skills)

---

## Project Structure

```
breachshitt/
├── backend/
│   ├── main.py                          # FastAPI app + CORS + router registration
│   ├── .env                             # Environment variables
│   ├── api/                             # Route handlers (15 files)
│   │   ├── auth.py                      #   JWT login, register, Google OAuth
│   │   ├── ingest.py                    #   Single + batch resume upload
│   │   ├── sources.py                   #   Gmail/HRMS/LinkedIn sync
│   │   ├── search.py                    #   NLP search endpoint
│   │   ├── candidates.py               #   CRUD + similar candidates
│   │   ├── jobs.py                      #   Jobs + AI matching + compare
│   │   ├── employees.py                #   Employee CRUD
│   │   ├── referrals.py                #   Referrals + analytics
│   │   ├── dedup.py                     #   Dedup queue + merge/dismiss
│   │   ├── shortlists.py               #   Shortlist management
│   │   ├── analytics.py                #   Dashboard stats
│   │   ├── activity.py                 #   Audit log
│   │   ├── health.py                   #   Health check
│   │   └── ws.py                        #   WebSocket handler
│   ├── core/                            # Shared infrastructure
│   │   ├── auth.py                      #   JWT + bcrypt password hashing
│   │   ├── config.py                    #   Pydantic Settings (env vars)
│   │   ├── database.py                  #   Async SQLAlchemy + Supabase pooler
│   │   └── websocket_manager.py         #   WS broadcast singleton
│   ├── models/                          # SQLAlchemy ORM (11 files)
│   │   ├── base.py                      #   UUID + Timestamp mixins
│   │   ├── candidate.py                 #   Candidate + CandidateMergeHistory
│   │   ├── user.py                      #   User (JWT + Google OAuth tokens)
│   │   ├── job.py                       #   Job (with pgvector embedding)
│   │   ├── employee.py                 #   Employee
│   │   ├── referral.py                 #   Referral
│   │   ├── referral_reward.py          #   Referral rewards
│   │   ├── dedup.py                     #   DedupQueue
│   │   ├── shortlist.py                #   Shortlist + ShortlistCandidate
│   │   └── activity_log.py             #   ActivityLog
│   ├── schemas/                         # Pydantic request/response models
│   │   ├── auth.py, candidate.py, search.py, ingest.py
│   │   ├── job.py, employee.py, referral.py
│   │   ├── dedup.py, shortlist.py, activity.py
│   │   ├── analytics.py, sources.py
│   │   └── __init__.py
│   └── services/                        # Business logic
│       ├── candidates/
│       │   └── similarity.py            #   pgvector similar candidates
│       ├── dedup/
│       │   ├── blocker.py               #   Candidate blocking stage
│       │   ├── scorer.py                #   3-layer cascade scorer
│       │   ├── engine.py                #   Dedup orchestrator
│       │   └── merger.py                #   Field-level merge logic
│       ├── email/
│       │   └── gmail_client.py          #   Gmail API + mock mode
│       ├── hrms/
│       │   ├── bamboohr_client.py       #   BambooHR sync + mock data
│       │   └── field_mapper.py          #   HRMS → internal schema
│       ├── jobs/
│       │   └── job_matching_engine.py   #   AI matching + comparison
│       ├── linkedin/
│       │   └── linkedin_parser.py       #   LinkedIn PDF ingestion
│       ├── parsing/
│       │   ├── embedding.py             #   gemini-embedding-001 (768d)
│       │   ├── extractor.py             #   PDF/DOCX text extraction
│       │   └── gemini_parser.py         #   Gemini → Groq fallback parsing
│       ├── search/
│       │   ├── query_analyzer.py        #   NL → SearchIntent (Groq + regex)
│       │   └── semantic_search.py       #   Hybrid pgvector + SQL search
│       └── workflows/
│           ├── ingestion_graph.py       #   LangGraph: extract→parse→embed→dedup→save
│           └── search_graph.py          #   LangGraph: analyze→search→rank
│
├── frontend/
│   ├── app/                             # Next.js 16 App Router (18 pages)
│   │   ├── dashboard/page.tsx           #   Overview dashboard
│   │   ├── candidates/page.tsx          #   Candidate list
│   │   ├── candidates/[id]/page.tsx     #   Detail + status + similar
│   │   ├── search/page.tsx              #   NL search interface
│   │   ├── upload/page.tsx              #   Upload + sync (4 sources)
│   │   ├── jobs/page.tsx                #   Job list + create
│   │   ├── jobs/[id]/page.tsx           #   Job detail + AI matching
│   │   ├── compare/page.tsx             #   Candidate comparison table
│   │   ├── referrals/page.tsx           #   Referral table + create
│   │   ├── referrals/analytics/page.tsx #   Referral analytics (Recharts)
│   │   ├── dedup/page.tsx               #   Dedup queue (3 tabs)
│   │   ├── shortlists/page.tsx          #   Shortlist management
│   │   ├── shortlists/[id]/page.tsx     #   Shortlist detail
│   │   ├── analytics/page.tsx           #   Platform analytics
│   │   ├── activity/page.tsx            #   Activity timeline
│   │   ├── login/page.tsx               #   Login + OAuth
│   │   └── login/callback/page.tsx      #   OAuth redirect handler
│   ├── components/
│   │   ├── layout/                      #   Sidebar, Topbar, Command Palette
│   │   └── ui/                          #   Shadcn/ui components
│   ├── lib/
│   │   ├── api.ts                       #   Fetch wrapper with JWT auth
│   │   ├── types.ts                     #   TypeScript interfaces (all entities)
│   │   └── utils.ts                     #   Utility functions
│   └── providers/
│       ├── auth-provider.tsx            #   Auth context
│       └── websocket-provider.tsx       #   WS context + toast notifications
│
└── CLAUDE.md                            # AI assistant project instructions
```

---

## Supabase Connection Notes

This project uses Supabase's **connection pooler** (pgbouncer in transaction mode) which requires:

- `NullPool` — Let pgbouncer handle pooling, not SQLAlchemy
- `statement_cache_size=0` — Disable asyncpg's prepared statement cache
- `prepared_statement_name_func` — Unique names per statement (UUID-based)
- SSL context with `CERT_NONE` — Required for Supabase connections

These are configured in `backend/core/database.py`.

---

## License

Built for a hackathon. All rights reserved.
