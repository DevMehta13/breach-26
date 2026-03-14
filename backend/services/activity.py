"""Activity logging utility."""

from __future__ import annotations

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.activity_log import ActivityLog


async def log_activity(
    db: AsyncSession,
    user_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    metadata: dict | None = None,
) -> None:
    """Insert an activity log record."""
    entry = ActivityLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_=metadata,
    )
    db.add(entry)
    await db.commit()
