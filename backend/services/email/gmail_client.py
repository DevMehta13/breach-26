"""Gmail integration for ingesting resumes from email attachments.

Uses the user's Google OAuth access token (stored during login) to
query their Gmail inbox for emails with resume/CV attachments.

Falls back to mock data when MOCK_GMAIL_ENABLED is true.
"""

from __future__ import annotations

import base64
import io
import logging
from datetime import datetime, timezone

from backend.core.config import get_settings
from backend.services.workflows.ingestion_graph import ingestion_graph

logger = logging.getLogger(__name__)


# ── Mock data ─────────────────────────────────────────────────────

_MOCK_RESUME_TEXT = """Alex Kim
alex.kim@candidatemail.com | +1 (310) 555-0404 | Los Angeles, CA
linkedin.com/in/alexkim

PROFESSIONAL SUMMARY
Data Engineer with 6 years of experience building data pipelines and
analytics platforms. Passionate about real-time streaming and ML infrastructure.

EXPERIENCE
Senior Data Engineer — DataStream Inc (2022 - Present)
- Architected real-time event pipeline processing 50M events/day with Apache Kafka and Flink
- Built feature store serving ML models with sub-10ms latency
- Led migration from on-prem Hadoop to cloud-native stack on GCP

Data Engineer — AnalyticsCo (2019 - 2022)
- Designed ETL pipelines using Apache Airflow and dbt
- Implemented data quality monitoring reducing data incidents by 70%

Junior Analyst — DataFirst (2018 - 2019)
- SQL analytics and dashboard development with Looker

EDUCATION
MS Data Science — UCLA (2018)
BS Mathematics — UC Berkeley (2016)

SKILLS
Python, SQL, Apache Kafka, Apache Flink, Spark, Airflow, dbt, BigQuery,
GCP, Terraform, Docker, Kubernetes, Machine Learning, Data Modeling
"""


def _create_mock_pdf_bytes() -> bytes:
    """Create a simple PDF from mock resume text."""
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        y = 740
        c.setFont("Helvetica", 10)
        for line in _MOCK_RESUME_TEXT.strip().split("\n"):
            if y < 72:
                c.showPage()
                c.setFont("Helvetica", 10)
                y = 740
            c.drawString(72, y, line)
            y -= 14
        c.save()
        return buf.getvalue()
    except ImportError:
        return _MOCK_RESUME_TEXT.encode("utf-8")


async def _get_valid_access_token(user) -> str:
    """Return a valid Google access token, refreshing if expired."""
    if not user.google_access_token:
        raise ValueError("No Google access token. User must sign in with Google first.")

    # Check if token is expired
    if user.google_token_expiry and user.google_token_expiry < datetime.now(timezone.utc):
        if not user.google_refresh_token:
            raise ValueError("Google token expired and no refresh token. User must re-authenticate.")

        from backend.core.oauth import refresh_google_token
        refreshed = await refresh_google_token(user.google_refresh_token)

        # Update user record (caller must commit the session)
        user.google_access_token = refreshed["access_token"]
        user.google_token_expiry = refreshed["expires_at"]

    return user.google_access_token


def _walk_parts(parts: list[dict]) -> list[dict]:
    """Recursively walk Gmail message parts to find all leaf parts.

    Gmail nests parts inside multipart/* containers, so we need to
    recurse into sub-parts to find actual attachments.
    """
    result = []
    for part in parts:
        if part.get("parts"):
            result.extend(_walk_parts(part["parts"]))
        else:
            result.append(part)
    return result


async def fetch_gmail_attachments(access_token: str, max_results: int = 10) -> list[dict]:
    """Fetch email attachments from Gmail using the user's OAuth access token.

    Uses two search strategies:
    1. Emails with attachments matching resume-related subjects
    2. Any recent email with PDF/DOCX attachments (catches forwarded resumes)

    Returns list of dicts: {filename, content_type, data, sender, subject}
    """
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(token=access_token)
    service = build("gmail", "v1", credentials=creds)

    # Broad search: any email with attachments (PDF/DOCX are filtered below)
    query = "has:attachment newer_than:7d"

    logger.info("Gmail search query: %s", query)

    results = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=max_results,
    ).execute()

    messages = results.get("messages", [])
    logger.info("Gmail found %d messages with attachments", len(messages))
    attachments = []

    for msg_meta in messages:
        msg = service.users().messages().get(
            userId="me", id=msg_meta["id"], format="full"
        ).execute()

        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        sender = headers.get("From", "")
        subject = headers.get("Subject", "")

        # Recursively walk all parts (handles nested multipart messages)
        all_parts = _walk_parts(msg["payload"].get("parts", []))

        # Also check top-level payload if it has an attachment directly
        if msg["payload"].get("filename"):
            all_parts.append(msg["payload"])

        for part in all_parts:
            filename = part.get("filename", "")
            if not filename:
                continue
            lower_name = filename.lower()
            if not (lower_name.endswith(".pdf") or lower_name.endswith(".docx")):
                continue

            att_id = part.get("body", {}).get("attachmentId")
            if not att_id:
                continue

            logger.info("Downloading attachment: %s from '%s'", filename, subject)

            att = service.users().messages().attachments().get(
                userId="me", messageId=msg_meta["id"], id=att_id
            ).execute()

            data = base64.urlsafe_b64decode(att["data"])
            attachments.append({
                "filename": filename,
                "content_type": part.get("mimeType", "application/pdf"),
                "data": data,
                "sender": sender,
                "subject": subject,
            })

    logger.info("Gmail total attachments found: %d", len(attachments))
    return attachments


async def sync_gmail_inbox(user_id: str, user=None, session=None) -> list[dict]:
    """Fetch attachments from Gmail and run each through ingestion pipeline.

    Args:
        user_id: UUID string of the current user
        user: User ORM object (needed for real Gmail to get access token)
        session: AsyncSession (needed to commit token refreshes)
    """
    settings = get_settings()

    if settings.MOCK_GMAIL_ENABLED:
        pdf_bytes = _create_mock_pdf_bytes()
        attachments = [
            {
                "filename": "Alex_Kim_Resume.pdf",
                "content_type": "application/pdf",
                "data": pdf_bytes,
                "sender": "alex.kim@candidatemail.com",
                "subject": "Application: Senior Data Engineer",
            }
        ]
    else:
        # Real Gmail API
        if not user:
            raise ValueError("User object required for real Gmail sync")
        access_token = await _get_valid_access_token(user)
        if session:
            await session.commit()  # Persist any token refresh
        attachments = await fetch_gmail_attachments(access_token, max_results=5)

    results = []
    for att in attachments:
        result = await ingestion_graph.ainvoke({
            "file_bytes": att["data"],
            "filename": att["filename"],
            "source": "gmail",
            "user_id": user_id,
        })

        results.append({
            "filename": att["filename"],
            "sender": att.get("sender", ""),
            "subject": att.get("subject", ""),
            "candidate_id": result.get("candidate_id"),
            "status": result.get("status"),
        })

    return results
