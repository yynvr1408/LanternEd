from datetime import datetime

from sqlalchemy import ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class InteropPackage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Imported SCORM, H5P, or LTI 1.3 interactive learning package attached to a course."""

    __tablename__ = "interop_packages"

    course_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    standard: Mapped[str] = mapped_column(String(32), nullable=False)  # scorm_1_2, scorm_2004, h5p, lti_1_3
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_prefix: Mapped[str | None] = mapped_column(String(512), nullable=True)
    entry_point: Mapped[str | None] = mapped_column(String(512), nullable=True)
    launch_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    manifest_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)


class XapiStatement(UUIDPrimaryKeyMixin, Base):
    """Experience API (xAPI) Learning Record Store (LRS) statement persisted online or via offline sync."""

    __tablename__ = "xapi_statements"

    actor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=True, index=True
    )
    verb_id: Mapped[str] = mapped_column(String(255), nullable=False)
    verb_display: Mapped[str] = mapped_column(String(120), nullable=False)
    object_id: Mapped[str] = mapped_column(String(255), nullable=False)
    object_name: Mapped[str] = mapped_column(String(255), nullable=False)
    object_type: Mapped[str] = mapped_column(String(80), nullable=False, default="Activity")
    result_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    context_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    statement_timestamp: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
    stored_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow, index=True)
