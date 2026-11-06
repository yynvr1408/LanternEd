"""Self-serve institution management for a delegated college administrator.

Distinct from app/api/v1/admin.py: that router is the platform admin's own, gated by a wholly
separate session/cookie (get_current_admin). This one runs on an ordinary teacher session
(get_current_user) plus one extra check — is this teacher delegated to manage this particular
college (college_service.assert_can_manage_college) — so a teacher who's been handed this
responsibility doesn't have to wait on the platform admin for routine institutional setup.
Creating a new college, or suspending/activating one, stays platform-admin-only and is
deliberately not exposed here.
"""

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.permissions import require_role
from app.db.models.enums import UserRole
from app.db.models.user import User
from app.dependencies import get_current_user, get_db
from app.schemas.admin import (
    BranchCreate,
    InstitutionCourseCreate,
    InstitutionCourseUpdate,
    InstitutionCourseOut,
    MemberProfileUpdate,
    BranchOut,
    BranchUpdate,
    CollegeDeletionRequestOut,
    CollegeOut,
    CollegeSectionCreate,
    CollegeSectionOut,
    CollegeSectionUpdate,
    CollegeStatusChange,
    CollegeUpdate,
    DecisionReject,
    DeletionOtpRequest,
    DeletionOtpVerify,
    AdminRoleRequestIn,
    BillingSummaryOut,
    MyAdminRoleRequestOut,
    PendingUserOut,
    ApproveRegistrationIn,
    BulkRegistrationsAction,
    BulkActionResult,
    AiScreenedApplicantOut,
    AiAutoApproveResult,
    CollegeSettingsOut,
    CollegeSettingsUpdate,
    RosterImportOut,
    RosterPageOut,
)
from app.services import billing_service, college_service, roster_service

router = APIRouter(prefix="/institution-admin", tags=["institution-admin"])


def _assert_can_manage_or_affiliated_teacher(db, user, college):
    if not college_service.is_college_admin(db, user.id, college.id):
        if user.role == UserRole.teacher and user.college_id == college.id:
            return
        college_service.assert_can_manage_college(db, user, college)


def _require_admin_or_teacher(user: User) -> None:
    require_role(user, UserRole.teacher, UserRole.admin)


@router.post("/my-admin-request", response_model=MyAdminRoleRequestOut, status_code=201)
def ask_to_administer_my_college(payload: AdminRoleRequestIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Any approved teacher of a college can ask to become its administrator; the platform administrator decides."""
    _require_admin_or_teacher(user)
    return college_service.request_admin_role(db, user, message=payload.message)


@router.get("/my-admin-request", response_model=MyAdminRoleRequestOut | None)
def my_admin_request(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    return college_service.get_my_admin_request(db, user)


@router.get("/colleges", response_model=list[CollegeOut])
def list_my_colleges(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The colleges this teacher is delegated to administer, or their affiliated college."""
    _require_admin_or_teacher(user)
    colleges = college_service.list_colleges_administered_by(db, user.id)
    if not colleges and user.role == UserRole.teacher and user.college_id:
        c = db.get(College, user.college_id)
        if c:
            colleges = [c]
    return colleges


@router.get("/colleges/{college_id}", response_model=CollegeOut)
def get_my_college(college_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    _assert_can_manage_or_affiliated_teacher(db, user, college)
    return college


@router.patch("/colleges/{college_id}", response_model=CollegeOut)
def update_my_college(
    college_id: str, payload: CollegeUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.update_college(db, user.id, college, fields=payload.model_dump(exclude_unset=True))


@router.post("/colleges/{college_id}/regenerate-code", response_model=CollegeOut)
def regenerate_my_college_code(college_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.regenerate_code(db, user.id, college)


@router.get("/colleges/{college_id}/branches", response_model=list[BranchOut])
def list_my_branches(
    college_id: str, search: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    _assert_can_manage_or_affiliated_teacher(db, user, college)
    return college_service.list_branches(db, college.id, active_only=False, search=search)


@router.post("/colleges/{college_id}/branches", response_model=BranchOut, status_code=201)
def create_my_branch(
    college_id: str, payload: BranchCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.create_branch(db, user.id, college, name=payload.name, short_code=payload.short_code)


@router.patch("/branches/{branch_id}", response_model=BranchOut)
def update_my_branch(
    branch_id: str, payload: BranchUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    branch = college_service.get_branch_or_404(db, branch_id)
    college = college_service.get_college_or_404(db, branch.college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.update_branch(db, user.id, branch, fields=payload.model_dump(exclude_unset=True))


@router.post("/branches/{branch_id}/status", response_model=BranchOut)
def change_my_branch_status(
    branch_id: str, payload: CollegeStatusChange, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    branch = college_service.get_branch_or_404(db, branch_id)
    college = college_service.get_college_or_404(db, branch.college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.set_branch_status(db, user.id, branch, payload.status)


@router.delete("/branches/{branch_id}", status_code=204)
def delete_my_branch(branch_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    branch = college_service.get_branch_or_404(db, branch_id)
    college = college_service.get_college_or_404(db, branch.college_id)
    college_service.assert_can_manage_college(db, user, college)
    college_service.delete_branch(db, user.id, branch)
    return None


@router.get("/branches/{branch_id}/sections", response_model=list[CollegeSectionOut])
def list_my_branch_sections(
    branch_id: str, search: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    branch = college_service.get_branch_or_404(db, branch_id)
    college = college_service.get_college_or_404(db, branch.college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.list_sections(db, branch.id, active_only=False, search=search)


@router.post("/branches/{branch_id}/sections", response_model=CollegeSectionOut, status_code=201)
def create_my_branch_section(
    branch_id: str, payload: CollegeSectionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    branch = college_service.get_branch_or_404(db, branch_id)
    college = college_service.get_college_or_404(db, branch.college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.create_section(db, user.id, branch, name=payload.name)


@router.patch("/sections/{section_id}", response_model=CollegeSectionOut)
def update_my_section(
    section_id: str, payload: CollegeSectionUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    section = college_service.get_section_or_404(db, section_id)
    college = college_service.get_college_or_404(db, section.college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.update_section(db, user.id, section, name=payload.name)


@router.post("/sections/{section_id}/status", response_model=CollegeSectionOut)
def change_my_section_status(
    section_id: str, payload: CollegeStatusChange, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    section = college_service.get_section_or_404(db, section_id)
    college = college_service.get_college_or_404(db, section.college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.set_section_status(db, user.id, section, payload.status)


@router.delete("/sections/{section_id}", status_code=204)
def delete_my_section(section_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    section = college_service.get_section_or_404(db, section_id)
    college = college_service.get_college_or_404(db, section.college_id)
    college_service.assert_can_manage_college(db, user, college)
    college_service.delete_section(db, user.id, section)
    return None


# ---- student/teacher registration review -------------------------------------------------------
# Replaces instant self-registration: a student/teacher who registers against this college now
# waits here until the delegated administrator approves or rejects them.


@router.get("/colleges/{college_id}/registrations", response_model=list[PendingUserOut])
def list_pending_registrations(college_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.list_pending_registrations(db, college_id)


@router.post("/colleges/{college_id}/registrations/{user_id}/approve", response_model=PendingUserOut)
def approve_registration(
    college_id: str,
    user_id: str,
    payload: ApproveRegistrationIn | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    branch_id = payload.branch_id if payload else None
    section_id = payload.section_id if payload else None
    all_sections = payload.all_sections if payload else False
    return college_service.approve_registration(
        db, user.id, college_id, user_id,
        branch_id=branch_id, section_id=section_id, all_sections=all_sections
    )


@router.post("/colleges/{college_id}/registrations/{user_id}/reject", response_model=PendingUserOut)
def reject_registration(
    college_id: str, user_id: str, payload: DecisionReject, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.reject_registration(db, user.id, college_id, user_id, reason=payload.reason)


@router.post("/colleges/{college_id}/registrations/bulk-approve", response_model=BulkActionResult)
def bulk_approve_registrations(
    college_id: str,
    payload: BulkRegistrationsAction,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    allocations = [a.model_dump() for a in payload.allocations] if payload.allocations else None
    approved_ids = college_service.bulk_approve_registrations(
        db, user.id, college_id, payload.user_ids, allocations=allocations
    )
    return BulkActionResult(
        success_count=len(approved_ids),
        user_ids=approved_ids,
        message=f"Successfully approved {len(approved_ids)} member registrations.",
    )


@router.post("/colleges/{college_id}/registrations/bulk-reject", response_model=BulkActionResult)
def bulk_reject_registrations(
    college_id: str, payload: BulkRegistrationsAction, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    rejected_ids = college_service.bulk_reject_registrations(db, user.id, college_id, payload.user_ids, reason=payload.reason)
    return BulkActionResult(
        success_count=len(rejected_ids),
        user_ids=rejected_ids,
        message=f"Successfully rejected {len(rejected_ids)} member registrations.",
    )


@router.get("/colleges/{college_id}/registrations/ai-screen", response_model=list[AiScreenedApplicantOut])
def ai_screen_registrations(
    college_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.ai_screen_registrations(db, college_id)


@router.post("/colleges/{college_id}/registrations/ai-auto-approve", response_model=AiAutoApproveResult)
def ai_auto_approve_registrations(
    college_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.ai_auto_approve_registrations(db, user.id, college_id)


# ---- dynamic institution settings and features --------------------------------------------------


@router.get("/colleges/{college_id}/settings", response_model=CollegeSettingsOut)
def get_institution_settings(
    college_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.get_college_settings(db, college_id)


@router.patch("/colleges/{college_id}/settings", response_model=CollegeSettingsOut)
def update_institution_settings(
    college_id: str, payload: CollegeSettingsUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.update_college_settings(
        db, user.id, college_id, payload.model_dump(exclude_unset=True)
    )


# ---- the student/teacher roster: everyone already admitted (active or suspended) ----------------


@router.get("/colleges/{college_id}/members", response_model=list[PendingUserOut])
def list_members(college_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.list_college_members(db, college_id)


@router.post("/colleges/{college_id}/members/{user_id}/suspend", response_model=PendingUserOut)
def suspend_member(college_id: str, user_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.suspend_member(db, user.id, college_id, user_id)


@router.post("/colleges/{college_id}/members/{user_id}/reactivate", response_model=PendingUserOut)
def reactivate_member(college_id: str, user_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.reactivate_member(db, user.id, college_id, user_id)


@router.post("/colleges/{college_id}/members/{user_id}/remove", response_model=PendingUserOut)
def remove_member(college_id: str, user_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.remove_member_from_college(db, user.id, college_id, user_id)


@router.patch("/colleges/{college_id}/members/{user_id}", response_model=PendingUserOut)
def update_member_profile(
    college_id: str, user_id: str, payload: MemberProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.update_member_profile(
        db, user.id, college_id, user_id,
        full_name=payload.full_name,
        email=payload.email,
        branch_id=payload.branch_id,
        section_id=payload.section_id,
        all_sections=payload.all_sections,
    )


@router.delete("/colleges/{college_id}/members/{user_id}", status_code=204)
def delete_member(
    college_id: str, user_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    college_service.remove_member_from_college(db, user.id, college_id, user_id)
    return None


# ---- institution course management -------------------------------------------------------------


@router.get("/colleges/{college_id}/courses", response_model=list[InstitutionCourseOut])
def list_my_college_courses(
    college_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    _assert_can_manage_or_affiliated_teacher(db, user, college)
    return college_service.list_college_courses(db, college.id)


@router.post("/colleges/{college_id}/courses", response_model=InstitutionCourseOut, status_code=201)
def create_my_college_course(
    college_id: str, payload: InstitutionCourseCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    _assert_can_manage_or_affiliated_teacher(db, user, college)
    return college_service.create_college_course(
        db, user.id, college.id,
        title=payload.title,
        description=payload.description,
        subject=payload.subject,
        teacher_id=payload.teacher_id,
        branch_id=payload.branch_id,
        section_id=payload.section_id,
        status=payload.status,
    )


@router.patch("/colleges/{college_id}/courses/{course_id}", response_model=InstitutionCourseOut)
def update_my_college_course(
    college_id: str, course_id: str, payload: InstitutionCourseUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    _assert_can_manage_or_affiliated_teacher(db, user, college)
    return college_service.update_college_course(
        db, user.id, college.id, course_id,
        title=payload.title,
        description=payload.description,
        subject=payload.subject,
        teacher_id=payload.teacher_id,
        branch_id=payload.branch_id,
        section_id=payload.section_id,
        status=payload.status,
    )


@router.delete("/colleges/{college_id}/courses/{course_id}", status_code=204)
def delete_my_college_course(
    college_id: str, course_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    _assert_can_manage_or_affiliated_teacher(db, user, college)
    college_service.delete_college_course(db, user.id, college.id, course_id)
    return None


# ---- college deletion: the delegated administrator's confirmation side --------------------------
# The super admin can only REQUEST deletion (POST /admin/colleges/{id}/deletion-requests); it is
# completed only here, by the college's own administrator, with their own password + an OTP
# emailed to the college's contact address.


@router.get("/colleges/{college_id}/deletion-requests", response_model=CollegeDeletionRequestOut | None)
def get_my_college_deletion_request(college_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return college_service.get_pending_deletion_request(db, college_id)


@router.post("/colleges/{college_id}/deletion-requests/{request_id}/request-otp", status_code=202)
def request_my_deletion_otp(
    college_id: str, request_id: str, payload: DeletionOtpRequest, request: Request,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    deletion_request = college_service.get_deletion_request_or_404(db, college_id, request_id)
    ip = request.client.host if request.client else None
    sent, dev_otp = college_service.request_deletion_confirmation_otp(
        db, college, deletion_request, user, password=payload.password, ip=ip
    )
    body = {"message": "A confirmation code has been sent to this college's registered contact email."}
    if dev_otp:
        body["dev_otp"] = dev_otp
    return body


@router.post("/colleges/{college_id}/deletion-requests/{request_id}/confirm", status_code=204)
def confirm_my_college_deletion(
    college_id: str, request_id: str, payload: DeletionOtpVerify, request: Request,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    deletion_request = college_service.get_deletion_request_or_404(db, college_id, request_id)
    ip = request.client.host if request.client else None
    college_service.confirm_college_deletion(db, college, deletion_request, user, otp=payload.otp, ip=ip)
    return None


@router.post("/colleges/{college_id}/deletion-requests/{request_id}/decline", response_model=CollegeDeletionRequestOut)
def decline_my_college_deletion(
    college_id: str, request_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    deletion_request = college_service.get_deletion_request_or_404(db, college_id, request_id)
    return college_service.decline_college_deletion(db, college, deletion_request, user)


# ---- roster: pre-approved emails (CSV upload) ----------------------------------------------------
# Listed people still register themselves (email code + college code); a match just skips the approval queue.


@router.post("/colleges/{college_id}/roster/import", response_model=RosterImportOut)
async def import_roster(
    college_id: str,
    file: UploadFile = File(...),
    dry_run: bool = Query(False, description="Validate and count only; change nothing."),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """CSV columns: email (required), full_name, role (student|teacher, default student), branch, section."""
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    raw = await file.read(roster_service.MAX_CSV_BYTES + 1)
    result = roster_service.import_csv(db, user.id, college, raw, dry_run=dry_run)
    return RosterImportOut(
        total_rows=result.total_rows, created=result.created, updated=result.updated, dry_run=result.dry_run,
        errors=[{"row": e.row, "email": e.email, "error": e.error} for e in result.errors],
    )


@router.get("/colleges/{college_id}/roster", response_model=RosterPageOut)
def list_roster(
    college_id: str,
    search: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    items, total = roster_service.list_entries(db, college_id, search=search, limit=limit, offset=offset)
    return RosterPageOut(items=items, total=total)


@router.delete("/colleges/{college_id}/roster/{entry_id}", status_code=204)
def delete_roster_entry(college_id: str, entry_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    roster_service.delete_entry(db, user.id, college_id, entry_id)


# ---- billing: read-only view of this college's plan, seat use and recorded payments ---------------------


class OnlineOrderRequest(BaseModel):
    period_months: int = Field(default=12, ge=1, le=36)


@router.post("/colleges/{college_id}/billing/orders", status_code=201)
def start_online_payment(
    college_id: str, payload: OnlineOrderRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Creates a Razorpay order for the amount the agreed terms imply; the browser then opens Razorpay Checkout.
    The college's subscription is extended only when Razorpay's signed webhook confirms the payment."""
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    from datetime import timedelta

    from app.services import rate_limit_service

    rate_limit_service.enforce(db, f"online-order:{user.id}", limit=10, window=timedelta(hours=1))
    return billing_service.create_online_order(db, user.id, college, period_months=payload.period_months)


@router.get("/colleges/{college_id}/billing", response_model=BillingSummaryOut)
def my_college_billing(college_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _require_admin_or_teacher(user)
    college = college_service.get_college_or_404(db, college_id)
    college_service.assert_can_manage_college(db, user, college)
    return billing_service.summary(db, college)
