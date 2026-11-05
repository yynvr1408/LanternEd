"""Optional demo data: `python -m app.seed` (run `alembic upgrade head` first).

Creates the two README demo accounts, a published course with one section and an assignment.
Idempotent — safe to run repeatedly. Refuses to run in production: these passwords are public."""

from sqlalchemy import select

from app.config import get_settings
from app.db.models.college import College, CollegeBranch, CollegeSection, UserCollegeSection
from app.db.models.course import Course
from app.db.models.enums import AssignmentStatus, CollegeStatus, CourseStatus, UserRole, UserStatus
from app.db.models.section import Section
from app.db.models.user import User
from app.db.session import SessionLocal
from app.services import assignment_service, auth_service, college_service, course_service, section_service

DEMO_TEACHER = ("Dr. Elena Rostova", "teacher@lanterned.org", "teacher123")
DEMO_STUDENT = ("Amina Diallo", "student@lanterned.org", "student123")


def _get_or_create_user(db, full_name: str, email: str, password: str, role: UserRole) -> User:
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user:
        return user
    settings = get_settings()
    # Seeding is an operator action, so it bypasses registration policies deliberately.
    saved_invite = settings.teacher_invite_code
    saved_otp = settings.require_registration_otp
    saved_teacher_college = settings.teacher_college_required
    saved_student_college = settings.student_college_required
    settings.teacher_invite_code = None
    settings.require_registration_otp = False
    settings.teacher_college_required = False
    settings.student_college_required = False
    try:
        user = auth_service.register_user(db, full_name=full_name, email=email, password=password, role=role)
        if user.status != UserStatus.active:
            user.status = UserStatus.active
            db.commit()
            db.refresh(user)
        return user
    finally:
        settings.teacher_invite_code = saved_invite
        settings.require_registration_otp = saved_otp
        settings.teacher_college_required = saved_teacher_college
        settings.student_college_required = saved_student_college


def seed() -> None:
    if get_settings().is_production:
        raise SystemExit("Refusing to seed demo accounts with public passwords in production.")
    with SessionLocal() as db:
        college = db.execute(select(College).where(College.name == "Demo Institute")).scalar_one_or_none()
        if college is None:
            college = college_service.create_college(
                db, None, name="Demo Institute", location="Main Campus",
                contact_email="demo@lanterned.org", contact_phone=None,
                status=CollegeStatus.active, code=None,
            )
            branch = college_service.create_branch(db, None, college, name="Computer Science", short_code="CS")
            college_section = college_service.create_section(db, None, branch, name="Section A")
        else:
            branch = db.execute(select(CollegeBranch).where(CollegeBranch.college_id == college.id)).scalar_one_or_none()
            college_section = db.execute(select(CollegeSection).where(CollegeSection.branch_id == branch.id)).scalar_one_or_none() if branch else None

        college_name = college.name
        college_code = college.code

        teacher = _get_or_create_user(db, *DEMO_TEACHER, UserRole.teacher)
        student = _get_or_create_user(db, *DEMO_STUDENT, UserRole.student)

        if college_section:
            if not teacher.college_id:
                teacher.college_id = college.id
                db.add(UserCollegeSection(user_id=teacher.id, college_section_id=college_section.id))
            if not student.college_id:
                student.college_id = college.id
                db.add(UserCollegeSection(user_id=student.id, college_section_id=college_section.id))
            db.commit()

        course = db.execute(select(Course).where(Course.teacher_id == teacher.id, Course.title == "Introduction to Biology")).scalar_one_or_none()
        if course is None:
            course = course_service.create_course(
                db, teacher, title="Introduction to Biology", description="Cells, genetics and ecosystems.", subject="Biology",
                status=CourseStatus.published,
            )
            assignment_service.create_assignment(
                db, teacher, course.id, title="Cell structure quiz", instructions="Describe the main organelles.", due_at=None,
                status=AssignmentStatus.published,
            )
        try:
            course_service.enroll_student(db, course, acting_user=student, student_id=None)
        except Exception:  # already enrolled
            db.rollback()
        section = db.execute(select(Section).where(Section.course_id == course.id, Section.code == "CAMPUS")).scalar_one_or_none()
        if section is None:
            section = section_service.create_section(db, teacher, course, name="Campus cohort", code="campus")
        try:
            section_service.add_member(db, teacher, section, student_id=student.id)
        except Exception:  # already a member
            db.rollback()
        print("Seeded demo accounts:", DEMO_TEACHER[1], "/", DEMO_STUDENT[1])
        print(f"Demo College: {college_name} (Code: {college_code})")


if __name__ == "__main__":
    seed()
