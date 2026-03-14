from __future__ import annotations

from pydantic import BaseModel


class SourceBreakdown(BaseModel):
    source: str
    count: int


class IngestionTrend(BaseModel):
    date: str
    count: int


class AnalyticsOverview(BaseModel):
    total_candidates: int
    total_shortlists: int
    sources: list[SourceBreakdown]
    ingestion_trends: list[IngestionTrend]
