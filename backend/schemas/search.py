from __future__ import annotations

import uuid
from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)


class SearchResultItem(BaseModel):
    candidate_id: uuid.UUID
    full_name: str
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    current_title: str | None = None
    years_experience: float | None = None
    skills: list | None = None
    summary: str | None = None
    source: str | None = None
    confidence_score: float | None = None
    similarity_score: float


class SearchResponse(BaseModel):
    query: str
    intent: dict
    total: int
    results: list[SearchResultItem]
