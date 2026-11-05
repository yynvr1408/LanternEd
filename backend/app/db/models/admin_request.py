from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin, utcnow


class CollegeAdminRequest(UUIDPrimaryKeyMixin, Base):
    """A teacher of a college asking to become its administrator. Only the platform administrator can grant it
    (see college_service.assign_college_admin); this just replaces asking by phone with a visible queue."""

    __tablename__ = "college_admin_requests"

    college_id: Mapped[str] = mapped_column(String(36), ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)  # pending | approved | rejected
    rejected_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
