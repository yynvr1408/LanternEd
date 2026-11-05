from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin, utcnow


class NotificationDelivery(UUIDPrimaryKeyMixin, Base):
    """The outbox for off-platform delivery (WhatsApp): one row per notification per channel, delivered by the worker
    so a class starting never waits on hundreds of outbound HTTP calls, and a failed send is retried a few times."""

    __tablename__ = "notification_deliveries"

    notification_id: Mapped[str] = mapped_column(String(36), ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)  # whatsapp
    to_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)  # pending | sent | failed
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(nullable=True)


class Notification(UUIDPrimaryKeyMixin, Base):
    """A short in-app message for one user ("Physics is live now", "Your assignment was graded").
    Created by the server as a side effect of something that happened; users can only read and mark their own."""

    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_created", "user_id", "created_at"),)

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)  # class_live | assignment_published | graded | summary_ready
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(String(500), nullable=True)
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)  # in-app path, never an external URL
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
    read_at: Mapped[datetime | None] = mapped_column(nullable=True)
