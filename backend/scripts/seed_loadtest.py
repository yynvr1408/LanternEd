"""Creates synthetic data for load testing a STAGING environment: one college, N students, one teacher, a published
course with every student enrolled, and a published assignment. Writes the student logins to a CSV for the load
generator (ops/loadtest/classday.js).

    cd backend
    python scripts/seed_loadtest.py --students 500 --out ../ops/loadtest/users.csv --i-know-this-is-staging

Never run this against production: it refuses when APP_ENV=production, and it needs the explicit flag above so a
copy-pasted command against the wrong DATABASE_URL does not silently fill a real database with fake users.
"""

import argparse
import csv
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.models.college import UserCollegeSection  # noqa: E402
from app.db.models.course import CourseEnrollment  # noqa: E402
from app.db.models.enums import AssignmentStatus, CollegeStatus, CourseStatus, EnrollmentStatus, UserRole, UserStatus  # noqa: E402
from app.db.models.user import User  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.services import assignment_service, college_service, course_service  # noqa: E402


def seed(students: int, out: Path, prefix: str) -> None:
    password = "Load-" + secrets.token_urlsafe(9)
    pw_hash = hash_password(password)  # hashed once and shared: argon2 per user would take minutes for thousands
    tag = secrets.token_hex(3)
    with SessionLocal() as db:
        college = college_service.create_college(
            db, None, name=f"Load Test College {tag}", location="staging", contact_email=None, contact_phone=None,
            status=CollegeStatus.active, code=None,
        )
        branch = college_service.create_branch(db, None, college, name="Load Branch", short_code="LB")
        section = college_service.create_section(db, None, branch, name="Section A")

        teacher = User(
            full_name="Load Teacher", email=f"{prefix}-teacher-{tag}@example.com", password_hash=pw_hash, role=UserRole.teacher,
            status=UserStatus.active, college_id=college.id,
        )
        db.add(teacher)
        db.flush()
        db.add(UserCollegeSection(user_id=teacher.id, college_section_id=section.id))
        course = course_service.create_course(
            db, teacher, title=f"Load Course {tag}", description="synthetic", subject="Load", status=CourseStatus.published
        )
        assignment_service.create_assignment(
            db, teacher, course.id, title="Load assignment", instructions="synthetic", due_at=None, status=AssignmentStatus.published
        )

        rows = []
        for i in range(students):
            student = User(
                full_name=f"Load Student {i}", email=f"{prefix}-{tag}-{i}@example.com", password_hash=pw_hash, role=UserRole.student,
                status=UserStatus.active, college_id=college.id,
            )
            db.add(student)
            db.flush()
            db.add(UserCollegeSection(user_id=student.id, college_section_id=section.id))
            db.add(CourseEnrollment(course_id=course.id, student_id=student.id, status=EnrollmentStatus.active))
            rows.append((student.email, password))
            if i % 200 == 199:
                db.commit()
        db.commit()
        teacher_login = (teacher.email, password)
        course_id = course.id

    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["email", "password"])
        writer.writerows(rows)
    print(f"Wrote {len(rows)} student logins to {out}")
    print(f"Teacher login: {teacher_login[0]} / {teacher_login[1]}")
    print(f"Course id: {course_id}  (pass it to k6 as COURSE_ID; create and start a class for CLASS_ID)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--students", type=int, default=200)
    parser.add_argument("--out", type=Path, default=Path("loadtest-users.csv"))
    parser.add_argument("--prefix", default="loadtest")
    parser.add_argument("--i-know-this-is-staging", action="store_true", dest="confirmed")
    args = parser.parse_args()

    if get_settings().is_production:
        raise SystemExit("Refusing to create synthetic users with APP_ENV=production.")
    if not args.confirmed:
        raise SystemExit("Add --i-know-this-is-staging to confirm DATABASE_URL points at a staging database.")
    if not 1 <= args.students <= 20000:
        raise SystemExit("--students must be between 1 and 20000.")
    seed(args.students, args.out, args.prefix)


if __name__ == "__main__":
    main()
