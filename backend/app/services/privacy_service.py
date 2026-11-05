"""A person's data, on request: a full export, and account erasure.

Erasure anonymises rather than deleting the user row. Other people's records point at it (a course roster, a
class's attendance, a teacher's grading history), and removing it would damage them. What is removed is what
identifies the person or is their own content: name, email, password, sessions, submitted answers and files,
notifications, recording acknowledgements and any roster entry. Marks stay as bare numbers so a college's
records stay consistent.
"""

import secrets

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ForbiddenError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.db.base import utcnow
from app.db.models.assignment import Assignment, AssignmentSubmission, SubmissionAttachment
from app.db.models.classroom import Class, ClassParticipant
from app.db.models.college import College, CollegeAdministrator
from app.db.models.consent import RecordingConsent
from app.db.models.course import Course, CourseEnrollment
from app.db.models.enums import UserRole, UserStatus
from app.db.models.notification import Notification, NotificationDelivery
from app.db.models.roster import CollegeRosterEntry
from app.db.models.user import PasswordResetOtpChallenge, PasswordResetToken, User, UserSession
from app.integrations.object_storage import get_storage
from app.services import audit_service


def _iso(moment):
    return moment.isoformat() if moment else None


def export_user(db: Session, user: User) -> dict:
    college = db.get(College, user.college_id) if user.college_id else None
    enrollments = db.execute(
        select(Course.title, CourseEnrollment.status, CourseEnrollment.enrolled_at)
        .join(CourseEnrollment, CourseEnrollment.course_id == Course.id)
        .where(CourseEnrollment.student_id == user.id)
    ).all()
    submissions = db.execute(
        select(Assignment.title, AssignmentSubmission)
        .join(AssignmentSubmission, AssignmentSubmission.assignment_id == Assignment.id)
        .where(AssignmentSubmission.student_id == user.id)
    ).all()
    attachments = db.execute(select(SubmissionAttachment).where(SubmissionAttachment.student_id == user.id)).scalars().all()
    attendance = db.execute(
        select(Class.title, ClassParticipant.joined_at, ClassParticipant.left_at)
        .join(ClassParticipant, ClassParticipant.class_id == Class.id)
        .where(ClassParticipant.user_id == user.id)
    ).all()
    notifications = db.execute(
        select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(200)
    ).scalars().all()
    sessions = db.execute(select(UserSession).where(UserSession.user_id == user.id)).scalars().all()
    owned_courses = db.execute(select(Course.title, Course.status).where(Course.teacher_id == user.id)).all()

    return {
        "exported_at": _iso(utcnow()),
        "profile": {
            "id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role.value,
            "status": user.status.value, "phone": user.phone, "whatsapp_opt_in": user.whatsapp_opt_in_at is not None, "college": college.name if college else None, "created_at": _iso(user.created_at),
        },
        "courses_enrolled": [{"course": title, "status": status.value, "enrolled_at": _iso(at)} for title, status, at in enrollments],
        "courses_taught": [{"course": title, "status": status.value} for title, status in owned_courses],
        "submissions": [
            {
                "assignment": title, "status": sub.status.value, "answer": sub.answer, "score": sub.score, "feedback": sub.feedback,
                "submitted_at": _iso(sub.submitted_at), "graded_at": _iso(sub.graded_at),
            }
            for title, sub in submissions
        ],
        "submission_files": [{"filename": a.filename, "size_bytes": a.size_bytes, "uploaded_at": _iso(a.created_at)} for a in attachments],
        "class_attendance": [{"class": title, "joined_at": _iso(j), "left_at": _iso(left)} for title, j, left in attendance],
        "notifications": [
            {"title": n.title, "body": n.body, "created_at": _iso(n.created_at), "read_at": _iso(n.read_at)} for n in notifications
        ],
        "sessions": [{"started": _iso(s.created_at), "expires": _iso(s.expires_at), "revoked": _iso(s.revoked_at)} for s in sessions],
    }


def erase_user(db: Session, user: User, *, password: str) -> None:
    if user.role not in (UserRole.student, UserRole.teacher):
        raise ForbiddenError("This account type cannot be erased here.", code="ROLE_NOT_ALLOWED")
    if not verify_password(password, user.password_hash):
        raise UnauthorizedError("Incorrect password.", code="INVALID_CREDENTIALS")
    if db.execute(select(CollegeAdministrator.id).where(CollegeAdministrator.user_id == user.id)).first():
        raise ConflictError("Ask the platform administrator to hand over your college administrator role first.", code="IS_COLLEGE_ADMIN")
    if db.execute(select(Course.id).where(Course.teacher_id == user.id)).first():
        raise ConflictError("Transfer or delete the courses you own before erasing your account.", code="OWNS_COURSES")

    storage = get_storage()
    for attachment in db.execute(select(SubmissionAttachment).where(SubmissionAttachment.student_id == user.id)).scalars():
        try:
            storage.delete(attachment.storage_key)
        except Exception:  # noqa: BLE001 - a missing object must not block the erasure
            pass
        db.delete(attachment)
    for sub in db.execute(select(AssignmentSubmission).where(AssignmentSubmission.student_id == user.id)).scalars():
        sub.answer, sub.feedback = {}, None  # their words are gone; the mark stays as a bare number

    email_before = user.email
    db.execute(delete(NotificationDelivery).where(NotificationDelivery.user_id == user.id))
    db.execute(delete(Notification).where(Notification.user_id == user.id))
    db.execute(delete(RecordingConsent).where(RecordingConsent.user_id == user.id))
    db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    db.execute(delete(PasswordResetOtpChallenge).where(PasswordResetOtpChallenge.user_id == user.id))
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))
    db.execute(delete(CollegeRosterEntry).where(CollegeRosterEntry.email == email_before))

    user.phone, user.whatsapp_opt_in_at = None, None
    user.full_name = "Deleted user"
    user.email = f"deleted-{user.id}@deleted.invalid"
    user.password_hash = hash_password(secrets.token_urlsafe(32))  # nobody knows it: the account can never sign in
    user.status = UserStatus.suspended
    db.commit()
    audit_service.record(db, actor_id=user.id, action="account_erased", resource_type="user", resource_id=user.id)
