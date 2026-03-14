"""LinkedIn PDF parser.

LinkedIn's 'Save to PDF' exports have a known structure:
  - Name at top (large font)
  - Headline / current title
  - Location
  - About section
  - Experience (with nested multi-role entries per company)
  - Education
  - Skills (with endorsement counts to strip)
  - Licenses & Certifications

We extract text via pdfplumber, then route through the ingestion_graph
with source="linkedin" — this triggers the LinkedIn-specific Gemini prompt
that handles nested company/role structures and endorsement noise.
"""

from __future__ import annotations

from backend.services.parsing.extractor import extract_text_from_pdf, ExtractionError
from backend.services.workflows.ingestion_graph import ingestion_graph


async def ingest_linkedin_pdf(
    file_bytes: bytes,
    filename: str,
    user_id: str,
) -> dict:
    """Parse a LinkedIn PDF export and run it through the ingestion pipeline.

    The ingestion_graph detects source="linkedin" and uses the specialized
    Gemini prompt (parse_linkedin_resume) that handles:
      - Headline extraction as current_title
      - Nested company/role structures in Experience
      - Skills with endorsement count stripping
      - Certifications merged into skills
      - Total experience calculated from earliest start to latest end
    """
    # Pre-validate text extraction
    try:
        raw_text = extract_text_from_pdf(file_bytes)
    except ExtractionError:
        raise

    if not raw_text or len(raw_text.strip()) < 50:
        raise ExtractionError(
            "LinkedIn PDF appears empty or too short. "
            "Please use LinkedIn's 'Save to PDF' feature from a profile page."
        )

    result = await ingestion_graph.ainvoke({
        "file_bytes": file_bytes,
        "filename": filename,
        "source": "linkedin",
        "user_id": user_id,
    })

    return result
