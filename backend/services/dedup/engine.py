"""Deduplication engine — Multi-Layer Cascading approach.

Flow:
    1. Blocker surfaces candidate pool (database queries)
    2. Scorer runs 3-layer cascade per candidate:
       - Layer 1: Deterministic (exact email/phone → 0.95)
       - Layer 2: Adaptive weighted (null-safe weight redistribution)
       - Layer 3: Semantic bypass (embedding > 0.82 + name > 0.75 → 0.90)
    3. Engine classifies the best match:
       - AUTO_MERGE    (score >= 0.85)  — high confidence same person
       - MANUAL_REVIEW (0.60 <= score < 0.85) — needs human decision
       - NEW_CANDIDATE (score < 0.60)  — no match found
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from enum import Enum

from sqlalchemy.ext.asyncio import AsyncSession

from backend.services.dedup.blocker import find_potential_matches
from backend.services.dedup.scorer import compute_composite_score, ScoreResult
from backend.core.websocket_manager import manager as ws_manager

logger = logging.getLogger(__name__)


class DedupClassification(str, Enum):
    AUTO_MERGE = "auto_merge"
    MANUAL_REVIEW = "manual_review"
    NEW_CANDIDATE = "new_candidate"


THRESHOLD_AUTO_MERGE = 0.85
THRESHOLD_MANUAL_REVIEW = 0.60


@dataclass
class DedupResult:
    classification: DedupClassification
    best_match_id: str | None
    best_score: float
    score_breakdown: dict | None
    all_matches: list[ScoreResult]


async def run_dedup_check(
    session: AsyncSession,
    parsed_data: dict,
    embedding: list[float] | None,
    exclude_id: uuid.UUID | None = None,
) -> DedupResult:
    """Run the full dedup pipeline: block -> score -> classify.

    Deep logging at every step for terminal visibility.
    """
    new_name = parsed_data.get("full_name", "Unknown")
    new_email = parsed_data.get("email")
    new_phone = parsed_data.get("phone")
    has_embedding = embedding is not None

    logger.info(
        "═══ DEDUP START: '%s' | email=%s | phone=%s | embedding=%s ═══",
        new_name,
        new_email or "NULL",
        new_phone or "NULL",
        "yes" if has_embedding else "no",
    )

    # Stage 1: Find potential matches via blocking
    candidates = await find_potential_matches(
        session=session,
        parsed_data=parsed_data,
        embedding=embedding,
        exclude_id=exclude_id,
    )

    logger.info(
        "DEDUP blocker returned %d potential matches for '%s'",
        len(candidates), new_name,
    )

    if not candidates:
        logger.info("DEDUP RESULT: NEW_CANDIDATE (no blocker matches) for '%s'", new_name)
        return DedupResult(
            classification=DedupClassification.NEW_CANDIDATE,
            best_match_id=None,
            best_score=0.0,
            score_breakdown=None,
            all_matches=[],
        )

    # Stage 2: Score each candidate through the 3-layer cascade
    scored: list[ScoreResult] = []
    for candidate in candidates:
        result = compute_composite_score(parsed_data, embedding, candidate)
        scored.append(result)
        logger.info(
            "DEDUP scored '%s' vs '%s' (id=%s): %.4f — %s",
            new_name, candidate.full_name, candidate.id,
            result.composite_score, result.match_reason,
        )

    # Sort by composite score descending
    scored.sort(key=lambda s: s.composite_score, reverse=True)
    best = scored[0]

    # Stage 3: Classify
    if best.composite_score >= THRESHOLD_AUTO_MERGE:
        classification = DedupClassification.AUTO_MERGE
    elif best.composite_score >= THRESHOLD_MANUAL_REVIEW:
        classification = DedupClassification.MANUAL_REVIEW
    else:
        classification = DedupClassification.NEW_CANDIDATE

    logger.info(
        "═══ DEDUP RESULT: %s for '%s' | best_score=%.4f | best_match=%s | reason=%s ═══",
        classification.value.upper(),
        new_name,
        best.composite_score,
        best.matched_candidate_id,
        best.match_reason,
    )

    result = DedupResult(
        classification=classification,
        best_match_id=best.matched_candidate_id if classification != DedupClassification.NEW_CANDIDATE else None,
        best_score=best.composite_score,
        score_breakdown=best.breakdown,
        all_matches=scored,
    )

    # Broadcast dedup event for non-new classifications
    if classification in (DedupClassification.AUTO_MERGE, DedupClassification.MANUAL_REVIEW):
        action = "AUTO_MERGE" if classification == DedupClassification.AUTO_MERGE else "MANUAL_REVIEW_QUEUED"
        # Find matched candidate's name for richer WS payload
        matched_name = "Unknown"
        for c in candidates:
            if str(c.id) == best.matched_candidate_id:
                matched_name = c.full_name or "Unknown"
                break
        await ws_manager.broadcast({
            "type": "DEDUP_UPDATE",
            "action": action,
            "match_id": best.matched_candidate_id,
            "new_name": new_name,
            "existing_name": matched_name,
            "score": round(best.composite_score, 3),
        })

    return result
