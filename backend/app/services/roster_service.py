"""College rosters: pre-approved emails a college administrator uploads (CSV) so that students and
teachers on the list skip the manual approval queue when they register.

A roster entry never creates an account or a password. The person still registers themselves and proves
their email with the one-time code and the college code; a match only changes the account's starting
status from `pending` to `active`.
"""

import csv
import io
from dataclasses import dataclass, field

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationFailedError
from app.db.base import utcnow
from app.db.models.college import College, CollegeBranch, CollegeSection
from app.db.models.enums import UserRole
from app.db.models.roster import CollegeRosterEntry
from app.services import audit_service
from app.services.college_service import _key

MAX_CSV_BYTES = 1_000_000
MAX_ROWS = 5000
ALLOWED_ROLES = {"student": UserRole.student, "teacher": UserRole.teacher}
_HEADER_ALIASES = {"name": "full_name", "fullname": "full_name", "full name": "full_name", "student": "full_name"}


@dataclass
class RowError:
    row: int  # 1-based data row (the header is row 0)
    email: str
    error: str


@dataclass
class ImportResult:
    total_rows: int = 0
    created: int = 0
    updated: int = 0
    dry_run: bool = False
    errors: list[RowError] = field(default_factory=list)


def _normalize_header(name: str) -> str:
    key = " ".join((name or "").replace("﻿", "").strip().lower().replace("_", " ").split())
    return _HEADER_ALIASES.get(key, key.replace(" ", "_"))


def _parse_csv(raw: bytes) -> list[dict[str, str]]:
    if len(raw) > MAX_CSV_BYTES:
        raise ValidationFailedError(f"The file is larger than {MAX_CSV_BYTES // 1_000_000} MB.", code="ROSTER_TOO_LARGE")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValidationFailedError("The file must be a UTF-8 CSV (in Excel: Save As > CSV UTF-8).", code="ROSTER_BAD_ENCODING") from None
    sample = text[:4096]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    try:
        header = next(reader)
    except StopIteration:
        raise ValidationFailedError("The file is empty.", code="ROSTER_EMPTY") from None
    columns = [_normalize_header(h) for h in header]
    if "email" not in columns:
        raise ValidationFailedError("The first row must have an 'email' column.", code="ROSTER_NO_EMAIL_COLUMN")
    rows: list[dict[str, str]] = []
    for values in reader:
        if not any(v.strip() for v in values):
            continue  # blank line
        rows.append({columns[i]: values[i].strip() for i in range(min(len(columns), len(values)))})
        if len(rows) > MAX_ROWS:
            raise ValidationFailedError(f"At most {MAX_ROWS} rows can be imported at once; split the file.", code="ROSTER_TOO_MANY_ROWS")
    return rows


def import_csv(db: Session, actor_id: str, college: College, raw: bytes, *, dry_run: bool = False) -> ImportResult:
    rows = _parse_csv(raw)
    result = ImportResult(total_rows=len(rows), dry_run=dry_run)

    branches = {_key(b.name): b for b in db.execute(select(CollegeBranch).where(CollegeBranch.college_id == college.id)).scalars()}
    sections: dict[tuple[str, str], CollegeSection] = {}
    for s in db.execute(select(CollegeSection).where(CollegeSection.college_id == college.id)).scalars():
        sections[(s.branch_id, _key(s.name))] = s
    existing = {
        e.email: e for e in db.execute(select(CollegeRosterEntry).where(CollegeRosterEntry.college_id == college.id)).scalars()
    }
    seen: set[str] = set()

    for index, row in enumerate(rows, start=1):
        email_raw = row.get("email", "")
        try:
            email = validate_email(email_raw, check_deliverability=False).normalized.lower()
        except EmailNotValidError:
            result.errors.append(RowError(index, email_raw[:100], "Not a valid email address."))
            continue
        if email in seen:
            result.errors.append(RowError(index, email, "Duplicate of an earlier row in this file."))
            continue
        seen.add(email)

        role_text = (row.get("role") or "student").strip().lower()
        role = ALLOWED_ROLES.get(role_text)
        if role is None:
            result.errors.append(RowError(index, email, "Role must be 'student' or 'teacher'."))
            continue

        branch = section = None
        branch_name, section_name = row.get("branch", ""), row.get("section", "")
        if branch_name:
            branch = branches.get(_key(branch_name))
            if branch is None:
                result.errors.append(RowError(index, email, f"Unknown branch '{branch_name[:60]}'. Create it first."))
                continue
        if section_name and _key(section_name) not in {"all", "all sections"}:
            if branch is None:
                result.errors.append(RowError(index, email, "A section needs a branch column too."))
                continue
            section = sections.get((branch.id, _key(section_name)))
            if section is None:
                result.errors.append(RowError(index, email, f"Unknown section '{section_name[:60]}' in that branch."))
                continue

        full_name = (row.get("full_name") or "").strip()[:160] or None
        entry = existing.get(email)
        if entry is None:
            result.created += 1
            if not dry_run:
                db.add(CollegeRosterEntry(
                    college_id=college.id, email=email, full_name=full_name, role=role,
                    branch_id=branch.id if branch else None, section_id=section.id if section else None, created_by=actor_id,
                ))
        else:
            result.updated += 1
            if not dry_run:
                entry.full_name, entry.role = full_name, role
                entry.branch_id, entry.section_id = (branch.id if branch else None), (section.id if section else None)

    if not dry_run and (result.created or result.updated):
        db.commit()
        audit_service.record(db, actor_id=actor_id, action="roster_imported", resource_type="college", resource_id=college.id)
    return result


def list_entries(db: Session, college_id: str, *, search: str | None, limit: int, offset: int) -> tuple[list[CollegeRosterEntry], int]:
    stmt = select(CollegeRosterEntry).where(CollegeRosterEntry.college_id == college_id)
    if search:
        stmt = stmt.where(CollegeRosterEntry.email.contains(search.strip().lower()))
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(stmt.order_by(CollegeRosterEntry.email).limit(limit).offset(offset)).scalars().all()
    return list(rows), total


def delete_entry(db: Session, actor_id: str, college_id: str, entry_id: str) -> None:
    entry = db.get(CollegeRosterEntry, entry_id)
    if entry is None or entry.college_id != college_id:
        raise NotFoundError("Roster entry not found.")
    db.delete(entry)
    db.commit()
    audit_service.record(db, actor_id=actor_id, action="roster_entry_removed", resource_type="college", resource_id=college_id)


def find_match(
    db: Session, *, college_id: str, email: str, role: UserRole, branch_id: str | None, section_id: str | None
) -> CollegeRosterEntry | None:
    """The unclaimed entry that pre-approves this registration, if any. A roster that names a branch or
    section only approves a registration into that same branch/section."""
    entry = db.execute(
        select(CollegeRosterEntry).where(
            CollegeRosterEntry.college_id == college_id,
            CollegeRosterEntry.email == email.strip().lower(),
            CollegeRosterEntry.claimed_at.is_(None),
        )
    ).scalar_one_or_none()
    if entry is None or entry.role != role:
        return None
    if entry.branch_id and entry.branch_id != branch_id:
        return None
    if entry.section_id and entry.section_id != section_id:
        return None
    return entry


def mark_claimed(db: Session, entry: CollegeRosterEntry) -> None:
    entry.claimed_at = utcnow()
    db.commit()
