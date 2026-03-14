from __future__ import annotations

import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class ShortlistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class ShortlistCandidateAdd(BaseModel):
    candidate_id: uuid.UUID
    notes: str | None = None


class ShortlistCandidateItem(BaseModel):
    id: uuid.UUID
    candidate_id: uuid.UUID
    full_name: str
    email: str | None = None
    current_title: str | None = None
    notes: str | None = None
    added_at: datetime


class ShortlistResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    created_by: uuid.UUID
    candidate_count: int = 0
    created_at: datetime
    updated_at: datetime


class ShortlistDetailResponse(ShortlistResponse):
    candidates: list[ShortlistCandidateItem] = []
