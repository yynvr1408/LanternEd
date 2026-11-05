"""Reports teachers and colleges ask for first: who attended, who scored what, and how much a college
actually uses the platform. Read-only; every function takes data the caller has already been authorized for."""

import csv
import io
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.db.models.assignment import Assignment, AssignmentSubmission
from app.db.models.classroom import Class, ClassParticipant, ClassRecording
from app.db.models.college import College
from app.db.models.course import Course, CourseEnrollment
from app.db.models.enums import AssignmentStatus, ClassStatus, EnrollmentStatus, ParticipationStatus, SubmissionStatus, UserRole, UserStatus
from app.db.models.summary import LectureSummary
from app.db.models.user import User

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value) -> str:
    """Spreadsheet formula injection: a name like '=HYPERLINK(...)' would run when a teacher opens the CSV
    in Excel. Student-controlled text is therefore prefixed with a quote so it stays text."""
    text = "" if value is None else str(value)
    return "'" + text if text.startswith(_FORMULA_PREFIXES) else text


def to_csv(header: list[str], rows: list[list]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([safe_cell(h) for h in header])
    for row in rows:
        writer.writerow([safe_cell(c) for c in row])
    return "﻿" + buffer.getvalue()  # BOM so Excel reads Indian-language names as UTF-8


def _enrolled_students(db: Session, course_id: str) -> list[User]:
    return list(
        db.execute(
            select(User)
            .join(CourseEnrollment, CourseEnrollment.student_id == User.id)
            .where(CourseEnrollment.course_id == course_id, CourseEnrollment.status == EnrollmentStatus.active)
            .order_by(User.full_name, User.email)
        ).scalars()
    )


def _minutes(participant: ClassParticipant, cls: Class) -> int:
    if participant.joined_at is None:
        return 0
    end = participant.left_at or cls.scheduled_end or (participant.joined_at + timedelta(minutes=0))
    return max(0, int((end - participant.joined_at).total_seconds() // 60))


def attendance(db: Session, course: Course) -> dict:
    """Per enrolled student: classes attended out of the classes actually held (live or ended)."""
    classes = list(
        db.execute(
            select(Class)
            .where(Class.course_id == course.id, Class.status.in_([ClassStatus.live, ClassStatus.ended]))
            .order_by(Class.scheduled_start)
        ).scalars()
    )
    students = _enrolled_students(db, course.id)
    class_by_id = {c.id: c for c in classes}
    attended: dict[tuple[str, str], int] = {}  # (student, class) -> minutes
    if classes:
        for p in db.execute(select(ClassParticipant).where(ClassParticipant.class_id.in_(class_by_id))).scalars():
            if p.joined_at is not None and p.participation_status != ParticipationStatus.removed:
                attended[(p.user_id, p.class_id)] = _minutes(p, class_by_id[p.class_id])

    rows = []
    for s in students:
        present = [c for c in classes if (s.id, c.id) in attended]
        rows.append({
            "student_id": s.id, "full_name": s.full_name, "email": s.email,
            "classes_attended": len(present), "classes_held": len(classes),
            "percent": round(100 * len(present) / len(classes), 1) if classes else None,
            "minutes": sum(attended[(s.id, c.id)] for c in present),
            "per_class": [(s.id, c.id) in attended for c in classes],
        })
    return {
        "course_id": course.id, "course_title": course.title,
        "classes": [{"id": c.id, "title": c.title, "date": c.scheduled_start.date().isoformat()} for c in classes],
        "students": rows,
    }


def attendance_csv(report: dict) -> str:
    header = ["Name", "Email", "Classes attended", "Classes held", "Attendance %", "Minutes in class"]
    header += [f"{c['date']} {c['title']}" for c in report["classes"]]
    rows = [
        [s["full_name"], s["email"], s["classes_attended"], s["classes_held"], "" if s["percent"] is None else s["percent"], s["minutes"]]
        + ["P" if present else "A" for present in s["per_class"]]
        for s in report["students"]
    ]
    return to_csv(header, rows)


def gradebook(db: Session, course: Course) -> dict:
    assignments = list(
        db.execute(
            select(Assignment)
            .where(Assignment.course_id == course.id, Assignment.status == AssignmentStatus.published)
            .order_by(Assignment.due_at.is_(None), Assignment.due_at, Assignment.created_at)
        ).scalars()
    )
    students = _enrolled_students(db, course.id)
    subs: dict[tuple[str, str], AssignmentSubmission] = {}
    if assignments:
        for sub in db.execute(
            select(AssignmentSubmission).where(AssignmentSubmission.assignment_id.in_([a.id for a in assignments]))
        ).scalars():
            subs[(sub.student_id, sub.assignment_id)] = sub

    rows = []
    for s in students:
        cells, earned, possible = [], 0.0, 0
        for a in assignments:
            sub = subs.get((s.id, a.id))
            submitted = sub is not None and sub.status == SubmissionStatus.submitted
            graded = sub is not None and sub.score is not None
            cells.append({"assignment_id": a.id, "submitted": submitted, "score": sub.score if graded else None})
            if graded:
                earned += sub.score
                possible += a.max_score
        rows.append({
            "student_id": s.id, "full_name": s.full_name, "email": s.email, "cells": cells,
            "earned": earned, "possible": possible,
            "percent": round(100 * earned / possible, 1) if possible else None,
            "submitted_count": sum(1 for c in cells if c["submitted"]),
        })
    return {
        "course_id": course.id, "course_title": course.title,
        "assignments": [{"id": a.id, "title": a.title, "max_score": a.max_score, "due_at": a.due_at.isoformat() if a.due_at else None} for a in assignments],
        "students": rows,
    }


def gradebook_csv(report: dict) -> str:
    header = ["Name", "Email"] + [f"{a['title']} (/{a['max_score']})" for a in report["assignments"]] + ["Total", "Out of", "Percent", "Submitted"]
    rows = []
    for s in report["students"]:
        scores = [("" if c["score"] is None else c["score"]) if c["submitted"] or c["score"] is not None else "missing" for c in s["cells"]]
        rows.append([s["full_name"], s["email"], *scores, s["earned"], s["possible"], "" if s["percent"] is None else s["percent"], s["submitted_count"]])
    return to_csv(header, rows)


def usage(db: Session, *, days: int = 30) -> dict:
    """Platform-wide and per-college usage for the last `days` days: the numbers a pilot is judged on
    (are teachers actually teaching, are students showing up) and what drives cost (live minutes)."""
    since = utcnow() - timedelta(days=days)

    def per_college(stmt):
        return dict(db.execute(stmt).all())

    members = per_college(
        select(User.college_id, func.count(User.id)).where(User.college_id.is_not(None), User.status == UserStatus.active).group_by(User.college_id)
    )
    teacher_college = select(Course.id.label("course_id"), User.college_id.label("college_id")).join(User, User.id == Course.teacher_id).subquery()
    classes_held = per_college(
        select(teacher_college.c.college_id, func.count(Class.id))
        .join(Class, Class.course_id == teacher_college.c.course_id)
        .where(Class.status == ClassStatus.ended, Class.scheduled_start >= since)
        .group_by(teacher_college.c.college_id)
    )
    attendees, live_seconds = {}, {}
    part_rows = db.execute(
        select(teacher_college.c.college_id, ClassParticipant.user_id, ClassParticipant.joined_at, ClassParticipant.left_at)
        .join(Class, Class.id == ClassParticipant.class_id)
        .join(teacher_college, teacher_college.c.course_id == Class.course_id)
        .where(ClassParticipant.joined_at.is_not(None), ClassParticipant.joined_at >= since)
    ).all()
    for college_id, user_id, joined, left in part_rows:
        attendees.setdefault(college_id, set()).add(user_id)
        if left is not None:
            live_seconds[college_id] = live_seconds.get(college_id, 0) + max(0, int((left - joined).total_seconds()))
    submissions = per_college(
        select(teacher_college.c.college_id, func.count(AssignmentSubmission.id))
        .join(Assignment, Assignment.course_id == teacher_college.c.course_id)
        .join(AssignmentSubmission, AssignmentSubmission.assignment_id == Assignment.id)
        .where(AssignmentSubmission.status == SubmissionStatus.submitted, AssignmentSubmission.submitted_at >= since)
        .group_by(teacher_college.c.college_id)
    )
    recordings = per_college(
        select(teacher_college.c.college_id, func.count(ClassRecording.id))
        .join(Class, Class.course_id == teacher_college.c.course_id)
        .join(ClassRecording, ClassRecording.class_id == Class.id)
        .where(ClassRecording.started_at >= since)
        .group_by(teacher_college.c.college_id)
    )
    summaries = per_college(
        select(teacher_college.c.college_id, func.count(LectureSummary.id))
        .join(Class, Class.course_id == teacher_college.c.course_id)
        .join(LectureSummary, LectureSummary.class_id == Class.id)
        .where(LectureSummary.created_at >= since)
        .group_by(teacher_college.c.college_id)
    )

    colleges = []
    for c in db.execute(select(College).order_by(College.name_key)).scalars():
        active = len(attendees.get(c.id, ()))
        members_n = members.get(c.id, 0)
        colleges.append({
            "college_id": c.id, "name": c.name, "status": c.status.value,
            "active_members": members_n, "classes_held": classes_held.get(c.id, 0),
            "students_attending": active,
            "attendance_rate_of_members": round(100 * active / members_n, 1) if members_n else None,
            "live_participant_minutes": live_seconds.get(c.id, 0) // 60,
            "submissions": submissions.get(c.id, 0), "recordings": recordings.get(c.id, 0), "summaries": summaries.get(c.id, 0),
        })
    totals = {k: sum(c[k] for c in colleges) for k in ("active_members", "classes_held", "live_participant_minutes", "submissions", "recordings", "summaries")}
    return {"days": days, "totals": totals, "colleges": colleges}
