from __future__ import annotations

import uuid
from pydantic import BaseModel, Field


class ReferralCreate(BaseModel):
    employee_id: str
    job_id: str
    candidate_name: str
    candidate_email: str
    candidate_phone: str | None = None
    candidate_location: str | None = None
    candidate_title: str | None = None
    candidate_id: str | None = None  # If candidate already exists
    notes: str | None = None


class ReferralResponse(BaseModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    candidate_id: uuid.UUID
    job_id: uuid.UUID
    status: str
    notes: str | None
    referred_at: str
    employee_name: str | None = None
    candidate_name: str | None = None
    job_title: str | None = None

    model_config = {"from_attributes": True}


class ReferralListResponse(BaseModel):
    total: int
    results: list[ReferralResponse]


class ReferralAnalytics(BaseModel):
    total_referrals: int
    total_hires: int
    success_rate: float
    top_referrers: list[dict]
    department_breakdown: list[dict]
    status_breakdown: list[dict]
