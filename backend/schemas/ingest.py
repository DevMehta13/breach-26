from __future__ import annotations

import uuid
from pydantic import BaseModel, Field


class EducationEntry(BaseModel):
    degree: str | None = None
    institution: str | None = None
    year: str | None = None
    field_of_study: str | None = None


class ExperienceEntry(BaseModel):
    title: str | None = None
    company: str | None = None
    duration: str | None = None
    description: str | None = None


class ParsedResume(BaseModel):
    """Schema for structured data extracted from a resume by Gemini."""

    full_name: str = Field(default="Unknown", description="Candidate's full name")
    email: str | None = Field(default=None, description="Email address")
    phone: str | None = Field(default=None, description="Phone number")
    location: str | None = Field(default=None, description="City, State or Country")
    linkedin_url: str | None = Field(default=None, description="LinkedIn profile URL")
    current_title: str | None = Field(default=None, description="Most recent job title")
    years_experience: float | None = Field(
        default=None,
        description="Total years of professional experience as a number",
    )
    summary: str | None = Field(
        default=None,
        description="A 2-3 sentence professional summary of the candidate",
    )
    skills: list[str] = Field(
        default_factory=list,
        description="List of technical and professional skills",
    )
    education: list[EducationEntry] = Field(default_factory=list)
    experience: list[ExperienceEntry] = Field(default_factory=list)
    confidence_score: float = Field(
        default=0.0,
        description="Confidence in extraction quality from 0.0 to 1.0",
    )


class UploadResponse(BaseModel):
    candidate_id: uuid.UUID
    status: str
    parsed_data: ParsedResume
