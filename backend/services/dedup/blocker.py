"""Stage 1: Blocking — narrow candidate pool before expensive scoring.

Instead of comparing every new candidate against every existing one (O(n^2)),
we use blocking keys to surface a small set of plausible matches:

1. Email block    — exact email match (strongest signal)
2. Phone block    — normalized phone match
3. Name block     — first 3 chars of last name + first initial
4. Embedding block — pgvector nearest-neighbor (cosine > 0.80)

The embedding threshold is intentionally looser than the scorer's bypass
threshold (0.82) to ensure we don't miss candidates at the blocking stage.
"""

from __future__ import annotations

import logging
import re
import uuid

from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.candidate import Candidate

logger = logging.getLogger(__name__)

_DEDUP_STATUSES = ["completed", "needs_review", "ingested", "pending_review"]


def _normalize_phone(phone: str | None) -> str | None:
    """Strip all non-digit characters for comparison."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    # Keep last 10 digits (strip country code)
    if len(digits) > 10:
        digits = digits[-10:]
    return digits if len(digits) >= 7 else None


def _name_block_key(full_name: str | None) -> str | None:
    """Generate a blocking key from name: first 3 chars of last name + first initial.

    'Sarah Chen'  -> 'che_s'
    'Jon Smith'   -> 'smi_j'
    """
    if not full_name:
        return None
    parts = full_name.strip().lower().split()
    if len(parts) < 2:
        return None
    last = parts[-1][:3]
    first_initial = parts[0][0]
    return f"{last}_{first_initial}"


async def find_potential_matches(
    session: AsyncSession,
    parsed_data: dict,
    embedding: list[float] | None,
    exclude_id: uuid.UUID | None = None,
    limit: int = 20,
) -> list[Candidate]:
    """Query the DB for candidates that could be duplicates.

    Returns a list of Candidate ORM objects for Stage 2 scoring.
    """
    conditions = []

    # 1. Email block — exact match
    email = parsed_data.get("email")
    if email:
        conditions.append(func.lower(Candidate.email) == email.lower())

    # 2. Phone block — normalized match
    phone = _normalize_phone(parsed_data.get("phone"))
    if phone:
        # Match last 7+ digits to handle formatting variance
        conditions.append(
            func.regexp_replace(Candidate.phone, r"\D", "", "g").op("~")(
                f"{phone[-7:]}$"
            )
        )

    # 3. Name block — fuzzy name match via first name + last name prefix
    full_name = parsed_data.get("full_name")
    if full_name:
        parts = full_name.strip().split()
        if len(parts) >= 2:
            last_prefix = parts[-1][:3].lower()
            first_name = parts[0].lower()
            # Get last word of candidate name using reverse(split_part(reverse(...)))
            # PostgreSQL split_part doesn't support negative indices
            last_word_expr = func.reverse(
                func.split_part(func.reverse(Candidate.full_name), " ", 1)
            )
            # Match: last name starts with same 3 chars AND first name matches
            conditions.append(
                and_(
                    func.lower(last_word_expr).op("LIKE")(f"{last_prefix}%"),
                    func.lower(func.split_part(Candidate.full_name, " ", 1)).op("LIKE")(
                        f"{first_name[:3]}%"
                    ),
                )
            )
        elif len(parts) == 1:
            # Single-word name: match candidates whose name contains it
            single = parts[0].lower()
            conditions.append(
                func.lower(Candidate.full_name).op("LIKE")(f"%{single}%")
            )

    if not conditions and embedding is None:
        logger.info("BLOCKER: no blocking keys and no embedding for '%s' — returning empty", parsed_data.get("full_name"))
        return []

    # Build the SQL block query (OR across all blocking keys)
    query = select(Candidate).where(
        Candidate.ingestion_status.in_(_DEDUP_STATUSES)
    )
    if exclude_id:
        query = query.where(Candidate.id != exclude_id)

    blocked_candidates: list[Candidate] = []
    if conditions:
        cond_query = query.where(or_(*conditions)).limit(limit)
        result = await session.execute(cond_query)
        blocked_candidates = list(result.scalars().all())
        logger.info(
            "BLOCKER: %d candidates from email/phone/name blocks for '%s'",
            len(blocked_candidates), parsed_data.get("full_name"),
        )

    # 4. Embedding block — pgvector nearest neighbors (top 10)
    # We fetch the top 10 nearest and let the scorer filter by its own thresholds.
    # This is intentionally loose to avoid missing matches at the blocking stage.
    if embedding is not None:
        embedding_query = (
            select(Candidate)
            .where(Candidate.embedding.isnot(None))
            .where(Candidate.ingestion_status.in_(_DEDUP_STATUSES))
        )
        if exclude_id:
            embedding_query = embedding_query.where(Candidate.id != exclude_id)

        embedding_query = (
            embedding_query
            .order_by(Candidate.embedding.cosine_distance(embedding))
            .limit(10)
        )
        emb_result = await session.execute(embedding_query)
        emb_candidates = list(emb_result.scalars().all())

        logger.info(
            "BLOCKER: %d candidates from embedding nearest-neighbor for '%s'",
            len(emb_candidates), parsed_data.get("full_name"),
        )

        # Merge, dedup by ID
        seen_ids = {c.id for c in blocked_candidates}
        for c in emb_candidates:
            if c.id not in seen_ids:
                blocked_candidates.append(c)
                seen_ids.add(c.id)

    logger.info(
        "BLOCKER: total %d unique candidates for scoring against '%s'",
        len(blocked_candidates), parsed_data.get("full_name"),
    )
    return blocked_candidates
