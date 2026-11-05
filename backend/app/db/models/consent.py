from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin, utcnow


class RecordingConsent(UUIDPrimaryKeyMixin, Base):
    """A student's acknowledgement that a class is being recorded, kept so a student's voice is never recorded
    (a mic grant while recording) without their having seen the notice."""

    __tablename__ = "recording_consents"
    __table_args__ = (UniqueConstraint("class_id", "user_id", name="uq_recording_consent_class_user"),)

    class_id: Mapped[str] = mapped_column(String(36), ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    accepted_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
