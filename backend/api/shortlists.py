from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.user import User
from backend.models.shortlist import Shortlist, ShortlistCandidate
from backend.models.candidate import Candidate
from backend.schemas.shortlist import (
    ShortlistCreate,
    ShortlistCandidateAdd,
    ShortlistCandidateItem,
    ShortlistResponse,
    ShortlistDetailResponse,
)
from backend.services.activity import log_activity

router = APIRouter(prefix="/api/shortlists", tags=["Shortlists"])


async def _shortlist_response(db: AsyncSession, shortlist: Shortlist) -> ShortlistResponse:
    count_result = await db.execute(
        select(func.count(ShortlistCandidate.id))
        .where(ShortlistCandidate.shortlist_id == shortlist.id)
    )
    return ShortlistResponse(
        id=shortlist.id,
        name=shortlist.name,
        description=shortlist.description,
        created_by=shortlist.created_by,
        candidate_count=count_result.scalar_one(),
        created_at=shortlist.created_at,
        updated_at=shortlist.updated_at,
    )


@router.get("", response_model=list[ShortlistResponse])
async def list_shortlists(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all shortlists."""
    result = await db.execute(
        select(Shortlist).order_by(Shortlist.created_at.desc())
    )
    shortlists = result.scalars().all()
    return [await _shortlist_response(db, s) for s in shortlists]


@router.post("", response_model=ShortlistResponse, status_code=status.HTTP_201_CREATED)
async def create_shortlist(
    body: ShortlistCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new shortlist."""
    shortlist = Shortlist(
        name=body.name,
        description=body.description,
        created_by=current_user.id,
    )
    db.add(shortlist)
    await db.commit()
    await db.refresh(shortlist)

    await log_activity(
        db, current_user.id, "created_shortlist", "shortlist",
        entity_id=shortlist.id, metadata={"name": body.name},
    )

    return await _shortlist_response(db, shortlist)


@router.get("/{shortlist_id}", response_model=ShortlistDetailResponse)
async def get_shortlist(
    shortlist_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get shortlist with its candidates."""
    result = await db.execute(
        select(Shortlist).where(Shortlist.id == shortlist_id)
    )
    shortlist = result.scalar_one_or_none()
    if not shortlist:
        raise HTTPException(status_code=404, detail="Shortlist not found")

    sc_result = await db.execute(
        select(ShortlistCandidate, Candidate)
        .join(Candidate, ShortlistCandidate.candidate_id == Candidate.id)
        .where(ShortlistCandidate.shortlist_id == shortlist.id)
        .order_by(ShortlistCandidate.added_at.desc())
    )
    rows = sc_result.all()

    count_result = await db.execute(
        select(func.count(ShortlistCandidate.id))
        .where(ShortlistCandidate.shortlist_id == shortlist.id)
    )

    return ShortlistDetailResponse(
        id=shortlist.id,
        name=shortlist.name,
        description=shortlist.description,
        created_by=shortlist.created_by,
        candidate_count=count_result.scalar_one(),
        created_at=shortlist.created_at,
        updated_at=shortlist.updated_at,
        candidates=[
            ShortlistCandidateItem(
                id=sc.id,
                candidate_id=sc.candidate_id,
                full_name=c.full_name,
                email=c.email,
                current_title=c.current_title,
                notes=sc.notes,
                added_at=sc.added_at,
            )
            for sc, c in rows
        ],
    )


@router.post(
    "/{shortlist_id}/candidates",
    response_model=ShortlistCandidateItem,
    status_code=status.HTTP_201_CREATED,
)
async def add_candidate_to_shortlist(
    shortlist_id: str,
    body: ShortlistCandidateAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a candidate to a shortlist."""
    # Verify shortlist exists
    sl_result = await db.execute(
        select(Shortlist).where(Shortlist.id == shortlist_id)
    )
    if not sl_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Shortlist not found")

    # Verify candidate exists
    c_result = await db.execute(
        select(Candidate).where(Candidate.id == body.candidate_id)
    )
    candidate = c_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Check for duplicate
    dup_result = await db.execute(
        select(ShortlistCandidate).where(
            ShortlistCandidate.shortlist_id == shortlist_id,
            ShortlistCandidate.candidate_id == body.candidate_id,
        )
    )
    if dup_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Candidate already in shortlist")

    sc = ShortlistCandidate(
        shortlist_id=shortlist_id,
        candidate_id=body.candidate_id,
        added_by=current_user.id,
        notes=body.notes,
    )
    db.add(sc)
    await db.commit()
    await db.refresh(sc)

    await log_activity(
        db, current_user.id, "added_to_shortlist", "shortlist",
        entity_id=shortlist_id,
        metadata={"candidate_id": str(body.candidate_id), "candidate_name": candidate.full_name},
    )

    return ShortlistCandidateItem(
        id=sc.id,
        candidate_id=sc.candidate_id,
        full_name=candidate.full_name,
        email=candidate.email,
        current_title=candidate.current_title,
        notes=sc.notes,
        added_at=sc.added_at,
    )


@router.delete(
    "/{shortlist_id}/candidates/{candidate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_candidate_from_shortlist(
    shortlist_id: str,
    candidate_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a candidate from a shortlist."""
    result = await db.execute(
        select(ShortlistCandidate).where(
            ShortlistCandidate.shortlist_id == shortlist_id,
            ShortlistCandidate.candidate_id == candidate_id,
        )
    )
    sc = result.scalar_one_or_none()
    if not sc:
        raise HTTPException(status_code=404, detail="Candidate not in shortlist")

    await db.delete(sc)
    await db.commit()

    await log_activity(
        db, current_user.id, "removed_from_shortlist", "shortlist",
        entity_id=shortlist_id,
        metadata={"candidate_id": candidate_id},
    )
