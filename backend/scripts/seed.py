"""Seed script: populates the database with realistic demo data.

Usage:
    python -m backend.scripts.seed

Creates:
  - 1 demo user (demo@recruitai.com / password123)
  - 20 realistic candidates across multiple sources
  - 2 intentional duplicate pairs → DedupQueue entries
  - 2 shortlists with candidates assigned
  - 30 days of activity log entries
"""

import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from backend.core.database import AsyncSessionLocal
from backend.core.auth import hash_password
from backend.models.user import User
from backend.models.candidate import Candidate
from backend.models.shortlist import Shortlist, ShortlistCandidate
from backend.models.dedup import DedupQueue
from backend.models.activity_log import ActivityLog

# ── Candidate templates ───────────────────────────────────────────

CANDIDATES = [
    {
        "full_name": "Sarah Chen",
        "email": "sarah.chen@techmail.io",
        "phone": "+1 (415) 555-1001",
        "location": "San Francisco, CA",
        "current_title": "Senior Frontend Engineer",
        "years_experience": 7,
        "skills": ["React", "TypeScript", "Next.js", "GraphQL", "CSS", "Figma", "Jest"],
        "education": [{"degree": "BS Computer Science", "institution": "Stanford University", "year": "2019"}],
        "experience": [
            {"title": "Senior Frontend Engineer", "company": "Stripe", "duration": "2022 - Present", "description": "Leading design system team, built component library used by 200+ engineers."},
            {"title": "Frontend Engineer", "company": "Airbnb", "duration": "2019 - 2022", "description": "Built search experience serving 10M+ monthly users."},
        ],
        "summary": "Frontend specialist with 7 years building high-performance web applications at top-tier companies. Expert in React ecosystem and design systems.",
        "source": "resume_upload",
    },
    {
        "full_name": "James Rodriguez",
        "email": "james.r@devmail.com",
        "phone": "+1 (212) 555-1002",
        "location": "New York, NY",
        "current_title": "Staff Backend Engineer",
        "years_experience": 10,
        "skills": ["Python", "Go", "PostgreSQL", "Kubernetes", "AWS", "gRPC", "Redis", "Kafka"],
        "education": [{"degree": "MS Computer Science", "institution": "Columbia University", "year": "2016"}],
        "experience": [
            {"title": "Staff Backend Engineer", "company": "Bloomberg", "duration": "2021 - Present", "description": "Architected real-time market data pipeline processing 5B events/day."},
            {"title": "Senior Engineer", "company": "MongoDB", "duration": "2018 - 2021", "description": "Core team contributor, built sharding coordinator."},
        ],
        "summary": "Backend systems expert specializing in distributed computing and real-time data pipelines. 10 years at scale.",
        "source": "linkedin",
    },
    {
        "full_name": "Aisha Patel",
        "email": "aisha.patel@gmail.com",
        "phone": "+1 (650) 555-1003",
        "location": "Mountain View, CA",
        "current_title": "ML Engineer",
        "years_experience": 5,
        "skills": ["Python", "PyTorch", "TensorFlow", "Scikit-learn", "MLOps", "Docker", "AWS SageMaker"],
        "education": [{"degree": "PhD Machine Learning", "institution": "UC Berkeley", "year": "2021"}],
        "experience": [
            {"title": "ML Engineer", "company": "Google DeepMind", "duration": "2021 - Present", "description": "Building production ML pipelines for language understanding."},
        ],
        "summary": "ML engineer with PhD from Berkeley and production experience at DeepMind. Focused on NLP and LLM applications.",
        "source": "bamboohr",
    },
    {
        "full_name": "Marcus Thompson",
        "email": "marcus.t@outlook.com",
        "phone": "+1 (512) 555-1004",
        "location": "Austin, TX",
        "current_title": "DevOps Lead",
        "years_experience": 8,
        "skills": ["Kubernetes", "Terraform", "AWS", "GCP", "Python", "CI/CD", "Prometheus", "Grafana"],
        "education": [{"degree": "BS Information Systems", "institution": "UT Austin", "year": "2018"}],
        "experience": [
            {"title": "DevOps Lead", "company": "CircleCI", "duration": "2022 - Present", "description": "Managing infrastructure for 500K+ builds/day."},
            {"title": "Senior SRE", "company": "Datadog", "duration": "2019 - 2022", "description": "Built observability platform serving 20K+ customers."},
        ],
        "summary": "DevOps leader with deep expertise in cloud infrastructure, CI/CD, and observability at scale.",
        "source": "resume_upload",
    },
    {
        "full_name": "Emily Nakamura",
        "email": "emily.n@protonmail.com",
        "phone": "+1 (206) 555-1005",
        "location": "Seattle, WA",
        "current_title": "Product Manager",
        "years_experience": 6,
        "skills": ["Product Strategy", "A/B Testing", "SQL", "Figma", "Jira", "Data Analysis", "User Research"],
        "education": [{"degree": "MBA", "institution": "University of Washington", "year": "2020"}],
        "experience": [
            {"title": "Senior Product Manager", "company": "Amazon", "duration": "2022 - Present", "description": "Leading Alexa Smart Home integrations, 40M+ MAU."},
            {"title": "Product Manager", "company": "Zillow", "duration": "2020 - 2022", "description": "Owned search and discovery for rental marketplace."},
        ],
        "summary": "Product manager bridging technical and business teams with strong data-driven approach. MBA with engineering background.",
        "source": "gmail",
    },
    {
        "full_name": "David Kim",
        "email": "david.kim@techcorp.io",
        "phone": "+1 (408) 555-1006",
        "location": "San Jose, CA",
        "current_title": "iOS Engineer",
        "years_experience": 6,
        "skills": ["Swift", "SwiftUI", "UIKit", "Combine", "Core Data", "XCTest", "CI/CD"],
        "education": [{"degree": "BS Software Engineering", "institution": "San Jose State University", "year": "2020"}],
        "experience": [
            {"title": "iOS Engineer", "company": "Apple", "duration": "2021 - Present", "description": "Core contributor to Health app, shipped features to 1B+ devices."},
        ],
        "summary": "iOS specialist with deep Apple ecosystem knowledge and production experience on apps reaching over a billion users.",
        "source": "linkedin",
    },
    {
        "full_name": "Olivia Martinez",
        "email": "olivia.m@designhub.co",
        "phone": "+1 (312) 555-1007",
        "location": "Chicago, IL",
        "current_title": "UX Designer",
        "years_experience": 5,
        "skills": ["Figma", "User Research", "Prototyping", "Design Systems", "Accessibility", "HTML/CSS", "Storybook"],
        "education": [{"degree": "BFA Interaction Design", "institution": "RISD", "year": "2021"}],
        "experience": [
            {"title": "Senior UX Designer", "company": "Shopify", "duration": "2023 - Present", "description": "Redesigned merchant onboarding, improving completion rate by 35%."},
            {"title": "UX Designer", "company": "Groupon", "duration": "2021 - 2023", "description": "Led mobile app redesign for consumer experience."},
        ],
        "summary": "UX designer passionate about accessible, user-centered design. RISD graduate with e-commerce and SaaS experience.",
        "source": "resume_upload",
    },
    {
        "full_name": "Raj Gupta",
        "email": "raj.gupta@mail.com",
        "phone": "+1 (469) 555-1008",
        "location": "Dallas, TX",
        "current_title": "Data Engineer",
        "years_experience": 4,
        "skills": ["Python", "Spark", "Airflow", "dbt", "BigQuery", "Kafka", "SQL", "Terraform"],
        "education": [{"degree": "MS Data Science", "institution": "Georgia Tech", "year": "2022"}],
        "experience": [
            {"title": "Data Engineer", "company": "Uber", "duration": "2022 - Present", "description": "Building real-time analytics platform for driver operations."},
        ],
        "summary": "Data engineer building large-scale analytics pipelines at Uber. Georgia Tech MS with focus on streaming architectures.",
        "source": "bamboohr",
    },
    {
        "full_name": "Laura Wilson",
        "email": "laura.wilson@fastmail.com",
        "phone": "+1 (303) 555-1009",
        "location": "Denver, CO",
        "current_title": "Full Stack Engineer",
        "years_experience": 5,
        "skills": ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "AWS", "GraphQL"],
        "education": [{"degree": "BS Computer Science", "institution": "University of Colorado", "year": "2021"}],
        "experience": [
            {"title": "Full Stack Engineer", "company": "Twilio", "duration": "2022 - Present", "description": "Building communication APIs and developer tools."},
            {"title": "Software Engineer", "company": "SendGrid", "duration": "2021 - 2022", "description": "Maintained email delivery infrastructure."},
        ],
        "summary": "Full stack engineer with strong TypeScript skills and experience building developer-facing products.",
        "source": "gmail",
    },
    {
        "full_name": "Chris Lee",
        "email": "chris.lee@startup.io",
        "phone": "+1 (617) 555-1010",
        "location": "Boston, MA",
        "current_title": "CTO",
        "years_experience": 12,
        "skills": ["Python", "Go", "System Design", "Team Leadership", "AWS", "Microservices", "PostgreSQL"],
        "education": [{"degree": "MS Computer Science", "institution": "MIT", "year": "2014"}],
        "experience": [
            {"title": "CTO", "company": "FinLeap (Series B)", "duration": "2022 - Present", "description": "Leading 30-person engineering team, architected core banking platform."},
            {"title": "VP Engineering", "company": "HubSpot", "duration": "2018 - 2022", "description": "Managed 5 teams building CRM integrations."},
        ],
        "summary": "Technical leader with 12 years spanning IC to CTO. MIT graduate with deep distributed systems expertise.",
        "source": "linkedin",
    },
    {
        "full_name": "Priya Sharma",
        "email": "priya.s@techcorp.io",
        "phone": "+1 (415) 555-1011",
        "location": "San Francisco, CA",
        "current_title": "Security Engineer",
        "years_experience": 6,
        "skills": ["Python", "Burp Suite", "AWS Security", "Terraform", "SOC2", "OWASP", "Kubernetes"],
        "education": [{"degree": "MS Cybersecurity", "institution": "Carnegie Mellon", "year": "2020"}],
        "experience": [
            {"title": "Senior Security Engineer", "company": "Cloudflare", "duration": "2022 - Present", "description": "Leading application security for Zero Trust platform."},
        ],
        "summary": "Security engineer with CMU cybersecurity MS and experience hardening infrastructure at Cloudflare.",
        "source": "resume_upload",
    },
    {
        "full_name": "Tom Anderson",
        "email": "tom.anderson@mail.com",
        "phone": "+1 (503) 555-1012",
        "location": "Portland, OR",
        "current_title": "QA Lead",
        "years_experience": 7,
        "skills": ["Selenium", "Cypress", "Python", "Playwright", "CI/CD", "API Testing", "Performance Testing"],
        "education": [{"degree": "BS Computer Science", "institution": "Oregon State", "year": "2019"}],
        "experience": [
            {"title": "QA Lead", "company": "Nike Digital", "duration": "2021 - Present", "description": "Built automated test framework covering 95% of e-commerce flows."},
        ],
        "summary": "QA leader focused on test automation and quality engineering for large-scale e-commerce platforms.",
        "source": "bamboohr",
    },
    {
        "full_name": "Nina Volkov",
        "email": "nina.volkov@proton.me",
        "phone": "+1 (305) 555-1013",
        "location": "Miami, FL",
        "current_title": "React Native Engineer",
        "years_experience": 4,
        "skills": ["React Native", "TypeScript", "Redux", "Firebase", "iOS", "Android", "Expo"],
        "education": [{"degree": "BS Computer Science", "institution": "University of Miami", "year": "2022"}],
        "experience": [
            {"title": "Mobile Engineer", "company": "Robinhood", "duration": "2022 - Present", "description": "Building trading features for the React Native mobile app."},
        ],
        "summary": "Mobile engineer specializing in React Native with experience building fintech trading applications.",
        "source": "gmail",
    },
    {
        "full_name": "Hassan Ali",
        "email": "hassan.ali@devmail.com",
        "phone": "+1 (713) 555-1014",
        "location": "Houston, TX",
        "current_title": "Platform Engineer",
        "years_experience": 5,
        "skills": ["Go", "Kubernetes", "Istio", "Terraform", "AWS", "Linux", "gRPC", "Prometheus"],
        "education": [{"degree": "BS Computer Engineering", "institution": "Rice University", "year": "2021"}],
        "experience": [
            {"title": "Platform Engineer", "company": "Palantir", "duration": "2022 - Present", "description": "Building internal developer platform serving 2000+ engineers."},
        ],
        "summary": "Platform engineer building developer infrastructure at Palantir. Deep Kubernetes and service mesh expertise.",
        "source": "resume_upload",
    },
    {
        "full_name": "Jessica Park",
        "email": "jessica.park@gmail.com",
        "phone": "+1 (404) 555-1015",
        "location": "Atlanta, GA",
        "current_title": "Engineering Manager",
        "years_experience": 9,
        "skills": ["People Management", "Java", "Spring Boot", "System Design", "Agile", "OKRs", "Hiring"],
        "education": [{"degree": "MS Software Engineering", "institution": "Georgia Tech", "year": "2017"}],
        "experience": [
            {"title": "Engineering Manager", "company": "Salesforce", "duration": "2021 - Present", "description": "Managing 12-person backend team for Commerce Cloud."},
            {"title": "Senior Engineer", "company": "NCR", "duration": "2017 - 2021", "description": "Led payment processing system modernization."},
        ],
        "summary": "Engineering manager with 9 years spanning IC to management. Builds high-performing teams at Salesforce.",
        "source": "linkedin",
    },
    {
        "full_name": "Alex Rivera",
        "email": "alex.r@techmail.io",
        "phone": "+1 (619) 555-1016",
        "location": "San Diego, CA",
        "current_title": "Blockchain Engineer",
        "years_experience": 3,
        "skills": ["Solidity", "Rust", "Ethereum", "TypeScript", "Web3.js", "Hardhat", "DeFi"],
        "education": [{"degree": "BS Mathematics", "institution": "UC San Diego", "year": "2023"}],
        "experience": [
            {"title": "Blockchain Engineer", "company": "Coinbase", "duration": "2023 - Present", "description": "Building smart contract infrastructure for Base L2."},
        ],
        "summary": "Blockchain engineer at Coinbase working on L2 scaling solutions. Mathematics background with strong Solidity skills.",
        "source": "resume_upload",
    },
    {
        "full_name": "Maria Santos",
        "email": "maria.santos@outlook.com",
        "phone": "+1 (202) 555-1017",
        "location": "Washington, DC",
        "current_title": "Technical Writer",
        "years_experience": 4,
        "skills": ["Technical Writing", "API Documentation", "Markdown", "OpenAPI", "Git", "Docs-as-Code"],
        "education": [{"degree": "BA English / CS Minor", "institution": "Georgetown University", "year": "2022"}],
        "experience": [
            {"title": "Technical Writer", "company": "Stripe", "duration": "2022 - Present", "description": "Writing API documentation for Stripe Connect, used by 100K+ developers."},
        ],
        "summary": "Technical writer crafting world-class API documentation at Stripe. Bridging engineering and communication.",
        "source": "bamboohr",
    },
    {
        "full_name": "Kevin Zhang",
        "email": "kevin.z@fastmail.com",
        "phone": "+1 (919) 555-1018",
        "location": "Raleigh, NC",
        "current_title": "Backend Engineer",
        "years_experience": 3,
        "skills": ["Java", "Spring Boot", "PostgreSQL", "Redis", "Docker", "Microservices", "REST APIs"],
        "education": [{"degree": "BS Computer Science", "institution": "NC State", "year": "2023"}],
        "experience": [
            {"title": "Backend Engineer", "company": "Red Hat", "duration": "2023 - Present", "description": "Contributing to OpenShift container platform APIs."},
        ],
        "summary": "Backend engineer at Red Hat building enterprise container platform APIs. Java and Spring Boot specialist.",
        "source": "gmail",
    },
]

# ── Duplicate pair 1: Same person, different contact info ─────────
DUPLICATE_A1 = {
    "full_name": "Sarah Chen",
    "email": "s.chen@personal.com",
    "phone": "+1 (415) 555-9999",
    "location": "San Francisco, CA",
    "current_title": "Senior Frontend Engineer",
    "years_experience": 7,
    "skills": ["React", "TypeScript", "Next.js", "GraphQL", "Tailwind CSS"],
    "education": [{"degree": "BS Computer Science", "institution": "Stanford University", "year": "2019"}],
    "experience": [
        {"title": "Senior Frontend Engineer", "company": "Stripe", "duration": "2022 - Present", "description": "Design system lead."},
    ],
    "summary": "Frontend engineer at Stripe specializing in React and design systems.",
    "source": "gmail",
}

# ── Duplicate pair 2: Same person via HRMS ────────────────────────
DUPLICATE_A2 = {
    "full_name": "James A. Rodriguez",
    "email": "james.rodriguez@bloomberg.net",
    "phone": "+1 (212) 555-1002",
    "location": "New York, NY",
    "current_title": "Staff Engineer",
    "years_experience": 10,
    "skills": ["Python", "Go", "PostgreSQL", "Kubernetes", "AWS", "Kafka"],
    "education": [{"degree": "MS Computer Science", "institution": "Columbia University", "year": "2016"}],
    "experience": [
        {"title": "Staff Engineer", "company": "Bloomberg LP", "duration": "2021 - Present", "description": "Market data systems."},
    ],
    "summary": "Staff engineer at Bloomberg building real-time market data infrastructure.",
    "source": "bamboohr",
}

SOURCES = ["resume_upload", "linkedin", "bamboohr", "gmail"]
ACTIONS = [
    ("created_shortlist", "shortlist"),
    ("added_to_shortlist", "shortlist"),
    ("uploaded_resume", "candidate"),
    ("added_to_shortlist", "shortlist"),
]


async def seed():
    async with AsyncSessionLocal() as session:
        # ── Demo user ─────────────────────────────────────────
        demo_user = User(
            email="demo@recruitai.com",
            hashed_password=hash_password("password123"),
            full_name="Demo Recruiter",
            auth_provider="native",
            is_active=True,
        )
        session.add(demo_user)
        await session.flush()
        user_id = demo_user.id
        print(f"Created demo user: demo@recruitai.com / password123  (id={user_id})")

        # ── Candidates ────────────────────────────────────────
        candidate_ids: list[uuid.UUID] = []
        now = datetime.now(timezone.utc)

        for i, data in enumerate(CANDIDATES):
            created_at = now - timedelta(days=random.randint(0, 29), hours=random.randint(0, 23))
            c = Candidate(
                full_name=data["full_name"],
                email=data["email"],
                phone=data["phone"],
                location=data["location"],
                current_title=data["current_title"],
                years_experience=data["years_experience"],
                skills=data["skills"],
                education=data["education"],
                experience=data["experience"],
                summary=data["summary"],
                source=data["source"],
                ingestion_status="completed",
                confidence_score=round(random.uniform(0.75, 0.98), 2),
                created_by=user_id,
            )
            # Override created_at after insert via raw SQL later — for now just add
            session.add(c)
            await session.flush()
            candidate_ids.append(c.id)

            # Backdate created_at for chart data
            await session.execute(
                Candidate.__table__.update()
                .where(Candidate.id == c.id)
                .values(created_at=created_at)
            )

        print(f"Created {len(CANDIDATES)} candidates")

        # ── Duplicate pair 1 ──────────────────────────────────
        dup1 = Candidate(
            full_name=DUPLICATE_A1["full_name"],
            email=DUPLICATE_A1["email"],
            phone=DUPLICATE_A1["phone"],
            location=DUPLICATE_A1["location"],
            current_title=DUPLICATE_A1["current_title"],
            years_experience=DUPLICATE_A1["years_experience"],
            skills=DUPLICATE_A1["skills"],
            education=DUPLICATE_A1["education"],
            experience=DUPLICATE_A1["experience"],
            summary=DUPLICATE_A1["summary"],
            source=DUPLICATE_A1["source"],
            ingestion_status="pending_review",
            confidence_score=0.85,
            created_by=user_id,
        )
        session.add(dup1)
        await session.flush()

        dq1 = DedupQueue(
            candidate_a_id=candidate_ids[0],  # Sarah Chen (original)
            candidate_b_id=dup1.id,
            composite_score=0.72,
            score_breakdown={"email": 0.0, "phone": 0.0, "name": 0.93, "linkedin": 0.0, "embedding": 0.85},
            status="pending",
        )
        session.add(dq1)
        print("Created dedup pair 1: Sarah Chen (resume) vs Sarah Chen (gmail)")

        # ── Duplicate pair 2 ──────────────────────────────────
        dup2 = Candidate(
            full_name=DUPLICATE_A2["full_name"],
            email=DUPLICATE_A2["email"],
            phone=DUPLICATE_A2["phone"],
            location=DUPLICATE_A2["location"],
            current_title=DUPLICATE_A2["current_title"],
            years_experience=DUPLICATE_A2["years_experience"],
            skills=DUPLICATE_A2["skills"],
            education=DUPLICATE_A2["education"],
            experience=DUPLICATE_A2["experience"],
            summary=DUPLICATE_A2["summary"],
            source=DUPLICATE_A2["source"],
            ingestion_status="pending_review",
            confidence_score=0.80,
            created_by=user_id,
        )
        session.add(dup2)
        await session.flush()

        dq2 = DedupQueue(
            candidate_a_id=candidate_ids[1],  # James Rodriguez (original)
            candidate_b_id=dup2.id,
            composite_score=0.68,
            score_breakdown={"email": 0.2, "phone": 1.0, "name": 0.87, "linkedin": 0.0, "embedding": 0.78},
            status="pending",
        )
        session.add(dq2)
        print("Created dedup pair 2: James Rodriguez (linkedin) vs James A. Rodriguez (bamboohr)")

        # ── Shortlists ────────────────────────────────────────
        sl1 = Shortlist(name="Frontend Candidates", description="Top frontend engineers for the UI team", created_by=user_id)
        sl2 = Shortlist(name="Senior Backend", description="Staff+ backend engineers", created_by=user_id)
        session.add_all([sl1, sl2])
        await session.flush()

        # Add candidates to shortlists
        frontend_ids = [candidate_ids[0], candidate_ids[5], candidate_ids[8]]  # Sarah, David, Laura
        for cid in frontend_ids:
            session.add(ShortlistCandidate(shortlist_id=sl1.id, candidate_id=cid, added_by=user_id))

        backend_ids = [candidate_ids[1], candidate_ids[3], candidate_ids[9]]  # James, Marcus, Chris
        for cid in backend_ids:
            session.add(ShortlistCandidate(shortlist_id=sl2.id, candidate_id=cid, added_by=user_id))

        print("Created 2 shortlists with candidates")

        # ── Activity log (spread over 30 days) ────────────────
        activity_entries = []
        for day_offset in range(30):
            ts = now - timedelta(days=day_offset, hours=random.randint(1, 12))
            action, entity_type = random.choice(ACTIONS)
            meta = {}
            entity_id = None

            if entity_type == "shortlist":
                entity_id = random.choice([sl1.id, sl2.id])
                meta = {"name": random.choice(["Frontend Candidates", "Senior Backend"])}
                if action == "added_to_shortlist":
                    c = random.choice(CANDIDATES)
                    meta["candidate_name"] = c["full_name"]
            else:
                entity_id = random.choice(candidate_ids)
                meta = {"filename": "resume.pdf"}

            entry = ActivityLog(
                user_id=user_id,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                metadata_=meta,
            )
            session.add(entry)
            await session.flush()

            # Backdate
            await session.execute(
                ActivityLog.__table__.update()
                .where(ActivityLog.id == entry.id)
                .values(created_at=ts)
            )

        print(f"Created 30 activity log entries")

        await session.commit()
        print("\nSeed complete! Login with: demo@recruitai.com / password123")


if __name__ == "__main__":
    asyncio.run(seed())
