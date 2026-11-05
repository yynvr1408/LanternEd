"""In-app notifications: created as a side effect of real events, private to each user."""

from tests.api.test_summaries import live_class  # noqa: F401  (fixture reuse)


def _inbox(client):
    return client.get("/api/v1/notifications").json()


def test_enrolled_students_are_told_when_a_published_assignment_appears(teacher, enrolled_student, published_course):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    tclient.post(f"/api/v1/assignments?course_id={published_course['id']}", json={"title": "Lab report", "status": "published"})
    inbox = _inbox(sclient)
    assert inbox["unread"] == 1
    assert inbox["items"][0]["kind"] == "assignment_published" and "Lab report" in inbox["items"][0]["title"]
    assert inbox["items"][0]["link"].startswith("/student/assignments/")


def test_a_draft_assignment_is_silent_until_it_is_published(teacher, enrolled_student, published_course):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    draft = tclient.post(f"/api/v1/assignments?course_id={published_course['id']}", json={"title": "Later", "status": "draft"}).json()
    assert _inbox(sclient)["items"] == []
    tclient.patch(f"/api/v1/assignments/{draft['id']}", json={"status": "published"})
    assert len(_inbox(sclient)["items"]) == 1
    tclient.patch(f"/api/v1/assignments/{draft['id']}", json={"title": "Later (renamed)"})
    assert len(_inbox(sclient)["items"]) == 1  # editing an already-published assignment does not announce it again


def test_only_enrolled_students_are_notified(teacher, enrolled_student, published_course, make_user):
    tclient, _ = teacher
    stranger, _ = make_user(role="student", prefix="stranger")
    tclient.post(f"/api/v1/assignments?course_id={published_course['id']}", json={"title": "Private", "status": "published"})
    assert _inbox(stranger)["items"] == []


def test_a_student_is_told_when_their_work_is_graded(teacher, enrolled_student, published_assignment):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    aid = published_assignment["id"]
    sub = sclient.put(f"/api/v1/assignments/{aid}/submissions/me", json={"answer": {"text": "x"}, "submit": True}).json()
    tclient.put(f"/api/v1/assignments/{aid}/submissions/{sub['id']}/grade", json={"score": 72})
    graded = [n for n in _inbox(sclient)["items"] if n["kind"] == "graded"]
    assert len(graded) == 1 and graded[0]["body"] == "Score 72 / 100"


def test_starting_a_class_notifies_its_students(teacher, enrolled_student, published_course, monkeypatch):
    from app.integrations import livekit

    async def fake_ensure_room(room_name: str) -> None:
        return None

    monkeypatch.setattr(livekit, "ensure_room", fake_ensure_room)
    tclient, _ = teacher
    sclient, _ = enrolled_student
    cls = tclient.post(
        f"/api/v1/classes?course_id={published_course['id']}", json={"title": "Optics", "scheduled_start": "2026-11-02T10:00:00Z"}
    ).json()
    assert tclient.post(f"/api/v1/classes/{cls['id']}/start").status_code == 200
    live = [n for n in _inbox(sclient)["items"] if n["kind"] == "class_live"]
    assert len(live) == 1 and live[0]["link"] == f"/classroom/{cls['id']}"


def test_mark_read_and_privacy(teacher, enrolled_student, published_course, make_user):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    other, _ = make_user(role="student", prefix="other")
    for title in ("One", "Two"):
        tclient.post(f"/api/v1/assignments?course_id={published_course['id']}", json={"title": title, "status": "published"})
    items = _inbox(sclient)["items"]
    assert len(items) == 2 and _inbox(sclient)["unread"] == 2

    # another user cannot mark mine read
    assert other.post("/api/v1/notifications/read", json={"ids": [items[0]["id"]]}).json()["marked"] == 0
    assert _inbox(sclient)["unread"] == 2

    assert sclient.post("/api/v1/notifications/read", json={"ids": [items[0]["id"]]}).json()["marked"] == 1
    assert _inbox(sclient)["unread"] == 1
    assert sclient.post("/api/v1/notifications/read", json={}).json()["marked"] == 1
    assert _inbox(sclient)["unread"] == 0


def test_notifications_require_sign_in(client):
    assert client.get("/api/v1/notifications").status_code == 401


def test_a_failing_notification_never_breaks_the_action(teacher, enrolled_student, published_course, monkeypatch):
    from app.services import notification_service

    tclient, _ = teacher

    def boom(*args, **kwargs):
        raise RuntimeError("db hiccup")

    monkeypatch.setattr(notification_service.Notification, "__init__", boom)
    resp = tclient.post(f"/api/v1/assignments?course_id={published_course['id']}", json={"title": "Still created", "status": "published"})
    assert resp.status_code == 201
