# Ingestion Module Upgrade — Execution Plan

**Time Budget: 3-4 hours | 5 Phases | Owner: Staff Engineer**

---

## Current State (from codebase audit)

| Feature | Status | Gap |
|---------|--------|-----|
| Google OAuth backend | Token verification works | No frontend button, no `gmail.readonly` scope, no real Gmail API fetch |
| Gmail Sync | Mock only (`MOCK_GMAIL_ENABLED=true`) | Returns hardcoded Alex Kim resume. No real attachment extraction |
| LinkedIn PDF | Endpoint `/api/ingest/linkedin` exists | Routes to generic ingestion graph — no LinkedIn-specific Gemini prompt |
| HRMS Sync | Mock returns 3 candidates | No intentional duplicates, no realistic field structure |
| Resume Upload | pdfplumber + python-docx extraction | Already production-grade. Just needs error UX polish |
| WebSocket | Fully working (broadcast + personal) | Needs to fire consistently on all ingest paths |
| Frontend Upload Page | Dropzone + quick-sync cards exist | Gmail/HRMS buttons call mock endpoints, no loading states |

---

## Phase 1: Google OAuth + Gmail API (Real) — ~75 min

**Goal:** User clicks "Sign in with Google" → logs in → gets `gmail.readonly` scope → "Sync Gmail" fetches real emails with resume attachments.

### Backend Changes

| File | Action | What |
|------|--------|------|
| `backend/core/config.py` | MODIFY | Add `GOOGLE_REDIRECT_URI` setting |
| `backend/core/oauth.py` | REWRITE | Replace simple token verification with full OAuth2 authorization code flow. Exchange auth code for access_token + refresh_token. Store Gmail token in user record |
| `backend/models/user.py` | MODIFY | Add `google_access_token`, `google_refresh_token`, `google_token_expiry` columns |
| `backend/api/auth.py` | MODIFY | Add `GET /api/auth/google/url` (returns OAuth consent URL with gmail.readonly scope) and `POST /api/auth/google/callback` (exchanges auth code → tokens → JWT) |
| `backend/services/email/gmail_client.py` | REWRITE | Replace mock with real Gmail API: authenticate with user's OAuth token, search for messages with attachments, download PDF/DOCX attachments, extract text, return list of raw resume texts |
| `backend/api/ingest.py` | MODIFY | Update `gmail_sync` endpoint to pass user's stored Google token to real gmail_client |

### Frontend Changes

| File | Action | What |
|------|--------|------|
| `frontend/app/login/page.tsx` | MODIFY | Add "Sign in with Google" button that redirects to backend's OAuth URL |
| `frontend/app/login/callback/page.tsx` | CREATE | OAuth redirect handler — receives auth code from Google, sends to backend callback endpoint, stores JWT, redirects to dashboard |
| `frontend/providers/auth-provider.tsx` | MODIFY | Add `loginWithGoogle(code)` method alongside existing email login |
| `frontend/app/upload/page.tsx` | MODIFY | Wire "Sync Gmail" card to real endpoint, add loading spinner + result count toast |

### DB Migration

| File | Action | What |
|------|--------|------|
| `backend/alembic/versions/xxxx_add_google_tokens.py` | CREATE | Add google_access_token, google_refresh_token, google_token_expiry to users table |

### Verification
- Click "Sign in with Google" → Google consent screen with gmail.readonly → redirected back → logged in
- Click "Sync Gmail" → shows spinner → fetches 5 recent emails with PDF attachments → candidates appear in list
- WebSocket toast fires for each ingested candidate

---

## Phase 2: LinkedIn PDF Parser — ~45 min

**Goal:** "Upload LinkedIn PDF" accepts LinkedIn's native "Save as PDF" export and extracts structured data using a Gemini prompt tuned for LinkedIn's weird formatting.

### Backend Changes

| File | Action | What |
|------|--------|------|
| `backend/services/linkedin/linkedin_parser.py` | REWRITE | Build LinkedIn-specific parsing: (1) Extract text with pdfplumber, (2) Send to Gemini with a LinkedIn-optimized prompt that handles sections like "Experience", "Education", "Skills", "About", "Licenses & Certifications", weird date formats ("Jan 2020 - Present · 4 yrs 2 mos"), multi-role entries under one company, and endorsement counts. (3) Return ParsedResume, (4) Pipe through ingestion_graph for embedding + dedup |
| `backend/services/parsing/gemini_parser.py` | MODIFY | Add `parse_linkedin_resume(raw_text: str) -> ParsedResume` with LinkedIn-specific system prompt (separate from generic resume prompt) |
| `backend/api/ingest.py` | VERIFY | LinkedIn endpoint already exists — just ensure it calls updated parser |

### Frontend Changes

| File | Action | What |
|------|--------|------|
| `frontend/app/upload/page.tsx` | MODIFY | Add distinct "LinkedIn PDF" dropzone section with LinkedIn branding/icon. Show "Optimized for LinkedIn's Save-to-PDF format" hint. Wire to `/api/ingest/linkedin` endpoint with loading state + success toast |

### Verification
- Upload a real LinkedIn "Save as PDF" export
- Parsed data shows correct: name, headline as title, all experience entries with computed total years, skills list, education
- Candidate appears in candidates list with high confidence score
- Dedup triggers if same person already exists

---

## Phase 3: HRMS Sync (Realistic Mock) — ~30 min

**Goal:** "Sync HRMS" fetches candidates from a realistic mock that simulates BambooHR/Workday responses, including intentional duplicates to exercise the dedup pipeline.

### Backend Changes

| File | Action | What |
|------|--------|------|
| `backend/services/hrms/bamboohr_client.py` | REWRITE | Replace 3 basic mocks with 8-10 realistic candidate records. Include: (1) 2-3 intentional duplicates (same person, slightly different names/emails — e.g., "James Rodriguez" vs "James A. Rodriguez"), (2) Varied locations, skills, experience levels, (3) Realistic HRMS field structure (employee_id, department, hire_date, job_title, work_email, personal_email). Map HRMS fields → our ParsedResume schema before piping to ingestion_graph |
| `backend/api/ingest.py` | MODIFY | Update HRMS sync endpoint to process each candidate through ingestion_graph (embedding + dedup) instead of direct DB insert. Add WebSocket notification per candidate |
| `backend/services/hrms/field_mapper.py` | CREATE | Map BambooHR/Workday field names to our ParsedResume schema (employee_number→id, work_email→email, jobTitle→current_title, etc.) |

### Frontend Changes

| File | Action | What |
|------|--------|------|
| `frontend/app/upload/page.tsx` | MODIFY | Wire "Sync HRMS" card with loading state, show progress ("Syncing 8 candidates..."), toast per candidate, final summary ("8 synced, 2 duplicates detected") |

### Verification
- Click "Sync HRMS" → progress indicator → 8 candidates ingested
- 2-3 entries land in Dedup Queue (visible on /dedup page)
- Each candidate has proper skills, experience, location from HRMS mapping

---

## Phase 4: Resume Upload Polish — ~20 min

**Goal:** Harden the existing drag-and-drop with better error handling, multi-file progress, and edge case coverage.

### Backend Changes

| File | Action | What |
|------|--------|------|
| `backend/services/parsing/extractor.py` | MODIFY | Add fallback chain: pdfplumber → pdfminer.six for scanned/image-heavy PDFs that pdfplumber returns empty text for. Add better error messages for corrupt files |
| `backend/api/ingest.py` | MODIFY | Add batch upload endpoint `POST /api/ingest/upload/batch` accepting multiple files. Process concurrently with asyncio.gather. Return per-file status |

### Frontend Changes

| File | Action | What |
|------|--------|------|
| `frontend/app/upload/page.tsx` | MODIFY | Show per-file upload progress (filename + spinner/checkmark/error). Support drag-and-drop of multiple files at once. Show individual file status: "Parsing...", "Dedup check...", "Done ✓" |

### Verification
- Drop 3 PDFs at once → each shows individual progress → all complete
- Drop a corrupt/empty PDF → graceful error message, other files still process
- Drop a DOCX → extracts correctly

---

## Phase 5: Frontend Integration & Polish — ~30 min

**Goal:** Wire everything together. All buttons work. Real-time toasts fire. Loading states are consistent.

### Frontend Changes

| File | Action | What |
|------|--------|------|
| `frontend/app/upload/page.tsx` | FINALIZE | Final pass: all 4 ingest paths (Resume, LinkedIn, Gmail, HRMS) have consistent loading states, error handling, success feedback |
| `frontend/providers/websocket-provider.tsx` | MODIFY | Handle new message types: `GMAIL_SYNC_PROGRESS`, `HRMS_SYNC_PROGRESS`, `LINKEDIN_PARSED`. Show contextual toasts ("Gmail: Found 3 resumes", "HRMS: James Rodriguez added") |
| `frontend/app/upload/page.tsx` | MODIFY | Add real-time candidate count that updates via WebSocket as candidates are ingested (without page refresh) |
| `frontend/lib/types.ts` | MODIFY | Add TypeScript types for new API responses (GmailSyncResponse, HRMSSyncResponse, BatchUploadResponse) |
| `frontend/app/login/page.tsx` | FINALIZE | Ensure Google button has proper styling, loading state during redirect, error handling if OAuth denied |

### Verification (End-to-End)
1. Login with Google → Dashboard
2. Navigate to Upload
3. Drop 2 resumes → both processed with individual progress → appear in candidates
4. Upload LinkedIn PDF → parsed with high confidence → candidate added
5. Click "Sync Gmail" → spinner → 3-5 candidates from email attachments
6. Click "Sync HRMS" → progress bar → 8 candidates, 2 go to dedup queue
7. All actions show WebSocket toasts in real-time
8. Navigate to Candidates → all new entries visible
9. Navigate to Dedup → HRMS duplicates waiting for review

---

## File Summary

### New Files (4)
```
frontend/app/login/callback/page.tsx     — OAuth redirect handler
backend/alembic/versions/xxxx_...py      — Google token migration
backend/services/hrms/field_mapper.py    — HRMS field mapping
```

### Modified Files (13)
```
backend/core/config.py                   — Google redirect URI
backend/core/oauth.py                    — Full OAuth2 flow
backend/models/user.py                   — Google token columns
backend/api/auth.py                      — OAuth URL + callback endpoints
backend/api/ingest.py                    — Real Gmail, batch upload, HRMS piping
backend/services/email/gmail_client.py   — Real Gmail API
backend/services/linkedin/linkedin_parser.py — LinkedIn-specific parsing
backend/services/parsing/gemini_parser.py — LinkedIn Gemini prompt
backend/services/parsing/extractor.py    — pdfminer fallback
backend/services/hrms/bamboohr_client.py — Realistic mock + dupes
frontend/app/login/page.tsx              — Google Sign-in button
frontend/app/upload/page.tsx             — All ingest UX
frontend/providers/auth-provider.tsx     — Google login method
frontend/providers/websocket-provider.tsx — New message types
frontend/lib/types.ts                    — New response types
```

---

## Execution Order & Dependencies

```
Phase 1 (Google OAuth + Gmail) ──→ Phase 5 depends on this for login flow
Phase 2 (LinkedIn Parser)       ──→ Independent, can overlap with Phase 3
Phase 3 (HRMS Sync)             ──→ Independent, can overlap with Phase 2
Phase 4 (Resume Polish)         ──→ Independent
Phase 5 (Integration Polish)    ──→ Depends on Phases 1-4 being complete
```

**Critical path:** Phase 1 → Phase 5. Phases 2, 3, 4 are parallelizable.
