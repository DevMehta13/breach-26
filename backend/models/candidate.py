import uuid

from sqlalchemy import String, Float, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from backend.core.database import Base
from backend.models.base import UUIDPrimaryKey, TimestampMixin


class Candidate(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "candidates"

    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    linkedin_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    years_experience: Mapped[float | None] = mapped_column(Float, nullable=True)

    skills: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    education: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    experience: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding = mapped_column(Vector(768), nullable=True)

    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="resume_upload"
    )
    source_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    ingestion_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending"
    )
    ingestion_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class CandidateMergeHistory(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "candidate_merge_history"

    primary_candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("candidates.id"), nullable=False
    )
    merged_candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("candidates.id"), nullable=False
    )
    merge_type: Mapped[str] = mapped_column(String(30), nullable=False, default="auto")
    merge_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    field_resolutions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    merged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
