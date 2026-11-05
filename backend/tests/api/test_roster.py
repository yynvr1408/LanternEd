"""College rosters: a CSV of pre-approved emails lets listed people skip the manual approval queue,
but only when they prove ownership of the email, and never grants a password or any other access."""

import secrets

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import auth_service
from tests.api.test_admin import BASE
from tests.api.test_college_registration import admin, make_college, register, register_active  # noqa: F401

INST = "/api/v1/institution-admin"


def _unique(prefix="roster"):
    return f"{prefix}-{secrets.token_hex(4)}@example.com"


@pytest.fixture
def setup(admin):  # noqa: F811
    """A college with one branch / two sections and a delegated, logged-in college administrator."""
    college, sections = make_college(admin)
    delegate_client, resp = register_active(college, sections[0], role="teacher")
    assert resp.status_code == 201, resp.text
    delegate = resp.json()["user"]
    assert admin.post(f"{BASE}/colleges/{college['id']}/administrators", json={"user_id": delegate["id"]}).status_code == 201
    return college, sections, delegate_client


def _csv(*lines):
    return ("\n".join(lines) + "\n").encode()


def _import(client, college, data, **params):
    return client.post(f"{INST}/colleges/{college['id']}/roster/import", files={"file": ("roster.csv", data, "text/csv")}, params=params)


def _verified_token(email):
    c = TestClient(app)
    otp = c.post("/api/v1/auth/register/request-otp", json={"email": email}).json()["dev_otp"]
    return c.post("/api/v1/auth/register/verify-otp", json={"email": email, "otp": otp}).json()["verification_token"]


# ---- import ----------------------------------------------------------------------------------------


def test_import_creates_entries_and_reports_row_errors(setup):
    college, sections, admin_client = setup
    good, again = _unique(), _unique()
    data = _csv(
        "Email,Full Name,Role,Branch,Section",
        f"{good},Asha Rao,student,Computer Science,CSE-A",
        f"{again},,teacher,Computer Science,all",
        "not-an-email,Bad,student,,",
        f"{_unique()},Nobody,student,Physics,",
        f"{_unique()},Nobody,principal,,",
        f"{good},Dup,student,,",
    )
    out = _import(admin_client, college, data).json()
    assert (out["total_rows"], out["created"], out["updated"]) == (6, 2, 0)
    assert [e["row"] for e in out["errors"]] == [3, 4, 5, 6]
    listing = admin_client.get(f"{INST}/colleges/{college['id']}/roster").json()
    assert listing["total"] == 2 and {i["email"] for i in listing["items"]} == {good, again}


def test_dry_run_changes_nothing_and_reimport_updates(setup):
    college, _, admin_client = setup
    email = _unique()
    data = _csv("email,name", f"{email},First Name")
    assert _import(admin_client, college, data, dry_run="true").json()["created"] == 1
    assert admin_client.get(f"{INST}/colleges/{college['id']}/roster").json()["total"] == 0

    assert _import(admin_client, college, data).json()["created"] == 1
    again = _import(admin_client, college, _csv("email,name", f"{email.upper()},Renamed")).json()
    assert (again["created"], again["updated"]) == (0, 1)
    items = admin_client.get(f"{INST}/colleges/{college['id']}/roster").json()["items"]
    assert [i["full_name"] for i in items] == ["Renamed"]


@pytest.mark.parametrize("data,code", [
    (b"", "ROSTER_EMPTY"),
    (b"name,phone\nA,1\n", "ROSTER_NO_EMAIL_COLUMN"),
    (b"\xff\xfe\x00bad", "ROSTER_BAD_ENCODING"),
])
def test_bad_files_are_rejected_with_a_clear_code(setup, data, code):
    college, _, admin_client = setup
    resp = _import(admin_client, college, data)
    assert resp.status_code in (400, 422) and resp.json()["error"]["code"] == code


def test_too_many_rows_are_rejected(setup, monkeypatch):
    from app.services import roster_service

    monkeypatch.setattr(roster_service, "MAX_ROWS", 3)
    college, _, admin_client = setup
    data = _csv("email", *[_unique() for _ in range(4)])
    assert _import(admin_client, college, data).json()["error"]["code"] == "ROSTER_TOO_MANY_ROWS"


def test_only_this_colleges_administrator_can_manage_its_roster(setup, admin, make_user):  # noqa: F811
    college, _, _ = setup
    other_college, other_sections = make_college(admin)
    other_client, resp = register_active(other_college, other_sections[0], role="teacher")
    assert admin.post(f"{BASE}/colleges/{other_college['id']}/administrators", json={"user_id": resp.json()["user"]["id"]}).status_code == 201

    data = _csv("email", _unique())
    assert _import(other_client, college, data).status_code == 403  # an admin of a different college
    student_client, _ = make_user(role="student")
    assert _import(student_client, college, data).status_code == 403
    assert student_client.get(f"{INST}/colleges/{college['id']}/roster").status_code == 403


def test_delete_entry_is_scoped_to_the_college(setup, admin):  # noqa: F811
    college, _, admin_client = setup
    _import(admin_client, college, _csv("email", _unique()))
    entry = admin_client.get(f"{INST}/colleges/{college['id']}/roster").json()["items"][0]

    other_college, other_sections = make_college(admin)
    other_client, resp = register_active(other_college, other_sections[0], role="teacher")
    admin.post(f"{BASE}/colleges/{other_college['id']}/administrators", json={"user_id": resp.json()["user"]["id"]})
    assert other_client.delete(f"{INST}/colleges/{other_college['id']}/roster/{entry['id']}").status_code == 404

    assert admin_client.delete(f"{INST}/colleges/{college['id']}/roster/{entry['id']}").status_code == 204
    assert admin_client.get(f"{INST}/colleges/{college['id']}/roster").json()["total"] == 0


# ---- registration -----------------------------------------------------------------------------------


@pytest.fixture
def otp_required(monkeypatch):
    monkeypatch.setattr(auth_service.settings, "require_registration_otp", True)


def test_a_rostered_email_is_active_immediately_once_verified(setup, otp_required):
    college, sections, admin_client = setup
    email = _unique("student")
    _import(admin_client, college, _csv("email,role,branch,section", f"{email},student,Computer Science,{sections[1]['name']}"))

    client, resp = register(college, sections[1], role="student", email=email, verification_token=_verified_token(email))
    assert resp.status_code == 201, resp.text
    assert resp.json()["user"]["status"] == "active"
    assert client.get("/api/v1/users/me").status_code == 200
    claimed = admin_client.get(f"{INST}/colleges/{college['id']}/roster").json()["items"][0]
    assert claimed["claimed_at"] is not None


def test_an_unlisted_email_still_waits_for_approval(setup, otp_required):
    college, sections, _ = setup
    email = _unique("walkin")
    _, resp = register(college, sections[0], role="student", email=email, verification_token=_verified_token(email))
    assert resp.status_code == 202 and resp.json()["status"] == "pending_approval"


def test_a_roster_naming_a_section_does_not_approve_a_different_section(setup, otp_required):
    college, sections, admin_client = setup
    email = _unique("wrong")
    _import(admin_client, college, _csv("email,branch,section", f"{email},Computer Science,{sections[0]['name']}"))
    _, resp = register(college, sections[1], role="student", email=email, verification_token=_verified_token(email))
    assert resp.status_code == 202


def test_a_student_entry_does_not_approve_a_teacher_registration(setup, otp_required):
    college, sections, admin_client = setup
    email = _unique("role")
    _import(admin_client, college, _csv("email,role", f"{email},student"))
    _, resp = register(college, sections[0], role="teacher", email=email, verification_token=_verified_token(email))
    assert resp.status_code == 202


def test_a_roster_entry_is_single_use(setup, otp_required, db_session):
    from sqlalchemy import delete

    from app.db.models.user import User

    college, sections, admin_client = setup
    email = _unique("once")
    _import(admin_client, college, _csv("email", email))
    _, first = register(college, sections[0], role="student", email=email, verification_token=_verified_token(email))
    assert first.status_code == 201
    db_session.execute(delete(User).where(User.email == email))
    db_session.commit()
    _, second = register(college, sections[0], role="student", email=email, verification_token=_verified_token(email))
    assert second.status_code == 202  # the entry was already claimed


def test_the_roster_grants_nothing_without_email_verification(setup, monkeypatch):
    """With the email-code requirement off nobody has proven ownership of the address, so a listed email
    must NOT skip the approval queue (otherwise knowing a classmate's email would be enough)."""
    monkeypatch.setattr(auth_service.settings, "require_registration_otp", False)
    college, sections, admin_client = setup
    email = _unique("unverified")
    _import(admin_client, college, _csv("email", email))
    _, resp = register(college, sections[0], role="student", email=email)
    assert resp.status_code == 202
