"""Regression tests for the second round of security-review findings (users, intake, rate limits, recordings,
sections, class lifecycle)."""

import secrets
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.db.base import utcnow
from app.db.models.classroom import Class, ClassRecording
from app.db.models.enums import ClassStatus, RecordingStatus
from app.db.session import SessionLocal
from app.integrations import livekit
from app.main import app
from app.services import auth_service, college_service, rate_limit_service, recording_service
from tests.api.test_classes import _create_class, mock_livekit  # noqa: F401  (fixture reuse)
from tests.api.test_college_registration import admin, make_college, register_active  # noqa: F401
from tests.conftest import unique_email


# --- class lifecycle -------------------------------------------------------------------------------


def test_ending_a_class_closes_the_livekit_room(mock_livekit, teacher, published_course, monkeypatch):  # noqa: F811
    deleted = []

    async def fake_delete_room(room_name):
        deleted.append(room_name)

    monkeypatch.setattr(livekit, "delete_room", fake_delete_room)
    tclient, _ = teacher
    cls = _create_class(tclient, published_course["id"])
    tclient.post(f"/api/v1/classes/{cls['id']}/start")
    assert tclient.post(f"/api/v1/classes/{cls['id']}/end").status_code == 200
    assert len(deleted) == 1 and cls["id"] in deleted[0]


def test_only_a_class_that_has_not_started_can_be_edited_and_times_must_be_ordered(mock_livekit, teacher, published_course):  # noqa: F811
    tclient, _ = teacher
    cls = _create_class(tclient, published_course["id"])
    url = f"/api/v1/classes/{cls['id']}"
    assert tclient.patch(url, json={"title": "Renamed"}).status_code == 200
    bad = tclient.patch(url, json={"scheduled_start": "2027-01-02T10:00:00Z", "scheduled_end": "2027-01-02T09:00:00Z"})
    assert bad.status_code in (400, 422) and bad.json()["error"]["code"] == "INVALID_SCHEDULE"
    tclient.post(f"{url}/start")
    live_edit = tclient.patch(url, json={"title": "Too late"})
    assert live_edit.status_code == 409 and live_edit.json()["error"]["code"] == "CLASS_NOT_EDITABLE"


def test_a_removed_student_cannot_keep_raising_a_hand(mock_livekit, teacher, enrolled_student, published_course):  # noqa: F811
    tclient, _ = teacher
    sclient, suser = enrolled_student
    cls = _create_class(tclient, published_course["id"])
    tclient.post(f"/api/v1/classes/{cls['id']}/start")
    sclient.post(f"/api/v1/classes/{cls['id']}/join-token")
    tclient.post(f"/api/v1/classes/{cls['id']}/participants/{suser['id']}/remove")
    resp = sclient.post(f"/api/v1/classes/{cls['id']}/speak-requests")
    assert resp.status_code == 403 and resp.json()["error"]["code"] == "REMOVED_FROM_CLASS"


# --- recordings ------------------------------------------------------------------------------------


def _recording(db, status):
    cls = Class(
        course_id="c-" + secrets.token_hex(4), teacher_id="t-" + secrets.token_hex(4), title="x",
        scheduled_start=utcnow(), status=ClassStatus.ended,
    )
    return cls, status


def test_two_finalizers_racing_only_one_triggers_follow_up_work(teacher, published_course, db_session):
    _, tuser = teacher
    cls = Class(course_id=published_course["id"], teacher_id=tuser["id"], title="Race", scheduled_start=utcnow(), status=ClassStatus.ended)
    db_session.add(cls)
    db_session.commit()
    rec = ClassRecording(class_id=cls.id, requested_by=tuser["id"], egress_id="egress-race", status=RecordingStatus.processing)
    db_session.add(rec)
    db_session.commit()

    # a webhook handler and a teacher's poll each loaded the recording while it was still processing
    other = SessionLocal()
    try:
        stale = other.get(ClassRecording, rec.id)
        first = recording_service.finalize_from_provider(db_session, rec, complete=False, failed=True, error="boom")
        second = recording_service.finalize_from_provider(other, stale, complete=False, failed=True, error="boom")
        assert first._finalized_here is True
        assert getattr(second, "_finalized_here", False) is False
        assert second.status == RecordingStatus.failed
    finally:
        other.close()


def test_a_recording_that_is_still_processing_cannot_be_deleted(teacher, published_course, db_session):
    tclient, tuser = teacher
    cls = Class(course_id=published_course["id"], teacher_id=tuser["id"], title="Busy", scheduled_start=utcnow(), status=ClassStatus.ended)
    db_session.add(cls)
    db_session.commit()
    rec = ClassRecording(class_id=cls.id, requested_by=tuser["id"], egress_id="egress-busy", status=RecordingStatus.processing)
    db_session.add(rec)
    db_session.commit()
    resp = tclient.delete(f"/api/v1/recordings/{rec.id}")
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "RECORDING_IN_PROGRESS"


# --- sections: a scoped teacher stays inside their own college sections -----------------------------


def test_a_scoped_teacher_cannot_manage_a_section_of_another_college_section(admin):  # noqa: F811
    college, sections = make_college(admin)  # CSE-A, CSE-B
    owner, owner_resp = register_active(college, role="teacher", all_sections=True)
    scoped, scoped_resp = register_active(college, sections[0], role="teacher")  # only section A
    course = owner.post("/api/v1/courses", json={"title": "Shared", "status": "published"}).json()
    section_b = owner.post(
        f"/api/v1/courses/{course['id']}/sections", json={"name": "B cohort", "code": "B1", "college_section_id": sections[1]["id"]}
    )
    assert section_b.status_code == 201, section_b.text
    assert owner.post(f"/api/v1/courses/{course['id']}/teachers", json={"teacher_id": scoped_resp.json()["user"]["id"]}).status_code == 201

    url = f"/api/v1/sections/{section_b.json()['id']}/members"
    assert scoped.get(url).status_code == 403
    assert owner.get(url).status_code == 200  # the all-sections teacher can


# --- login lockout and rate-limit helper ------------------------------------------------------------


def test_strangers_cannot_lock_an_account_owner_out_of_login(make_user, db_session, monkeypatch):
    monkeypatch.setattr(auth_service, "_MAX_ATTEMPTS", 3)
    _, user = make_user(role="student", prefix="victim")
    for n in range(10):  # attempts from ten different addresses
        with pytest.raises(Exception):
            auth_service.authenticate_user(db_session, email=user["email"], password="wrong-password", ip=f"203.0.113.{n}")
    assert auth_service.authenticate_user(db_session, email=user["email"], password="password123", ip="198.51.100.9").id == user["id"]


def test_one_client_guessing_an_account_is_still_stopped(make_user, db_session, monkeypatch):
    monkeypatch.setattr(auth_service, "_MAX_ATTEMPTS", 3)
    _, user = make_user(role="student", prefix="target")
    for _ in range(3):
        with pytest.raises(Exception):
            auth_service.authenticate_user(db_session, email=user["email"], password="wrong-password", ip="203.0.113.77")
    with pytest.raises(Exception) as locked:
        auth_service.authenticate_user(db_session, email=user["email"], password="password123", ip="203.0.113.77")
    assert getattr(locked.value, "status_code", None) == 429


def test_enforce_allows_the_limit_then_refuses(db_session):
    key = f"test-enforce:{secrets.token_hex(4)}"
    for _ in range(3):
        rate_limit_service.enforce(db_session, key, limit=3, window=timedelta(minutes=5))
    with pytest.raises(Exception) as refused:
        rate_limit_service.enforce(db_session, key, limit=3, window=timedelta(minutes=5))
    assert getattr(refused.value, "status_code", None) == 429


def test_summary_jobs_are_rate_limited_per_user(teacher, published_course, monkeypatch):
    from app.api.v1 import summaries

    calls = []
    real = rate_limit_service.enforce

    def spy(db, key, *, limit, window, **kw):
        calls.append((key.split(":")[0], limit))
        return real(db, key, limit=limit, window=window, **kw)

    monkeypatch.setattr(summaries.rate_limit_service, "enforce", spy)
    tclient, _ = teacher
    cls = _create_class(tclient, published_course["id"])
    tclient.post(f"/api/v1/classes/{cls['id']}/summary-jobs", json={"transcript_text": "hello"})
    assert ("summary-jobs", 30) in calls


def test_oversized_transcripts_and_blank_names_are_rejected(teacher, published_course, make_user):
    tclient, _ = teacher
    cls = _create_class(tclient, published_course["id"])
    assert tclient.post(f"/api/v1/classes/{cls['id']}/summary-jobs", json={"transcript_text": "x" * 200_001}).status_code == 422
    client, _ = make_user(role="student", prefix="namer")
    assert client.patch("/api/v1/users/me", json={"full_name": ""}).status_code == 422
    assert client.patch("/api/v1/users/me", json={"full_name": "x" * 256}).status_code == 422
    assert client.patch("/api/v1/users/me", json={"full_name": "Asha Rao"}).status_code == 200


# --- college intake -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "a,b",
    [("owner+one@example.com", "owner+two@example.com"), ("First.Last@gmail.com", "firstlast+x@gmail.com"), ("A@Example.com", "a@example.com")],
)
def test_canonical_email_collapses_plus_tags_and_gmail_dots(a, b):
    assert college_service.canonical_email(a) == college_service.canonical_email(b)


def test_distinct_mailboxes_stay_distinct():
    assert college_service.canonical_email("a@example.com") != college_service.canonical_email("b@example.com")
    assert college_service.canonical_email("a.b@example.com") != college_service.canonical_email("ab@example.com")  # dots only matter on gmail


def _verified_token(email):
    c = TestClient(app)
    otp = c.post("/api/v1/auth/register/request-otp", json={"email": email}).json()["dev_otp"]
    return c.post("/api/v1/auth/register/verify-otp", json={"email": email, "otp": otp}).json()["verification_token"]


def _college_request(email, name, location="Guntur"):
    c = TestClient(app)
    body = {
        "college_name": name, "location": location, "admin_full_name": "Principal", "admin_email": email,
        "admin_password": "password123", "verification_token": _verified_token(email),
    }
    return c.post("/api/v1/registration/colleges/request", json=body)


def test_college_request_intake_refuses_duplicates(monkeypatch):
    monkeypatch.setattr(auth_service.settings, "require_registration_otp", True)
    name = f"Duplicate Test College {secrets.token_hex(3)}"
    first = _college_request(unique_email("p1"), name)
    assert first.status_code == 202, first.text
    same_name = _college_request(unique_email("p2"), name.upper())
    assert same_name.status_code == 409 and same_name.json()["error"]["code"] == "REQUEST_ALREADY_PENDING"
