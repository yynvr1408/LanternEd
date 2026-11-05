from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.models.enums import UserRole


class CollegeRosterEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An email a college's administrator has pre-approved (usually from an uploaded CSV).

    It creates no account and sets no password: the person still registers themselves, proving their
    email with the one-time code and the college code. A matching entry only skips the manual approval
    queue. `branch_id` / `section_id`, when given, must match what the person registers into, otherwise the
    registration waits for manual review like any other."""

    __tablename__ = "college_roster_entries"
    __table_args__ = (UniqueConstraint("college_id", "email", name="uq_roster_college_email"),)

    college_id: Mapped[str] = mapped_column(String(36), ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, native_enum=False), nullable=False, default=UserRole.student)
    branch_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("college_branches.id", ondelete="SET NULL"), nullable=True)
    section_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("college_sections.id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(nullable=True)
