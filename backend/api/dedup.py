from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.user import User
from backend.models.candidate import Candidate, CandidateMergeHistory
from backend.models.dedup import DedupQueue
from backend.services.dedup.merger import merge_candidates
from backend.services.dedup.scorer import compute_composite_score
from backend.services.dedup.engine import THRESHOLD_MANUAL_REVIEW
from backend.schemas.dedup import (
    DedupQueueItem,
    DedupQueueListItem,
    CandidateSummary,
    MergeRequest,
    DedupActionResponse,
)
from backend.core.websocket_manager import manager as ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dedup", tags=["Deduplication"])


@router.get("/queue", response_model=list[DedupQueueListItem])
async def list_dedup_queue(
    status_filter: str = "pending",
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List dedup queue items with candidate names for quick overview."""
    candidate_a = Candidate.__table__.alias("candidate_a")
    candidate_b = Candidate.__table__.alias("candidate_b")

    query = (
        select(
            DedupQueue.id,
            DedupQueue.candidate_a_id,
            candidate_a.c.full_name.label("candidate_a_name"),
            DedupQueue.candidate_b_id,
            candidate_b.c.full_name.label("candidate_b_name"),
            DedupQueue.composite_score,
            DedupQueue.status,
            DedupQueue.created_at,
        )
        .join(candidate_a, DedupQueue.candidate_a_id == candidate_a.c.id)
        .join(candidate_b, DedupQueue.candidate_b_id == candidate_b.c.id)
        .where(DedupQueue.status == status_filter)
        .order_by(DedupQueue.composite_score.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(query)
    rows = result.all()
    return [
        DedupQueueListItem(
            id=row.id,
            candidate_a_id=row.candidate_a_id,
            candidate_a_name=row.candidate_a_name,
            candidate_b_id=row.candidate_b_id,
            candidate_b_name=row.candidate_b_name,
            composite_score=row.composite_score,
            status=row.status,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/queue/{queue_id}", response_model=DedupQueueItem)
async def get_dedup_queue_item(
    queue_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single dedup queue item with full candidate details for comparison."""
    result = await db.execute(
        select(DedupQueue).where(DedupQueue.id == queue_id)
    )
    queue_item = result.scalar_one_or_none()
    if not queue_item:
        raise HTTPException(status_code=404, detail="Queue item not found")

    # Fetch both candidates
    ca_result = await db.execute(
        select(Candidate).where(Candidate.id == queue_item.candidate_a_id)
    )
    cb_result = await db.execute(
        select(Candidate).where(Candidate.id == queue_item.candidate_b_id)
    )
    candidate_a = ca_result.scalar_one_or_none()
    candidate_b = cb_result.scalar_one_or_none()
    if not candidate_a or not candidate_b:
        raise HTTPException(status_code=404, detail="Candidate not found")

    return DedupQueueItem(
        id=queue_item.id,
        candidate_a=CandidateSummary.model_validate(candidate_a),
        candidate_b=CandidateSummary.model_validate(candidate_b),
        composite_score=queue_item.composite_score,
        score_breakdown=queue_item.score_breakdown,
        status=queue_item.status,
        created_at=queue_item.created_at,
    )


@router.post("/queue/{queue_id}/merge", response_model=DedupActionResponse)
async def merge_queue_item(
    queue_id: uuid.UUID,
    body: MergeRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually approve a merge from the dedup queue."""
    result = await db.execute(
        select(DedupQueue).where(DedupQueue.id == queue_id)
    )
    queue_item = result.scalar_one_or_none()
    if not queue_item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    if queue_item.status != "pending":
        raise HTTPException(status_code=400, detail=f"Queue item already {queue_item.status}")

    # candidate_a is the older (primary), candidate_b is the newer
    ca_result = await db.execute(
        select(Candidate).where(Candidate.id == queue_item.candidate_a_id)
    )
    cb_result = await db.execute(
        select(Candidate).where(Candidate.id == queue_item.candidate_b_id)
    )
    primary = ca_result.scalar_one_or_none()
    secondary = cb_result.scalar_one_or_none()
    if not primary or not secondary:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Build new_data dict from the secondary candidate
    new_data = {
        "full_name": secondary.full_name,
        "email": secondary.email,
        "phone": secondary.phone,
        "linkedin_url": secondary.linkedin_url,
        "location": secondary.location,
        "current_title": secondary.current_title,
        "years_experience": secondary.years_experience,
        "skills": secondary.skills or [],
        "education": secondary.education or [],
        "experience": secondary.experience or [],
        "summary": secondary.summary,
        "raw_text": secondary.raw_text,
        "confidence_score": secondary.confidence_score,
    }

    # Apply field_overrides if provided
    if body and body.field_overrides:
        for field, value in body.field_overrides.items():
            new_data[field] = value

    secondary_emb = list(secondary.embedding) if secondary.embedding is not None else None

    merge_result = await merge_candidates(
        session=db,
        primary=primary,
        new_data=new_data,
        new_embedding=secondary_emb,
        merge_type="manual",
        merged_by=current_user.id,
        score_reason=f"manual_merge from dedup_queue composite={queue_item.composite_score}",
    )

    # Update the merge history with the correct merged_candidate_id
    # (merger.py sets a placeholder; update the last history record)
    history_result = await db.execute(
        select(CandidateMergeHistory)
        .where(CandidateMergeHistory.primary_candidate_id == primary.id)
        .order_by(CandidateMergeHistory.created_at.desc())
        .limit(1)
    )
    history = history_result.scalar_one_or_none()
    if history:
        history.merged_candidate_id = secondary.id

    # Mark secondary as merged
    secondary.ingestion_status = "merged"

    # Resolve queue item
    queue_item.status = "merged"
    queue_item.resolved_by = current_user.id
    queue_item.resolved_at = datetime.now(timezone.utc)

    await db.commit()

    return DedupActionResponse(
        status="merged",
        message=f"Candidate {secondary.id} merged into {primary.id}",
        candidate_id=primary.id,
    )


@router.post("/queue/{queue_id}/dismiss", response_model=DedupActionResponse)
async def dismiss_queue_item(
    queue_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a dedup queue item as 'not a duplicate' and dismiss."""
    result = await db.execute(
        select(DedupQueue).where(DedupQueue.id == queue_id)
    )
    queue_item = result.scalar_one_or_none()
    if not queue_item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    if queue_item.status != "pending":
        raise HTTPException(status_code=400, detail=f"Queue item already {queue_item.status}")

    queue_item.status = "dismissed"
    queue_item.resolved_by = current_user.id
    queue_item.resolved_at = datetime.now(timezone.utc)

    await db.commit()

    return DedupActionResponse(
        status="dismissed",
        message="Queue item dismissed — candidates kept separate",
    )


@router.post("/scan", response_model=dict)
async def retroactive_dedup_scan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retroactive dedup scan: compare ALL existing candidates against each other.

    Finds duplicate pairs that were missed at ingestion time (e.g., because
    the dedup code was updated after ingestion, or both candidates were
    ingested concurrently).

    Only creates dedup_queue entries for NEW pairs not already in the queue.
    """
    # Fetch all active candidates
    result = await db.execute(
        select(Candidate)
        .where(Candidate.ingestion_status.in_(["completed", "needs_review", "ingested", "pending_review"]))
        .order_by(Candidate.created_at)
    )
    candidates = list(result.scalars().all())
    logger.info("DEDUP SCAN: checking %d candidates for missed duplicates", len(candidates))

    # Fetch existing dedup queue pairs (so we don't create duplicates)
    existing_pairs: set[tuple[str, str]] = set()
    queue_result = await db.execute(select(DedupQueue))
    for q in queue_result.scalars().all():
        a, b = str(q.candidate_a_id), str(q.candidate_b_id)
        existing_pairs.add((min(a, b), max(a, b)))

    new_pairs = 0
    checked = 0

    for i, candidate_a in enumerate(candidates):
        for candidate_b in candidates[i + 1:]:
            checked += 1
            pair_key = (
                min(str(candidate_a.id), str(candidate_b.id)),
                max(str(candidate_a.id), str(candidate_b.id)),
            )

            # Skip if already in queue
            if pair_key in existing_pairs:
                continue

            # Build parsed_data from candidate_a to score against candidate_b
            parsed_a = {
                "full_name": candidate_a.full_name,
                "email": candidate_a.email,
                "phone": candidate_a.phone,
                "linkedin_url": candidate_a.linkedin_url,
            }
            emb_a = list(candidate_a.embedding) if candidate_a.embedding is not None else None

            score_result = compute_composite_score(parsed_a, emb_a, candidate_b)

            if score_result.composite_score >= THRESHOLD_MANUAL_REVIEW:
                # Older candidate is A, newer is B
                if candidate_a.created_at <= candidate_b.created_at:
                    a_id, b_id = candidate_a.id, candidate_b.id
                else:
                    a_id, b_id = candidate_b.id, candidate_a.id

                entry = DedupQueue(
                    candidate_a_id=a_id,
                    candidate_b_id=b_id,
                    composite_score=score_result.composite_score,
                    score_breakdown=score_result.breakdown,
                    status="pending",
                )
                db.add(entry)
                existing_pairs.add(pair_key)
                new_pairs += 1

                logger.info(
                    "DEDUP SCAN: new pair found: '%s' <-> '%s' score=%.4f reason=%s",
                    candidate_a.full_name, candidate_b.full_name,
                    score_result.composite_score, score_result.match_reason,
                )

                # Broadcast each found pair in real-time
                await ws_manager.broadcast({
                    "type": "DEDUP_UPDATE",
                    "action": "SCAN_MATCH_FOUND",
                    "new_name": candidate_a.full_name or "Unknown",
                    "existing_name": candidate_b.full_name or "Unknown",
                    "score": round(score_result.composite_score, 3),
                })

    await db.commit()
    logger.info("DEDUP SCAN complete: checked %d pairs, found %d new duplicates", checked, new_pairs)

    # Broadcast scan completion
    await ws_manager.broadcast({
        "type": "DEDUP_UPDATE",
        "action": "SCAN_COMPLETE",
        "score": new_pairs,  # reuse score field for count
    })

    return {
        "total_candidates": len(candidates),
        "pairs_checked": checked,
        "new_duplicates_found": new_pairs,
    }


@router.get("/history", response_model=list[dict])
async def get_merge_history(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get merge audit trail."""
    result = await db.execute(
        select(CandidateMergeHistory)
        .order_by(CandidateMergeHistory.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(row.id),
            "primary_candidate_id": str(row.primary_candidate_id),
            "merged_candidate_id": str(row.merged_candidate_id),
            "merge_type": row.merge_type,
            "merge_reason": row.merge_reason,
            "field_resolutions": row.field_resolutions,
            "merged_by": str(row.merged_by) if row.merged_by else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
