"""College-scoped course catalogue: with COURSE_CATALOG_SCOPE=college a published course is open only to people of the
teacher's own college. The default ("global") keeps the original open catalogue."""

import pytest

from app.config import get_settings
from tests.api.test_college_registration import admin, make_college, register_active  # noqa: F401


@pytest.fixture
def two_colleges(admin):  # noqa: F811
    a, a_sections = make_college(admin)
    b, b_sections = make_college(admin)
    teacher_a, _ = register_active(a, a_sections[0], role="teacher")
    course = teacher_a.post("/api/v1/courses", json={"title": "Algebra", "status": "published"}).json()
    student_a, ra = register_active(a, a_sections[0], role="student")
    student_b, rb = register_active(b, b_sections[0], role="student")
    return {
        "teacher": teacher_a, "course": course, "a": student_a, "a_user": ra.json()["user"], "b": student_b, "b_user": rb.json()["user"],
    }


def _catalog_ids(client):
    return {c["id"] for c in client.get("/api/v1/courses/catalog").json()}


def test_by_default_the_catalogue_is_open_to_everyone(two_colleges):
    assert get_settings().course_catalog_scope == "global"
    c = two_colleges
    assert c["course"]["id"] in _catalog_ids(c["b"])
    assert c["b"].post(f"/api/v1/courses/{c['course']['id']}/enrollments", json={}).status_code == 201


def test_a_college_scoped_catalogue_hides_other_colleges_courses(two_colleges, monkeypatch):
    monkeypatch.setattr(get_settings(), "course_catalog_scope", "college")
    c = two_colleges
    assert c["course"]["id"] in _catalog_ids(c["a"])
    assert c["course"]["id"] not in _catalog_ids(c["b"])


def test_another_colleges_student_cannot_open_or_join_the_course(two_colleges, monkeypatch):
    monkeypatch.setattr(get_settings(), "course_catalog_scope", "college")
    c = two_colleges
    cid = c["course"]["id"]
    assert c["b"].get(f"/api/v1/courses/{cid}").status_code == 403
    assert c["b"].get(f"/api/v1/courses/{cid}/lessons").status_code == 403
    join = c["b"].post(f"/api/v1/courses/{cid}/enrollments", json={})
    assert join.status_code == 403 and join.json()["error"]["code"] == "COURSE_NOT_IN_COLLEGE"
    assert c["a"].get(f"/api/v1/courses/{cid}").status_code == 200
    assert c["a"].post(f"/api/v1/courses/{cid}/enrollments", json={}).status_code == 201


def test_a_teacher_cannot_enrol_a_student_of_another_college(two_colleges, monkeypatch):
    monkeypatch.setattr(get_settings(), "course_catalog_scope", "college")
    c = two_colleges
    url = f"/api/v1/courses/{c['course']['id']}/enrollments"
    assert c["teacher"].post(url, json={"student_id": c["b_user"]["id"]}).status_code == 404
    assert c["teacher"].post(url, json={"student_id": c["a_user"]["id"]}).status_code == 201


def test_a_teacher_can_only_ever_enrol_students(two_colleges):
    """Holds in every catalogue mode: the id must belong to an existing student."""
    c = two_colleges
    url = f"/api/v1/courses/{c['course']['id']}/enrollments"
    teacher_id = c["teacher"].get("/api/v1/users/me").json()["id"]
    assert c["teacher"].post(url, json={"student_id": teacher_id}).status_code == 404  # a teacher
    assert c["teacher"].post(url, json={"student_id": "00000000-0000-0000-0000-000000000000"}).status_code == 404


def test_enrolled_students_keep_access_if_the_scope_is_tightened_later(two_colleges, monkeypatch):
    c = two_colleges
    cid = c["course"]["id"]
    assert c["b"].post(f"/api/v1/courses/{cid}/enrollments", json={}).status_code == 201  # joined while global
    monkeypatch.setattr(get_settings(), "course_catalog_scope", "college")
    assert c["b"].get(f"/api/v1/courses/{cid}").status_code == 200  # an existing enrolment is not revoked
