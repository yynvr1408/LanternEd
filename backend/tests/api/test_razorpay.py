"""Online payments: server-computed order amounts, and a subscription extended only by a correctly signed webhook."""

import hashlib
import hmac
import json
import uuid

import httpx
import pytest

from app.config import get_settings
from app.integrations import razorpay
from tests.api.test_admin import BASE
from tests.api.test_college_registration import admin, make_college, register_active  # noqa: F401

INST = "/api/v1/institution-admin"
SECRET = "whsec_test_secret"


@pytest.fixture
def pay_env(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(s, "razorpay_key_secret", "key_secret")
    monkeypatch.setattr(s, "razorpay_webhook_secret", SECRET)
    created = []

    def fake_post(url, **kwargs):
        created.append(kwargs["json"])
        return httpx.Response(200, json={"id": f"order_{uuid.uuid4().hex[:12]}", "amount": kwargs["json"]["amount"]}, request=httpx.Request("POST", url))

    monkeypatch.setattr(razorpay.httpx, "post", fake_post)
    return created


@pytest.fixture
def setup(admin):  # noqa: F811
    college, sections = make_college(admin)
    client, resp = register_active(college, sections[0], role="teacher")
    admin.post(f"{BASE}/colleges/{college['id']}/administrators", json={"user_id": resp.json()["user"]["id"]})
    admin.put(f"{BASE}/colleges/{college['id']}/subscription", json={
        "plan": "standard", "status": "trialing", "seats": 1000, "price_per_seat_paise": 35000, "current_period_end": None, "notes": None,
    })
    return admin, college, client


def _event(order_id, amount, payment_id="pay_1", name="payment.captured", currency="INR"):
    return {"event": name, "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id, "amount": amount, "currency": currency}}}}


def _post_event(client, event, secret=SECRET):
    body = json.dumps(event).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return client.post("/api/v1/webhooks/razorpay", content=body, headers={"x-razorpay-signature": sig, "content-type": "application/json"})


def test_the_amount_is_computed_on_the_server_not_chosen_by_the_client(pay_env, setup):
    admin, college, client = setup
    resp = client.post(f"{INST}/colleges/{college['id']}/billing/orders", json={"period_months": 6, "amount_paise": 1})
    assert resp.status_code == 201, resp.text
    assert resp.json()["amount_paise"] == 17_500_000 and pay_env[0]["amount"] == 17_500_000  # 1000 seats x Rs350 x 6/12
    assert resp.json()["key_id"] == "rzp_test_key" and "secret" not in resp.text


def test_online_payment_needs_configuration_a_subscription_and_the_right_admin(setup, admin, monkeypatch):  # noqa: F811
    _, college, client = setup
    assert client.post(f"{INST}/colleges/{college['id']}/billing/orders", json={}).json()["error"]["code"] == "PAYMENTS_NOT_CONFIGURED"

    s = get_settings()
    for name, value in (("razorpay_key_id", "k"), ("razorpay_key_secret", "s"), ("razorpay_webhook_secret", SECRET)):
        monkeypatch.setattr(s, name, value)
    other, other_sections = make_college(admin)
    outsider, _ = register_active(other, other_sections[0], role="teacher")
    assert outsider.post(f"{INST}/colleges/{college['id']}/billing/orders", json={}).status_code == 403

    admin.put(f"{BASE}/colleges/{other['id']}/subscription", json={"plan": "standard", "status": "canceled", "seats": 10, "price_per_seat_paise": 100, "current_period_end": None, "notes": None})
    delegate, resp = register_active(other, other_sections[1], role="teacher")
    admin.post(f"{BASE}/colleges/{other['id']}/administrators", json={"user_id": resp.json()["user"]["id"]})
    assert delegate.post(f"{INST}/colleges/{other['id']}/billing/orders", json={}).json()["error"]["code"] == "NO_SUBSCRIPTION"


def test_a_signed_webhook_extends_the_subscription_exactly_once(pay_env, setup, client):
    admin, college, delegate = setup
    order = delegate.post(f"{INST}/colleges/{college['id']}/billing/orders", json={"period_months": 12}).json()
    assert _post_event(client, _event(order["order_id"], order["amount_paise"])).status_code == 200

    summary = admin.get(f"{BASE}/colleges/{college['id']}/billing").json()
    assert summary["state"] == "active" and summary["subscription"]["current_period_end"]
    assert [(p["method"], p["reference"], p["amount_paise"]) for p in summary["payments"]] == [("razorpay", "pay_1", order["amount_paise"])]

    end_once = summary["subscription"]["current_period_end"]
    _post_event(client, _event(order["order_id"], order["amount_paise"]))  # Razorpay retries
    _post_event(client, _event(order["order_id"], order["amount_paise"], name="order.paid"))
    again = admin.get(f"{BASE}/colleges/{college['id']}/billing").json()
    assert again["subscription"]["current_period_end"] == end_once and len(again["payments"]) == 1


def test_a_bad_signature_is_refused_and_changes_nothing(pay_env, setup, client):
    admin, college, delegate = setup
    order = delegate.post(f"{INST}/colleges/{college['id']}/billing/orders", json={}).json()
    forged = _post_event(client, _event(order["order_id"], order["amount_paise"]), secret="attacker-guess")
    assert forged.status_code == 401
    assert client.post("/api/v1/webhooks/razorpay", json=_event(order["order_id"], order["amount_paise"])).status_code == 401
    assert admin.get(f"{BASE}/colleges/{college['id']}/billing").json()["payments"] == []


def test_the_webhook_never_credits_a_different_amount(pay_env, setup, client):
    admin, college, delegate = setup
    order = delegate.post(f"{INST}/colleges/{college['id']}/billing/orders", json={}).json()
    assert _post_event(client, _event(order["order_id"], 100)).status_code == 200  # signed, but for Rs 1
    assert _post_event(client, _event(order["order_id"], order["amount_paise"], currency="USD")).status_code == 200
    assert admin.get(f"{BASE}/colleges/{college['id']}/billing").json()["payments"] == []


def test_unknown_orders_and_other_events_are_ignored(pay_env, setup, client):
    admin, college, _ = setup
    assert _post_event(client, _event("order_nope", 5000)).status_code == 200
    assert _post_event(client, {"event": "payment.failed", "payload": {}}).status_code == 200
    assert admin.get(f"{BASE}/colleges/{college['id']}/billing").json()["payments"] == []


def test_without_a_webhook_secret_nothing_is_ever_accepted(setup, client, monkeypatch):
    monkeypatch.setattr(get_settings(), "razorpay_webhook_secret", None)
    assert _post_event(client, _event("order_x", 100), secret="").status_code == 401


def test_a_person_cannot_record_a_razorpay_payment_by_hand(setup):
    admin, college, _ = setup
    resp = admin.post(f"{BASE}/colleges/{college['id']}/payments", json={"amount_paise": 100, "method": "razorpay", "period_months": 1})
    assert resp.status_code in (400, 422)
