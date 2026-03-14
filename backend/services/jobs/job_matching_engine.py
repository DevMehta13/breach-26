"""AI Job-Candidate Matching Engine.

Uses pgvector semantic similarity + composite scoring to rank candidates
against a job opening.

Composite formula:
  score = (0.50 * semantic_similarity)
        + (0.25 * skill_match)
        + (0.15 * experience_match)
        + (0.10 * title_relevance)

When candidates lack embeddings, semantic weight is redistributed to
skill_match (0.45) and experience_match (0.30) so matching still works.
"""

from __future__ import annotations

import logging

import numpy as np
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from thefuzz import fuzz

from backend.models.candidate import Candidate
from backend.models.job import Job
from backend.services.parsing.embedding import generate_embedding

logger = logging.getLogger(__name__)

_VALID_STATUSES = ["completed", "ingested", "needs_review", "pending_review"]


def generate_job_embedding(job: Job) -> list[float]:
    """Generate embedding for a job by combining title + description + skills."""
    parts = [job.title or ""]
    if job.job_description:
        parts.append(job.job_description[:1500])
    if job.skills_required:
        skills = job.skills_required if isinstance(job.skills_required, list) else []
        parts.append("Skills: " + ", ".join(skills))
    if job.location:
        parts.append(f"Location: {job.location}")
    text = "\n".join(parts)
    return generate_embedding(text)


def _compute_skill_match(candidate_skills: list | dict | None, job_skills: list | None) -> float:
    """Compute fraction of required job skills found in candidate skills."""
    if not job_skills:
        return 0.5

    if not candidate_skills:
        return 0.0

    if isinstance(candidate_skills, dict):
        cand_set = {s.lower() for s in candidate_skills.get("skills", candidate_skills.keys())}
    elif isinstance(candidate_skills, list):
        cand_set = {s.lower() for s in candidate_skills if isinstance(s, str)}
    else:
        cand_set = set()

    matched = 0
    for skill in job_skills:
        skill_lower = skill.lower()
        if any(skill_lower in cs or cs in skill_lower for cs in cand_set):
            matched += 1

    return matched / len(job_skills)


def _compute_skill_match_from_text(
    raw_text: str | None, summary: str | None, job_skills: list | None
) -> float:
    """Fallback skill match: search for skills in raw_text and summary."""
    if not job_skills:
        return 0.5
    text = ((raw_text or "") + " " + (summary or "")).lower()
    if not text.strip():
        return 0.0
    matched = sum(1 for s in job_skills if s.lower() in text)
    return matched / len(job_skills)


def _compute_experience_match(candidate_exp: float | None, required_exp: float | None) -> float:
    if required_exp is None or required_exp <= 0:
        return 0.5
    if candidate_exp is None:
        return 0.2
    diff = abs(candidate_exp - required_exp)
    return max(0.2, 1.0 - diff * 0.08)


def _compute_title_relevance(candidate_title: str | None, job_title: str | None) -> float:
    if not candidate_title or not job_title:
        return 0.3
    return fuzz.token_sort_ratio(candidate_title.lower(), job_title.lower()) / 100.0


def _compute_semantic_similarity(
    candidate_embedding: list | None,
    job_embedding: list[float] | None,
) -> float:
    if candidate_embedding is None or job_embedding is None:
        return 0.0
    a = np.array(candidate_embedding, dtype=np.float32)
    b = np.array(job_embedding, dtype=np.float32)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(max(0.0, min(1.0, dot / (norm_a * norm_b))))


async def match_candidates_to_job(
    session: AsyncSession,
    job: Job,
    top_k: int = 20,
) -> list[dict]:
    """Find and rank the best candidates for a job opening.

    Two-pass approach:
      Pass 1: Semantic — candidates WITH embeddings ranked by pgvector distance
      Pass 2: Non-semantic — ALL remaining candidates scored by skill/exp/title
    Merge, sort by composite, return top_k.
    """
    job_skills = job.skills_required if isinstance(job.skills_required, list) else []
    job_emb = list(job.embedding) if job.embedding is not None else None

    if job_emb is None:
        logger.info("Job '%s' has no embedding, generating now", job.title)
        try:
            job_emb = generate_job_embedding(job)
            # Save embedding to DB for future use
            job.embedding = job_emb
            session.add(job)
            await session.commit()
            await session.refresh(job)
        except Exception as e:
            logger.warning("Failed to generate job embedding: %s", e)
            job_emb = None

    scored: list[dict] = []
    seen_ids: set[str] = set()

    # ── Pass 1: Semantic ranking (candidates with embeddings) ────────
    if job_emb is not None:
        try:
            distance = Candidate.embedding.cosine_distance(job_emb)
            stmt = (
                select(Candidate, distance.label("distance"))
                .where(and_(
                    Candidate.ingestion_status.in_(_VALID_STATUSES),
                    Candidate.embedding.isnot(None),
                ))
                .order_by(distance)
                .limit(200)
            )
            result = await session.execute(stmt)
            rows = result.all()

            for row in rows:
                candidate = row[0]
                pg_distance = row[1]
                cid = str(candidate.id)
                seen_ids.add(cid)

                semantic = max(0.0, min(1.0, 1.0 - (pg_distance or 0.0)))
                skill = _compute_skill_match(candidate.skills, job_skills)
                if skill == 0.0:
                    skill = _compute_skill_match_from_text(candidate.raw_text, candidate.summary, job_skills)
                experience = _compute_experience_match(candidate.years_experience, job.experience_required)
                title = _compute_title_relevance(candidate.current_title, job.title)

                composite = (
                    0.50 * semantic + 0.25 * skill + 0.15 * experience + 0.10 * title
                )

                scored.append(_build_result(candidate, composite, semantic, skill, experience, title))
        except Exception as e:
            logger.warning("Semantic pass failed: %s", e)

    # ── Pass 2: Non-semantic fallback (all remaining candidates) ─────
    stmt = (
        select(Candidate)
        .where(and_(
            Candidate.ingestion_status.in_(_VALID_STATUSES),
        ))
        .limit(500)
    )
    result = await session.execute(stmt)
    all_candidates = result.scalars().all()

    for candidate in all_candidates:
        cid = str(candidate.id)
        if cid in seen_ids:
            continue
        seen_ids.add(cid)

        # Try to compute semantic if both have embeddings
        cand_emb = list(candidate.embedding) if candidate.embedding is not None else None
        semantic = _compute_semantic_similarity(cand_emb, job_emb)

        skill = _compute_skill_match(candidate.skills, job_skills)
        if skill == 0.0:
            skill = _compute_skill_match_from_text(candidate.raw_text, candidate.summary, job_skills)
        experience = _compute_experience_match(candidate.years_experience, job.experience_required)
        title = _compute_title_relevance(candidate.current_title, job.title)

        # When no semantic signal, redistribute weight to skill + experience
        if semantic == 0.0:
            composite = 0.45 * skill + 0.30 * experience + 0.15 * title + 0.10 * 0.3
        else:
            composite = 0.50 * semantic + 0.25 * skill + 0.15 * experience + 0.10 * title

        scored.append(_build_result(candidate, composite, semantic, skill, experience, title))

    # Sort by composite descending, filter out irrelevant candidates, return top_k
    scored.sort(key=lambda x: x["composite_score"], reverse=True)
    MIN_RELEVANCE = 0.20  # Below 20% = clearly not a fit
    filtered = [s for s in scored if s["composite_score"] >= MIN_RELEVANCE]
    return filtered[:top_k]


async def compare_candidates_for_job(
    session: AsyncSession,
    job: Job,
    candidate_ids: list[str],
) -> list[dict]:
    """Compare specific candidates against a job with detailed metrics."""
    job_skills = job.skills_required if isinstance(job.skills_required, list) else []
    job_emb = list(job.embedding) if job.embedding is not None else None

    if job_emb is None:
        try:
            job_emb = generate_job_embedding(job)
            job.embedding = job_emb
            session.add(job)
            await session.commit()
            await session.refresh(job)
        except Exception:
            job_emb = None

    import uuid as _uuid
    uuids = [_uuid.UUID(cid) for cid in candidate_ids]

    stmt = select(Candidate).where(Candidate.id.in_(uuids))
    result = await session.execute(stmt)
    candidates = result.scalars().all()

    compared: list[dict] = []
    for candidate in candidates:
        cand_emb = list(candidate.embedding) if candidate.embedding is not None else None
        semantic = _compute_semantic_similarity(cand_emb, job_emb)

        skill = _compute_skill_match(candidate.skills, job_skills)
        if skill == 0.0:
            skill = _compute_skill_match_from_text(candidate.raw_text, candidate.summary, job_skills)
        experience = _compute_experience_match(candidate.years_experience, job.experience_required)
        title = _compute_title_relevance(candidate.current_title, job.title)

        if semantic == 0.0:
            overall = 0.45 * skill + 0.30 * experience + 0.15 * title + 0.10 * 0.3
        else:
            overall = 0.50 * semantic + 0.25 * skill + 0.15 * experience + 0.10 * title

        compared.append({
            "candidate_id": str(candidate.id),
            "full_name": candidate.full_name,
            "email": candidate.email,
            "location": candidate.location,
            "current_title": candidate.current_title,
            "years_experience": candidate.years_experience,
            "skills": candidate.skills if isinstance(candidate.skills, list) else [],
            "education": candidate.education if isinstance(candidate.education, list) else [],
            "experience": candidate.experience if isinstance(candidate.experience, list) else [],
            "semantic_match": round(semantic, 4),
            "skill_overlap": round(skill, 4),
            "experience_score": round(experience, 4),
            "overall_score": round(overall, 4),
        })

    compared.sort(key=lambda x: x["overall_score"], reverse=True)
    return compared


def _build_result(candidate, composite, semantic, skill, experience, title) -> dict:
    return {
        "candidate_id": str(candidate.id),
        "full_name": candidate.full_name,
        "email": candidate.email,
        "location": candidate.location,
        "current_title": candidate.current_title,
        "years_experience": candidate.years_experience,
        "skills": candidate.skills if isinstance(candidate.skills, list) else [],
        "composite_score": round(composite, 4),
        "breakdown": {
            "semantic_similarity": round(semantic, 4),
            "skill_match": round(skill, 4),
            "experience_match": round(experience, 4),
            "title_relevance": round(title, 4),
        },
    }
