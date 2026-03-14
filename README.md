# RecruitAI — AI-Powered Recruitment Platform

A unified recruitment hub that ingests candidate data from **Resumes (PDF/DOCX)**, **Emails (Gmail)**, **HRMS (BambooHR)**, and **LinkedIn PDFs**. It extracts structured data using AI, deduplicates candidates with a multi-layer scoring engine, and provides natural language search, AI job matching, candidate comparison, employee referrals, and similar candidate discovery — all in real-time via WebSockets.

**Live Demo:** [breach-26.vercel.app](https://breach-26.vercel.app) | **Backend:** Hosted on [Render](https://breach-26-backend.onrender.com)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Frontend Pages](#frontend-pages)
- [AI/ML Pipeline — Deep Dive](#aiml-pipeline--deep-dive)
- [Deduplication Engine — Deep Dive](#deduplication-engine--deep-dive)
- [Job Matching Engine](#job-matching-engine)
- [Search Pipeline — Deep Dive](#search-pipeline--deep-dive)
- [Real-Time WebSocket Events](#real-time-websocket-events)
- [Database Schema](#database-schema)
- [Performance Optimizations](#performance-optimizations)
- [UI/UX Design System](#uiux-design-system)
- [Project Structure](#project-structure)

---

## Features

### Multi-Source Ingestion
- **Resume Upload** — Single and batch (up to 20) PDF/DOCX upload with AI-powered parsing via Gemini 2.0 Flash
- **Gmail Sync** — OAuth2 integration pulls resume attachments from recruiter's inbox automatically
- **HRMS Sync** — BambooHR connector with mock data mode (3 candidates including 1 duplicate pair for testing)
- **LinkedIn PDF** — Specialized parser for LinkedIn "Save to PDF" exports with dedicated prompt engineering
- **Smart Failure Handling** — Failed parses are silently skipped (no "Unknown" stub candidates created)

### Intelligent Deduplication
- **3-Layer Cascading Scorer** — Deterministic (exact email/phone), Adaptive Weighted (null-safe redistribution), and Semantic Bypass layers
- **Tie-Breaking** — When scores tie, the most complete candidate record is preferred as merge target
- **Placeholder-Aware Merging** — "Unknown", "N/A", "None" treated as empty during merge so real data always wins
- **Real-Time Queue** — WebSocket-driven live dedup updates with merge/dismiss actions
- **Retroactive Scan** — Re-run dedup across all existing candidates on demand (O(n^2))
- **Field-Level Merge** — Smart conflict resolution with full audit trail (field_resolutions JSONB)
- **Merge History** — Dedicated tab showing all auto-merge events with which fields were updated

### Natural Language Search
- Queries like *"3 years of Python experience based in New York"*
- **Groq LLM** extracts structured intent (skills, location, experience range) with regex fallback
- **Hybrid Search** — strict SQL pre-filters (hard constraints) + pgvector semantic ranking (soft ranking)
- **City Aliases** — NYC/New York City → New York, SF → San Francisco, etc.
- **Seniority Inference** — "senior" → 5yr, "staff" → 8yr, "principal" → 12yr
- **Max Experience** — "less than 10 years" / "under 5 years" properly parsed as upper bounds
- **4-Signal Composite Scoring** — Skill Match (40%) + Title Relevance (25%) + Experience Proximity (20%) + Summary Coverage (15%)

### Job Openings & AI Candidate Matching
- Create job openings with auto-generated pgvector embeddings
- **AI Matching** — Composite scoring: 50% semantic + 25% skill + 15% experience + 10% title
- **Top K Filtering** — Top 3/5/20/50/100 with minimum relevance threshold (20%)
- **Candidate Comparison** — Side-by-side metrics table for any job with breakdown scores

### Similar Candidates
- **pgvector Cosine Similarity** — Find candidates with similar profiles (>65% threshold)
- Button-triggered search from candidate detail page with auto-scroll to results

### Employee Referral System
- **Full Workflow** — Employee → Candidate → Job linking with status pipeline
- **Auto-Create Candidates** — New candidates created from referral if not already in system
- **Status Pipeline** — Referred → Under Review → Interview → Hired/Rejected
- **Analytics Dashboard** — Top referrers, success rate, department breakdown, funnel (Recharts)

### Candidate Management
- **Active / Merged / History Tabs** — Merged candidates hidden from main list by default
- **Bulk Cleanup** — One-click "Clean Up Unknowns" button removes all failed parse stubs
- **Individual Delete** — Hover-reveal trash icon on every candidate card
- **Status Management** — Dropdown to change status (needs_review → completed, etc.)

### Analytics Dashboard
- **4 Gradient Stat Cards** — Total Candidates, Shortlists, Auto-Merged count, Avg Confidence
- **Ingestion Timeline** — Area chart with gradient fill showing last 30 days
- **Source Breakdown** — Donut chart with gradient fills and rounded corners
- **Pipeline Status** — Animated horizontal progress bars per status
- **Skills Landscape** — Treemap visualization of top skills across talent pool
- **Skill Radar** — Spider/radar chart showing top 6 skill coverage
- **Experience Distribution** — Histogram bucketed by years (0-2, 2-5, 5-8, 8-12, 12+)
- **Top Locations** — Horizontal bar chart of candidate geographic distribution

### Platform
- **Real-Time Updates** — WebSocket broadcasts for all major events with toast notifications
- **Google OAuth** — Single sign-on + Gmail API scope for email sync
- **Command Palette** — Cmd+K quick navigation across all pages
- **SWR-Style Caching** — API responses cached 30s client-side, stale-while-revalidate pattern
- **Prefetch on Hover** — Sidebar links prefetch API data + route chunks before click
- **Glassmorphism UI** — Frosted glass cards, backdrop-blur, gradient mesh backgrounds

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11, FastAPI 0.115, SQLAlchemy 2.0 (async), Pydantic v2 |
| **AI/Orchestration** | LangChain 1.2, LangGraph 1.1 (stateful workflow graphs) |
| **LLMs** | Gemini 2.0 Flash (document parsing + embeddings), Groq Llama3-8b (fast search routing) |
| **Embeddings** | Google `gemini-embedding-001` (768 dimensions) |
| **Database** | Supabase PostgreSQL + pgvector extension |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **UI** | TailwindCSS 4, Shadcn/ui (base-ui), Recharts 3, Framer Motion, Lucide Icons |
| **Auth** | JWT (HS256, 24hr expiry) + Google OAuth 2.0 |
| **Real-Time** | WebSocket (native FastAPI, singleton ConnectionManager) |
| **PDF Parsing** | PyMuPDF (fitz), python-docx, pdfplumber |
| **Fuzzy Matching** | thefuzz (Levenshtein distance for name comparison in dedup) |
| **Deployment** | Render (backend), Vercel (frontend), Supabase (database) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Frontend (Next.js 16)                         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  SWR Cache Layer (in-memory, 30s TTL, stale-while-revalidate)│   │
│  │  Prefetch on Hover │ Dedup In-Flight Requests                │   │
│  └──────────────────────────────────────────────────────────────┘   │
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
│  │   Extraction  (name, email,     Embedding    Cascade         │   │
│  │               skills, exp...)                Scorer         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Supabase PostgreSQL + pgvector                  │   │
│  │                                                             │   │
│  │  candidates │ jobs │ employees │ referrals │ dedup_queue    │   │
│  │  users │ shortlists │ activity_log │ merge_history          │   │
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

## Deployment

### Backend (Render)

1. Create a **Web Service** on Render, connect GitHub repo
2. Settings:
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - **Root Directory:** (leave empty — project root)
3. Environment Variables:
   - `PYTHON_VERSION=3.11.11` (critical — Python 3.14 breaks SQLAlchemy)
   - `DATABASE_URL=postgresql://...` (Supabase pooler URL)
   - `JWT_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - All other env vars from the [Environment Variables](#environment-variables) section

### Frontend (Vercel)

1. Import GitHub repo on Vercel
2. Settings:
   - **Framework Preset:** Next.js
   - **Root Directory:** `frontend`
3. Environment Variables:
   - `NEXT_PUBLIC_API_URL=https://your-backend.onrender.com`

### Database (Supabase)

1. Create a new project on Supabase
2. Enable pgvector: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Copy the **connection pooler** URL (Transaction mode, port 6543)
4. First backend deploy auto-creates all tables

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web Application)
3. Authorized redirect URIs:
   - `http://localhost:3000/login/callback` (local dev)
   - `https://your-app.vercel.app/login/callback` (production)
4. Enable **Gmail API** in the APIs library
5. Add test users (or publish the app) in the OAuth consent screen

---

## Environment Variables

### Backend (`backend/.env`)

```env
# ── Database ──────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres.xxx:password@aws-xxx.pooler.supabase.com:6543/postgres

# ── Authentication ────────────────────────────────────────────
JWT_SECRET=your-secret-key-min-32-chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440    # 24 hours

# ── Google OAuth (for login + Gmail sync) ─────────────────────
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# ── AI APIs ───────────────────────────────────────────────────
GEMINI_API_KEY=your-gemini-api-key    # Google AI Studio
GROQ_API_KEY=your-groq-api-key       # console.groq.com

# ── Optional: HRMS ───────────────────────────────────────────
BAMBOOHR_API_KEY=
BAMBOOHR_SUBDOMAIN=
MOCK_HRMS_ENABLED=True               # True = inject test data

# ── Optional: Gmail ──────────────────────────────────────────
MOCK_GMAIL_ENABLED=True              # True = simulate email
GMAIL_CREDENTIALS_JSON=
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> **Note:** WebSocket URL is automatically derived from `NEXT_PUBLIC_API_URL` by replacing `http` with `ws`. No separate WS env var needed.

---

## API Reference

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user (email + password) |
| `POST` | `/api/auth/login` | Login → returns JWT token |
| `GET`  | `/api/auth/google/url` | Get Google OAuth consent URL |
| `POST` | `/api/auth/google/callback` | Exchange OAuth code → JWT (supports account linking) |
| `GET`  | `/api/auth/me` | Current authenticated user profile |

### Candidates (`/api/candidates`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/candidates?status=active\|merged\|all` | List candidates (paginated, filtered) |
| `GET` | `/api/candidates/merge-history` | List all auto-merge events with field resolutions |
| `GET` | `/api/candidates/cleanup/unknowns` | — |
| `DELETE` | `/api/candidates/cleanup/unknowns` | Bulk delete "Unknown" + needs_review stubs |
| `GET` | `/api/candidates/{id}` | Full candidate profile |
| `PUT` | `/api/candidates/{id}` | Update candidate fields |
| `DELETE` | `/api/candidates/{id}` | Delete candidate |
| `GET` | `/api/candidates/{id}/similar` | Find similar candidates via pgvector |

### Ingestion (`/api/ingest`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest/upload` | Single resume upload (PDF/DOCX, max 10MB) |
| `POST` | `/api/ingest/upload/batch` | Batch upload (up to 20 files) |
| `POST` | `/api/ingest/linkedin` | LinkedIn PDF upload (specialized parser) |
| `POST` | `/api/ingest/hrms/sync` | Sync from BambooHR (or mock) |
| `POST` | `/api/ingest/gmail/sync` | Sync Gmail inbox for resume attachments |

### Search (`/api/search`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search` | Natural language candidate search |

**Request body:** `{ "query": "3 years of Python in New York" }`

**Response:** Parsed intent + ranked candidate results with similarity scores.

### Jobs & Matching (`/api/jobs`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs` | Create job opening (auto-generates embedding) |
| `GET`  | `/api/jobs` | List all jobs |
| `GET`  | `/api/jobs/{id}` | Job detail |
| `POST` | `/api/jobs/{id}/match` | AI candidate matching (top_k param) |
| `POST` | `/api/jobs/{id}/compare` | Side-by-side candidate comparison |

### Deduplication (`/api/dedup`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/dedup/queue` | Dedup queue (filter: pending/merged/dismissed) |
| `GET`  | `/api/dedup/queue/{id}` | Dedup pair detail with full candidate data |
| `POST` | `/api/dedup/queue/{id}/merge` | Approve merge (supports field_overrides) |
| `POST` | `/api/dedup/queue/{id}/dismiss` | Mark as "not a duplicate" |
| `POST` | `/api/dedup/scan` | Retroactive full scan across ALL candidates |
| `GET`  | `/api/dedup/history` | Merge audit trail |

### Shortlists (`/api/shortlists`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/shortlists` | Create shortlist |
| `GET`  | `/api/shortlists` | List shortlists |
| `GET`  | `/api/shortlists/{id}` | Detail with candidates |
| `POST` | `/api/shortlists/{id}/candidates` | Add candidate |
| `DELETE` | `/api/shortlists/{id}/candidates/{cid}` | Remove candidate |

### Referrals (`/api/referrals`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/referrals` | Create referral (auto-creates candidate if new) |
| `GET`  | `/api/referrals` | List with employee/candidate/job joins |
| `GET`  | `/api/referrals/{id}` | Referral detail |
| `PATCH` | `/api/referrals/{id}/status` | Update status |
| `GET`  | `/api/referrals/analytics` | Analytics: top referrers, funnel, department breakdown |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analytics/overview` | Full platform analytics (parallel queries) |
| `GET` | `/api/activity` | Activity audit log |
| `GET` | `/health` | Health check (DB connectivity) |
| `WS`  | `/ws/{token}` | WebSocket connection (JWT in URL) |
| `POST/GET` | `/api/employees` | Employee CRUD |

---

## Frontend Pages

| Route | Description | Key Features |
|-------|-------------|--------------|
| `/` | Landing page | Hero, feature showcase, animated stats |
| `/login` | Login/Register | Email/password + Google OAuth, glassmorphism inputs |
| `/dashboard` | Overview dashboard | Bento grid: hero stat, donut, sparkline, mini bars, activity feed |
| `/candidates` | Candidate list | Active/Merged/History tabs, delete buttons, bulk cleanup |
| `/candidates/[id]` | Profile detail | Status dropdown, "Find Similar" button, full parsed data |
| `/search` | AI search | Natural language input, parsed intent display, ranked results |
| `/upload` | Resume upload | Drag-drop zone, batch upload, HRMS/Gmail sync cards |
| `/jobs` | Job openings | List + create dialog |
| `/jobs/[id]` | Job detail | AI matching (Top K), candidate results table |
| `/compare` | Comparison | Select job + candidates → side-by-side metrics |
| `/referrals` | Referrals | Data table + create dialog |
| `/referrals/analytics` | Referral analytics | Recharts: top referrers, funnel, department pie |
| `/dedup` | Dedup queue | Pending/Merged/Dismissed tabs, side-by-side view |
| `/shortlists` | Shortlist mgmt | Create, list, manage |
| `/shortlists/[id]` | Shortlist detail | Candidates with notes |
| `/analytics` | Platform analytics | 8 charts: area, donut, treemap, radar, bars, histogram |
| `/activity` | Activity timeline | Full audit trail of platform actions |

---

## AI/ML Pipeline — Deep Dive

### Ingestion Workflow (LangGraph State Machine)

The ingestion pipeline is implemented as a **LangGraph compiled state graph** — each node transforms the state dict, and conditional edges route based on success/failure.

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│ extract_text │────→│ parse_with_gemini│────→│ generate_embedding│
│              │     │                  │     │                   │
│ PyMuPDF /    │     │ Gemini 2.0 Flash │     │ gemini-embedding  │
│ python-docx  │     │ → Structured JSON│     │ -001 (768 dims)   │
└──────┬───────┘     └────────┬─────────┘     └─────────┬─────────┘
       │                      │                          │
       │ (on error)           │ (on error)               │ (on error)
       ▼                      ▼                          ▼
  ┌─────────┐           ┌─────────┐                ┌─────────┐
  │ SKIP    │           │ SKIP    │                │ SKIP    │
  │ (no     │           │ (no     │                │ save    │
  │ stub    │           │ stub    │                │ without │
  │ created)│           │ created)│                │ embed)  │
  └─────────┘           └─────────┘                └─────────┘

  On success at each step ↓

┌──────────────────┐     ┌──────────────┐
│ run_dedup_check  │────→│ save_to_db   │
│                  │     │              │
│ Blocker → Scorer │     │ 3 paths:     │
│ → Classifier     │     │ AUTO_MERGE   │
│                  │     │ MANUAL_REVIEW│
│ 3-Layer Cascade  │     │ NEW_CANDIDATE│
└──────────────────┘     └──────────────┘
```

**Key design decisions:**
- **Fail-fast routing:** If any node fails, the pipeline skips directly to `save_to_db`. But if parsing produced no usable data (no `full_name`), the save is skipped entirely — no "Unknown" stubs.
- **State accumulation:** Each node returns a partial dict that gets merged into the running state. This means later nodes can access outputs of earlier nodes.
- **Async nodes:** `run_dedup_check` and `save_to_db` are async (database I/O), while text extraction and parsing are sync (CPU-bound).

### LLM Usage

| LLM | Model | Purpose | Why This Model |
|-----|-------|---------|---------------|
| **Gemini 2.0 Flash** | `gemini-2.0-flash` | Resume parsing, LinkedIn parsing | Best quality for document understanding, handles messy PDFs well |
| **Gemini Embedding** | `gemini-embedding-001` | 768-dim vector generation | High quality embeddings, good for cosine similarity in pgvector |
| **Groq Llama3-8b** | `llama3-8b-8192` | Search query analysis | Extremely fast (~100ms), good enough for intent extraction |

### Parsed Resume Schema

Gemini extracts this structured JSON from raw resume text:

```json
{
  "full_name": "Sarah Chen",
  "email": "sarah.chen@email.com",
  "phone": "+1-415-555-1234",
  "linkedin_url": "linkedin.com/in/sarahchen",
  "location": "San Francisco, CA",
  "current_title": "Senior Frontend Engineer",
  "years_experience": 8,
  "skills": ["React", "TypeScript", "Next.js", "GraphQL", "AWS"],
  "education": [
    { "degree": "BS", "institution": "Stanford", "year": "2016", "field_of_study": "CS" }
  ],
  "experience": [
    { "title": "Senior Frontend Engineer", "company": "Stripe", "duration": "2021-Present", "description": "Led React migration..." }
  ],
  "summary": "Experienced frontend engineer specializing in React...",
  "confidence_score": 0.92
}
```

---

## Deduplication Engine — Deep Dive

### Why 3 Layers?

No single signal is reliable enough alone:
- **Email** is strong but candidates might use different emails across sources
- **Name** has false positives (common names) and false negatives (nicknames)
- **Embedding** catches semantic similarity but can over-match different people with similar backgrounds

The 3-layer cascade handles all these edge cases:

### Stage 1: Blocking (Candidate Pool Generation)

Before scoring, we need to narrow down from potentially thousands of candidates to a manageable pool (~20). This is called **blocking** — fast, recall-oriented queries:

```
Query 1: Exact email match (strongest signal)
Query 2: Normalized phone match (strip non-digits, last 10)
Query 3: Name prefix (last name 3 chars + first initial)
Query 4: pgvector nearest neighbors (cosine > 0.80, top 10)

All results combined with OR → deduplicated pool (max 20)
```

**File:** `backend/services/dedup/blocker.py`

### Stage 2: Multi-Layer Scoring

For each blocked candidate, compute a composite score:

#### Layer 1: Deterministic (instant 1.0)
```python
if exact_email_match(new, existing):    return 1.0
if exact_phone_match(new, existing):    return 1.0
# else: proceed to Layer 2
```

#### Layer 2: Adaptive Weighted

Base weights (when ALL fields present on both sides):
```
Email:     0.30  (exact match = 1.0, same domain = 0.2)
Name:      0.25  (fuzzy: 0.7 × token_sort_ratio + 0.3 × partial_ratio)
Embedding: 0.20  (cosine similarity between 768-dim vectors)
Phone:     0.15  (exact = 1.0, last 7 digits = 0.5)
LinkedIn:  0.10  (normalized URL exact match = 1.0)
```

**Null-Safe Redistribution:** If a field is NULL on either side, its weight redistributes proportionally:
```
Example: LinkedIn PDF (no email) vs Gmail resume (has email)
  → Email weight (0.30) redistributed to Name, Embedding, Phone, LinkedIn
  → Effective weights: Name=0.36, Embedding=0.29, Phone=0.21, LinkedIn=0.14
```

This prevents the score from being artificially low just because one source lacks a field.

#### Layer 3: Semantic Bypass
```python
if embedding_similarity > 0.82 and name_fuzzy > 0.75:
    score = max(layer2_score, 0.90)  # Override to at least 0.90
```

This catches cases where the same person has very different structured data (e.g., different emails, different phone) but their resume content is nearly identical.

### Stage 3: Classification + Tie-Breaking

```
Score >= 0.85  →  AUTO_MERGE     (merge into existing record)
0.60 <= Score  →  MANUAL_REVIEW  (queue for human decision)
Score < 0.60   →  NEW_CANDIDATE  (create new entry)
```

**Tie-breaking** (when multiple candidates score identically): The engine prefers the most **complete** record as the merge target:
```python
completeness = (
    2 if has_real_name +   # extra weight for real name
    1 if has_title +
    1 if has_email +
    1 if has_summary +
    1 if has_skills +
    1 if has_experience
)
sort_key = (composite_score, completeness)  # both descending
```

### Merger: Field-Level Conflict Resolution

When merging, each field is resolved independently:

```python
# Placeholder detection: "Unknown", "None", "N/A" treated as empty
if old_is_placeholder and new_has_value:  → keep new (was_empty)
if old_has_value and new_is_placeholder:  → keep old (no_change)
if both_have_values and they_match:       → keep either (no_change)
if both_have_values and they_differ:      → keep newer (most_recent)

# Arrays (skills, education, experience): union + dedup
skills = old_skills ∪ new_skills  (dedup by lowercase)
```

All resolution decisions logged to `field_resolutions` JSONB for audit.

**Files:**
- `backend/services/dedup/blocker.py` — Blocking stage
- `backend/services/dedup/scorer.py` — 3-layer cascade scoring
- `backend/services/dedup/engine.py` — Orchestrator + classification
- `backend/services/dedup/merger.py` — Field-level merge logic

---

## Job Matching Engine

### Composite Scoring Formula

```
score = (0.50 × semantic_similarity)
      + (0.25 × skill_match)
      + (0.15 × experience_match)
      + (0.10 × title_relevance)
```

| Signal | Weight | Calculation |
|--------|--------|-------------|
| **Semantic** | 50% | Cosine similarity: job.embedding vs candidate.embedding |
| **Skill Match** | 25% | `matched_skills / required_skills` (checks JSONB + raw_text + summary) |
| **Experience** | 15% | `max(0.2, 1.0 - abs(candidate_exp - required_exp) × 0.08)` |
| **Title** | 10% | Fuzzy `token_sort_ratio(job_title, candidate_title)` |

**Two-Pass Matching:**
1. **Pass 1:** Candidates WITH embeddings → pgvector cosine distance query (fast, uses index)
2. **Pass 2:** Remaining candidates → skill/experience/title scoring only (no semantic signal)

Results merged and sorted by composite score. Minimum 20% threshold.

**File:** `backend/services/jobs/job_matching_engine.py`

---

## Search Pipeline — Deep Dive

### End-to-End Flow

```
User Query: "3 years of python experience based in new york"
                              │
                    ┌─────────▼──────────┐
                    │ Query Analyzer     │
                    │ (Groq Llama3-8b)   │
                    │                    │
                    │ Extracts:          │
                    │  skills: [Python]  │
                    │  location: New York│
                    │  min_exp: 3        │
                    │  max_exp: 0        │
                    └─────────┬──────────┘
                              │
            ┌─────────────────▼─────────────────┐
            │ Strict SQL Pre-Filters             │
            │ (hard constraints — NEVER relaxed) │
            │                                    │
            │ WHERE years_experience >= 3        │
            │   AND location ILIKE '%New York%'  │
            │   AND (skills::text ILIKE '%python%│
            │        OR summary ILIKE '%python%' │
            │        OR raw_text ILIKE '%python%')│
            │   AND ingestion_status IN (...)    │
            │   AND ingestion_status != 'merged' │
            └─────────────────┬─────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Semantic Ranking   │
                    │                    │
                    │ If embeddings exist:│
                    │   pgvector cosine  │
                    │   distance sort    │
                    │                    │
                    │ Else: Composite    │
                    │   keyword scorer:  │
                    │   Skill 40%        │
                    │   Title 25%        │
                    │   Experience 20%   │
                    │   Summary 15%      │
                    └────────────────────┘
```

### Query Analyzer: Groq + Regex Fallback

The analyzer tries Groq first (structured output), then patches any gaps with regex:

```python
# 1. Groq parses the query into SearchIntent
result = groq.with_structured_output(SearchIntent).invoke(query)

# 2. Patch missing fields from regex fallback
if not result.skills:      result.skills = regex_fallback.skills
if not result.location:    result.location = regex_fallback.location
if result.min_exp == 0:    result.min_exp = regex_fallback.min_exp
```

**City aliases** (checked before regex):
```python
CITY_ALIASES = {
    "nyc": "New York", "new york city": "New York",
    "sf": "San Francisco", "san fran": "San Francisco",
    "la": "Los Angeles", "dc": "Washington",
    "chi": "Chicago", "atx": "Austin", ...
}
```

**Seniority-to-experience inference** (when no explicit years):
```python
SENIORITY_EXPERIENCE = {
    "senior": 5, "staff": 8, "principal": 12,
    "lead": 5, "cto": 12
}
```

### Keyword Composite Scorer

When pgvector embeddings aren't available, candidates are ranked by 4 weighted signals computed entirely in SQL:

```sql
composite = (
    skill_matches / total_skills * 40     -- Skill Match
  + title_word_matches / total_words * 25 -- Title Relevance
  + max(100 - abs(exp - target)*10, 20) * 20 / 100 -- Experience Proximity
  + summary_keyword_hits / total_keywords * 15 -- Summary Coverage
) / 100
```

**Files:**
- `backend/services/search/query_analyzer.py` — NL → SearchIntent
- `backend/services/search/semantic_search.py` — Hybrid search execution

---

## Real-Time WebSocket Events

The backend maintains a singleton `ConnectionManager` that broadcasts events to all connected clients. The frontend shows toast notifications for each event type.

| Event | When It Fires | Frontend Toast |
|-------|--------------|---------------|
| `INGESTION_COMPLETE` | Resume parsed and saved | "Gmail: Candidate ingested" |
| `DEDUP_UPDATE` | Duplicate found or auto-merged | "Duplicate Auto-Merged: Alice ↔ Alice K. (95%)" |
| `GMAIL_SYNC_PROGRESS` | Each Gmail attachment processed | "Gmail Sync: 3/5 attachments processed" |
| `HRMS_SYNC_PROGRESS` | Each HRMS record synced | "HRMS: John Doe added to database" |
| `LINKEDIN_PARSED` | LinkedIn PDF parsed | "Sarah Chen parsed successfully" |
| `JOB_CREATED` | New job opening created | — |
| `JOB_MATCH_COMPLETED` | AI matching finished | — |
| `REFERRAL_CREATED` | Employee referral submitted | — |
| `REFERRAL_STATUS_UPDATED` | Referral status changed | — |

**Connection:** `ws://host/ws/{jwt_token}` — JWT is passed in the URL path. Connection auto-reconnects after 3 seconds on close.

**Files:**
- `backend/core/websocket_manager.py` — Singleton manager
- `backend/api/ws.py` — WebSocket endpoint
- `frontend/providers/websocket-provider.tsx` — Client-side handler

---

## Database Schema

### Entity-Relationship Overview

```
users ──────────┬──→ candidates (created_by)
                ├──→ shortlists (created_by)
                ├──→ jobs (created_by)
                ├──→ activity_log (user_id)
                └──→ dedup_queue (resolved_by)

candidates ─────┬──→ dedup_queue (candidate_a, candidate_b)
                ├──→ candidate_merge_history (primary, merged)
                ├──→ shortlist_candidates (candidate_id)
                └──→ referrals (candidate_id)

jobs ───────────┬──→ referrals (job_id)
employees ──────┘──→ referrals (employee_id)
```

### Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `users` | email, hashed_password, auth_provider, google_access/refresh_token | Platform users (JWT + OAuth) |
| `candidates` | full_name, email, skills (JSONB), embedding (Vector 768), ingestion_status, source | All candidate profiles |
| `candidate_merge_history` | primary_candidate_id, merged_candidate_id, field_resolutions (JSONB) | Merge audit trail |
| `dedup_queue` | candidate_a_id, candidate_b_id, composite_score, status | Duplicate pairs for review |
| `jobs` | title, skills_required (JSONB), embedding (Vector 768), status | Job openings |
| `shortlists` | name, description, created_by | Candidate lists |
| `shortlist_candidates` | shortlist_id, candidate_id, notes | Junction table |
| `employees` | name, email, department, company | Referring employees |
| `referrals` | employee_id, candidate_id, job_id, status | Employee referrals |
| `activity_log` | user_id, action, entity_type, metadata (JSONB) | Full audit trail |

### pgvector Columns
- `candidates.embedding` — 768-dim (cosine similarity index)
- `jobs.embedding` — 768-dim (cosine similarity index)

### Supabase Connection Notes
Uses Supabase's **connection pooler** (pgbouncer in transaction mode):
- `NullPool` — Let pgbouncer handle pooling, not SQLAlchemy
- `statement_cache_size=0` — Disable asyncpg's prepared statement cache
- SSL context with `CERT_NONE` — Required for Supabase connections

---

## Performance Optimizations

### Frontend

| Optimization | How It Works |
|-------------|-------------|
| **SWR-Style Cache** | All GET responses cached in-memory for 30s. Returns cached data instantly on revisit. Stale data served immediately while fresh data loads in background. |
| **Request Deduplication** | Multiple components requesting the same endpoint simultaneously → only 1 network call. |
| **Prefetch on Hover** | Hovering a sidebar link prefetches both the Next.js route chunk AND the page's API data. By click time, everything is ready. |
| **Cache Invalidation** | Mutations (DELETE, POST, PUT) auto-invalidate related cache entries. Logout clears entire cache. |
| **Next.js prefetch** | All sidebar `<Link>` components have `prefetch={true}` for route-level code splitting. |

### Backend

| Optimization | How It Works |
|-------------|-------------|
| **Parallel Analytics Queries** | All 9 analytics queries run concurrently via `asyncio.gather` instead of sequentially. Response time = slowest query, not sum of all. |
| **pgvector Indexes** | Cosine similarity queries use vector indexes for sub-linear search time. |
| **Blocking in Dedup** | Instead of scoring ALL candidates (O(n^2)), blocking reduces the pool to ~20 candidates before running the expensive scorer. |
| **Supabase Pooler** | Connection pooling via pgbouncer avoids connection overhead per request. |

---

## UI/UX Design System

### Glassmorphism Theme

The app uses a warm cream/terracotta/sage color palette with frosted glass effects:

```css
/* Card glass effect */
background: rgba(253, 251, 248, 0.55);
backdrop-filter: blur(16px) saturate(1.4);
border: 1px solid rgba(255, 255, 255, 0.4);
box-shadow: 0 4px 24px rgba(45,45,42,0.04), inset 0 1px 0 rgba(255,255,255,0.5);

/* Background gradient mesh */
background:
  radial-gradient(ellipse at 20% 50%, rgba(196,85,58,0.06) 0%, transparent 50%),
  radial-gradient(ellipse at 80% 20%, rgba(196,144,58,0.05) 0%, transparent 50%),
  radial-gradient(ellipse at 50% 80%, rgba(74,140,92,0.04) 0%, transparent 50%);
```

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#F5F0EB` | Page background |
| `--foreground` | `#2D2D2A` | Primary text |
| `--terra` | `#C4553A` | Primary accent (CTAs, active states) |
| `--sage` | `#4A8C5C` | Success states, secondary accent |
| `--card` | `#FDFBF8` | Card backgrounds (with glass effect) |
| `--muted` | `#EDE7E0` | Disabled states, borders |

### Chart Colors
```
Terra:  #C4553A    Sage:   #4A8C5C    Gold:   #C4903A
Steel:  #6B8CA3    Plum:   #8B6B99    Umber:  #A0785A
```

---

## Project Structure

```
breachshitt/
├── backend/
│   ├── main.py                          # FastAPI app entry point
│   ├── requirements.txt                 # Pinned Python dependencies
│   ├── api/                             # Route handlers
│   │   ├── auth.py                      #   JWT + Google OAuth
│   │   ├── ingest.py                    #   Single + batch upload
│   │   ├── sources.py                   #   Gmail/HRMS/LinkedIn sync
│   │   ├── search.py                    #   NLP search endpoint
│   │   ├── candidates.py               #   CRUD + merge history + cleanup
│   │   ├── jobs.py                      #   Jobs + AI matching + compare
│   │   ├── employees.py                #   Employee CRUD
│   │   ├── referrals.py                #   Referrals + analytics
│   │   ├── dedup.py                     #   Dedup queue + merge/dismiss + scan
│   │   ├── shortlists.py               #   Shortlist management
│   │   ├── analytics.py                #   Dashboard stats (parallel queries)
│   │   ├── activity.py                 #   Audit log
│   │   ├── health.py                   #   Health check
│   │   └── ws.py                        #   WebSocket handler
│   ├── core/
│   │   ├── auth.py                      #   JWT creation/validation + bcrypt
│   │   ├── oauth.py                     #   Google OAuth flow
│   │   ├── config.py                    #   Pydantic Settings
│   │   ├── database.py                  #   Async SQLAlchemy + Supabase pooler
│   │   └── websocket_manager.py         #   WS broadcast singleton
│   ├── models/                          # SQLAlchemy ORM models
│   │   ├── base.py                      #   UUID + Timestamp mixins
│   │   ├── candidate.py                 #   Candidate + MergeHistory
│   │   ├── user.py                      #   User (with Google tokens)
│   │   ├── job.py                       #   Job (with pgvector)
│   │   ├── dedup.py                     #   DedupQueue
│   │   ├── shortlist.py                #   Shortlist + ShortlistCandidate
│   │   ├── employee.py, referral.py    #   Employee, Referral
│   │   └── activity_log.py             #   ActivityLog
│   ├── schemas/                         # Pydantic request/response models
│   └── services/                        # Business logic
│       ├── workflows/
│       │   ├── ingestion_graph.py       #   LangGraph pipeline (5 nodes)
│       │   └── search_graph.py          #   Search workflow
│       ├── parsing/
│       │   ├── extractor.py             #   PDF/DOCX → raw text
│       │   ├── gemini_parser.py         #   Gemini structured parsing
│       │   └── embedding.py             #   768-dim vector generation
│       ├── dedup/
│       │   ├── blocker.py               #   4-key blocking
│       │   ├── scorer.py                #   3-layer cascade scorer
│       │   ├── engine.py                #   Orchestrator + tie-breaking
│       │   └── merger.py                #   Field-level merge + placeholders
│       ├── search/
│       │   ├── query_analyzer.py        #   Groq + regex fallback
│       │   └── semantic_search.py       #   Hybrid SQL + pgvector search
│       ├── jobs/
│       │   └── job_matching_engine.py   #   4-signal composite scoring
│       ├── candidates/
│       │   └── similarity.py            #   pgvector similar candidates
│       ├── email/
│       │   └── gmail_client.py          #   Gmail API + mock mode
│       ├── hrms/
│       │   ├── bamboohr_client.py       #   BambooHR + mock data
│       │   └── field_mapper.py          #   HRMS → internal schema
│       └── activity.py                  #   Audit logging helper
│
├── frontend/
│   ├── app/                             # Next.js 16 App Router (18 pages)
│   │   ├── layout.tsx                   #   Root layout + providers
│   │   ├── page.tsx                     #   Landing page
│   │   ├── loading.tsx                  #   Global loading spinner
│   │   ├── globals.css                  #   Theme + glassmorphism utilities
│   │   ├── dashboard/page.tsx           #   Bento grid dashboard
│   │   ├── candidates/page.tsx          #   Active/Merged/History tabs
│   │   ├── candidates/[id]/page.tsx     #   Profile + similar candidates
│   │   ├── search/page.tsx              #   NL search interface
│   │   ├── upload/page.tsx              #   Drag-drop + sync cards
│   │   ├── jobs/page.tsx, [id]/page.tsx #   Job CRUD + AI matching
│   │   ├── compare/page.tsx             #   Side-by-side comparison
│   │   ├── dedup/page.tsx               #   Dedup queue
│   │   ├── shortlists/*, referrals/*    #   Shortlist + referral pages
│   │   ├── analytics/page.tsx           #   8-chart analytics dashboard
│   │   ├── activity/page.tsx            #   Audit timeline
│   │   └── login/page.tsx, callback/    #   Auth pages
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx              #   Nav + prefetch on hover
│   │   │   └── topbar.tsx               #   Glassmorphism header
│   │   └── ui/                          #   Shadcn components (glass-themed)
│   ├── providers/
│   │   ├── auth-provider.tsx            #   JWT + OAuth context
│   │   └── websocket-provider.tsx       #   Real-time WS + toasts
│   └── lib/
│       ├── api.ts                       #   Fetch + SWR cache + prefetch
│       ├── types.ts                     #   All TypeScript interfaces
│       └── utils.ts                     #   Utility functions
│
├── CLAUDE.md                            # AI assistant instructions
└── README.md                            # This file
```

---

## License

Built for a hackathon. All rights reserved.
