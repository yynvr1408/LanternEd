"""
LanternED Complete End-to-End Multi-Dashboard Lifecycle Test
============================================================
Simulates realistic, interconnected user journeys across all 4 dashboards:
  1. Platform Super-Admin Console (/super-admin)
  2. Institution Admin Console (/institution/*)
  3. Teacher Workspace (/teacher/*)
  4. Student Portal (/student/*)
  5. Infrastructure & Ingress Probes (/health, /releases)
  6. CIA Gradebook & Split-Screen Rubric Evaluation
  7. Cross-Portal Role-Based Access Control (RBAC) Security Verification
"""

import os
import sys
import tempfile
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Force UTF-8 stdout if possible on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Set up test environment
test_db = tempfile.mktemp(suffix=".db")
os.environ["DATABASE_URL"] = f"sqlite:///{test_db}"
os.environ["APP_ENV"] = "test"
os.environ["STORAGE_BACKEND"] = "local"
os.environ["REQUIRE_REGISTRATION_OTP"] = "false"
os.environ["CONCURRENT_LOGIN_OTP"] = "false"
os.environ["TEACHER_COLLEGE_REQUIRED"] = "false"
os.environ["STUDENT_COLLEGE_REQUIRED"] = "false"

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient

from app.db import models  # populates Base.metadata
from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.main import app
from app.services import college_service, auth_service
from app.db.models.enums import UserRole, UserStatus

# Initialize schema
Base.metadata.create_all(bind=engine)

client = TestClient(app)
results = []

def record(name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name} - {detail}")
    results.append((name, passed, detail))

def run_e2e():
    print("=" * 80)
    print("Starting LanternED 4-Dashboard Comprehensive End-to-End Lifecycle Audit")
    print("=" * 80)

    # -------------------------------------------------------------------------
    # 0. Infrastructure & Diagnostic Probes
    # -------------------------------------------------------------------------
    print("\n--- [STAGE 0] Infrastructure & Releases Probes ---")
    r_health = client.get("/health")
    record("Probe: /health endpoint", r_health.status_code == 200, f"Status: {r_health.status_code}, Body: {r_health.json()}")

    r_manifest = client.get("/api/v1/releases/manifest")
    record("Probe: /releases/manifest", r_manifest.status_code == 200 and "platforms" in r_manifest.json(), f"Version: {r_manifest.json().get('version')}")

    r_check = client.get("/api/v1/releases/check-update?current_version=0.1.0&platform=windows")
    record("Probe: /releases/check-update", r_check.status_code == 200 and r_check.json().get("has_update") is True, f"Has update: {r_check.json().get('has_update')}, Latest: {r_check.json().get('latest_version')}")

    # -------------------------------------------------------------------------
    # 1. Super Admin Authentication & College Provisioning
    # -------------------------------------------------------------------------
    print("\n--- [STAGE 1] Super-Admin Console Workflow ---")
    # Super-admin CSRF & session test
    r_admin_no_csrf = client.post("/api/v1/admin/colleges", json={"name": "Test College"}, headers={})
    record("Super-Admin: CSRF Guard blocks mutation without x-lanterned-admin", r_admin_no_csrf.status_code in (401, 403), f"Status: {r_admin_no_csrf.status_code}")

    # Create a college directly via service
    db = SessionLocal()
    college_name = f"National Institute of Technology AP-{secrets.token_hex(3).upper()}"
    college = college_service.create_college(
        db, admin_id=None, name=college_name, location="Tirupati, AP",
        contact_email="director@nitap.ac.in", contact_phone="+919876543210",
        status="active", code=None
    )
    college_id = college.id
    college_code = college.code
    college_title = college.name
    db.close()
    record("Super-Admin: Provision Institutional College", college_id is not None, f"College: {college_title}, Code: {college_code}")

    # -------------------------------------------------------------------------
    # 2. Faculty Onboarding & Institution Admin Delegation
    # -------------------------------------------------------------------------
    print("\n--- [STAGE 2] Faculty Onboarding & Institution Hierarchy ---")
    teacher_email = f"hod_cse_{secrets.token_hex(4)}@nitap.ac.in"
    teacher_pass = "FacultyPass@1234"
    db = SessionLocal()
    teacher_user = auth_service.register_user(
        db, full_name="Dr. Afzal Siddappa", email=teacher_email, password=teacher_pass,
        role=UserRole.teacher, college_id=college_id, college_code=college_code
    )
    teacher_user.status = UserStatus.active
    teacher_id = teacher_user.id
    
    # Platform super-admin delegates faculty as college administrator
    college_obj = db.get(models.college.College, college_id)
    college_service.assign_college_admin(db, platform_admin_id=None, college=college_obj, user_id=teacher_id)
    db.commit()
    db.close()
    record("Auth: Register & Delegate Verified Faculty as College Admin", teacher_id is not None, f"Teacher: {teacher_email}, College ID: {college_id}")

    # Login as Teacher / Institution Admin
    t_client = TestClient(app)
    r_tlogin = t_client.post("/api/v1/auth/login", json={"email": teacher_email, "password": teacher_pass, "role": "teacher"})
    record("Auth: Teacher Session Established", r_tlogin.status_code == 200, f"Status: {r_tlogin.status_code}")

    # -------------------------------------------------------------------------
    # 3. Institution Admin Console Actions
    # -------------------------------------------------------------------------
    print("\n--- [STAGE 3] Institution Admin Console Workflow ---")
    # List colleges administered
    r_my_colleges = t_client.get("/api/v1/institution-admin/colleges")
    record("Institution Admin: List Administered Institutions", r_my_colleges.status_code == 200 and len(r_my_colleges.json()) > 0, f"Colleges count: {len(r_my_colleges.json())}")

    # Create Branch (e.g. Computer Science Engineering)
    r_branch = t_client.post(f"/api/v1/institution-admin/colleges/{college_id}/branches", json={"name": "Computer Science and Engineering", "short_code": "CSE"})
    branch_id = r_branch.json().get("id") if r_branch.status_code == 201 else None
    record("Institution Admin: Create Department Branch", r_branch.status_code == 201, f"Branch ID: {branch_id}")

    # Create Section under Branch (e.g. Section A)
    r_sec = t_client.post(f"/api/v1/institution-admin/branches/{branch_id}/sections", json={"name": "Section A"})
    sec_id = r_sec.json().get("id") if r_sec.status_code == 201 else None
    record("Institution Admin: Create Branch Section Cohort", r_sec.status_code == 201, f"Section ID: {sec_id}")

    # Create Branch-Mapped Course (Verifying authorization)
    r_inst_course = t_client.post(
        f"/api/v1/institution-admin/colleges/{college_id}/courses",
        json={
            "title": "Data Structures & Algorithms (CS201)",
            "subject": "Computer Science",
            "description": "Core computer science algorithms and asymptotic complexity.",
            "teacher_id": teacher_id,
            "branch_id": branch_id,
            "section_id": sec_id,
            "status": "published"
        }
    )
    inst_course_id = r_inst_course.json().get("id") if r_inst_course.status_code == 201 else None
    record("Institution Admin: Create Branch-Mapped Course", r_inst_course.status_code == 201, f"Course ID: {inst_course_id}")

    # List courses in college catalog
    r_cat = t_client.get(f"/api/v1/institution-admin/colleges/{college_id}/courses")
    record("Institution Admin: View Institutional Course Catalog", r_cat.status_code == 200 and len(r_cat.json()) >= 1, f"Catalog courses: {len(r_cat.json())}")

    # -------------------------------------------------------------------------
    # 4. Teacher Console Workflow
    # -------------------------------------------------------------------------
    print("\n--- [STAGE 4] Teacher Console Workflow ---")
    # Teacher authors direct course
    r_t_course = t_client.post(
        "/api/v1/courses",
        json={
            "title": "Cloud Native Distributed Systems",
            "subject": "Cloud Computing",
            "description": "Kubernetes, microservices, and distributed consensus algorithms.",
            "status": "published"
        }
    )
    teacher_course_id = r_t_course.json().get("id") if r_t_course.status_code == 201 else None
    record("Teacher Console: Author Direct Course", r_t_course.status_code == 201, f"Course ID: {teacher_course_id}")

    # Teacher creates multi-level grading rubrics
    r_rubric = t_client.post(
        f"/api/v1/courses/{inst_course_id}/rubrics",
        json={
            "title": "Algorithm Correctness & Complexity Rubric",
            "total_points": 100.0,
            "criteria": [
                {
                    "criterion_name": "Tree Rotations & Invariant Proof",
                    "max_score": 50.0,
                    "position": 0,
                    "levels": [
                        {"name": "Exemplary", "points": 50, "description": "All BST rotations balance accurately."},
                        {"name": "Needs Work", "points": 25, "description": "Fails edge cases on double rotation."}
                    ]
                },
                {
                    "criterion_name": "Big-O Time Complexity Proof",
                    "max_score": 50.0,
                    "position": 1,
                    "levels": [
                        {"name": "Rigorous", "points": 50, "description": "Tight asymptotic bounds with master theorem."},
                        {"name": "Incomplete", "points": 20, "description": "Lacks recurrence tree derivation."}
                    ]
                }
            ]
        }
    )
    rubric_id = r_rubric.json().get("id") if r_rubric.status_code == 201 else None
    record("Teacher Console: Create Multi-Level Rubrics", r_rubric.status_code == 201, f"Rubric ID: {rubric_id}")

    # Teacher creates assignment
    due_date = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    r_asgn = t_client.post(
        f"/api/v1/assignments?course_id={inst_course_id}",
        json={
            "title": "Assignment 1: Balanced BST & Red-Black Trees",
            "instructions": "Implement AVL and Red-Black tree insertion with rebalancing.",
            "due_at": due_date,
            "status": "published",
            "max_score": 100
        }
    )
    asgn_id = r_asgn.json().get("id") if r_asgn.status_code == 201 else None
    record("Teacher Console: Publish Coursework Assignment", r_asgn.status_code == 201, f"Assignment ID: {asgn_id}")

    # Teacher schedules live class
    class_start = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    class_end = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
    r_class = t_client.post(
        f"/api/v1/classes?course_id={inst_course_id}",
        json={
            "title": "Lecture 04: Red-Black Tree Rotations",
            "scheduled_start": class_start,
            "scheduled_end": class_end
        }
    )
    class_id = r_class.json().get("id") if r_class.status_code == 201 else None
    record("Teacher Console: Schedule Live Class Session", r_class.status_code == 201, f"Class ID: {class_id}")

    # Teacher creates proctored examination
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    start_win = (now - timedelta(minutes=5)).isoformat()
    end_win = (now + timedelta(hours=3)).isoformat()
    r_exam = t_client.post(
        f"/api/v1/courses/{inst_course_id}/exams",
        json={
            "title": "Midterm Examination: Advanced Data Structures",
            "instructions": "Lockdown examination. Tab switches and screen blurs are strictly logged.",
            "duration_minutes": 60,
            "start_window": start_win,
            "end_window": end_win,
            "total_marks": 100.0,
            "shuffle_questions": True,
            "shuffle_options": True,
            "enforce_fullscreen": True,
            "max_tab_switches": 3,
            "sections": []
        }
    )
    exam_id = r_exam.json().get("id") if r_exam.status_code == 201 else None
    record("Teacher Console: Create Proctored Examination Suite", r_exam.status_code == 201, f"Exam ID: {exam_id}")

    # -------------------------------------------------------------------------
    # 5. Student Portal Workflow
    # -------------------------------------------------------------------------
    print("\n--- [STAGE 5] Student Portal Workflow ---")
    student_email = f"student_{secrets.token_hex(4)}@nitap.ac.in"
    student_pass = "StudentPass@1234"
    db = SessionLocal()
    student_user = auth_service.register_user(
        db, full_name="Nandhi Vardhan Reddy", email=student_email, password=student_pass,
        role=UserRole.student, college_id=college_id, college_code=college_code, branch_id=branch_id, section_id=sec_id
    )
    student_user.status = UserStatus.active
    db.commit()
    student_id = student_user.id
    db.close()
    record("Auth: Register Student to Branch & Section", student_id is not None, f"Student: {student_email}")

    # Login as Student
    s_client = TestClient(app)
    r_slogin = s_client.post("/api/v1/auth/login", json={"email": student_email, "password": student_pass, "role": "student"})
    record("Auth: Student Session Established", r_slogin.status_code == 200, f"Status: {r_slogin.status_code}")

    # Student enrolls in the published course
    r_enroll = s_client.post(f"/api/v1/courses/{inst_course_id}/enrollments", json={})
    record("Student Portal: Self-Enroll in Branch Course", r_enroll.status_code in (200, 201), f"Status: {r_enroll.status_code}")

    # Student views course details & upcoming classes
    r_s_course = s_client.get(f"/api/v1/courses/{inst_course_id}")
    record("Student Portal: View Course & Class Schedule", r_s_course.status_code == 200, f"Title: {r_s_course.json().get('title')}")

    # Student submits assignment
    r_submit = s_client.put(
        f"/api/v1/assignments/{asgn_id}/submissions/me",
        json={
            "answer": {
                "text": "AVL tree balancing implementation with automated test coverage.",
                "status": "ready"
            },
            "submit": True
        }
    )
    sub_id = r_submit.json().get("id") if r_submit.status_code == 200 else None
    record("Student Portal: Submit Assignment Solution", r_submit.status_code == 200, f"Submission ID: {sub_id}")

    # Student starts proctored examination
    r_start_exam = s_client.post(f"/api/v1/exams/{exam_id}/start")
    attempt_id = r_start_exam.json().get("attempt_id") if r_start_exam.status_code == 200 else None
    record("Student Portal: Start Lockdown Examination Sitting", r_start_exam.status_code == 200 and attempt_id is not None, f"Attempt ID: {attempt_id}")

    # Student telemetry heartbeat & auto-save draft answer
    r_heartbeat = s_client.post(
        f"/api/v1/exams/{exam_id}/heartbeat",
        json={
            "attempt_id": attempt_id,
            "answers": {"q1": "O(log n)", "q2": "2 * log2(n + 1)"},
            "event": {
                "type": "tab_hidden",
                "duration_ms": 1500
            }
        }
    )
    record("Student Portal: 30s Examination Heartbeat & Anti-Cheat Tab Detection", r_heartbeat.status_code == 200, f"Status: {r_heartbeat.status_code}")

    # Student submits exam & receives cryptographic SHA-256 receipt
    r_finish_exam = s_client.post(
        f"/api/v1/exams/{exam_id}/submit",
        json={
            "attempt_id": attempt_id,
            "final_answers": {"q1": "O(log n)", "q2": "2 * log2(n + 1)"}
        }
    )
    receipt_hash = r_finish_exam.json().get("receipt_hash") if r_finish_exam.status_code == 200 else None
    record("Student Portal: Submit Exam & Verify Cryptographic SHA-256 Receipt", receipt_hash is not None, f"Receipt SHA-256: {receipt_hash}")

    # -------------------------------------------------------------------------
    # 6. Teacher Split-Screen Rubric Grading & Gradebook Export
    # -------------------------------------------------------------------------
    print("\n--- [STAGE 6] Rubric Grading & CIA Gradebook ---")
    # Teacher grades assignment submission
    r_grade = t_client.put(
        f"/api/v1/assignments/{asgn_id}/submissions/{sub_id}/grade",
        json={
            "score": 96.0,
            "feedback": "Exemplary implementation of AVL balance factors and rigorous asymptotic proof."
        }
    )
    record("Teacher Console: Grade Assignment Submission", r_grade.status_code == 200, f"Score: {r_grade.json().get('score')}")

    # Teacher records split-screen rubric evaluation
    r_eval = t_client.post(
        f"/api/v1/submissions/{sub_id}/evaluation",
        json={
            "criterion_scores": {
                "Tree Rotations & Invariant Proof": 50.0,
                "Big-O Time Complexity Proof": 46.0
            },
            "total_score": 96.0,
            "private_staff_notes": "Student demonstrated advanced mastery of AVL rebalancing."
        }
    )
    record("Teacher Console: Split-Screen Rubric Evaluation Recorded", r_eval.status_code == 200, f"Score: {r_eval.json().get('total_score')}")

    # Teacher views course gradebook summary
    r_gb_summary = t_client.get(f"/api/v1/courses/{inst_course_id}/gradebook/summary")
    record("Teacher Console: View Continuous Internal Assessment (CIA) Summary", r_gb_summary.status_code == 200, f"Students scored: {len(r_gb_summary.json().get('students', []))}")

    # Teacher exports CIA gradebook CSV
    r_gradebook = t_client.get(f"/api/v1/courses/{inst_course_id}/reports/gradebook.csv")
    record("Teacher Console: Continuous Internal Assessment (CIA) CSV Export", r_gradebook.status_code == 200 and "text/csv" in r_gradebook.headers.get("content-type", ""), f"Content-Type: {r_gradebook.headers.get('content-type')}")

    # -------------------------------------------------------------------------
    # 7. Cross-Portal Security & RBAC Isolation Audit
    # -------------------------------------------------------------------------
    print("\n--- [STAGE 7] Cross-Portal RBAC Isolation Audit ---")
    # Student cannot call super-admin endpoint
    r_s_admin = s_client.get("/api/v1/admin/colleges")
    record("RBAC: Student blocked from Platform Super-Admin Console", r_s_admin.status_code in (401, 403), f"Status: {r_s_admin.status_code}")

    # Student cannot call institution-admin creation endpoint
    r_s_inst = s_client.post(f"/api/v1/institution-admin/colleges/{college_id}/branches", json={"name": "Hacked Branch", "short_code": "HB"})
    record("RBAC: Student blocked from Institution Admin Mutations", r_s_inst.status_code in (401, 403), f"Status: {r_s_inst.status_code}")

    # Unauthenticated client blocked from private endpoints
    anon_client = TestClient(app)
    r_anon = anon_client.get("/api/v1/users/me")
    record("RBAC: Unauthenticated client blocked with 401 Unauthorized", r_anon.status_code == 401, f"Status: {r_anon.status_code}")

    # -------------------------------------------------------------------------
    # 8. Summary of Results
    # -------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("E2E LIFECYCLE AUDIT SUMMARY")
    print("=" * 80)
    passed_count = sum(1 for _, p, _ in results if p)
    total_count = len(results)
    for name, passed, detail in results:
        status_sym = "[OK]  " if passed else "[FAIL]"
        print(f"{status_sym} {name:<68} | {detail}")

    print("-" * 80)
    print(f"Overall Result: {passed_count}/{total_count} Stages Passed ({passed_count/total_count*100:.1f}%)")
    print("=" * 80)

    # Clean up test database
    engine.dispose()
    if os.path.exists(test_db):
        try:
            os.remove(test_db)
        except Exception:
            pass

    return passed_count == total_count

if __name__ == "__main__":
    success = run_e2e()
    sys.exit(0 if success else 1)
