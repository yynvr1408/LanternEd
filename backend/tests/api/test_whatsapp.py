"""WhatsApp notifications: explicit opt-in, an outbox the worker delivers, retries, and nothing sent without consent."""

import logging

import httpx
import pytest

from app.config import get_settings
from app.db.models.notification import NotificationDelivery
from app.integrations import whatsapp
from app.services import notification_service

PHONE = "+919876543210"


@pytest.fixture
def wa(monkeypatch, db_session):
    db_session.query(NotificationDelivery).delete()  # start from an empty outbox (the test database is shared)
    db_session.commit()
    s = get_settings()
    monkeypatch.setattr(s, "whatsapp_phone_number_id", "1234567890")
    monkeypatch.setattr(s, "whatsapp_access_token", "EAAG-test-token")
    sent = []
    outcomes = []  # status codes to return in order; default 200

    def fake_post(url, **kwargs):
        sent.append({"url": url, **kwargs})
        status = outcomes.pop(0) if outcomes else 200
        return httpx.Response(status, json={}, request=httpx.Request("POST", url))

    monkeypatch.setattr(whatsapp.httpx, "post", fake_post)
    return sent, outcomes


def _opt_in(client, phone=PHONE):
    assert client.patch("/api/v1/users/me", json={"phone": phone, "whatsapp_opt_in": True}).status_code == 200


def _publish(tclient, course, title="Lab report"):
    return tclient.post(f"/api/v1/assignments?course_id={course['id']}", json={"title": title, "status": "published"})


# --- profile -----------------------------------------------------------------------------------------


def test_the_number_must_be_international_format_and_consent_needs_a_number(make_user):
    client, _ = make_user(role="student", prefix="phone")
    assert client.patch("/api/v1/users/me", json={"phone": "98765"}).status_code == 422
    assert client.patch("/api/v1/users/me", json={"phone": "+0123456789"}).status_code == 422
    assert client.patch("/api/v1/users/me", json={"whatsapp_opt_in": True}).json()["error"]["code"] == "PHONE_REQUIRED"

    out = client.patch("/api/v1/users/me", json={"phone": PHONE, "whatsapp_opt_in": True}).json()
    assert out["phone"] == PHONE and out["whatsapp_opt_in"] is True
    assert client.get("/api/v1/users/me").json()["whatsapp_opt_in"] is True


def test_turning_it_off_or_removing_the_number_withdraws_consent(make_user):
    client, _ = make_user(role="student", prefix="optout")
    _opt_in(client)
    assert client.patch("/api/v1/users/me", json={"whatsapp_opt_in": False}).json()["whatsapp_opt_in"] is False
    _opt_in(client)
    cleared = client.patch("/api/v1/users/me", json={"phone": ""}).json()
    assert cleared["phone"] is None and cleared["whatsapp_opt_in"] is False


# --- outbox ------------------------------------------------------------------------------------------


def test_only_opted_in_people_get_an_outbox_row(wa, teacher, enrolled_student, published_course, make_user, db_session):
    tclient, _ = teacher
    sclient, suser = enrolled_student
    other, ouser = make_user(role="student", prefix="nowa")
    other.post(f"/api/v1/courses/{published_course['id']}/enrollments", json={})
    _opt_in(sclient)
    other.patch("/api/v1/users/me", json={"phone": PHONE})  # has a number but never ticked the box

    _publish(tclient, published_course)
    rows = db_session.query(NotificationDelivery).filter(NotificationDelivery.user_id.in_([suser["id"], ouser["id"]])).all()
    assert [r.user_id for r in rows] == [suser["id"]] and rows[0].status == "pending" and rows[0].to_phone == PHONE


def test_nothing_is_queued_when_whatsapp_is_not_configured(teacher, enrolled_student, published_course, db_session):
    tclient, _ = teacher
    sclient, suser = enrolled_student
    _opt_in(sclient)
    _publish(tclient, published_course)
    assert db_session.query(NotificationDelivery).filter(NotificationDelivery.user_id == suser["id"]).count() == 0


def test_the_worker_pass_sends_the_approved_template_once(wa, teacher, enrolled_student, published_course, db_session):
    sent, _ = wa
    tclient, _ = teacher
    sclient, suser = enrolled_student
    _opt_in(sclient)
    _publish(tclient, published_course, title="Optics lab")
    assert notification_service.deliver_pending(db_session) >= 1

    mine = [m for m in sent if m["json"]["to"] == PHONE.lstrip("+")]
    assert len(mine) == 1
    body = mine[0]["json"]
    assert body["type"] == "template" and body["template"]["name"] == "lanterned_update"
    assert "Optics lab" in body["template"]["components"][0]["parameters"][0]["text"]
    assert mine[0]["headers"]["Authorization"] == "Bearer EAAG-test-token"

    assert notification_service.deliver_pending(db_session) == 0  # not sent again
    row = db_session.query(NotificationDelivery).filter(NotificationDelivery.user_id == suser["id"]).one()
    assert row.status == "sent" and row.sent_at is not None


def test_a_temporary_failure_is_retried_then_sent(wa, teacher, enrolled_student, published_course, db_session):
    sent, outcomes = wa
    tclient, _ = teacher
    sclient, suser = enrolled_student
    _opt_in(sclient)
    outcomes.extend([500, 200])
    _publish(tclient, published_course)
    notification_service.deliver_pending(db_session)
    row = db_session.query(NotificationDelivery).filter(NotificationDelivery.user_id == suser["id"]).one()
    assert row.status == "pending" and row.attempts == 1
    notification_service.deliver_pending(db_session)
    db_session.refresh(row)
    assert row.status == "sent" and row.attempts == 2


def test_it_gives_up_after_three_attempts_and_on_permanent_errors(wa, teacher, enrolled_student, published_course, db_session):
    sent, outcomes = wa
    tclient, _ = teacher
    sclient, suser = enrolled_student
    _opt_in(sclient)
    outcomes.extend([500, 500, 500])
    _publish(tclient, published_course)
    for _ in range(4):
        notification_service.deliver_pending(db_session)
    row = db_session.query(NotificationDelivery).filter(NotificationDelivery.user_id == suser["id"]).one()
    assert row.status == "failed" and row.attempts == 3

    outcomes.append(400)  # a rejected number / unapproved template is not worth retrying
    _publish(tclient, published_course, title="Second")
    notification_service.deliver_pending(db_session)
    latest = db_session.query(NotificationDelivery).filter(NotificationDelivery.user_id == suser["id"]).order_by(NotificationDelivery.created_at.desc()).first()
    assert latest.status == "failed" and latest.error_code == "http_400" and latest.attempts == 1


def test_switching_it_off_after_queueing_stops_the_message(wa, teacher, enrolled_student, published_course, db_session):
    sent, _ = wa
    tclient, _ = teacher
    sclient, suser = enrolled_student
    _opt_in(sclient)
    _publish(tclient, published_course)
    sclient.patch("/api/v1/users/me", json={"whatsapp_opt_in": False})
    notification_service.deliver_pending(db_session)
    assert [m for m in sent if m["json"]["to"] == PHONE.lstrip("+")] == []
    row = db_session.query(NotificationDelivery).filter(NotificationDelivery.user_id == suser["id"]).one()
    assert row.status == "failed" and row.error_code == "opted_out"


def test_the_phone_number_is_never_logged(wa, caplog, monkeypatch):
    monkeypatch.setattr(whatsapp.httpx, "post", lambda url, **kw: httpx.Response(400, json={"error": {"message": PHONE}}, request=httpx.Request("POST", url)))
    with caplog.at_level(logging.DEBUG):
        ok, error = whatsapp.send_template(to_phone=PHONE, title="t", detail="d")
    assert ok is False and error == "http_400"
    assert PHONE not in caplog.text and PHONE.lstrip("+") not in caplog.text


def test_erasing_the_account_removes_the_number(wa, enrolled_student, db_session):
    from app.db.models.user import User

    sclient, suser = enrolled_student
    _opt_in(sclient)
    assert sclient.post("/api/v1/users/me/erase", json={"password": "password123", "confirm": "DELETE"}).status_code == 204
    db_session.expire_all()
    user = db_session.get(User, suser["id"])
    assert user.phone is None and user.whatsapp_opt_in_at is None
