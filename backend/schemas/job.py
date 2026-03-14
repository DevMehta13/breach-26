from __future__ import annotations

import uuid
from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    title: str
    company: str | None = None
    department: str | None = None
    location: str | None = None
    employment_type: str = "full_time"
    experience_required: float | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    skills_required: list[str] = Field(default_factory=list)
    job_description: str | None = None


class JobResponse(BaseModel):
    id: uuid.UUID
    title: str
    company: str | None
    department: str | None
    location: str | None
    employment_type: str | None
    experience_required: float | None
    salary_min: float | None
    salary_max: float | None
    skills_required: list[str] | None
    job_description: str | None
    status: str
    created_by: uuid.UUID | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class MatchRequest(BaseModel):
    top_k: int = Field(default=20, ge=1, le=500)


class MatchScoreBreakdown(BaseModel):
    semantic_similarity: float
    skill_match: float
    experience_match: float
    title_relevance: float


class MatchResultItem(BaseModel):
    candidate_id: str
    full_name: str
    email: str | None
    location: str | None
    current_title: str | None
    years_experience: float | None
    skills: list[str] | None
    composite_score: float
    breakdown: MatchScoreBreakdown


class MatchResponse(BaseModel):
    job_id: str
    job_title: str
    total: int
    results: list[MatchResultItem]


class CompareRequest(BaseModel):
    candidate_ids: list[str]


class CompareCandidate(BaseModel):
    candidate_id: str
    full_name: str
    email: str | None
    location: str | None
    current_title: str | None
    years_experience: float | None
    skills: list[str] | None
    education: list[dict] | None
    experience: list[dict] | None
    semantic_match: float
    skill_overlap: float
    experience_score: float
    overall_score: float


class CompareResponse(BaseModel):
    job_id: str
    job_title: str
    candidates: list[CompareCandidate]
