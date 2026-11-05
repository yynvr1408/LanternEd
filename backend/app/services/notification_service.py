"""In-app notifications. Creating one must never break the action that caused it (a class starting, a grade
being saved), so `notify` swallows and logs its own failures."""

import logging
from collections.abc import Iterable
from datetime import timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.db.models.classroom import Class
from app.db.models.course import CourseEnrollment
from app.db.models.enums import EnrollmentStatus
from app.db.models.notification import Notification, NotificationDelivery
from app.db.models.user import User

logger = logging.getLogger(__name__)


def notify(db: Session, user_ids: Iterable[str], *, kind: str, title: str, body: str | None = None, link: str | None = None) -> int:
    ids = list(dict.fromkeys(user_ids))
    if not ids:
        return 0
    try:
        rows = [Notification(user_id=uid, kind=kind, title=title[:200], body=body[:500] if body else None, link=link) for uid in ids]
        db.add_all(rows)
        db.flush()
        _queue_whatsapp(db, rows)
        db.commit()
        return len(ids)
    except Exception:  # noqa: BLE001 - a notification is never worth failing the real action
        db.rollback()
        logger.exception("could not create notifications kind=%s", kind)
        return 0


def _queue_whatsapp(db: Session, rows: list[Notification]) -> None:
    """Outbox rows for people who explicitly opted in and gave a number. Does nothing when WhatsApp is not set up."""
    from app.config import get_settings

    if not get_settings().whatsapp_configured:
        return
    by_user = {n.user_id: n for n in rows}
    users = db.execute(select(User).where(User.id.in_(by_user), User.phone.is_not(None), User.whatsapp_opt_in_at.is_not(None))).scalars()
    for user in users:
        db.add(NotificationDelivery(notification_id=by_user[user.id].id, user_id=user.id, channel="whatsapp", to_phone=user.phone))


MAX_DELIVERY_ATTEMPTS = 3


def deliver_pending(db: Session, *, batch: int = 50) -> int:
    """Worker pass: sends queued WhatsApp messages. A temporary failure is retried on later passes (up to 3 tries);
    a permanent one (bad number, unapproved template) is marked failed. Returns how many were sent."""
    from app.integrations import whatsapp

    pending = db.execute(
        select(NotificationDelivery).where(NotificationDelivery.status == "pending").order_by(NotificationDelivery.created_at).limit(batch)
    ).scalars().all()
    sent = 0
    for delivery in pending:
        # Claim it first: with the standalone worker and/or several API processes running the same pass, only the one
        # whose UPDATE matches may send. At-most-once on purpose: a crash mid-send loses one WhatsApp copy (the in-app
        # notification still exists), where a retry-on-crash scheme would risk messaging a person twice.
        claimed = db.execute(
            update(NotificationDelivery)
            .where(NotificationDelivery.id == delivery.id, NotificationDelivery.status == "pending")
            .values(status="sending")
        ).rowcount
        db.commit()
        if claimed != 1:
            continue
        db.refresh(delivery)
        notification = db.get(Notification, delivery.notification_id)
        user = db.get(User, delivery.user_id)
        if notification is None or user is None or user.whatsapp_opt_in_at is None:
            delivery.status, delivery.error_code = "failed", "opted_out"  # they switched it off after it was queued
            db.commit()
            continue
        ok, error = whatsapp.send_template(to_phone=delivery.to_phone, title=notification.title, detail=notification.body or "")
        delivery.attempts += 1
        if ok:
            delivery.status, delivery.sent_at = "sent", utcnow()
            sent += 1
        elif error == "retry" and delivery.attempts < MAX_DELIVERY_ATTEMPTS:
            delivery.status, delivery.error_code = "pending", "retry"  # back in the queue for the next pass
        else:
            delivery.status, delivery.error_code = "failed", (error or "unknown")[:40]
        db.commit()
    return sent


def course_student_ids(db: Session, course_id: str) -> list[str]:
    return list(
        db.execute(
            select(CourseEnrollment.student_id).where(CourseEnrollment.course_id == course_id, CourseEnrollment.status == EnrollmentStatus.active)
        ).scalars()
    )


def class_audience_ids(db: Session, cls: Class) -> list[str]:
    """Enrolled students who can actually join this class (its branch and section limits respected)."""
    from app.services import section_service, teaching_scope_service

    enrolled = course_student_ids(db, cls.course_id)
    if not enrolled:
        return []
    out = []
    for student in db.execute(select(User).where(User.id.in_(enrolled))).scalars():
        if not teaching_scope_service.student_in_branch_audience(db, student, cls):
            continue
        if cls.section_ids and not section_service.is_member_of_any(db, student.id, cls.section_ids):
            continue
        out.append(student.id)
    return out


def list_for_user(db: Session, user_id: str, *, limit: int = 30, unread_only: bool = False) -> list[Notification]:
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    return list(db.execute(stmt.order_by(Notification.created_at.desc()).limit(limit)).scalars())


def unread_count(db: Session, user_id: str) -> int:
    return db.execute(
        select(func.count(Notification.id)).where(Notification.user_id == user_id, Notification.read_at.is_(None))
    ).scalar_one()


def mark_read(db: Session, user_id: str, ids: list[str] | None) -> int:
    """`ids=None` marks everything read. Only the caller's own rows can ever match."""
    stmt = update(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
    if ids is not None:
        stmt = stmt.where(Notification.id.in_(ids))
    result = db.execute(stmt.values(read_at=utcnow()))
    db.commit()
    return result.rowcount or 0


def prune(db: Session, *, retention_days: int = 90) -> int:
    result = db.execute(delete(Notification).where(Notification.created_at < utcnow() - timedelta(days=retention_days)))
    db.commit()
    return result.rowcount or 0
