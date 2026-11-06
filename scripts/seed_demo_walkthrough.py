"""
Seeds dev.db with complete institutional data for real website walkthrough recording.
"""
import os
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

os.environ["REQUIRE_REGISTRATION_OTP"] = "false"
os.environ["CONCURRENT_LOGIN_OTP"] = "false"
os.environ["TEACHER_COLLEGE_REQUIRED"] = "false"
os.environ["STUDENT_COLLEGE_REQUIRED"] = "false"
from sqlalchemy import select

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.db.session import engine, SessionLocal
from app.db import models
from app.db.base import Base
from app.db.models.enums import UserRole, UserStatus, CourseStatus, AssignmentStatus
from app.services import college_service, auth_service, course_service, assignment_service, classroom_service, admin_service

def seed_walkthrough_data():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # 1. Platform Admin
    try:
        admin_service.bootstrap_admin(db)
        print("Platform admin bootstrapped.")
    except Exception as e:
        print("Admin bootstrap:", e)

    # 2. Check / Create College
    colleges, _ = college_service.list_colleges(db, search=None, status=None, limit=50, offset=0)
    college = None
    for c in colleges:
        if c.name == "National Institute of Technology AP":
            college = c
            break

    if not college:
        college = college_service.create_college(
            db, admin_id=None,
            name="National Institute of Technology AP",
            location="Tirupati, AP",
            contact_email="registrar@nitap.ac.in",
            contact_phone="+919876543210",
            status="active",
            code=None
        )
        print(f"Created college: {college.name} (Code: {college.code})")

    # 3. Branches
    branches = college_service.list_branches(db, college.id, active_only=False)
    branch_cse = next((b for b in branches if b.short_code == "CSE"), None)
    if not branch_cse:
        branch_cse = college_service.create_branch(db, None, college, name="Computer Science and Engineering", short_code="CSE")
        print("Created CSE branch.")

    branch_ece = next((b for b in branches if b.short_code == "ECE"), None)
    if not branch_ece:
        branch_ece = college_service.create_branch(db, None, college, name="Electronics and Communication Engineering", short_code="ECE")
        print("Created ECE branch.")

    # 4. Sections
    sections = college_service.list_sections(db, branch_cse.id, active_only=False)
    sec_a = next((s for s in sections if s.name == "Section A"), None)
    if not sec_a:
        sec_a = college_service.create_section(db, None, branch_cse, name="Section A")
        print("Created Section A.")

    # 5. Teacher User
    teacher_email = "teacher@lanterned.edu"
    teacher_pass = "Password@123"
    teacher = db.execute(select(models.user.User).where(models.user.User.email == teacher_email)).scalar_one_or_none()
    if not teacher:
        teacher = auth_service.register_user(
            db, full_name="Dr. Afzal Siddappa", email=teacher_email, password=teacher_pass,
            role=UserRole.teacher, college_id=college.id, college_code=college.code
        )
        teacher.status = UserStatus.active
        db.commit()
        college_service.assign_college_admin(db, platform_admin_id=None, college=college, user_id=teacher.id)
        print(f"Created teacher user: {teacher_email}")

    # 6. Student User
    student_email = "student@lanterned.edu"
    student_pass = "Password@123"
    student = db.execute(select(models.user.User).where(models.user.User.email == student_email)).scalar_one_or_none()
    if not student:
        student = auth_service.register_user(
            db, full_name="Nandhi Vardhan Reddy", email=student_email, password=student_pass,
            role=UserRole.student, college_id=college.id, college_code=college.code,
            branch_id=branch_cse.id, section_id=sec_a.id
        )
        student.status = UserStatus.active
        db.commit()
        print(f"Created student user: {student_email}")

    # 7. Courses
    existing_courses = course_service.list_courses_for_user(db, teacher)
    course1 = next((c for c in existing_courses if "Data Structures" in c.title), None)
    if not course1:
        course1 = course_service.create_course(
            db, teacher,
            title="CS201: Data Structures & Algorithms",
            subject="Computer Science",
            description="Fundamental algorithms, asymptotic analysis, balanced search trees (AVL & Red-Black), and graph traversals.",
            status=CourseStatus.published
        )
        course1.college_id = college.id
        course1.branch_id = branch_cse.id
        course1.section_id = sec_a.id
        db.commit()
        print(f"Created course: {course1.title}")

    course2 = next((c for c in existing_courses if "Cloud Native" in c.title), None)
    if not course2:
        course2 = course_service.create_course(
            db, teacher,
            title="CS304: Cloud Native Distributed Systems",
            subject="Cloud Computing",
            description="Microservices architectures, container orchestration with Kubernetes, and distributed Raft consensus.",
            status=CourseStatus.published
        )
        course2.college_id = college.id
        course2.branch_id = branch_cse.id
        course2.section_id = sec_a.id
        db.commit()
        print(f"Created course: {course2.title}")

    # 8. Enroll student
    try:
        course_service.enroll_student(db, course1, acting_user=teacher, student_id=student.id)
        course_service.enroll_student(db, course2, acting_user=teacher, student_id=student.id)
        print("Enrolled student into CS201 and CS304.")
    except Exception as e:
        print("Enrollment note:", e)

    # 9. Assignments
    asgns = assignment_service.list_assignments(db, teacher, course_id=course1.id)
    if not asgns:
        now = datetime.now(timezone.utc)
        due_at = now + timedelta(days=7)
        asgn = assignment_service.create_assignment(
            db, teacher, course1.id,
            title="Assignment 1: Balanced BST & AVL Rotations",
            instructions="Implement single (LL, RR) and double (LR, RL) rotations for AVL trees. Assert height invariants on all operations.",
            due_at=due_at,
            status=AssignmentStatus.published,
            max_score=100
        )
        print("Created assignment for CS201.")

    # 10. Live Classes
    classes = classroom_service.list_classes_for_user(db, teacher)
    if not classes:
        now = datetime.now(timezone.utc)
        start_time = now + timedelta(hours=2)
        end_time = now + timedelta(hours=3)
        classroom_service.create_class(
            db, teacher, course1.id,
            title="Lecture 04: Red-Black Tree Rotations & Invariants",
            scheduled_start=start_time,
            scheduled_end=end_time
        )
        print("Scheduled live class for CS201.")

    db.close()
    print("Demo data seeded successfully into dev.db!")

if __name__ == "__main__":
    seed_walkthrough_data()
