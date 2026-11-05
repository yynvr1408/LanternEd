"""Attendance, gradebook and platform usage reports."""

from datetime import timedelta

import pytest

from app.db.base import utcnow
from app.db.models.classroom import Class, ClassParticipant
from app.db.models.enums import ClassStatus, ParticipationStatus
from app.services import report_service
from tests.api.test_admin import BASE, admin_client, admin_creds  # noqa: F401 - fixtures


def _class(db, course_id, teacher_id, title, *, hours_ago, status=ClassStatus.ended):
    start = utcnow() - timedelta(hours=hours_ago)
    cls = Class(course_id=course_id, teacher_id=teacher_id, title=title, scheduled_start=start, scheduled_end=start + timedelta(hours=1), status=status)
    db.add(cls)
    db.commit()
    return cls


def _attend(db, cls, user_id, *, minutes=30, status=ParticipationStatus.left):
    joined = cls.scheduled_start
    db.add(ClassParticipant(class_id=cls.id, user_id=user_id, joined_at=joined, left_at=joined + timedelta(minutes=minutes), participation_status=status))
    db.commit()


# --- attendance ------------------------------------------------------------------------------------


def test_attendance_counts_only_held_classes_and_marks_present_absent(teacher, enrolled_student, published_course, db_session):
    tclient, tuser = teacher
    _, student = enrolled_student
    c1 = _class(db_session, published_course["id"], tuser["id"], "Lecture 1", hours_ago=48)
    _class(db_session, published_course["id"], tuser["id"], "Lecture 2", hours_ago=24)  # student absent
    _class(db_session, published_course["id"], tuser["id"], "Future", hours_ago=-24, status=ClassStatus.scheduled)  # not held
    _attend(db_session, c1, student["id"], minutes=45)

    report = tclient.get(f"/api/v1/courses/{published_course['id']}/reports/attendance").json()
    assert [c["title"] for c in report["classes"]] == ["Lecture 1", "Lecture 2"]
    row = report["students"][0]
    assert (row["classes_attended"], row["classes_held"], row["percent"], row["minutes"]) == (1, 2, 50.0, 45)
    assert row["per_class"] == [True, False]


def test_a_removed_participant_does_not_count_as_attending(teacher, enrolled_student, published_course, db_session):
    tclient, tuser = teacher
    _, student = enrolled_student
    cls = _class(db_session, published_course["id"], tuser["id"], "Kicked", hours_ago=5)
    _attend(db_session, cls, student["id"], status=ParticipationStatus.removed)
    row = tclient.get(f"/api/v1/courses/{published_course['id']}/reports/attendance").json()["students"][0]
    assert row["classes_attended"] == 0


def test_attendance_csv_is_a_download_with_the_expected_columns(teacher, enrolled_student, published_course, db_session):
    tclient, tuser = teacher
    _, student = enrolled_student
    _attend(db_session, _class(db_session, published_course["id"], tuser["id"], "Intro", hours_ago=3), student["id"])
    resp = tclient.get(f"/api/v1/courses/{published_course['id']}/reports/attendance.csv")
    assert resp.status_code == 200 and "attachment" in resp.headers["content-disposition"]
    lines = resp.text.lstrip("﻿").splitlines()
    assert lines[0].startswith("Name,Email,Classes attended,Classes held,Attendance %,Minutes in class,")
    assert lines[1].endswith(",1,1,100.0,30,P")


def test_reports_are_for_the_courses_teachers_only(enrolled_student, published_course, make_user):
    sclient, _ = enrolled_student
    other_teacher, _ = make_user(role="teacher", prefix="other")
    for client in (sclient, other_teacher):
        for path in ("reports/attendance", "reports/attendance.csv", "reports/gradebook", "reports/gradebook.csv"):
            assert client.get(f"/api/v1/courses/{published_course['id']}/{path}").status_code == 403


# --- gradebook -------------------------------------------------------------------------------------


def test_gradebook_totals_graded_work_and_flags_missing(teacher, enrolled_student, published_course, published_assignment):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    aid = published_assignment["id"]
    sub = sclient.put(f"/api/v1/assignments/{aid}/submissions/me", json={"answer": {"text": "x"}, "submit": True}).json()
    tclient.put(f"/api/v1/assignments/{aid}/submissions/{sub['id']}/grade", json={"score": 80})
    # a second published assignment the student never touched
    tclient.post(f"/api/v1/assignments?course_id={published_course['id']}", json={"title": "Lab 2", "status": "published"})

    report = tclient.get(f"/api/v1/courses/{published_course['id']}/reports/gradebook").json()
    assert [a["max_score"] for a in report["assignments"]] == [100, 100]
    row = report["students"][0]
    assert (row["earned"], row["possible"], row["percent"], row["submitted_count"]) == (80.0, 100, 80.0, 1)

    csv_text = tclient.get(f"/api/v1/courses/{published_course['id']}/reports/gradebook.csv").text.lstrip("﻿").splitlines()
    assert csv_text[1].split(",")[2:] == ["80.0", "missing", "80.0", "100", "80.0", "1"]


def test_draft_assignments_are_not_in_the_gradebook(teacher, enrolled_student, published_course):
    tclient, _ = teacher
    tclient.post(f"/api/v1/assignments?course_id={published_course['id']}", json={"title": "Unreleased", "status": "draft"})
    assert tclient.get(f"/api/v1/courses/{published_course['id']}/reports/gradebook").json()["assignments"] == []


# --- spreadsheet formula injection -----------------------------------------------------------------


@pytest.mark.parametrize("hostile", ["=HYPERLINK(\"http://evil\",\"x\")", "+1+1", "-2", "@SUM(A1)", "\tcmd"])
def test_formula_like_cells_are_neutralised(hostile):
    assert report_service.safe_cell(hostile).startswith("'")
    assert report_service.safe_cell("Asha Rao") == "Asha Rao"


def test_a_students_hostile_name_is_neutralised_in_the_csv(teacher, make_user, published_course):
    tclient, _ = teacher
    sclient, student = make_user(role="student", prefix="evil")
    sclient.patch("/api/v1/users/me", json={"full_name": "=1+1"})
    sclient.post(f"/api/v1/courses/{published_course['id']}/enrollments", json={})
    text = tclient.get(f"/api/v1/courses/{published_course['id']}/reports/gradebook.csv").text
    assert "'=1+1" in text and ",=1+1," not in text and not any(line.startswith("=") for line in text.splitlines())


# --- platform usage --------------------------------------------------------------------------------


def test_usage_requires_the_platform_admin(client, teacher):
    assert client.get(f"{BASE}/usage").status_code == 401
    assert teacher[0].get(f"{BASE}/usage").status_code in (401, 403)


def test_usage_counts_classes_attendance_and_live_minutes(admin_client, db_session):  # noqa: F811
    from tests.api.test_college_registration import make_college, register_active

    college, sections = make_college(admin_client)
    tclient, resp = register_active(college, sections[0], role="teacher")
    teacher_user = resp.json()["user"]
    sclient, sresp = register_active(college, sections[0], role="student")
    student = sresp.json()["user"]
    course = tclient.post("/api/v1/courses", json={"title": "Usage", "status": "published"}).json()
    cls = _class(db_session, course["id"], teacher_user["id"], "Held", hours_ago=2)
    _attend(db_session, cls, student["id"], minutes=40)

    out = admin_client.get(f"{BASE}/usage?days=7").json()
    mine = next(c for c in out["colleges"] if c["college_id"] == college["id"])
    assert mine["active_members"] == 2
    assert mine["classes_held"] == 1 and mine["students_attending"] == 1
    assert mine["live_participant_minutes"] == 40
    assert out["totals"]["classes_held"] >= 1
