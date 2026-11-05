"""Database cleanup utility: cleans out all mock student, teacher, class, and assignment records.

Usage:
    cd backend
    python scripts/cleanup_test_data.py [--dry-run] [--force]

Preserves:
    - Platform administrator account (User.role == UserRole.admin)
    - Foundational institution hierarchy (Colleges, Branches, Sections, Settings, Code History)
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, func, inspect, select  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.db.models.enums import UserRole  # noqa: E402
from app.db.models.user import User, UserSession, PasswordResetToken  # noqa: E402
from app.db.models.college import (  # noqa: E402
    College,
    CollegeBranch,
    CollegeSection,
    UserCollegeSection,
    UserBranchAssignment,
    CollegeRegistrationRequest,
)
from app.db.models.course import Course, CourseEnrollment, CourseTeacher  # noqa: E402
from app.db.models.section import Section, SectionMember  # noqa: E402
from app.db.models.assignment import (  # noqa: E402
    Assignment,
    AssignmentSubmission,
    SubmissionAttachment,
    SubmissionRevision,
)
from app.db.models.classroom import (  # noqa: E402
    Class,
    ClassParticipant,
    ClassRecording,
    ClassSection,
    RecordingProgress,
    RecordingSection,
)
from app.db.models.lesson import Lesson, LearningResource, ResourceSection  # noqa: E402
from app.db.models.summary import LectureSummary, LectureTranscript  # noqa: E402
from app.db.models.notification import Notification, NotificationDelivery  # noqa: E402
from app.db.models.consent import RecordingConsent  # noqa: E402
from app.db.models.admin_request import CollegeAdminRequest  # noqa: E402


def cleanup(dry_run: bool = False, force: bool = False) -> None:
    with SessionLocal() as db:
        inspector = inspect(db.get_bind())
        if not inspector.has_table("users"):
            print("Notice: Database tables not found. Please run 'alembic upgrade head' first to initialize the schema.")
            return

        # Check platform admin
        admin_count = db.execute(select(func.count(User.id)).where(User.role == UserRole.admin)).scalar() or 0
        college_count = db.execute(select(func.count(College.id))).scalar() or 0
        branch_count = db.execute(select(func.count(CollegeBranch.id))).scalar() or 0
        section_count = db.execute(select(func.count(CollegeSection.id))).scalar() or 0

        # Check records to be deleted
        non_admin_users = db.execute(select(func.count(User.id)).where(User.role != UserRole.admin)).scalar() or 0
        courses = db.execute(select(func.count(Course.id))).scalar() or 0
        assignments = db.execute(select(func.count(Assignment.id))).scalar() or 0
        submissions = db.execute(select(func.count(AssignmentSubmission.id))).scalar() or 0
        classes = db.execute(select(func.count(Class.id))).scalar() or 0

        print("=" * 60)
        print("LanternEd Test Data Cleanup Utility")
        print("=" * 60)
        print(f"Institutions preserved:      {college_count} colleges, {branch_count} branches, {section_count} sections")
        print(f"Platform admins preserved:   {admin_count}")
        print("-" * 60)
        print("Records targeted for cleanup:")
        print(f"  - Non-admin users (students/teachers): {non_admin_users}")
        print(f"  - Courses / Cohorts:                   {courses}")
        print(f"  - Assignments:                         {assignments}")
        print(f"  - Assignment Submissions:              {submissions}")
        print(f"  - Classes / Live Sessions:             {classes}")
        print("=" * 60)

        if dry_run:
            print("[DRY RUN] No changes were made to the database.")
            return

        if non_admin_users == 0 and courses == 0 and assignments == 0:
            print("Database is already clean. Nothing to delete.")
            return

        if not force:
            confirm = input("Are you sure you want to permanently delete these test records? [y/N]: ")
            if confirm.lower() not in ("y", "yes"):
                print("Aborted by user.")
                return

        # Execute cleanup in safe foreign-key order
        # 1. Assignment submission files & revisions
        db.execute(delete(SubmissionAttachment))
        db.execute(delete(SubmissionRevision))
        db.execute(delete(AssignmentSubmission))
        db.execute(delete(Assignment))

        # 2. Classroom & recordings
        db.execute(delete(RecordingProgress))
        db.execute(delete(RecordingSection))
        db.execute(delete(ClassRecording))
        db.execute(delete(ClassParticipant))
        db.execute(delete(ClassSection))
        db.execute(delete(Class))

        # 3. Summaries & transcripts
        db.execute(delete(LectureSummary))
        db.execute(delete(LectureTranscript))

        # 4. Lessons & resources
        db.execute(delete(ResourceSection))
        db.execute(delete(LearningResource))
        db.execute(delete(Lesson))

        # 5. Sections & members
        db.execute(delete(SectionMember))
        db.execute(delete(Section))

        # 6. Courses & enrollments
        db.execute(delete(CourseEnrollment))
        db.execute(delete(CourseTeacher))
        db.execute(delete(Course))

        # 7. User notifications, consents, sessions & linkages
        db.execute(delete(RecordingConsent))
        db.execute(delete(NotificationDelivery))
        db.execute(delete(Notification))
        db.execute(delete(UserCollegeSection))
        db.execute(delete(UserBranchAssignment))
        db.execute(delete(CollegeAdminRequest))
        db.execute(delete(CollegeRegistrationRequest))

        # Delete non-admin sessions and reset tokens
        non_admin_subquery = select(User.id).where(User.role != UserRole.admin)
        db.execute(delete(UserSession).where(UserSession.user_id.in_(non_admin_subquery)))
        db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id.in_(non_admin_subquery)))

        # 8. Finally delete all non-admin users (students, teachers, etc.)
        deleted_users = db.execute(delete(User).where(User.role != UserRole.admin)).rowcount

        db.commit()
        print(f"Successfully cleaned database: deleted {deleted_users} mock user accounts and all related class/assignment records.")
        print(f"Preserved {admin_count} platform admin(s) and full institution hierarchy.")


def main():
    parser = argparse.ArgumentParser(description="Clean up test data and mock accounts from the LanternEd database.")
    parser.add_argument("--dry-run", action="store_true", help="Report what would be deleted without executing.")
    parser.add_argument("--force", "-y", action="store_true", help="Execute cleanup without interactive confirmation.")
    args = parser.parse_args()

    cleanup(dry_run=args.dry_run, force=args.force)


if __name__ == "__main__":
    main()
