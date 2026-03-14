import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, cast, Date, case
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.user import User
from backend.models.candidate import Candidate, CandidateMergeHistory
from backend.models.shortlist import Shortlist
from backend.schemas.analytics import (
    AnalyticsOverview, SourceBreakdown, IngestionTrend,
    StatusBreakdown, SkillCount, LocationCount, ExperienceBucket,
)

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/overview", response_model=AnalyticsOverview)
async def analytics_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated analytics — all queries run in parallel for speed."""

    # Run all independent queries concurrently
    (
        total_candidates_r,
        total_shortlists_r,
        total_merged_r,
        avg_conf_r,
        source_r,
        trend_r,
        status_r,
        loc_r,
        exp_r,
    ) = await asyncio.gather(
        db.execute(
            select(func.count(Candidate.id)).where(Candidate.ingestion_status != "merged")
        ),
        db.execute(select(func.count(Shortlist.id))),
        db.execute(select(func.count(CandidateMergeHistory.id))),
        db.execute(
            select(func.avg(Candidate.confidence_score)).where(
                Candidate.confidence_score.isnot(None),
                Candidate.ingestion_status != "merged",
            )
        ),
        db.execute(
            select(Candidate.source, func.count(Candidate.id))
            .where(Candidate.ingestion_status != "merged")
            .group_by(Candidate.source)
            .order_by(func.count(Candidate.id).desc())
        ),
        db.execute(
            select(
                cast(Candidate.created_at, Date).label("date"),
                func.count(Candidate.id).label("count"),
            )
            .where(Candidate.ingestion_status != "merged")
            .group_by(cast(Candidate.created_at, Date))
            .order_by(cast(Candidate.created_at, Date).desc())
            .limit(30)
        ),
        db.execute(
            select(Candidate.ingestion_status, func.count(Candidate.id))
            .group_by(Candidate.ingestion_status)
            .order_by(func.count(Candidate.id).desc())
        ),
        db.execute(
            select(Candidate.location, func.count(Candidate.id))
            .where(
                Candidate.location.isnot(None),
                Candidate.location != "",
                Candidate.ingestion_status != "merged",
            )
            .group_by(Candidate.location)
            .order_by(func.count(Candidate.id).desc())
            .limit(8)
        ),
        db.execute(
            select(
                case(
                    (Candidate.years_experience < 2, "0-2 yrs"),
                    (Candidate.years_experience < 5, "2-5 yrs"),
                    (Candidate.years_experience < 8, "5-8 yrs"),
                    (Candidate.years_experience < 12, "8-12 yrs"),
                    else_="12+ yrs",
                ).label("bucket"),
                func.count(Candidate.id).label("count"),
            )
            .where(
                Candidate.years_experience.isnot(None),
                Candidate.ingestion_status != "merged",
            )
            .group_by("bucket")
            .order_by("bucket")
        ),
    )

    # Skills query separately (can fail on empty JSONB)
    try:
        skill_r = await db.execute(
            select(
                func.jsonb_array_elements_text(Candidate.skills).label("skill"),
                func.count().label("cnt"),
            )
            .where(
                Candidate.skills.isnot(None),
                Candidate.ingestion_status != "merged",
            )
            .group_by("skill")
            .order_by(func.count().desc())
            .limit(12)
        )
        top_skills = [SkillCount(skill=r.skill, count=r.cnt) for r in skill_r.all()]
    except Exception:
        top_skills = []

    # Extract results
    total_candidates = total_candidates_r.scalar_one()
    total_shortlists = total_shortlists_r.scalar_one()
    total_merged = total_merged_r.scalar_one()
    avg_confidence = avg_conf_r.scalar_one()

    sources = [SourceBreakdown(source=r[0], count=r[1]) for r in source_r.all()]
    trends = [IngestionTrend(date=str(r.date), count=r.count) for r in trend_r.all()]
    statuses = [StatusBreakdown(status=r[0], count=r[1]) for r in status_r.all()]
    top_locations = [LocationCount(location=r[0], count=r[1]) for r in loc_r.all()]
    experience_distribution = [ExperienceBucket(bucket=r.bucket, count=r.count) for r in exp_r.all()]

    return AnalyticsOverview(
        total_candidates=total_candidates,
        total_shortlists=total_shortlists,
        total_merged=total_merged,
        avg_confidence=round(avg_confidence, 2) if avg_confidence else None,
        sources=sources,
        ingestion_trends=trends,
        statuses=statuses,
        top_skills=top_skills,
        top_locations=top_locations,
        experience_distribution=experience_distribution,
    )
