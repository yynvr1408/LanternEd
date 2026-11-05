"""Regression tests for the issues found by the security audit (run-1): cross-site request refusal,
request-id reflection, draft lessons, summary-job resource binding, LiveKit token lifetime."""

import jwt
import pytest

from app.db.models.enums import ProcessingStatus, ResourceStatus, ResourceType
from app.db.models.lesson import LearningResource
from app.integrations import livekit
from tests.api.test_summaries import live_class  # noqa: F401  (fixture reuse)


# --- cross-site request refusal ------------------------------------------------------------------

def test_cross_site_mutation_is_refused(student):
    client, _ = student
    resp = client.post("/api/v1/auth/logout", headers={"Origin": "https://evil.example"})
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "ORIGIN_NOT_ALLOWED"


def test_mutation_from_the_frontend_origin_is_allowed(student):
    client, _ = student
    resp = client.post("/api/v1/auth/logout", headers={"Origin": "http://localhost:5173"})
    assert resp.status_code != 403


def test_same_origin_mutation_is_allowed(student):
    client, _ = student
    # The self-hosted deployment serves the SPA and the API from one host; the Origin is the API's own.
    resp = client.post("/api/v1/auth/logout", headers={"Origin": "http://testserver"})
    assert resp.status_code != 403


def test_request_without_origin_is_not_a_browser_csrf_and_passes(student):
    client, _ = student
    assert client.post("/api/v1/auth/logout").status_code != 403


def test_cross_site_read_is_not_blocked_by_the_origin_check(student):
    client, _ = student
    assert client.get("/api/v1/users/me", headers={"Origin": "https://evil.example"}).status_code == 200


# --- request id ----------------------------------------------------------------------------------

def test_a_well_formed_request_id_is_echoed(client):
    assert client.get("/health", headers={"x-request-id": "abc-123_X.y"}).headers["x-request-id"] == "abc-123_X.y"


@pytest.mark.parametrize("bad", ["x" * 65, "has space", "semi;colon", "<script>"])
def test_a_malformed_request_id_is_replaced_not_reflected(client, bad):
    got = client.get("/health", headers={"x-request-id": bad}).headers["x-request-id"]
    assert got != bad and len(got) == 36  # a fresh uuid


# --- draft lessons -------------------------------------------------------------------------------

def test_draft_lessons_are_hidden_from_students_but_visible_to_the_teacher(teacher, enrolled_student, published_course):
    tclient, _ = teacher
    base = f"/api/v1/courses/{published_course['id']}/lessons"
    draft = tclient.post(base, json={"title": "Secret draft", "position": 1, "status": "draft"}).json()
    live = tclient.post(base, json={"title": "Public lesson", "position": 2, "status": "published"}).json()

    sclient, _ = enrolled_student
    assert [l["title"] for l in sclient.get(base).json()] == ["Public lesson"]
    assert sclient.get(f"/api/v1/lessons/{live['id']}").status_code == 200
    assert sclient.get(f"/api/v1/lessons/{draft['id']}").status_code == 404

    assert {l["title"] for l in tclient.get(base).json()} == {"Secret draft", "Public lesson"}
    assert tclient.get(f"/api/v1/lessons/{draft['id']}").status_code == 200


def test_draft_lessons_are_hidden_from_unenrolled_viewers_of_a_published_course(student, teacher, published_course):
    tclient, _ = teacher
    draft = tclient.post(
        f"/api/v1/courses/{published_course['id']}/lessons", json={"title": "Draft", "status": "draft"}
    ).json()
    outsider, _ = student
    assert outsider.get(f"/api/v1/courses/{published_course['id']}/lessons").json() == []
    assert outsider.get(f"/api/v1/lessons/{draft['id']}").status_code == 404


# --- summary job: resource must belong to the class's course -------------------------------------

def _resource(db, *, course_id, uploaded_by, resource_type=ResourceType.audio, status=ResourceStatus.available):
    resource = LearningResource(
        course_id=course_id,
        uploaded_by=uploaded_by,
        storage_key=f"{course_id}/x-lecture.mp3",
        filename="lecture.mp3",
        mime_type="audio/mpeg",
        size_bytes=10,
        status=status,
        resource_type=resource_type,
        processing_status=ProcessingStatus.ready,
        is_published=True,
    )
    db.add(resource)
    db.commit()
    return resource


def _summary_job(client, class_id, resource_id):
    return client.post(f"/api/v1/classes/{class_id}/summary-jobs", json={"resource_id": resource_id})


def test_summary_job_rejects_another_courses_resource(teacher, live_class, make_user, db_session):  # noqa: F811
    tclient, _ = teacher
    other_client, other = make_user(role="teacher", prefix="other")
    other_course = other_client.post("/api/v1/courses", json={"title": "Other", "status": "published"}).json()
    foreign = _resource(db_session, course_id=other_course["id"], uploaded_by=other["id"])

    resp = _summary_job(tclient, live_class["id"], foreign.id)
    assert resp.status_code == 404


def test_summary_job_rejects_a_non_media_or_unfinished_resource(teacher, live_class, published_course, db_session):  # noqa: F811
    tclient, user = teacher
    notes = _resource(db_session, course_id=published_course["id"], uploaded_by=user["id"], resource_type=ResourceType.notes)
    pending = _resource(db_session, course_id=published_course["id"], uploaded_by=user["id"], status=ResourceStatus.pending)
    missing = "00000000-0000-0000-0000-000000000000"

    for rid in (notes.id, pending.id, missing):
        assert _summary_job(tclient, live_class["id"], rid).status_code == 404


def test_summary_job_accepts_the_classs_own_audio_resource(teacher, live_class, published_course, db_session):  # noqa: F811
    tclient, user = teacher
    own = _resource(db_session, course_id=published_course["id"], uploaded_by=user["id"])
    assert _summary_job(tclient, live_class["id"], own.id).status_code in (200, 201, 202)


# --- LiveKit token lifetime ----------------------------------------------------------------------

def test_join_tokens_are_short_lived(monkeypatch):
    monkeypatch.setattr(livekit.settings, "livekit_url", "wss://example.livekit.test")
    monkeypatch.setattr(livekit.settings, "livekit_api_key", "test-key")
    monkeypatch.setattr(livekit.settings, "livekit_api_secret", "x" * 40)
    token = livekit.generate_access_token(identity="s1", name="S", room_name="r", can_publish=False)
    claims = jwt.decode(token, "x" * 40, algorithms=["HS256"], options={"verify_aud": False, "verify_exp": False})
    lifetime = claims["exp"] - claims["nbf"]
    assert lifetime == livekit.settings.livekit_token_ttl_minutes * 60
    assert lifetime <= 30 * 60
