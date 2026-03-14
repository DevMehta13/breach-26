import uuid
from datetime import datetime

from sqlalchemy import String, Float, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base
from backend.models.base import UUIDPrimaryKey, TimestampMixin


class DedupQueue(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "dedup_queue"

    candidate_a_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    candidate_b_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    composite_score: Mapped[float] = mapped_column(Float, nullable=False)
    score_breakdown: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
