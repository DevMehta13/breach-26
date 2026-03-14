# AI-Powered Recruitment Platform - Claude Rules & Context

## 1. Project Overview
A unified recruitment hub that ingests candidate data from Resumes (PDF/DOCX), Emails, HRMS, and LinkedIn. It extracts structured data, deduplicates candidates, and provides an AI-powered natural language search dashboard.

## 2. Tech Stack & APIs
- **Backend**: Python (FastAPI).
- **AI/Orchestration**: LangChain & LangGraph.
- **LLMs**: Gemini API (for heavy document/resume parsing) & Groq API (for fast UI chat/search routing).
- **Database**: supabase PostgreSQL with `pgvector` for semantic search.
- **Frontend**: Next.js (React), TailwindCSS.
- **Authentication**: Custom JWT + Google OAuth.

## 3. Best Practice Workflow (CRITICAL)
- **Always start in Plan Mode**: Press `Shift+Tab` twice before touching code. Create a gated plan.
- **Phase-Wise Execution**: Break the project down into distinct, testable phases. Do not move to the next phase until the current one is 100% complete and tested.
- **Context Management**: Keep responses concise. If context gets heavy, summarize progress in `docs/progress.md`, run `/clear`, and start fresh.
- **The "Interview" Rule**: Before generating a complex architectural plan or writing major boilerplate, act as a Staff Engineer. Ask the user clarifying questions about edge cases, data structures, or unstated assumptions.
- **End-to-End Verification (N2E)**: Ensure blast radius is checked before modifying shared files. Verify written code matches the requirements exactly.

## 4. Architectural Rules
- Separate the backend into distinct modules: `api/` (routes), `core/` (auth/config), `services/` (LangGraph workflows/resume parsing), and `models/` (DB schemas).
- Write test-driven code where applicable. Handle edge cases (e.g., rate limits, bad PDFs, conflicting deduplication data) gracefully.