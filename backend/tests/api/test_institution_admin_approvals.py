import secrets
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import get_settings
from app.db.models.enums import UserRole, UserStatus
from app.db.models.user import User
from app.main import app
from tests.api.test_admin import BASE as ADMIN_BASE
from tests.api.test_admin import CSRF, admin_client, admin_creds  # noqa: F401
from tests.api.test_college_registration import make_college

INST_BASE = "/api/v1/institution-admin"


@pytest.fixture
def college_with_admin(admin_client, teacher):
    _tclient, tuser = teacher
    college, secs = make_college(admin_client)
    # Delegate teacher to administer this college
    resp = admin_client.post(f"{ADMIN_BASE}/colleges/{college['id']}/administrators", json={"user_id": tuser["id"]})
    assert resp.status_code == 201
    return college, secs, _tclient, tuser


def _register_pending_user(db_session, college, section, role="student", email=None, full_name="Student Example"):
    c = TestClient(app)
    mail = email or f"user-{secrets.token_hex(4)}@gmail.com"
    payload = {
        "full_name": full_name,
        "email": mail,
        "password": "password123",
        "role": role,
        "college_id": college["id"],
        "college_code": college["code"],
        "branch_id": college["_branch_id"],
        "section_id": section["id"],
    }
    resp = c.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 202, resp.text
    db_session.expire_all()
    user = db_session.execute(select(User).where(User.email == mail.lower().strip())).scalar_one()
    return c, user


def test_bulk_approve_and_bulk_reject_registrations(college_with_admin, db_session):
    college, secs, tclient, _tuser = college_with_admin

    # Register 3 students: 2 valid, 1 to reject
    _, u1 = _register_pending_user(db_session, college, secs[0], full_name="Alice Kumar", email=f"alice-{secrets.token_hex(4)}@college.edu.in")
    _, u2 = _register_pending_user(db_session, college, secs[0], full_name="Bob Reddy", email=f"bob-{secrets.token_hex(4)}@college.edu.in")
    _, u3 = _register_pending_user(db_session, college, secs[0], full_name="Spam Bot", email=f"spam-{secrets.token_hex(4)}@mailinator.com")

    # Verify all 3 appear in pending registrations
    pending_resp = tclient.get(f"{INST_BASE}/colleges/{college['id']}/registrations")
    assert pending_resp.status_code == 200
    pending_ids = [p["id"] for p in pending_resp.json()]
    assert u1.id in pending_ids
    assert u2.id in pending_ids
    assert u3.id in pending_ids

    # Bulk approve Alice and Bob
    bulk_approve_resp = tclient.post(
        f"{INST_BASE}/colleges/{college['id']}/registrations/bulk-approve",
        json={"user_ids": [u1.id, u2.id]}
    )
    assert bulk_approve_resp.status_code == 200
    assert bulk_approve_resp.json()["success_count"] == 2
    assert set(bulk_approve_resp.json()["user_ids"]) == {u1.id, u2.id}

    # Bulk reject Spam Bot
    bulk_reject_resp = tclient.post(
        f"{INST_BASE}/colleges/{college['id']}/registrations/bulk-reject",
        json={"user_ids": [u3.id], "reason": "Disposable email domain flagged."}
    )
    assert bulk_reject_resp.status_code == 200
    assert bulk_reject_resp.json()["success_count"] == 1
    assert bulk_reject_resp.json()["user_ids"] == [u3.id]

    # Verify DB statuses
    db_session.expire_all()
    assert db_session.get(User, u1.id).status == UserStatus.active
    assert db_session.get(User, u2.id).status == UserStatus.active
    assert db_session.get(User, u3.id).status == UserStatus.rejected


def test_ai_screening_and_auto_approval(college_with_admin, db_session):
    college, secs, tclient, _tuser = college_with_admin

    # Set college allowed domains to ["ruralcollege.edu.in"]
    settings_patch = tclient.patch(
        f"{INST_BASE}/colleges/{college['id']}/settings",
        json={
            "institution_type": "engineering",
            "approval_mode": "ai_auto_approve",
            "allowed_email_domains": ["ruralcollege.edu.in"],
        }
    )
    assert settings_patch.status_code == 200
    assert settings_patch.json()["allowed_email_domains"] == ["ruralcollege.edu.in"]

    # Register one high-confidence student and one disposable spam email
    good_email = f"student-{secrets.token_hex(4)}@ruralcollege.edu.in"
    bad_email = f"fake-{secrets.token_hex(4)}@tempmail.com"

    _, u_good = _register_pending_user(db_session, college, secs[0], full_name="Priya Sharma", email=good_email)
    _, u_bad = _register_pending_user(db_session, college, secs[0], full_name="bad fake", email=bad_email)

    # Call AI screen endpoint
    screen_resp = tclient.get(f"{INST_BASE}/colleges/{college['id']}/registrations/ai-screen")
    assert screen_resp.status_code == 200
    screened = {item["user_id"]: item for item in screen_resp.json()}

    assert u_good.id in screened
    assert u_bad.id in screened

    # Good user should be recommended for approval with high score
    assert screened[u_good.id]["ai_recommendation"] == "approve"
    assert screened[u_good.id]["ai_risk_level"] == "low"
    assert screened[u_good.id]["ai_score"] >= 85
    assert any("whitelist" in r.lower() or "domain" in r.lower() for r in screened[u_good.id]["ai_reasons"])

    # Bad user should be flagged high risk
    assert screened[u_bad.id]["ai_risk_level"] == "high"
    assert screened[u_bad.id]["ai_score"] < 60
    assert any("disposable" in r.lower() or "risk" in r.lower() for r in screened[u_bad.id]["ai_reasons"])

    # Execute AI auto-approval
    auto_approve_resp = tclient.post(f"{INST_BASE}/colleges/{college['id']}/registrations/ai-auto-approve")
    assert auto_approve_resp.status_code == 200
    res = auto_approve_resp.json()
    assert res["approved_count"] >= 1
    assert u_good.id in res["approved_user_ids"]
    assert u_bad.id not in res["approved_user_ids"]

    # Verify good user is now active, bad user is still pending
    db_session.expire_all()
    assert db_session.get(User, u_good.id).status == UserStatus.active
    assert db_session.get(User, u_bad.id).status == UserStatus.pending


def test_dynamic_institution_settings_get_and_update(college_with_admin):
    college, _secs, tclient, _tuser = college_with_admin

    # GET default settings
    get_resp = tclient.get(f"{INST_BASE}/colleges/{college['id']}/settings")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["college_id"] == college["id"]
    assert data["institution_type"] == "engineering"
    assert data["approval_mode"] == "manual_admin"
    assert data["features"]["whiteboard_enabled"] is True

    # PATCH custom settings
    patch_resp = tclient.patch(
        f"{INST_BASE}/colleges/{college['id']}/settings",
        json={
            "institution_type": "polytechnic",
            "approval_mode": "manual_admin",
            "allowed_email_domains": ["polytech.ac.in", "state.gov.in"],
            "features": {
                "low_bandwidth_default": True,
                "whatsapp_alerts_enabled": False,
            }
        }
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()
    assert updated["institution_type"] == "polytechnic"
    assert updated["allowed_email_domains"] == ["polytech.ac.in", "state.gov.in"]
    assert updated["features"]["low_bandwidth_default"] is True
    assert updated["features"]["whatsapp_alerts_enabled"] is False
    assert updated["features"]["whiteboard_enabled"] is True  # preserved
