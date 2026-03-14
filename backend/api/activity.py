from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.user import User
from backend.models.activity_log import ActivityLog
from backend.schemas.activity import ActivityLogItem, ActivityLogResponse

router = APIRouter(prefix="/api/activity", tags=["Activity"])


@router.get("", response_model=ActivityLogResponse)
async def list_activity(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the latest activity logs."""
    count_result = await db.execute(select(func.count(ActivityLog.id)))
    total = count_result.scalar_one()

    result = await db.execute(
        select(ActivityLog)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()

    return ActivityLogResponse(
        total=total,
        results=[
            ActivityLogItem(
                id=log.id,
                user_id=log.user_id,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                metadata=log.metadata_,
                created_at=log.created_at,
            )
            for log in logs
        ],
    )
