"""Self-service data export, account erasure, and enforced retention."""

from datetime import timedelta

from fastapi.testclient import TestClient

from app.db.base import utcnow
from app.db.models.classroom import Class, ClassRecording
from app.db.models.enums import ClassStatus, RecordingStatus
from app.db.models.notification import Notification
from app.integrations import object_storage
from app.main import app
from app.services import notification_service, recording_service


def test_export_contains_the_persons_own_data_only(teacher, enrolled_student, published_assignment, make_user):
    sclient, suser = enrolled_student
    tclient, _ = teacher
    aid = published_assignment["id"]
    sub = sclient.put(f"/api/v1/assignments/{aid}/submissions/me", json={"answer": {"text": "my private answer"}, "submit": True}).json()
    tclient.put(f"/api/v1/assignments/{aid}/submissions/{sub['id']}/grade", json={"score": 64, "feedback": "ok"})

    resp = sclient.get("/api/v1/users/me/export")
    assert resp.status_code == 200 and "attachment" in resp.headers["content-disposition"]
    assert resp.headers["cache-control"] == "no-store"
    data = resp.json()
    assert data["profile"]["email"] == suser["email"]
    assert data["submissions"][0]["answer"] == {"text": "my private answer"} and data["submissions"][0]["score"] == 64
    assert any(n["title"].startswith("Graded") for n in data["notifications"])
    assert "password" not in str(data).lower() and "session_hash" not in str(data)

    other, other_user = make_user(role="student", prefix="other")
    assert "my private answer" not in other.get("/api/v1/users/me/export").text


def test_export_requires_sign_in(client):
    assert client.get("/api/v1/users/me/export").status_code == 401


def test_erasure_needs_the_password_and_the_confirmation_word(make_user):
    client, _ = make_user(role="student", prefix="eraser")
    assert client.post("/api/v1/users/me/erase", json={"password": "wrong", "confirm": "DELETE"}).status_code == 401
    assert client.post("/api/v1/users/me/erase", json={"password": "password123", "confirm": "yes"}).status_code in (400, 422)
    assert client.get("/api/v1/users/me").status_code == 200  # still there


def test_erasure_anonymises_removes_content_and_blocks_sign_in(teacher, enrolled_student, published_assignment, db_session):
    from sqlalchemy import select

    from app.db.models.assignment import AssignmentSubmission
    from app.db.models.user import User

    sclient, suser = enrolled_student
    tclient, _ = teacher
    aid = published_assignment["id"]
    sub = sclient.put(f"/api/v1/assignments/{aid}/submissions/me", json={"answer": {"text": "secret words"}, "submit": True}).json()
    tclient.put(f"/api/v1/assignments/{aid}/submissions/{sub['id']}/grade", json={"score": 55, "feedback": "private feedback"})

    assert sclient.post("/api/v1/users/me/erase", json={"password": "password123", "confirm": "DELETE"}).status_code == 204

    db_session.expire_all()
    user = db_session.get(User, suser["id"])
    assert user.full_name == "Deleted user" and user.email.endswith("@deleted.invalid") and user.status.value == "suspended"
    row = db_session.execute(select(AssignmentSubmission).where(AssignmentSubmission.student_id == suser["id"])).scalar_one()
    assert row.answer == {} and row.feedback is None and row.score == 55  # words gone, the mark stays
    assert db_session.execute(select(Notification).where(Notification.user_id == suser["id"])).first() is None

    assert TestClient(app).post("/api/v1/auth/login", json={"email": suser["email"], "password": "password123"}).status_code == 401
    assert sclient.get("/api/v1/users/me").status_code == 401  # the session is gone


def test_a_teacher_who_owns_courses_cannot_erase_until_they_hand_them_over(teacher, published_course):
    tclient, _ = teacher
    resp = tclient.post("/api/v1/users/me/erase", json={"password": "password123", "confirm": "DELETE"})
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "OWNS_COURSES"


def _expired_recording(db, teacher_id, course_id, *, age_days, name):
    cls = Class(course_id=course_id, teacher_id=teacher_id, title=name, scheduled_start=utcnow(), status=ClassStatus.ended)
    db.add(cls)
    db.commit()
    key = f"recordings/{cls.id}/{name}.mp4"
    rec = ClassRecording(
        class_id=cls.id, requested_by=teacher_id, egress_id=f"e-{name}", storage_key=key, status=RecordingStatus.available,
        completed_at=utcnow() - timedelta(days=age_days), is_published=True,
    )
    db.add(rec)
    db.commit()
    return rec


def test_retention_deletes_old_recording_media_and_keeps_recent_ones(teacher, published_course, db_session, monkeypatch):
    _, tuser = teacher
    deleted = []

    class FakeStore:
        def delete(self, key):
            deleted.append(key)

    monkeypatch.setattr(recording_service, "get_storage", lambda: FakeStore())
    old = _expired_recording(db_session, tuser["id"], published_course["id"], age_days=200, name="old")
    recent = _expired_recording(db_session, tuser["id"], published_course["id"], age_days=10, name="recent")

    assert recording_service.archive_expired(db_session, retention_days=180) == 1
    db_session.refresh(old)
    db_session.refresh(recent)
    assert old.status == RecordingStatus.archived and old.is_published is False and deleted == [old.storage_key]
    assert recent.status == RecordingStatus.available
    assert recording_service.archive_expired(db_session, retention_days=180) == 0  # repeatable


def test_a_failed_media_deletion_keeps_the_recording_for_the_next_pass(teacher, published_course, db_session, monkeypatch):
    _, tuser = teacher

    class Broken:
        def delete(self, key):
            raise RuntimeError("storage down")

    monkeypatch.setattr(recording_service, "get_storage", lambda: Broken())
    rec = _expired_recording(db_session, tuser["id"], published_course["id"], age_days=400, name="stuck")
    recording_service.archive_expired(db_session, retention_days=180)
    db_session.refresh(rec)
    assert rec.status == RecordingStatus.available


def test_old_notifications_are_pruned(enrolled_student, db_session):
    _, suser = enrolled_student
    notification_service.notify(db_session, [suser["id"]], kind="x", title="old one")
    row = db_session.query(Notification).filter(Notification.user_id == suser["id"]).first()
    row.created_at = utcnow() - timedelta(days=120)
    db_session.commit()
    notification_service.notify(db_session, [suser["id"]], kind="x", title="fresh one")
    assert notification_service.prune(db_session, retention_days=90) >= 1
    titles = [n.title for n in db_session.query(Notification).filter(Notification.user_id == suser["id"])]
    assert "fresh one" in titles and "old one" not in titles
