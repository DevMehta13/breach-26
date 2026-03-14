import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.core.websocket_manager import manager as ws_manager
from backend.models.candidate import Candidate
from backend.models.employee import Employee
from backend.models.job import Job
from backend.models.referral import Referral
from backend.models.activity_log import ActivityLog
from backend.models.user import User
from backend.schemas.referral import (
    ReferralCreate, ReferralResponse, ReferralListResponse, ReferralAnalytics,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/referrals", tags=["Referrals"])


@router.post("", response_model=ReferralResponse, status_code=status.HTTP_201_CREATED)
async def create_referral(
    body: ReferralCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a referral. Creates candidate if new, links to job, logs activity."""
    # Validate employee exists
    employee = await db.get(Employee, uuid.UUID(body.employee_id))
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Validate job exists
    job = await db.get(Job, uuid.UUID(body.job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Find or create candidate
    if body.candidate_id:
        candidate = await db.get(Candidate, uuid.UUID(body.candidate_id))
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
    else:
        # Check if candidate exists by email
        candidate = None
        if body.candidate_email:
            result = await db.execute(
                select(Candidate).where(Candidate.email == body.candidate_email)
            )
            candidate = result.scalar_one_or_none()

        if not candidate:
            candidate = Candidate(
                full_name=body.candidate_name,
                email=body.candidate_email,
                phone=body.candidate_phone,
                location=body.candidate_location,
                current_title=body.candidate_title,
                source="referral",
                ingestion_status="completed",
                created_by=current_user.id,
            )
            db.add(candidate)
            await db.flush()

    # Create referral
    referral = Referral(
        employee_id=employee.id,
        candidate_id=candidate.id,
        job_id=job.id,
        status="referred",
        notes=body.notes,
    )
    db.add(referral)

    # Log activity
    activity = ActivityLog(
        user_id=current_user.id,
        action="referral_created",
        entity_type="referral",
        entity_id=referral.id,
        metadata_={
            "employee_name": employee.name,
            "candidate_name": candidate.full_name,
            "job_title": job.title,
        },
    )
    db.add(activity)

    await db.commit()
    await db.refresh(referral)

    await ws_manager.broadcast({
        "type": "REFERRAL_CREATED",
        "referral_id": str(referral.id),
        "employee_name": employee.name,
        "candidate_name": candidate.full_name,
        "job_title": job.title,
    })

    return ReferralResponse(
        id=referral.id,
        employee_id=referral.employee_id,
        candidate_id=referral.candidate_id,
        job_id=referral.job_id,
        status=referral.status,
        notes=referral.notes,
        referred_at=str(referral.referred_at),
        employee_name=employee.name,
        candidate_name=candidate.full_name,
        job_title=job.title,
    )


@router.get("/analytics", response_model=ReferralAnalytics)
async def referral_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get referral analytics: top referrers, success rate, department breakdown."""
    # Total referrals
    total_result = await db.execute(select(func.count(Referral.id)))
    total_referrals = total_result.scalar() or 0

    # Total hires
    hired_result = await db.execute(
        select(func.count(Referral.id)).where(Referral.status == "hired")
    )
    total_hires = hired_result.scalar() or 0

    success_rate = round(total_hires / total_referrals * 100, 1) if total_referrals > 0 else 0.0

    # Top referrers
    top_ref_stmt = (
        select(
            Employee.name,
            Employee.department,
            func.count(Referral.id).label("referral_count"),
            func.count(Referral.id).filter(Referral.status == "hired").label("hires"),
        )
        .join(Referral, Employee.id == Referral.employee_id)
        .group_by(Employee.id, Employee.name, Employee.department)
        .order_by(func.count(Referral.id).desc())
        .limit(10)
    )
    top_ref_result = await db.execute(top_ref_stmt)
    top_referrers = [
        {
            "name": row.name,
            "department": row.department,
            "referral_count": row.referral_count,
            "hires": row.hires,
        }
        for row in top_ref_result.all()
    ]

    # Department breakdown
    dept_stmt = (
        select(
            Employee.department,
            func.count(Referral.id).label("count"),
        )
        .join(Referral, Employee.id == Referral.employee_id)
        .where(Employee.department.isnot(None))
        .group_by(Employee.department)
        .order_by(func.count(Referral.id).desc())
    )
    dept_result = await db.execute(dept_stmt)
    department_breakdown = [
        {"department": row.department, "count": row.count}
        for row in dept_result.all()
    ]

    # Status breakdown
    status_stmt = (
        select(
            Referral.status,
            func.count(Referral.id).label("count"),
        )
        .group_by(Referral.status)
    )
    status_result = await db.execute(status_stmt)
    status_breakdown = [
        {"status": row.status, "count": row.count}
        for row in status_result.all()
    ]

    return ReferralAnalytics(
        total_referrals=total_referrals,
        total_hires=total_hires,
        success_rate=success_rate,
        top_referrers=top_referrers,
        department_breakdown=department_breakdown,
        status_breakdown=status_breakdown,
    )


@router.get("", response_model=ReferralListResponse)
async def list_referrals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all referrals with employee/candidate/job details."""
    stmt = (
        select(Referral, Employee.name, Candidate.full_name, Job.title)
        .join(Employee, Referral.employee_id == Employee.id)
        .join(Candidate, Referral.candidate_id == Candidate.id)
        .join(Job, Referral.job_id == Job.id)
        .order_by(Referral.referred_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    referrals = [
        ReferralResponse(
            id=ref.id,
            employee_id=ref.employee_id,
            candidate_id=ref.candidate_id,
            job_id=ref.job_id,
            status=ref.status,
            notes=ref.notes,
            referred_at=str(ref.referred_at),
            employee_name=emp_name,
            candidate_name=cand_name,
            job_title=job_title,
        )
        for ref, emp_name, cand_name, job_title in rows
    ]

    return ReferralListResponse(total=len(referrals), results=referrals)


@router.get("/{referral_id}", response_model=ReferralResponse)
async def get_referral(
    referral_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single referral by ID."""
    stmt = (
        select(Referral, Employee.name, Candidate.full_name, Job.title)
        .join(Employee, Referral.employee_id == Employee.id)
        .join(Candidate, Referral.candidate_id == Candidate.id)
        .join(Job, Referral.job_id == Job.id)
        .where(Referral.id == referral_id)
    )
    result = await db.execute(stmt)
    row = result.one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Referral not found")

    ref, emp_name, cand_name, job_title = row

    return ReferralResponse(
        id=ref.id,
        employee_id=ref.employee_id,
        candidate_id=ref.candidate_id,
        job_id=ref.job_id,
        status=ref.status,
        notes=ref.notes,
        referred_at=str(ref.referred_at),
        employee_name=emp_name,
        candidate_name=cand_name,
        job_title=job_title,
    )


@router.patch("/{referral_id}/status")
async def update_referral_status(
    referral_id: uuid.UUID,
    new_status: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a referral's status."""
    valid_statuses = {"referred", "under_review", "interview", "hired", "rejected"}
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    referral = await db.get(Referral, referral_id)
    if not referral:
        raise HTTPException(status_code=404, detail="Referral not found")

    referral.status = new_status
    await db.commit()

    await ws_manager.broadcast({
        "type": "REFERRAL_STATUS_UPDATED",
        "referral_id": str(referral.id),
        "new_status": new_status,
    })

    return {"status": "ok", "new_status": new_status}
