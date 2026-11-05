"""A teacher asking to administer their own college; the platform administrator decides."""

import pytest

from tests.api.test_admin import BASE
from tests.api.test_college_registration import admin, make_college, register_active  # noqa: F401

INST = "/api/v1/institution-admin"


@pytest.fixture
def college_with_teacher(admin):  # noqa: F811
    college, sections = make_college(admin)
    client, resp = register_active(college, sections[0], role="teacher")
    return admin, college, sections, client, resp.json()["user"]


def _ask(client, message="I run the CSE department."):
    return client.post(f"{INST}/my-admin-request", json={"message": message})


def test_a_teacher_can_ask_and_sees_the_request(college_with_teacher):
    admin, college, _, client, _ = college_with_teacher
    assert client.get(f"{INST}/my-admin-request").json() is None
    resp = _ask(client)
    assert resp.status_code == 201 and resp.json()["status"] == "pending" and resp.json()["college_id"] == college["id"]
    assert client.get(f"{INST}/my-admin-request").json()["message"] == "I run the CSE department."


def test_only_one_pending_request_at_a_time(college_with_teacher):
    _, _, _, client, _ = college_with_teacher
    _ask(client)
    again = _ask(client)
    assert again.status_code == 409 and again.json()["error"]["code"] == "REQUEST_ALREADY_PENDING"


def test_students_and_collegeless_teachers_cannot_ask(college_with_teacher, make_user, monkeypatch):
    _, college, sections, _, _ = college_with_teacher
    student, _ = register_active(college, sections[0], role="student")
    assert _ask(student).status_code == 403
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "teacher_college_required", False)  # a legacy teacher with no college
    loose, _ = make_user(role="teacher", prefix="loose")
    assert _ask(loose).json()["error"]["code"] == "NO_COLLEGE"


def test_approving_makes_them_the_administrator_and_tells_them(college_with_teacher):
    admin, college, _, client, user = college_with_teacher
    req_id = _ask(client).json()["id"]
    listed = admin.get(f"{BASE}/admin-role-requests?status=pending").json()
    mine = next(r for r in listed if r["id"] == req_id)
    assert mine["college_name"] == college["name"] and mine["email"] == user["email"]

    assert admin.post(f"{BASE}/admin-role-requests/{req_id}/approve").status_code == 204
    assert client.get(f"{INST}/colleges").json()[0]["id"] == college["id"]  # now administers it
    assert client.get(f"{INST}/my-admin-request").json()["status"] == "approved"
    titles = [n["title"] for n in client.get("/api/v1/notifications").json()["items"]]
    assert "You are now your college's administrator" in titles
    assert admin.post(f"{BASE}/admin-role-requests/{req_id}/approve").json()["error"]["code"] == "ALREADY_DECIDED"
    assert _ask(client).json()["error"]["code"] == "ALREADY_ADMIN"


def test_rejecting_records_the_reason_and_allows_asking_again(college_with_teacher):
    admin, _, _, client, _ = college_with_teacher
    req_id = _ask(client).json()["id"]
    assert admin.post(f"{BASE}/admin-role-requests/{req_id}/reject", json={"reason": "Please ask your principal to email us."}).status_code == 204
    state = client.get(f"{INST}/my-admin-request").json()
    assert state["status"] == "rejected" and state["rejected_reason"].startswith("Please ask")
    assert _ask(client).status_code == 201  # a new request is allowed after a rejection


def test_a_taken_seat_blocks_new_requests_and_approval(college_with_teacher):
    admin, college, sections, first, first_user = college_with_teacher
    second, second_resp = register_active(college, sections[1], role="teacher")
    req_id = _ask(second).json()["id"]  # asked while the seat was free
    admin.post(f"{BASE}/colleges/{college['id']}/administrators", json={"user_id": first_user["id"]})  # then the platform gave it away
    assert admin.post(f"{BASE}/admin-role-requests/{req_id}/approve").json()["error"]["code"] == "COLLEGE_ALREADY_HAS_ADMINISTRATOR"
    third, _ = register_active(college, sections[0], role="teacher")
    assert _ask(third).json()["error"]["code"] == "COLLEGE_ALREADY_HAS_ADMINISTRATOR"


def test_only_the_platform_administrator_can_decide(college_with_teacher, client):
    admin, _, _, teacher_client, _ = college_with_teacher
    req_id = _ask(teacher_client).json()["id"]
    assert teacher_client.post(f"{BASE}/admin-role-requests/{req_id}/approve").status_code in (401, 403)
    assert client.get(f"{BASE}/admin-role-requests").status_code == 401
    assert teacher_client.get(f"{BASE}/admin-role-requests").status_code in (401, 403)
