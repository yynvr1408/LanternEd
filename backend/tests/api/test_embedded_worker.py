"""The worker pass can run inside the API process, and two workers never send the same WhatsApp message twice."""

import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app import worker
from app.config import get_settings
from app.db.models.notification import NotificationDelivery
from app.integrations import whatsapp
from app.main import app
from app.services import notification_service


def _run_for(seconds):
    with TestClient(app):  # entering the context runs the app's lifespan (startup, then shutdown on exit)
        time.sleep(seconds)


def test_it_is_off_by_default(monkeypatch):
    calls = []
    monkeypatch.setattr(worker, "run_once", lambda: calls.append(1) or 0)
    assert get_settings().embedded_worker is False
    _run_for(0.2)
    assert calls == []


def test_when_enabled_the_pass_repeats_and_stops_on_shutdown(monkeypatch):
    calls = []
    monkeypatch.setattr(worker, "run_once", lambda: calls.append(time.monotonic()) or 0)
    monkeypatch.setattr(get_settings(), "embedded_worker", True)
    monkeypatch.setattr(get_settings(), "embedded_worker_interval_seconds", 0.05)
    _run_for(0.6)
    assert len(calls) >= 3
    settled = len(calls)
    time.sleep(0.3)
    assert len(calls) == settled  # the loop ended with the app


def test_a_failing_pass_does_not_end_the_loop(monkeypatch):
    calls = []

    def flaky():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("database hiccup")
        return 0

    monkeypatch.setattr(worker, "run_once", flaky)
    monkeypatch.setattr(get_settings(), "embedded_worker", True)
    monkeypatch.setattr(get_settings(), "embedded_worker_interval_seconds", 0.05)
    _run_for(0.5)
    assert len(calls) >= 3


@pytest.fixture
def wa(monkeypatch, db_session):
    db_session.query(NotificationDelivery).delete()
    db_session.commit()
    s = get_settings()
    monkeypatch.setattr(s, "whatsapp_phone_number_id", "1")
    monkeypatch.setattr(s, "whatsapp_access_token", "t")
    sent = []
    monkeypatch.setattr(whatsapp.httpx, "post", lambda url, **kw: sent.append(kw["json"]["to"]) or httpx.Response(200, json={}, request=httpx.Request("POST", url)))
    return sent


def _queue_one(tclient, sclient, course):
    sclient.patch("/api/v1/users/me", json={"phone": "+919876500001", "whatsapp_opt_in": True})
    tclient.post(f"/api/v1/assignments?course_id={course['id']}", json={"title": "Once only", "status": "published"})


def test_a_message_claimed_by_another_worker_is_not_sent_again(wa, teacher, enrolled_student, published_course, db_session):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    _queue_one(tclient, sclient, published_course)
    row = db_session.query(NotificationDelivery).one()
    row.status = "sending"  # another worker has it right now
    db_session.commit()
    assert notification_service.deliver_pending(db_session) == 0
    assert wa == []


def test_two_passes_send_each_message_exactly_once(wa, teacher, enrolled_student, published_course, db_session):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    _queue_one(tclient, sclient, published_course)
    assert notification_service.deliver_pending(db_session) == 1
    assert notification_service.deliver_pending(db_session) == 0
    assert wa == ["919876500001"]
