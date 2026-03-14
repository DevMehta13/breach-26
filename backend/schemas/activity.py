from __future__ import annotations

import uuid
from datetime import datetime
from pydantic import BaseModel


class ActivityLogItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    action: str
    entity_type: str
    entity_id: uuid.UUID | None = None
    metadata: dict | None = None
    created_at: datetime


class ActivityLogResponse(BaseModel):
    total: int
    results: list[ActivityLogItem]
