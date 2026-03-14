import asyncio

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from pydantic import BaseModel
from backend.core.auth import get_current_user
from backend.models.user import User
from backend.schemas.ingest import UploadResponse, ParsedResume
from backend.services.workflows.ingestion_graph import ingestion_graph

router = APIRouter(prefix="/api/ingest", tags=["Ingestion"])

ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}. Upload PDF or DOCX.",
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

    initial_state = {
        "file_bytes": file_bytes,
        "filename": file.filename or "unknown.pdf",
        "source": "resume_upload",
        "user_id": str(current_user.id),
    }

    result = await ingestion_graph.ainvoke(initial_state)

    parsed_data = result.get("parsed_data", {})
    parsed = ParsedResume(**parsed_data) if parsed_data else ParsedResume(
        full_name="Unknown", summary="Parsing failed — flagged for manual review"
    )

    return UploadResponse(
        candidate_id=result["candidate_id"],
        status=result["status"],
        parsed_data=parsed,
    )


# ── Batch upload ─────────────────────────────────────────────────


class BatchFileResult(BaseModel):
    filename: str
    status: str  # "success" | "error"
    candidate_id: str | None = None
    error: str | None = None


class BatchUploadResponse(BaseModel):
    total: int
    succeeded: int
    failed: int
    results: list[BatchFileResult]


async def _process_single_file(
    file: UploadFile,
    user_id: str,
) -> BatchFileResult:
    """Process a single file through the ingestion pipeline.

    Returns a BatchFileResult — never raises, catches all errors.
    """
    filename = file.filename or "unknown"

    try:
        if file.content_type not in ALLOWED_TYPES:
            return BatchFileResult(
                filename=filename,
                status="error",
                error=f"Unsupported file type: {file.content_type}",
            )

        file_bytes = await file.read()

        if len(file_bytes) == 0:
            return BatchFileResult(
                filename=filename,
                status="error",
                error="File is empty",
            )

        if len(file_bytes) > MAX_FILE_SIZE:
            return BatchFileResult(
                filename=filename,
                status="error",
                error="File exceeds 10 MB limit",
            )

        result = await ingestion_graph.ainvoke({
            "file_bytes": file_bytes,
            "filename": filename,
            "source": "resume_upload",
            "user_id": user_id,
        })

        return BatchFileResult(
            filename=filename,
            status="success",
            candidate_id=result.get("candidate_id"),
        )

    except Exception as e:
        return BatchFileResult(
            filename=filename,
            status="error",
            error=str(e),
        )


@router.post("/upload/batch", response_model=BatchUploadResponse)
async def upload_batch(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload multiple resume files at once.

    Processes all files concurrently through the ingestion pipeline.
    Returns per-file status — individual failures don't block others.
    """
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided",
        )

    if len(files) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 20 files per batch",
        )

    user_id = str(current_user.id)

    results = await asyncio.gather(
        *[_process_single_file(f, user_id) for f in files]
    )

    succeeded = sum(1 for r in results if r.status == "success")

    return BatchUploadResponse(
        total=len(results),
        succeeded=succeeded,
        failed=len(results) - succeeded,
        results=list(results),
    )
