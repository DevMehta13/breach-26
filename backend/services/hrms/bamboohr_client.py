"""BambooHR HRMS client.

When MOCK_HRMS_ENABLED is true, returns 3 realistic candidate records
including one intentional near-duplicate to exercise the dedup pipeline.
When false, calls the real BambooHR REST API.

Intentional duplicate:
  - "Michael Chen" / "Mike Chen" — same person, different name/email variants
"""

from __future__ import annotations

import httpx

from backend.core.config import get_settings
from backend.services.hrms.field_mapper import hrms_record_to_candidate, candidate_to_raw_text
from backend.services.workflows.ingestion_graph import ingestion_graph


# ── 3 realistic HRMS records (1 duplicate pair + 1 unique) ───────

MOCK_HRMS_RECORDS: list[dict] = [
    # ── Candidate 1: Michael Chen (DUPLICATE A) ──────────────────
    {
        "employee_id": "BHR-1042",
        "full_name": "Michael Chen",
        "work_email": "m.chen@techcorp.io",
        "mobilePhone": "+1 (415) 555-0810",
        "location": "San Francisco, CA",
        "department": "Engineering",
        "jobTitle": "Senior Software Engineer",
        "years_experience": 8,
        "skills": [
            "Python", "AWS", "Kubernetes", "PostgreSQL", "Go",
            "Terraform", "CI/CD", "Microservices",
        ],
        "education": [
            {"degree": "MS", "field_of_study": "Computer Science", "institution": "Stanford University", "year": "2016"},
        ],
        "experience": [
            {
                "title": "Senior Software Engineer",
                "company": "TechCorp",
                "duration": "2021 - Present",
                "description": "Leading backend platform team. Designed event-driven "
                "architecture processing 100M+ events/day on AWS.",
            },
            {
                "title": "Software Engineer",
                "company": "CloudBase Inc",
                "duration": "2017 - 2021",
                "description": "Built core API gateway serving 50k req/s. "
                "Migrated monolith to microservices on Kubernetes.",
            },
        ],
    },

    # ── Candidate 2: Mike Chen (DUPLICATE B — same person) ───────
    {
        "employee_id": "BHR-2087",
        "full_name": "Mike Chen",
        "work_email": "michael.chen@techcorp.io",
        "personal_email": "m.chen@gmail.com",
        "mobilePhone": "+1 (415) 555-0810",
        "location": "San Francisco, CA",
        "department": "Platform Engineering",
        "jobTitle": "Senior Software Engineer",
        "years_experience": 8,
        "skills": [
            "Python", "AWS", "Kubernetes", "PostgreSQL", "Golang",
            "Terraform", "Docker", "gRPC",
        ],
        "education": [
            {"degree": "MS", "field_of_study": "Computer Science", "institution": "Stanford University", "year": "2016"},
        ],
        "experience": [
            {
                "title": "Senior Software Engineer",
                "company": "TechCorp",
                "duration": "2021 - Present",
                "description": "Platform team lead. Architected event-driven "
                "system on AWS processing 100M+ events daily.",
            },
            {
                "title": "Software Engineer",
                "company": "CloudBase",
                "duration": "2017 - 2021",
                "description": "Core API development, Kubernetes migration.",
            },
        ],
    },

    # ── Candidate 3: Unique — Raj Patel ──────────────────────────
    {
        "employee_id": "BHR-1456",
        "full_name": "Raj Patel",
        "work_email": "raj.patel@techcorp.io",
        "mobilePhone": "+1 (206) 555-0455",
        "location": "Seattle, WA",
        "department": "Frontend",
        "jobTitle": "Staff Frontend Engineer",
        "years_experience": 10,
        "skills": [
            "React", "TypeScript", "Next.js", "GraphQL", "Node.js",
            "Tailwind CSS", "Playwright", "Figma",
        ],
        "education": [
            {"degree": "BS", "field_of_study": "Computer Science", "institution": "University of Washington", "year": "2014"},
        ],
        "experience": [
            {
                "title": "Staff Frontend Engineer",
                "company": "TechCorp",
                "duration": "2022 - Present",
                "description": "Architecting the next-gen design system. "
                "Led migration from CRA to Next.js App Router.",
            },
            {
                "title": "Senior Frontend Engineer",
                "company": "ShopFast",
                "duration": "2018 - 2022",
                "description": "Built checkout flow handling $2B+ annual GMV. "
                "Reduced bundle size by 60% via code splitting.",
            },
        ],
    },
]


async def fetch_bamboohr_candidates() -> list[dict]:
    """Fetch candidates from BambooHR API or return mock data."""
    settings = get_settings()

    if settings.MOCK_HRMS_ENABLED:
        return MOCK_HRMS_RECORDS

    # Real BambooHR API call
    url = f"https://api.bamboohr.com/api/gateway.php/{settings.BAMBOOHR_SUBDOMAIN}/v1/employees/directory"
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            url,
            headers={
                "Accept": "application/json",
                "Authorization": f"Basic {settings.BAMBOOHR_API_KEY}",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return data.get("employees", [])


async def sync_hrms_candidates(user_id: str) -> list[dict]:
    """Fetch candidates from HRMS and run each through the full ingestion pipeline.

    Each candidate goes through:
      1. Field mapping (HRMS fields → our schema)
      2. Raw text generation (for Gemini parsing)
      3. ingestion_graph (extract → parse → embed → dedup → save)

    Returns a list of results with name, candidate_id, and status.
    """
    raw_records = await fetch_bamboohr_candidates()
    results = []

    for record in raw_records:
        # Map HRMS fields to our standard format
        candidate = hrms_record_to_candidate(record)

        # Generate raw text for the Gemini parser
        raw_text = candidate_to_raw_text(candidate)

        # Pipe through full ingestion graph (with pre-populated raw_text
        # so extraction is skipped — text is already structured)
        result = await ingestion_graph.ainvoke({
            "file_bytes": raw_text.encode("utf-8"),
            "filename": f"hrms_{candidate['full_name'].replace(' ', '_').lower()}.txt",
            "source": "bamboohr",
            "user_id": user_id,
            "raw_text": raw_text,  # Pre-populated → skips extractor
        })

        results.append({
            "name": candidate["full_name"],
            "candidate_id": result.get("candidate_id"),
            "status": result.get("status"),
        })

    return results
