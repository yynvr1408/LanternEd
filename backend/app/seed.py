"""Bootstrap foundational system structure: `python -m app.seed` (run `alembic upgrade head` first).

Ensures only the platform administrator (configured via ADMIN_USERNAME / ADMIN_PASSWORD)
and the foundational institution structure are provisioned.
Does NOT create mock user accounts, demo teachers, or demo students.
"""

from sqlalchemy import select

from app.config import get_settings
from app.db.models.college import College, CollegeBranch
from app.db.models.enums import CollegeStatus
from app.db.session import SessionLocal
from app.services import admin_service, college_service


def seed() -> None:
    settings = get_settings()
    with SessionLocal() as db:
        # 1. Initialize configured platform administrator if credentials are provided
        if settings.admin_username and settings.admin_password:
            admin_service.bootstrap_admin(db)
            print(f"Platform admin account initialized/verified for '{settings.admin_username}'.")
        else:
            print("Notice: ADMIN_USERNAME and ADMIN_PASSWORD are not configured; platform admin bootstrap skipped.")

        # 2. Provision foundational institution structure if none exists
        existing_college = db.execute(select(College)).first()
        if existing_college is None:
            college = college_service.create_college(
                db,
                None,
                name="Foundational Institute",
                location="Main Campus",
                contact_email=None,
                contact_phone=None,
                status=CollegeStatus.active,
                code=None,
            )
            branch = college_service.create_branch(db, None, college, name="General Sciences & Engineering", short_code="GSE")
            college_service.create_section(db, None, branch, name="Section 1")
            print(f"Provisioned foundational institution: '{college.name}' (Code: {college.code})")
        else:
            print("Institution hierarchy already exists; preserving existing structure.")


if __name__ == "__main__":
    seed()
