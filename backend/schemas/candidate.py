from __future__ import annotations

import uuid
from datetime import datetime
from pydantic import BaseModel


class CandidateListItem(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    current_title: str | None = None
    years_experience: float | None = None
    source: str
    ingestion_status: str
    confidence_score: float | None = None
    created_at: datetime


class CandidateDetail(CandidateListItem):
    linkedin_url: str | None = None
    skills: list | None = None
    education: list | None = None
    experience: list | None = None
    summary: str | None = None
    raw_text: str | None = None
    source_ref: str | None = None
    ingestion_error: str | None = None
    updated_at: datetime


class CandidateUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    current_title: str | None = None
    years_experience: float | None = None
    linkedin_url: str | None = None
    skills: list | None = None
    education: list | None = None
    experience: list | None = None
    summary: str | None = None
    ingestion_status: str | None = None


class CandidateListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    results: list[CandidateListItem]
