import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.core.websocket_manager import manager as ws_manager
from backend.models.job import Job
from backend.models.user import User
from backend.schemas.job import (
    JobCreate, JobResponse, MatchRequest, MatchResponse, MatchResultItem,
    MatchScoreBreakdown, CompareRequest, CompareResponse, CompareCandidate,
)
from backend.services.jobs.job_matching_engine import (
    generate_job_embedding, match_candidates_to_job, compare_candidates_for_job,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    body: JobCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new job opening and generate its embedding."""
    job = Job(
        title=body.title,
        company=body.company,
        department=body.department,
        location=body.location,
        employment_type=body.employment_type,
        experience_required=body.experience_required,
        salary_min=body.salary_min,
        salary_max=body.salary_max,
        skills_required=body.skills_required,
        job_description=body.job_description,
        status="open",
        created_by=current_user.id,
    )

    # Generate embedding
    try:
        job.embedding = generate_job_embedding(job)
    except Exception as e:
        logger.warning("Failed to generate job embedding: %s", e)

    db.add(job)
    await db.commit()
    await db.refresh(job)

    await ws_manager.broadcast({
        "type": "JOB_CREATED",
        "job_id": str(job.id),
        "job_title": job.title,
    })

    return _job_to_response(job)


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all job openings."""
    stmt = select(Job).order_by(Job.created_at.desc())
    result = await db.execute(stmt)
    jobs = result.scalars().all()
    return [_job_to_response(j) for j in jobs]


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single job by ID."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)


@router.post("/{job_id}/match", response_model=MatchResponse)
async def match_candidates(
    job_id: uuid.UUID,
    body: MatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Find best-matching candidates for a job using AI scoring."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    results = await match_candidates_to_job(db, job, top_k=body.top_k)

    await ws_manager.broadcast({
        "type": "JOB_MATCH_COMPLETED",
        "job_id": str(job.id),
        "job_title": job.title,
        "matches_found": len(results),
    })

    return MatchResponse(
        job_id=str(job.id),
        job_title=job.title,
        total=len(results),
        results=[
            MatchResultItem(
                candidate_id=r["candidate_id"],
                full_name=r["full_name"],
                email=r["email"],
                location=r["location"],
                current_title=r["current_title"],
                years_experience=r["years_experience"],
                skills=r["skills"],
                composite_score=r["composite_score"],
                breakdown=MatchScoreBreakdown(**r["breakdown"]),
            )
            for r in results
        ],
    )


@router.post("/{job_id}/compare", response_model=CompareResponse)
async def compare_candidates_endpoint(
    job_id: uuid.UUID,
    body: CompareRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compare specific candidates against a job with detailed metrics."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not body.candidate_ids:
        raise HTTPException(status_code=400, detail="No candidate IDs provided")

    results = await compare_candidates_for_job(db, job, body.candidate_ids)

    return CompareResponse(
        job_id=str(job.id),
        job_title=job.title,
        candidates=[
            CompareCandidate(**r)
            for r in results
        ],
    )


def _job_to_response(job: Job) -> JobResponse:
    return JobResponse(
        id=job.id,
        title=job.title,
        company=job.company,
        department=job.department,
        location=job.location,
        employment_type=job.employment_type,
        experience_required=job.experience_required,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        skills_required=job.skills_required if isinstance(job.skills_required, list) else [],
        job_description=job.job_description,
        status=job.status,
        created_by=job.created_by,
        created_at=str(job.created_at),
        updated_at=str(job.updated_at),
    )
