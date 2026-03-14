from __future__ import annotations

import uuid
from pydantic import BaseModel


class SyncResultItem(BaseModel):
    name: str | None = None
    filename: str | None = None
    sender: str | None = None
    subject: str | None = None
    candidate_id: uuid.UUID | None = None
    status: str


class SyncResponse(BaseModel):
    source: str
    total: int
    results: list[SyncResultItem]
