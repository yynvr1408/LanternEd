import re

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.db.models.enums import CollegeDeletionRequestStatus, CollegeRegistrationRequestStatus, CollegeStatus, UserRole, UserStatus
from app.schemas.common import UtcDatetime


class AdminLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)


class AdminOut(BaseModel):
    username: str
    display_name: str


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


class CollegeCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    location: str | None = Field(default=None, max_length=160)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=40)
    status: CollegeStatus = CollegeStatus.active
    # Optional: an admin may supply their own code; otherwise a secure one is generated.
    code: str | None = Field(default=None, max_length=32)

    @field_validator("name", "location", "contact_phone")
    @classmethod
    def _tidy(cls, v):
        return _clean(v)


class CollegeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    location: str | None = Field(default=None, max_length=160)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=40)

    @field_validator("name", "location", "contact_phone")
    @classmethod
    def _tidy(cls, v):
        return _clean(v)


class CollegeStatusChange(BaseModel):
    status: CollegeStatus


class CollegeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    location: str | None
    contact_email: str | None
    contact_phone: str | None
    code: str
    code_generated_at: UtcDatetime
    status: CollegeStatus
    created_at: UtcDatetime
    updated_at: UtcDatetime


class CollegePage(BaseModel):
    items: list[CollegeOut]
    total: int
    limit: int
    offset: int


class OverviewOut(BaseModel):
    total_colleges: int
    active_colleges: int
    inactive_colleges: int
    total_codes_generated: int  # current codes + every replaced code


class BranchCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    short_code: str | None = Field(default=None, max_length=20)

    @field_validator("name", "short_code")
    @classmethod
    def _tidy(cls, v):
        return _clean(v)


class BranchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    short_code: str | None = Field(default=None, max_length=20)

    @field_validator("name", "short_code")
    @classmethod
    def _tidy(cls, v):
        return _clean(v)


class BranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    college_id: str
    name: str
    short_code: str | None
    status: CollegeStatus


class CollegeSectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def _tidy(cls, v):
        return _clean(v)


class CollegeSectionUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def _tidy(cls, v):
        return _clean(v)


class CollegeSectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    college_id: str
    branch_id: str
    name: str
    status: CollegeStatus


class CollegeAdministratorCreate(BaseModel):
    user_id: str = Field(min_length=1)


class CollegeAdministratorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    college_id: str
    full_name: str
    email: str
    assigned_at: UtcDatetime


class PublicBranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    short_code: str | None


class PublicCollegeOut(BaseModel):
    """What an unauthenticated visitor may see: never the code or contact details."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    location: str | None


class StudentVisibleTeacherBranchOut(BaseModel):
    id: str
    name: str


class StudentVisibleTeacherSectionOut(BaseModel):
    id: str
    name: str


class StudentVisibleCourseOut(BaseModel):
    id: str
    title: str


class CollegeRegistrationRequestCreate(BaseModel):
    """Public, unauthenticated: a college registering itself, pending platform-admin approval."""

    college_name: str = Field(min_length=2, max_length=160)
    location: str | None = Field(default=None, max_length=160)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=40)
    admin_full_name: str = Field(min_length=1, max_length=255)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8, max_length=256)
    # Proves control of admin_email — see POST /auth/register/verify-otp, reused as-is.
    verification_token: str = Field(min_length=1, max_length=128)

    @field_validator("college_name", "location", "contact_phone", "admin_full_name")
    @classmethod
    def _tidy(cls, v):
        return _clean(v)


class CollegeRegistrationRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    college_name: str
    location: str | None
    contact_email: str | None
    contact_phone: str | None
    admin_full_name: str
    admin_email: str
    status: CollegeRegistrationRequestStatus
    rejected_reason: str | None
    resulting_college_id: str | None
    created_at: UtcDatetime
    decided_at: UtcDatetime | None


class DecisionReject(BaseModel):
    """Shared by college-registration-request rejection and student/teacher registration rejection."""

    reason: str | None = Field(default=None, max_length=500)



class BulkRegistrationsAction(BaseModel):
    user_ids: list[str] = Field(..., min_length=1, max_length=200)
    reason: str | None = Field(default=None, max_length=500)


class BulkActionResult(BaseModel):
    success_count: int
    user_ids: list[str]
    message: str


class AiScreenedApplicantOut(BaseModel):
    user_id: str
    full_name: str
    email: str
    role: UserRole
    branch_name: str | None = None
    section_name: str | None = None
    ai_score: int = Field(ge=0, le=100)
    ai_recommendation: str  # "approve" | "review" | "reject"
    ai_risk_level: str  # "low" | "medium" | "high"
    ai_reasons: list[str] = Field(default_factory=list)
    roster_matched: bool = False


class AiAutoApproveResult(BaseModel):
    approved_count: int
    remaining_count: int
    approved_user_ids: list[str]
    message: str


class CollegeFeaturesDict(BaseModel):
    whiteboard_enabled: bool = True
    ai_summaries_enabled: bool = True
    offline_bundles_enabled: bool = True
    low_bandwidth_default: bool = False
    whatsapp_alerts_enabled: bool = True


class CollegeSettingsOut(BaseModel):
    college_id: str
    institution_type: str = "engineering"  # "engineering" | "polytechnic" | "school" | "coaching" | "general"
    approval_mode: str = "manual_admin"  # "manual_admin" | "ai_auto_approve" | "instant_code"
    allowed_email_domains: list[str] = Field(default_factory=list)
    features: dict[str, bool] = Field(default_factory=dict)


class CollegeSettingsUpdate(BaseModel):
    institution_type: str | None = None
    approval_mode: str | None = None
    allowed_email_domains: list[str] | None = None
    features: dict[str, bool] | None = None

class PendingUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: str
    role: UserRole
    status: UserStatus
    created_at: UtcDatetime


class CollegeDeletionRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    college_id: str
    status: CollegeDeletionRequestStatus
    requested_at: UtcDatetime
    confirmed_at: UtcDatetime | None


class DeletionOtpRequest(BaseModel):
    """The confirming college administrator's own password — step 1 of the two-step confirmation."""

    password: str = Field(min_length=1, max_length=256)


class DeletionOtpVerify(BaseModel):
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class StudentVisibleTeacherOut(BaseModel):
    """A teacher a student may discover within their own college/section. Discovery only — does
    not imply enrollment or course access."""

    id: str
    full_name: str
    branch: StudentVisibleTeacherBranchOut | None
    section: StudentVisibleTeacherSectionOut | None
    all_sections: bool
    courses: list[StudentVisibleCourseOut]


class AdminRoleRequestIn(BaseModel):
    message: str | None = Field(default=None, max_length=500)


class MyAdminRoleRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    college_id: str
    message: str | None
    status: str
    rejected_reason: str | None
    created_at: UtcDatetime


class AdminRoleRequestOut(BaseModel):
    id: str
    college_id: str
    college_name: str
    user_id: str
    full_name: str
    email: str
    message: str | None
    status: str
    rejected_reason: str | None
    created_at: UtcDatetime


class RosterEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str | None
    role: UserRole
    branch_id: str | None
    section_id: str | None
    claimed_at: UtcDatetime | None
    created_at: UtcDatetime


class RosterPageOut(BaseModel):
    items: list[RosterEntryOut]
    total: int


class RosterRowErrorOut(BaseModel):
    row: int
    email: str
    error: str


class RosterImportOut(BaseModel):
    total_rows: int
    created: int
    updated: int
    dry_run: bool
    errors: list[RosterRowErrorOut]


class SubscriptionIn(BaseModel):
    plan: str = Field(max_length=20)
    status: str = Field(max_length=20)
    seats: int = Field(ge=0, le=1_000_000)
    price_per_seat_paise: int = Field(ge=0, le=100_000_000)
    current_period_end: UtcDatetime | None = None
    notes: str | None = Field(default=None, max_length=500)


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    plan: str
    status: str
    seats: int
    price_per_seat_paise: int
    current_period_end: UtcDatetime | None
    notes: str | None


class PaymentIn(BaseModel):
    amount_paise: int = Field(gt=0, le=10_000_000_000)
    method: str = Field(max_length=20)
    reference: str | None = Field(default=None, max_length=120)
    period_months: int = Field(ge=1, le=36)


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    amount_paise: int
    method: str
    reference: str | None
    period_months: int
    period_end_after: UtcDatetime
    created_at: UtcDatetime


class BillingSummaryOut(BaseModel):
    college_id: str
    subscription: SubscriptionOut | None
    active_students: int
    over_seats: int
    annual_value_paise: int
    state: str | None
    online_payments_enabled: bool = False
    payments: list[PaymentOut]


class RenewalOut(BaseModel):
    college_id: str
    college_name: str
    plan: str
    status: str
    seats: int
    current_period_end: UtcDatetime
    overdue: bool
