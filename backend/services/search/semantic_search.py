"""Advanced Hybrid Search: Strict Pre-Filtering + Semantic Ranking.

Pipeline:
  1. Build strict SQL filters (experience, location, skills) — these are
     hard constraints that NEVER get relaxed by the semantic layer.
  2. If candidates have embeddings → rank by pgvector cosine distance.
  3. If no embeddings exist → rank by keyword relevance score.

This ensures "AWS developer with 10+ years" NEVER returns candidates
with <10 years or no AWS experience, regardless of embedding similarity.
"""

from __future__ import annotations

from sqlalchemy import select, and_, or_, func, cast, String, case, literal
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.candidate import Candidate
from backend.services.search.query_analyzer import SearchIntent


_VALID_STATUSES = ["completed", "ingested", "merged", "needs_review", "pending_review"]

_STOP_WORDS = frozenset({
    "the", "and", "for", "with", "who", "find", "get", "show", "need",
    "give", "list", "search", "looking", "want", "engineer", "developer",
    "candidate", "person", "someone", "hire", "years", "year", "experience",
    "least", "minimum", "senior", "junior", "staff", "principal", "lead",
    "based", "located", "near", "from", "good", "best", "top", "great",
    "have", "has", "plus", "over", "more", "than", "about", "new",
    "role", "job", "position", "less", "under", "below", "strictly",
    "fewer", "most", "candidates", "people", "tell", "give", "list",
})


def _build_strict_filters(intent: SearchIntent) -> list:
    """Build hard-constraint SQL WHERE clauses from the parsed intent.

    These filters are applied BEFORE any ranking — candidates that don't
    pass are excluded entirely, not just ranked lower.
    """
    conditions: list = [
        Candidate.ingestion_status.in_(_VALID_STATUSES),
    ]

    # ── Strict experience filter ────────────────────────────────────
    if intent.min_experience_years > 0:
        conditions.append(
            Candidate.years_experience >= intent.min_experience_years
        )
    if intent.max_experience_years > 0:
        conditions.append(
            Candidate.years_experience < intent.max_experience_years
        )

    # ── Strict location filter ──────────────────────────────────────
    if intent.location:
        conditions.append(
            Candidate.location.ilike(f"%{intent.location}%")
        )

    # ── Strict skill filter ─────────────────────────────────────────
    # Each skill must be present in the candidate's skills JSONB OR
    # their raw_text / summary (covers cases where skills array is sparse).
    if intent.skills:
        for skill in intent.skills:
            skill_lower = skill.lower()
            conditions.append(
                or_(
                    func.lower(cast(Candidate.skills, String)).contains(skill_lower),
                    func.lower(Candidate.summary).contains(skill_lower),
                    func.lower(Candidate.raw_text).contains(skill_lower),
                    func.lower(Candidate.current_title).contains(skill_lower),
                )
            )

    return conditions


def _compute_composite_score(intent: SearchIntent):
    """Build a SQL expression that scores candidates via 4 weighted sub-signals.

    Signals (weights):
      - Skill match (40%): fraction of required skills found in candidate
      - Title relevance (25%): non-skill query words matched in current_title
      - Experience proximity (20%): how close candidate exp is to requested
      - Summary coverage (15%): remaining keywords matched in summary
    """
    skill_keywords = [s.lower() for s in intent.skills]

    # Non-skill query words (for title + summary signals)
    query_words: list[str] = []
    for word in intent.semantic_query.split():
        w = word.strip().lower()
        if len(w) >= 3 and w not in _STOP_WORDS and w not in skill_keywords:
            query_words.append(w)

    # ── Skill match signal (0–100) ───────────────────────────────────
    if skill_keywords:
        skill_matches = []
        for sk in skill_keywords:
            # A skill counts once if found in ANY field
            skill_matches.append(
                case(
                    (or_(
                        func.lower(cast(Candidate.skills, String)).contains(sk),
                        func.lower(Candidate.summary).contains(sk),
                        func.lower(Candidate.raw_text).contains(sk),
                        func.lower(Candidate.current_title).contains(sk),
                    ), 1),
                    else_=0,
                )
            )
        skill_score = sum(skill_matches) * 100 / len(skill_keywords)
    else:
        skill_score = literal(50)  # neutral when no skills requested

    # ── Title relevance signal (0–100) ───────────────────────────────
    if query_words:
        title_matches = []
        for qw in query_words:
            title_matches.append(
                case(
                    (func.lower(Candidate.current_title).contains(qw), 1),
                    else_=0,
                )
            )
        title_score = sum(title_matches) * 100 / len(query_words)
    else:
        title_score = literal(50)

    # ── Experience proximity signal (0–100) ──────────────────────────
    target_exp = intent.min_experience_years or intent.max_experience_years
    if target_exp > 0:
        candidate_exp = func.coalesce(Candidate.years_experience, literal(0))
        raw_diff = func.abs(candidate_exp - target_exp)
        # max(100 - diff*10, 20)
        exp_score = case(
            (raw_diff * 10 >= 80, 20),
            else_=100 - raw_diff * 10,
        )
    else:
        exp_score = literal(50)

    # ── Summary coverage signal (0–100) ──────────────────────────────
    all_keywords = skill_keywords + query_words
    if all_keywords:
        summary_matches = []
        for kw in all_keywords:
            summary_matches.append(
                case(
                    (func.lower(Candidate.summary).contains(kw), 1),
                    else_=0,
                )
            )
        summary_score = sum(summary_matches) * 100 / len(all_keywords)
    else:
        summary_score = literal(50)

    # ── Composite: weighted sum ──────────────────────────────────────
    composite = (
        skill_score * 40
        + title_score * 25
        + exp_score * 20
        + summary_score * 15
    ) / 100

    return composite


def _row_to_dict(row, similarity: float) -> dict:
    return {
        "candidate_id": str(row.id),
        "full_name": row.full_name,
        "email": row.email,
        "phone": row.phone,
        "location": row.location,
        "current_title": row.current_title,
        "years_experience": row.years_experience,
        "skills": row.skills,
        "summary": row.summary,
        "source": row.source,
        "confidence_score": row.confidence_score,
        "similarity_score": similarity,
    }


async def search_candidates(
    session: AsyncSession,
    intent: SearchIntent,
    limit: int = 20,
) -> list[dict]:
    """Execute hybrid search: strict SQL pre-filter → semantic/keyword rank.

    Guarantees: a query for "AWS developer with 10+ years" will ONLY return
    candidates who have >=10 years AND mention AWS. Ranking among those
    qualifying candidates is done by embedding similarity (if available)
    or keyword relevance score.
    """
    strict_conditions = _build_strict_filters(intent)

    # ── Try semantic ranking first (requires embeddings) ────────────
    try:
        from backend.services.parsing.embedding import generate_embedding

        query_embedding = generate_embedding(intent.semantic_query)

        distance = Candidate.embedding.cosine_distance(query_embedding)

        stmt = (
            select(
                Candidate.id,
                Candidate.full_name,
                Candidate.email,
                Candidate.phone,
                Candidate.location,
                Candidate.current_title,
                Candidate.years_experience,
                Candidate.skills,
                Candidate.summary,
                Candidate.source,
                Candidate.confidence_score,
                distance.label("distance"),
            )
            .where(and_(
                Candidate.embedding.isnot(None),
                *strict_conditions,
            ))
            .order_by(distance)
            .limit(limit)
        )

        result = await session.execute(stmt)
        rows = result.all()

        if rows:
            # Cosine distance: 0 = identical, 1 = orthogonal, 2 = opposite
            # Convert to percentage: max(0, (1 - distance)) clamped to [0, 1]
            return [
                _row_to_dict(
                    row,
                    round(max(0.0, min(1.0 - (row.distance or 0.0), 1.0)), 4),
                )
                for row in rows
            ]
    except Exception:
        pass

    # ── Fallback: keyword relevance ranking ─────────────────────────
    relevance = _compute_composite_score(intent)

    stmt = (
        select(
            Candidate.id,
            Candidate.full_name,
            Candidate.email,
            Candidate.phone,
            Candidate.location,
            Candidate.current_title,
            Candidate.years_experience,
            Candidate.skills,
            Candidate.summary,
            Candidate.source,
            Candidate.confidence_score,
            relevance.label("relevance"),
        )
        .where(and_(*strict_conditions))
        .order_by(relevance.desc(), Candidate.years_experience.desc().nulls_last())
        .limit(limit)
    )

    result = await session.execute(stmt)
    rows = result.all()

    # Normalize relevance to 0.0–1.0 range
    max_rel = max((row.relevance for row in rows), default=1) or 1

    return [
        _row_to_dict(row, round(min(row.relevance / max_rel, 1.0), 4))
        for row in rows
    ]
