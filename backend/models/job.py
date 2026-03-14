import uuid

from sqlalchemy import String, Float, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from backend.core.database import Base
from backend.models.base import UUIDPrimaryKey, TimestampMixin


class Job(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "jobs"

    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    employment_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default="full_time"
    )
    experience_required: Mapped[float | None] = mapped_column(Float, nullable=True)
    salary_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    salary_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    skills_required: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    job_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding = mapped_column(Vector(768), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="open", index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
