# RecruitAI — 3-Minute Demo Script

> **Goal**: Show judges the full AI pipeline in action — from multi-source ingestion, through intelligent deduplication (the STAR feature), to natural language search.

---

## 0. Setup (before demo)

1. Backend running: `uvicorn backend.main:app --reload`
2. Frontend running: `npm run dev` (in `frontend/`)
3. Seed data loaded: `python -m backend.scripts.seed`
4. Open browser to `http://localhost:3000/login`

---

## 1. Login & Dashboard (30 seconds)

**Screen**: Login page

- Type `demo@recruitai.com` / `password123` → click **Sign in**
- You land on the **Dashboard**
- Point out: **"We have 20 candidates already ingested from 4 different sources — resume uploads, LinkedIn, BambooHR HRMS, and Gmail."**
- Highlight the stat cards and source breakdown chart

---

## 2. Live Ingestion — Multi-Source (45 seconds)

**Screen**: Upload page (click "Upload" in sidebar)

- **BambooHR sync**: Click "Sync BambooHR" → toast appears: "Synced 3 candidates from bamboohr"
- **Gmail sync**: Click "Sync Gmail" → toast appears: "Synced 1 candidate from gmail"
- Say: **"Every source flows through the same LangGraph AI pipeline — Gemini extracts structured data, generates embeddings, and runs dedup in real-time."**
- If WebSocket is connected, point out the live toast notifications

---

## 3. AI-Powered Search — The Wow Moment (45 seconds)

**Screen**: Search page (click "Search" in sidebar)

- Type: **"Find me a senior Python engineer in New York with 10+ years"**
- Hit Search
- Say: **"Groq parses the natural language query in under 200ms into structured filters — skills, location, experience. Then pgvector does semantic search against 768-dimensional embeddings."**
- Point out the parsed intent display (Skills: Python, Location: New York, Min exp: 10yr)
- Click on the top result → candidate profile with full details
- Show: summary, skills badges, experience timeline, education

---

## 4. Deduplication Engine — The STAR Feature (45 seconds)

**Screen**: Dedup Queue (click "Dedup Queue" in sidebar)

- Say: **"This is our star feature. The system automatically detected 2 potential duplicates from different sources."**
- Click on **"Sarah Chen ↔ Sarah Chen"** (score ~72%)
- Point out the side-by-side comparison:
  - **Conflicting fields highlighted in red** (different email, different phone)
  - **Skills diff**: unique skills shown with colored borders
  - **Score breakdown badges**: name similarity 0.93, embedding 0.85
- Say: **"Our composite scoring engine uses 5 weighted signals — email, phone, fuzzy name matching, LinkedIn URL, and embedding cosine similarity. High-confidence matches auto-merge. Ambiguous ones land here for human review."**
- Click **"Merge Candidates"** → toast: "Candidates merged successfully"
- The item disappears from the queue

---

## 5. Quick Hits (15 seconds)

- **Cmd+K**: Press Cmd+K, type "React" → show instant search results in the command palette
- **Analytics**: Flash the analytics page with the pie chart and bar chart
- **Shortlists**: Show the pre-populated shortlists

---

## Closing Statement

> "RecruitAI unifies 4 data sources into one AI pipeline. Gemini parses resumes, pgvector powers semantic search, and our composite dedup engine — combining fuzzy matching, embedding similarity, and rule-based signals — ensures every candidate is unique. Built with FastAPI, LangGraph, Next.js, and Supabase."
