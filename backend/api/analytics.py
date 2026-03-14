from fastapi import APIRouter, Depends
from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.user import User
from backend.models.candidate import Candidate
from backend.models.shortlist import Shortlist
from backend.schemas.analytics import AnalyticsOverview, SourceBreakdown, IngestionTrend

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/overview", response_model=AnalyticsOverview)
async def analytics_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated analytics: totals, source breakdown, ingestion trends."""

    # Total candidates
    total_candidates_result = await db.execute(
        select(func.count(Candidate.id))
    )
    total_candidates = total_candidates_result.scalar_one()

    # Total shortlists
    total_shortlists_result = await db.execute(
        select(func.count(Shortlist.id))
    )
    total_shortlists = total_shortlists_result.scalar_one()

    # Candidates by source
    source_result = await db.execute(
        select(Candidate.source, func.count(Candidate.id))
        .group_by(Candidate.source)
        .order_by(func.count(Candidate.id).desc())
    )
    sources = [
        SourceBreakdown(source=row[0], count=row[1])
        for row in source_result.all()
    ]

    # Ingestion trends (candidates created per day, last 30 days)
    trend_result = await db.execute(
        select(
            cast(Candidate.created_at, Date).label("date"),
            func.count(Candidate.id).label("count"),
        )
        .group_by(cast(Candidate.created_at, Date))
        .order_by(cast(Candidate.created_at, Date).desc())
        .limit(30)
    )
    trends = [
        IngestionTrend(date=str(row.date), count=row.count)
        for row in trend_result.all()
    ]

    return AnalyticsOverview(
        total_candidates=total_candidates,
        total_shortlists=total_shortlists,
        sources=sources,
        ingestion_trends=trends,
    )
