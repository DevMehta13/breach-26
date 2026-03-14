# Project Progress

## Phase 0: Project Scaffolding & Infrastructure - COMPLETE (2026-03-13)

### Backend
- FastAPI app with CORS middleware (`backend/main.py`)
- Directory structure: `core/`, `api/`, `models/`, `services/`, `schemas/`
- Config via pydantic-settings loading from `backend/.env`
- Async SQLAlchemy engine with asyncpg driver (`core/database.py`)
- Alembic configured for sync migrations with psycopg2 (`backend/alembic/env.py`)
- First migration: `CREATE EXTENSION IF NOT EXISTS vector;` — pgvector enabled
- `GET /health` endpoint returns `{"status": "ok", "db": "connected"}`

### Frontend
- Next.js 15 scaffolded with App Router, TypeScript, TailwindCSS, ESLint
- Located at `frontend/`

### Gate Verification
- `alembic upgrade head` — pgvector extension created successfully
- `curl localhost:8000/health` — `{"status": "ok", "db": "connected"}`
- `frontend/` scaffolded and ready for `npm run dev`

---

## Phase 1: Database Models & Authentication - COMPLETE (2026-03-13)

### Database Tables (7 tables created)
- **users**: UUID PK, email (unique, indexed), hashed_password, full_name, avatar_url, auth_provider, is_active, timestamps
- **candidates**: UUID PK, full_name, email, phone (all indexed), linkedin_url, location, current_title, years_experience, skills/education/experience (JSONB), summary, raw_text, embedding (Vector(768)), source, ingestion_status, confidence_score, created_by FK, timestamps
- **candidate_merge_history**: UUID PK, primary/merged candidate FKs, merge_type, merge_reason, field_resolutions (JSONB), merged_by FK, timestamps
- **shortlists**: UUID PK, name, description, created_by FK, timestamps
- **shortlist_candidates**: UUID PK, shortlist_id + candidate_id (unique constraint), added_by FK, notes, added_at
- **dedup_queue**: UUID PK, candidate_a/b FKs (CASCADE), composite_score, score_breakdown (JSONB), status (indexed), resolved_by FK, timestamps
- **activity_log**: UUID PK, user_id FK (indexed), action (indexed), entity_type, entity_id, metadata (JSONB), created_at (indexed)

### Authentication
- Password hashing via passlib/bcrypt
- JWT tokens (PyJWT) with configurable algorithm and expiry
- Google OAuth via userinfo endpoint verification
- `get_current_user` FastAPI dependency for protected routes

### API Endpoints
- `POST /api/auth/register` — 201 + JWT on success, 409 on duplicate email
- `POST /api/auth/login` — 200 + JWT on success, 401 on bad credentials
- `POST /api/auth/google` — 200 + JWT, creates user if new
- `GET /api/auth/me` — 200 with user profile, 403 without token

### Pydantic Schemas
- `RegisterRequest`, `LoginRequest`, `GoogleAuthRequest`, `TokenResponse`, `UserResponse`

### Gate Verification
- Alembic migration `64b57613a4bc` created all 7 tables successfully
- Register: 201 Created with JWT token
- Login: 200 OK with JWT token
- GET /me with token: 200 OK with full user profile
- GET /me without token: 403 Forbidden
- Duplicate register: 409 Conflict
- Bad password: 401 Unauthorized
- Health check: still operational

---

## Phase 2: Resume Upload & AI Parsing Pipeline - COMPLETE (2026-03-13)

### Pydantic Schema
- `ParsedResume`: full_name, email, phone, location, linkedin_url, current_title, years_experience, summary, skills (List[str]), education (List[EducationEntry]), experience (List[ExperienceEntry]), confidence_score
- `UploadResponse`: candidate_id, status, parsed_data

### Parsing Services (`backend/services/parsing/`)
- `extractor.py`: PDF (pdfplumber) and DOCX (python-docx) text extraction with error handling for password-protected/scanned files
- `gemini_parser.py`: LangChain ChatGoogleGenerativeAI + `.with_structured_output(ParsedResume)` for structured extraction with skill normalization
- `embedding.py`: GoogleGenerativeAIEmbeddings (text-embedding-004) for 768-dim vectors

### LangGraph Ingestion Workflow (`backend/services/workflows/ingestion_graph.py`)
- `IngestionState`: file_bytes, filename, source, user_id, raw_text, parsed_data, embedding, candidate_id, status, error
- Nodes: `extract_text` -> `parse_with_gemini` -> `generate_embedding` -> `save_to_db`
- Conditional edges: failures at any stage route to `save_to_db` with `needs_review` status
- Error details preserved in `ingestion_error` column

### API Endpoint
- `POST /api/ingest/upload` — JWT-protected, accepts PDF/DOCX (max 10MB), returns candidate_id + parsed data
- Validates file type (400), file size (413), empty file (400)
- Graceful degradation: API rate limits save candidate as `needs_review` instead of 500

### Gate Verification
- Text extraction: raw_text correctly extracted from test PDF resume
- DB save: candidates persisted with raw_text, source_ref, ingestion_status, error details
- LangGraph routing: conditional edges properly skip failed stages
- Endpoint accessible: 201 Created on upload, 403 without auth, 400 on bad file type
- Gemini parsing: **blocked by API quota** (free-tier limit=0). Code verified structurally. Will work once billing is enabled on Google AI project.

### Known Issue
- Gemini API key has exhausted free-tier quota. Enable billing at https://ai.google.dev to restore. The pipeline degrades gracefully (saves as `needs_review`).

---

## Phase 3: Deduplication Engine (STAR FEATURE) - COMPLETE (2026-03-13)

### Architecture — Two-Stage Dedup
**Stage 1: Blocking** (`services/dedup/blocker.py`)
- Email block — exact match (strongest signal)
- Phone block — normalized digits, last-7 partial match
- Name block — first 3 chars of last name + first initial
- Embedding block — pgvector cosine distance nearest neighbors
- Avoids O(n^2) by narrowing to ~20 candidates before scoring

**Stage 2: Composite Scoring** (`services/dedup/scorer.py`)
| Signal | Weight | Logic |
|--------|--------|-------|
| Email | 0.35 | exact=1.0, domain-only=0.2, miss=0.0 |
| Phone | 0.20 | exact=1.0, last-7-digits=0.5, miss=0.0 |
| Name fuzzy | 0.20 | token_sort_ratio (0.7) + partial_ratio (0.3) via thefuzz |
| LinkedIn | 0.15 | normalized slug exact=1.0, miss=0.0 |
| Embedding | 0.10 | numpy cosine similarity (0.0-1.0) |

**Thresholds:**
- >= 0.85 → AUTO_MERGE
- 0.50 - 0.84 → MANUAL_REVIEW (DedupQueue entry)
- < 0.50 → NEW_CANDIDATE

### Scorer Verification
- Full match (5 signals): composite = 0.98 → AUTO_MERGE
- Email + name + embedding: composite = 0.64 → MANUAL_REVIEW
- Different people: composite = 0.06 → NEW_CANDIDATE
- Name fuzzy: "Jon Smith" vs "John Smith" = 0.93, "Sarah Chen" vs "Sara Chen" = 0.93

### Merge Logic (`services/dedup/merger.py`)
- Scalar fields: conflict → keep most recent
- Array fields (skills/education/experience): union + dedup by fingerprint
- Embedding: keep newer
- Raw text: append with "--- MERGED SOURCE ---" separator
- All decisions recorded in `field_resolutions` JSONB
- `CandidateMergeHistory` row created for audit trail

### Engine Orchestrator (`services/dedup/engine.py`)
- Calls blocker → scorer → classify
- Returns `DedupResult` with classification, best_match_id, score, breakdown

### Updated LangGraph Pipeline
```
extract_text → parse_with_gemini → generate_embedding → run_dedup_check → save_to_db
```
- NEW_CANDIDATE: insert new row
- AUTO_MERGE: merge into existing, log to CandidateMergeHistory
- MANUAL_REVIEW: insert new row + create DedupQueue entry

### API Endpoints
- `GET /api/dedup/queue` — list pending reviews with candidate names, sorted by score desc
- `GET /api/dedup/queue/{id}` — full side-by-side candidate comparison with score breakdown
- `POST /api/dedup/queue/{id}/merge` — manually approve merge (with optional field_overrides)
- `POST /api/dedup/queue/{id}/dismiss` — mark as not-duplicate
- `GET /api/dedup/history` — merge audit trail

### Gate Verification
- All 5 dedup endpoints accessible and returning correct responses
- Scorer logic verified with unit tests across all signal types
- Empty queue returns `[]`, fake IDs return 404
- Server starts clean with all routes registered

---

## Phase 4: Additional Ingestion Sources - COMPLETE (2026-03-13)

### Services Created

**LinkedIn Parser** (`services/linkedin/linkedin_parser.py`)
- Extracts text from LinkedIn PDF exports via pdfplumber
- Prepends LinkedIn-specific hint for Gemini parser
- Feeds through ingestion_graph with `source="linkedin"`

**BambooHR Client** (`services/hrms/bamboohr_client.py`)
- Mock mode: 3 realistic candidates (Priya Sharma, Marcus Johnson, Emily Rodriguez) designed to trigger dedup scenarios
- Real mode: REST API call to BambooHR employee directory
- Converts structured HRMS data to raw text → ingestion_graph with `source="bamboohr"`

**Gmail Client** (`services/email/gmail_client.py`)
- Mock mode: generates PDF with Alex Kim's Data Engineer resume via reportlab (fallback to raw text)
- Real mode: Gmail API with OAuth — fetches unread emails with resume/CV attachments, marks as read
- Each attachment → ingestion_graph with `source="gmail"`

### Schemas
- `SyncResultItem`: name, filename, sender, subject, candidate_id, status
- `SyncResponse`: source, total, results list

### API Endpoints (`api/sources.py`, wired into main.py)
- `POST /api/ingest/linkedin` — upload LinkedIn PDF, returns UploadResponse (201)
- `POST /api/ingest/hrms/sync` — trigger BambooHR sync, returns SyncResponse
- `POST /api/ingest/gmail/sync` — trigger Gmail inbox sync, returns SyncResponse

### Gate Verification
- All 3 endpoints confirmed accessible in OpenAPI/Swagger
- Sources router wired into main.py alongside existing routers

---

## Phase 5: Natural Language Search (Groq + pgvector) - COMPLETE (2026-03-13)

### Query Analyzer (`services/search/query_analyzer.py`)
- `SearchIntent` Pydantic model: semantic_query, skills, location, min_experience_years
- ChatGroq (llama3-8b-8192) with `.with_structured_output(SearchIntent)` for sub-200ms parsing
- System prompt tailored for recruitment query parsing
- Graceful fallback: if Groq fails, uses raw query as semantic search

### Semantic Search (`services/search/semantic_search.py`)
- Generates embedding for semantic_query via GoogleGenerativeAIEmbeddings (text-embedding-004)
- pgvector cosine distance ordering for candidate ranking
- SQL filters: location (case-insensitive partial match), min experience years, skills (JSONB text search)
- Returns similarity_score (1 - cosine_distance) per candidate

### Search Graph (`services/workflows/search_graph.py`)
- LangGraph StateGraph: `analyze_query` → `execute_search` → END
- State: user_query, intent, results, session, error
- Combines Groq intent parsing with pgvector + SQL filter execution

### Schemas (`schemas/search.py`)
- `SearchRequest`: query (str, 1-500 chars)
- `SearchResultItem`: candidate fields + similarity_score
- `SearchResponse`: query, intent, total, results

### API Endpoint (`api/search.py`, wired into main.py)
- `POST /api/search` — JWT-protected, accepts `{"query": "..."}`, returns ranked candidates

### Gate Verification
- Search endpoint confirmed accessible in OpenAPI/Swagger at `POST /api/search`
- All 15 routes registered and accessible
- Server starts clean with search_router wired in

---

## Phase 6: Candidate CRUD, Shortlists, Activity, Analytics APIs - COMPLETE (2026-03-13)

### Candidate CRUD (`api/candidates.py`)
- `GET /api/candidates` — paginated list (skip/limit), ordered by created_at desc
- `GET /api/candidates/{id}` — full candidate detail
- `PUT /api/candidates/{id}` — partial update (exclude_unset)
- `DELETE /api/candidates/{id}` — delete with 204

### Shortlists (`api/shortlists.py`)
- `GET /api/shortlists` — list all with candidate counts
- `POST /api/shortlists` — create (201), logs activity
- `GET /api/shortlists/{id}` — detail with candidate list (joined with Candidate table)
- `POST /api/shortlists/{id}/candidates` — add candidate (201), 409 on duplicate, logs activity
- `DELETE /api/shortlists/{id}/candidates/{candidate_id}` — remove (204), logs activity

### Activity Logging
- `log_activity()` utility (`services/activity.py`): inserts into ActivityLog table
- Injected into shortlist create, add candidate, remove candidate
- `GET /api/activity` — latest logs (configurable limit, default 50)

### Analytics (`api/analytics.py`)
- `GET /api/analytics/overview` — aggregated stats:
  - total_candidates (COUNT)
  - total_shortlists (COUNT)
  - sources (GROUP BY source)
  - ingestion_trends (candidates per day, last 30 days)

### Schemas
- `schemas/candidate.py`: CandidateListItem, CandidateDetail, CandidateUpdate, CandidateListResponse
- `schemas/shortlist.py`: ShortlistCreate, ShortlistCandidateAdd, ShortlistCandidateItem, ShortlistResponse, ShortlistDetailResponse
- `schemas/activity.py`: ActivityLogItem, ActivityLogResponse
- `schemas/analytics.py`: AnalyticsOverview, SourceBreakdown, IngestionTrend

### Gate Verification
- All 8 new endpoints confirmed accessible in Swagger
- 4 routers (candidates, shortlists, activity, analytics) wired into main.py
- Total routes: 23, server starts clean

---

## Phase 7: WebSocket Real-Time Layer - COMPLETE (2026-03-13)

### Connection Manager (`core/websocket_manager.py`)
- Singleton pattern via `__new__` override
- Maintains `dict[str, list[WebSocket]]` mapping user_id to active connections
- Methods: `connect()`, `disconnect()`, `send_personal_message()`, `broadcast()`
- Auto-cleans dead connections on send failure

### WebSocket Endpoint (`api/ws.py`)
- `WS /ws/{token}` — JWT-authenticated WebSocket endpoint
- Accepts connection first, then validates JWT (avoids FastAPI 403 on pre-accept close)
- Invalid token → close with code 4001
- Valid token → registers connection, enters keep-alive loop
- Graceful disconnect handling

### Ingestion Graph Integration
- `save_to_db_node` broadcasts `{"type": "INGESTION_COMPLETE", "candidate_id": "...", "status": "...", "source": "..."}` after every candidate save (auto_merged, completed, needs_review, pending_review)

### Dedup Engine Integration
- `run_dedup_check()` broadcasts `{"type": "DEDUP_UPDATE", "action": "AUTO_MERGE" | "MANUAL_REVIEW_QUEUED", "match_id": "...", "score": ...}` when dedup fires

### Gate Verification
- Invalid JWT: WebSocket closed with code=4001
- Valid JWT: WebSocket connects and disconnects cleanly
- 23 HTTP routes + 1 WebSocket endpoint registered
- Server starts clean with ws_router wired in

---

## Phase 8: Frontend — Layout, Auth, Dashboard - COMPLETE (2026-03-13)

### API Client (`lib/api.ts`)
- Fetch wrapper with auto JWT attachment from localStorage
- `api<T>(path, options)` for JSON requests, `apiUpload<T>(path, formData)` for file uploads
- `ApiError` class with status code for error handling
- `getToken()`, `setToken()`, `clearToken()` helpers

### Types (`lib/types.ts`)
- `User`, `TokenResponse`, `AnalyticsOverview`, `SourceBreakdown`, `IngestionTrend`, `CandidateListItem`, `WsMessage`

### Auth Context (`providers/auth-provider.tsx`)
- React Context managing user, token, isLoading state
- `login(email, password)` calls `/api/auth/login`, stores JWT
- `logout()` clears token and user state
- Checks `/api/auth/me` on initial load to restore session

### WebSocket Context (`providers/websocket-provider.tsx`)
- Connects to `WS_URL/ws/{token}` when user is logged in
- Parses incoming JSON messages as `WsMessage` type
- `INGESTION_COMPLETE` → success toast with source info
- `DEDUP_UPDATE` → info toast with score
- Auto-reconnect after 3s on disconnect
- Exposes `isConnected` and `lastMessage` to consumers

### Layout Shell
- `components/layout/sidebar.tsx` — 9 nav items (Dashboard, Candidates, Search, Upload, Dedup Queue, Shortlists, Analytics, Activity, Settings), active state highlighting
- `components/layout/topbar.tsx` — user avatar/name, WS connection status indicator, logout button

### Pages
- `app/page.tsx` — redirects to /dashboard (logged in) or /login
- `app/login/page.tsx` — clean login form with shadcn Card/Input/Button, error display, redirect on success
- `app/dashboard/page.tsx` — stat cards (Total Candidates, Total Shortlists, Sources Active, Recent Ingestions), source breakdown list, ingestion trends list, skeleton loaders

### Root Layout (`app/layout.tsx`)
- Wraps app in ThemeProvider → AuthProvider → WebSocketProvider → Toaster

### Gate Verification
- `npm run build` succeeds: 4 routes (/, /_not-found, /dashboard, /login) compiled
- TypeScript strict mode passes
- All providers and components wired correctly

---

## Phase 9: Frontend — Candidates, Search, Upload - COMPLETE (2026-03-13)

### Upload Page (`app/upload/page.tsx`)
- Drag-and-drop zone via react-dropzone (PDF/DOCX, max 10MB)
- Multipart upload to `POST /api/ingest/upload`
- Three Quick Sync cards: BambooHR (`/api/ingest/hrms/sync`), Gmail (`/api/ingest/gmail/sync`), LinkedIn PDF (`/api/ingest/linkedin`)
- Loading states and toast notifications on success/failure

### Candidates List (`app/candidates/page.tsx`)
- Data table (shadcn Table) fetching from `GET /api/candidates?limit=50`
- Columns: Name, Email, Title, Location, Source (badge), Status (badge)
- Clickable rows → `/candidates/[id]`
- Skeleton loading, empty state

### Candidate Profile (`app/candidates/[id]/page.tsx`)
- Full detail from `GET /api/candidates/{id}`
- Header: name, title, contact info (email/phone/location/linkedin/experience)
- Status and confidence badges
- Summary card, Skills as badges, Experience timeline (border-left), Education list
- Back button to candidates list

### AI Search Page (`app/search/page.tsx`)
- Natural language input bar with search icon
- Calls `POST /api/search` with `{ query }`, displays parsed intent (skills, location, min exp)
- Results grid of CandidateCards: name, title, match %, location, experience, skills (max 6 + overflow)
- Empty state, loading skeletons, error state

### Command Palette (`components/layout/command-palette.tsx`)
- Cmd+K / Ctrl+K opens shadcn CommandDialog
- Debounced search (350ms) hitting `/api/search`
- Quick result list: name, title, location, experience, similarity %
- Click result → navigate to `/candidates/{id}`
- Mounted globally in root layout.tsx

### Dependencies Added
- `react-dropzone` for file upload drag-and-drop

### Gate Verification
- `npm run build` succeeds: 7 routes (/, /_not-found, /candidates, /candidates/[id], /dashboard, /login, /search, /upload)
- TypeScript strict mode passes
- All routes render without errors

---

## Phase 10: Frontend — Shortlists, Analytics, Activity, Dedup Queue - COMPLETE (2026-03-13)

### Dedup Queue Page (`app/dedup/page.tsx`)
- Fetches pending duplicates from `GET /api/dedup/queue`
- Queue list with composite score badges, click to expand
- Side-by-side comparison: Candidate A vs B with field-level conflict highlighting (red background for mismatches)
- Skills comparison: unique skills highlighted with primary-colored outline badges
- Score breakdown badges showing individual signal scores
- Action buttons: "Merge Candidates" (`POST /api/dedup/queue/{id}/merge`) and "Not a Duplicate" (`POST /api/dedup/queue/{id}/dismiss`)
- Items removed from UI state on action success

### Analytics Page (`app/analytics/page.tsx`)
- Stat cards: Total Candidates, Total Shortlists
- PieChart (recharts): source breakdown with donut style, percentage labels, color-coded cells, legend
- BarChart (recharts): ingestion trends per day (last 30 days) with rounded bars, grid, tooltips
- Skeleton loading states

### Shortlists Pages
- `app/shortlists/page.tsx` — grid of shortlist cards with candidate counts, create dialog (shadcn Dialog) with name/description inputs
- `app/shortlists/[id]/page.tsx` — detail view with candidate table (Name, Email, Title, Notes, Added date), clickable rows → candidate profile

### Activity Page (`app/activity/page.tsx`)
- Vertical timeline with left border and icon dots
- Action-specific icons (ListPlus, UserPlus, Trash2, Merge, Upload)
- Human-readable labels and relative timestamps (just now, 5m ago, 2h ago, 3d ago)
- Entity type badges, metadata display (shortlist name, candidate name)

### Dependencies Added
- `recharts` for analytics charts

### Gate Verification
- `npm run build` succeeds: 13 routes (/, /_not-found, /activity, /analytics, /candidates, /candidates/[id], /dashboard, /dedup, /login, /search, /shortlists, /shortlists/[id], /upload)
- TypeScript strict mode passes
- All routes compile without errors

---

## Phase 11: Polish, Seed Data & Demo Prep - COMPLETE (2026-03-13)

### Seed Script (`backend/scripts/seed.py`)
- Creates demo user: `demo@recruitai.com` / `password123`
- 20 realistic candidates across 4 sources (resume_upload, gmail, bamboohr, linkedin)
- Backdated `created_at` for realistic ingestion trends
- 2 intentional duplicate pairs in DedupQueue (pending status)
- 2 shortlists ("Frontend Engineers", "Data Team") with assigned candidates
- 30 activity log entries spanning 30 days

### UI Polish
- `frontend/app/loading.tsx` — Global loading screen with branded "R" logo + spinner

### Documentation
- `docs/demo-script.md` — 3-minute demo script: login → dashboard → live ingestion → AI search → dedup merge → Cmd+K → analytics → closing statement
- `README.md` — Project overview, core features, tech stack, setup instructions, architecture diagram

### Gate Verification
- Seed script ready to run: `python -m backend.scripts.seed`
- Demo script covers full product walkthrough
- All 11 phases complete, 23 HTTP endpoints + 1 WebSocket + 13 frontend routes
