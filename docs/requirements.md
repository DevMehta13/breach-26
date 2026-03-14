Project Title: Unified AI-Powered Recruitment Platform

The Problem: Recruiters suffer from fragmented workflows. Candidate data is scattered across email inboxes, HRMS systems, job boards, LinkedIn, and referrals. This leads to duplicate records, slow evaluation cycles, and wasted time on administrative data entry rather than candidate engagement.

The Solution: An intelligent, centralized recruitment hub. The platform automatically ingests applicant data from diverse sources, uses AI/NLP to extract and structure resume data, and merges everything into a single, deduplicated database. Recruiters interact with this unified pipeline through a single dashboard featuring an AI-powered natural language search to instantly find, compare, and shortlist candidates based on granular requirements.

Hackathon Impact Focus: Drastically reduced time-to-hire, zero duplicate records, and intuitive AI-driven search capabilities.

1. Data Ingestion & Aggregation

Manual Uploads: System must accept direct resume file uploads (PDF, DOCX).

Email Integration: System must monitor a designated inbox, identify emails containing applications/resumes, and extract them.

HRMS Sync: System must pull candidate data from at least one simulated HRMS.

LinkedIn Simulation: System must accept and parse simulated LinkedIn profile links/exports.

2. AI Parsing & Structuring

System must extract core fields from unstructured text: Name, Contact, Skills, Experience (Years/Titles), Education, and Location.

System must normalize skills (e.g., mapping "JS" to "JavaScript") for uniform searching.

3. Deduplication Engine (Single Source of Truth)

System must identify if an incoming candidate already exists in the database.

System must merge new information with existing profiles rather than creating duplicates.

4. Natural Language Search & Shortlisting

Recruiters must be able to type conversational queries (e.g., "Find me a frontend dev with 5 years React experience willing to relocate to New York").

System must return a ranked list of candidates matching the query criteria.

System must allow recruiters to add candidates to "Shortlists" for specific job roles.

5. User Interface

A single unified dashboard to view aggregated pipelines.

A side-by-side candidate comparison view.

🔍 Critical Thinking & Edge Cases
Conflicting Data (Deduplication): What happens if a candidate applies via Email with Phone A, and via HRMS with Phone B, but the same email? Rule: The system must prompt a manual merge or trust the most recent data timestamp.

File Format Edge Cases: Password-protected PDFs, scanned image PDFs (requires OCR), or corrupted files. Rule: The system must gracefully flag these for manual review instead of crashing the pipeline.

Query Ambiguity: If a recruiter searches for "Java developer," does the system mistakenly include "JavaScript"? Rule: NLP extraction must be context-aware.

Rate Limits: If an HRMS or Email API gets rate-limited during a mass sync. Rule: Ingestion must be asynchronous with a retry mechanism.

It should be multi page faang level website not single or 2-3 pages only.