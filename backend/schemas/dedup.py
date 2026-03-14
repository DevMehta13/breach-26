from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class CandidateSummary(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str | None
    phone: str | None
    linkedin_url: str | None
    location: str | None
    current_title: str | None
    years_experience: float | None
    skills: list | None
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DedupQueueItem(BaseModel):
    id: uuid.UUID
    candidate_a: CandidateSummary
    candidate_b: CandidateSummary
    composite_score: float
    score_breakdown: dict | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DedupQueueListItem(BaseModel):
    id: uuid.UUID
    candidate_a_id: uuid.UUID
    candidate_a_name: str
    candidate_b_id: uuid.UUID
    candidate_b_name: str
    composite_score: float
    status: str
    created_at: datetime


class MergeRequest(BaseModel):
    field_overrides: dict | None = None


class DedupActionResponse(BaseModel):
    status: str
    message: str
    candidate_id: uuid.UUID | None = None
