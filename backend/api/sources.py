from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.user import User
from backend.schemas.ingest import UploadResponse, ParsedResume
from backend.schemas.sources import SyncResponse, SyncResultItem
from backend.services.linkedin.linkedin_parser import ingest_linkedin_pdf
from backend.services.hrms.bamboohr_client import sync_hrms_candidates
from backend.services.email.gmail_client import sync_gmail_inbox

router = APIRouter(prefix="/api/ingest", tags=["Ingestion Sources"])

ALLOWED_PDF = {"application/pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024


# ── LinkedIn ──────────────────────────────────────────────────────


@router.post("/linkedin", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_linkedin_pdf(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a LinkedIn profile PDF for parsing and ingestion."""
    if file.content_type not in ALLOWED_PDF:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LinkedIn ingestion requires a PDF file.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 10 MB limit",
        )
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    result = await ingest_linkedin_pdf(
        file_bytes=file_bytes,
        filename=file.filename or "linkedin_profile.pdf",
        user_id=str(current_user.id),
    )

    parsed_data = result.get("parsed_data", {})
    parsed = ParsedResume(**parsed_data) if parsed_data else ParsedResume(
        full_name="Unknown", summary="Parsing failed — flagged for manual review"
    )

    return UploadResponse(
        candidate_id=result["candidate_id"],
        status=result["status"],
        parsed_data=parsed,
    )


# ── HRMS (BambooHR) ──────────────────────────────────────────────


@router.post("/hrms/sync", response_model=SyncResponse)
async def sync_hrms(
    current_user: User = Depends(get_current_user),
):
    """Trigger a sync with the HRMS (BambooHR) to pull candidate data.

    When MOCK_HRMS_ENABLED is true, returns 3 mock candidates
    (1 duplicate pair + 1 unique) to exercise the dedup pipeline.
    Each candidate is run through the full ingestion pipeline:
    field mapping → Gemini parsing → embedding → dedup check → save.
    """
    results = await sync_hrms_candidates(user_id=str(current_user.id))

    return SyncResponse(
        source="bamboohr",
        total=len(results),
        results=[
            SyncResultItem(
                name=r.get("name"),
                candidate_id=r.get("candidate_id"),
                status=r.get("status", "unknown"),
            )
            for r in results
        ],
    )


# ── Gmail ─────────────────────────────────────────────────────────


@router.post("/gmail/sync", response_model=SyncResponse)
async def sync_gmail(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger a sync with Gmail inbox to fetch resume attachments.

    When MOCK_GMAIL_ENABLED is true, simulates an email with a
    PDF resume attachment. Each attachment is run through the full
    ingestion pipeline.
    """
    results = await sync_gmail_inbox(
        user_id=str(current_user.id),
        user=current_user,
        session=db,
    )

    return SyncResponse(
        source="gmail",
        total=len(results),
        results=[
            SyncResultItem(
                filename=r.get("filename"),
                sender=r.get("sender"),
                subject=r.get("subject"),
                candidate_id=r.get("candidate_id"),
                status=r.get("status", "unknown"),
            )
            for r in results
        ],
    )
