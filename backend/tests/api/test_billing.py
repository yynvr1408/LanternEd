"""Subscription records and manually recorded payments."""

from datetime import timedelta

import pytest

from app.db.base import utcnow
from app.services import billing_service
from tests.api.test_admin import BASE
from tests.api.test_college_registration import admin, make_college, register_active  # noqa: F401

INST = "/api/v1/institution-admin"


def _sub(**over):
    body = {"plan": "standard", "status": "trialing", "seats": 1000, "price_per_seat_paise": 35000, "current_period_end": None, "notes": None}
    body.update(over)
    return body


def test_add_months_clamps_to_month_end():
    from datetime import datetime

    assert billing_service.add_months(datetime(2027, 1, 31), 1) == datetime(2027, 2, 28)
    assert billing_service.add_months(datetime(2027, 11, 15), 3) == datetime(2028, 2, 15)
    assert billing_service.add_months(datetime(2027, 3, 1), 12) == datetime(2028, 3, 1)


def test_subscription_can_be_set_and_changed(admin):  # noqa: F811
    college, _ = make_college(admin)
    assert admin.get(f"{BASE}/colleges/{college['id']}/billing").json()["subscription"] is None
    assert admin.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub()).status_code == 200
    out = admin.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub(plan="plus", seats=1200, status="active")).json()
    assert (out["plan"], out["seats"], out["status"]) == ("plus", 1200, "active")


@pytest.mark.parametrize("bad", [{"plan": "gold"}, {"status": "great"}, {"seats": -1}, {"price_per_seat_paise": -5}])
def test_invalid_subscription_values_are_rejected(admin, bad):  # noqa: F811
    college, _ = make_college(admin)
    assert admin.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub(**bad)).status_code in (400, 422)


def test_a_payment_needs_a_subscription_then_extends_it(admin):  # noqa: F811
    college, _ = make_college(admin)
    pay = {"amount_paise": 35_000_000, "method": "bank_transfer", "reference": "UTR123", "period_months": 12}
    assert admin.post(f"{BASE}/colleges/{college['id']}/payments", json=pay).json()["error"]["code"] == "NO_SUBSCRIPTION"

    admin.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub())
    first = admin.post(f"{BASE}/colleges/{college['id']}/payments", json=pay)
    assert first.status_code == 201
    summary = admin.get(f"{BASE}/colleges/{college['id']}/billing").json()
    assert summary["subscription"]["status"] == "active" and summary["state"] == "active"
    end_one = summary["subscription"]["current_period_end"]
    assert [p["reference"] for p in summary["payments"]] == ["UTR123"]

    # paying again before expiry extends from the existing end, not from today (no lost days)
    admin.post(f"{BASE}/colleges/{college['id']}/payments", json={**pay, "period_months": 1})
    end_two = admin.get(f"{BASE}/colleges/{college['id']}/billing").json()["subscription"]["current_period_end"]
    assert end_two > end_one and end_two[:4] >= end_one[:4]
    assert len(admin.get(f"{BASE}/colleges/{college['id']}/billing").json()["payments"]) == 2


@pytest.mark.parametrize("bad", [{"amount_paise": 0}, {"method": "barter"}, {"period_months": 0}, {"period_months": 99}])
def test_invalid_payments_are_rejected(admin, bad):  # noqa: F811
    college, _ = make_college(admin)
    admin.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub())
    good = {"amount_paise": 100, "method": "upi", "reference": None, "period_months": 1}
    assert admin.post(f"{BASE}/colleges/{college['id']}/payments", json={**good, **bad}).status_code in (400, 422)


def test_expired_subscription_is_flagged_and_listed_for_renewal(admin):  # noqa: F811
    college, _ = make_college(admin)
    admin.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub(status="active", current_period_end=(utcnow() - timedelta(days=3)).isoformat() + "Z"))
    assert admin.get(f"{BASE}/colleges/{college['id']}/billing").json()["state"] == "expired"
    rows = admin.get(f"{BASE}/billing/renewals?within_days=30").json()
    mine = next(r for r in rows if r["college_id"] == college["id"])
    assert mine["overdue"] is True
    admin.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub(status="canceled", current_period_end=(utcnow() - timedelta(days=3)).isoformat() + "Z"))
    assert all(r["college_id"] != college["id"] for r in admin.get(f"{BASE}/billing/renewals?within_days=30").json())


def test_seat_usage_counts_active_students(admin):  # noqa: F811
    college, sections = make_college(admin)
    admin.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub(seats=1))
    for _ in range(2):
        register_active(college, sections[0], role="student")
    summary = admin.get(f"{BASE}/colleges/{college['id']}/billing").json()
    assert (summary["active_students"], summary["over_seats"]) == (2, 1)
    assert summary["annual_value_paise"] == 35000


def test_only_the_platform_admin_can_write_and_a_college_admin_can_only_read_their_own(admin, client):  # noqa: F811
    college, sections = make_college(admin)
    other_college, other_sections = make_college(admin)
    admin.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub())

    assert client.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub()).status_code in (401, 403)
    assert client.get(f"{BASE}/billing/renewals").status_code == 401

    delegate, resp = register_active(college, sections[0], role="teacher")
    admin.post(f"{BASE}/colleges/{college['id']}/administrators", json={"user_id": resp.json()["user"]["id"]})
    assert delegate.get(f"{INST}/colleges/{college['id']}/billing").status_code == 200
    assert delegate.get(f"{INST}/colleges/{other_college['id']}/billing").status_code == 403
    assert delegate.put(f"{BASE}/colleges/{college['id']}/subscription", json=_sub()).status_code in (401, 403)
    assert delegate.post(f"{BASE}/colleges/{college['id']}/payments", json={"amount_paise": 1, "method": "upi", "period_months": 1}).status_code in (401, 403)
