"""Find Similar Candidates via pgvector cosine similarity.

Given a target candidate's embedding, queries all other candidates
and returns those above a similarity threshold, ranked by closeness.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.candidate import Candidate

_VALID_STATUSES = ["completed", "ingested", "needs_review", "pending_review"]


async def get_similar_candidates(
    session: AsyncSession,
    candidate_id: str,
    limit: int = 5,
    threshold: float = 0.75,
) -> list[dict]:
    """Find candidates with similar profiles using pgvector cosine distance.

    Args:
        candidate_id: UUID of the target candidate.
        limit: Max results to return.
        threshold: Minimum similarity score (0.0–1.0). Only candidates
                   above this threshold are returned.

    Returns:
        List of dicts with candidate fields + similarity_score.
    """
    target_uuid = uuid.UUID(candidate_id)

    # Step 1: Get the target candidate's embedding
    result = await session.execute(
        select(Candidate.embedding).where(Candidate.id == target_uuid)
    )
    row = result.first()
    if row is None or row[0] is None:
        return []

    target_embedding = list(row[0])

    # Step 2: pgvector cosine distance against all other candidates
    # cosine_distance returns 0 (identical) to 2 (opposite)
    # similarity = 1.0 - distance, clamped to [0, 1]
    distance = Candidate.embedding.cosine_distance(target_embedding)

    stmt = (
        select(
            Candidate,
            distance.label("distance"),
        )
        .where(and_(
            Candidate.id != target_uuid,
            Candidate.embedding.isnot(None),
            Candidate.ingestion_status.in_(_VALID_STATUSES),
        ))
        .order_by(distance)
        .limit(limit * 3)  # Over-fetch to filter by threshold
    )

    result = await session.execute(stmt)
    rows = result.all()

    similar: list[dict] = []
    seen_names: set[str] = set()
    for candidate, dist in rows:
        similarity = max(0.0, min(1.0, 1.0 - (dist or 0.0)))
        if similarity < threshold:
            continue

        # Deduplicate by normalized name — keep the first (highest similarity) entry
        name_key = candidate.full_name.strip().lower()
        if name_key in seen_names:
            continue
        seen_names.add(name_key)

        similar.append({
            "candidate_id": str(candidate.id),
            "full_name": candidate.full_name,
            "email": candidate.email,
            "current_title": candidate.current_title,
            "location": candidate.location,
            "years_experience": candidate.years_experience,
            "skills": candidate.skills if isinstance(candidate.skills, list) else [],
            "similarity_score": round(similarity, 4),
        })

        if len(similar) >= limit:
            break

    return similar
