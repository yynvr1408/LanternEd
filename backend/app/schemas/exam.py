from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class QuestionOption(BaseModel):
    id: str
    text: str


class QuestionItemCreate(BaseModel):
    question_type: str = "mcq_single"  # mcq_single, mcq_multi, coding, numerical, subjective
    prompt: str
    options: list[dict[str, str]] = []
    correct_answer: Any = None
    code_harness: dict[str, Any] = {}
    default_marks: float = 1.0
    bloom_level: str = "Understand"
    course_outcome_tag: str | None = None
    explanation: str | None = None


class QuestionItemOut(BaseModel):
    id: str
    bank_id: str
    question_type: str
    prompt: str
    options: list[dict[str, str]]
    default_marks: float
    bloom_level: str
    course_outcome_tag: str | None
    explanation: str | None = None
    # correct_answer omitted from general student views


class QuestionItemStudentView(BaseModel):
    id: str
    question_type: str
    prompt: str
    options: list[dict[str, str]]
    default_marks: float
    code_harness: dict[str, Any] = {}


class QuestionBankCreate(BaseModel):
    title: str
    description: str | None = None


class QuestionBankOut(BaseModel):
    id: str
    course_id: str
    title: str
    description: str | None
    item_count: int
    created_at: datetime


class ExamSectionCreate(BaseModel):
    title: str
    position: int = 0
    marks_per_question: float = 1.0
    questions_to_pick: int | None = None
    question_bank_id: str | None = None


class ExamSectionOut(BaseModel):
    id: str
    title: str
    position: int
    marks_per_question: float
    questions_to_pick: int | None
    question_bank_id: str | None


class ExamCreate(BaseModel):
    title: str
    instructions: str | None = None
    duration_minutes: int = Field(default=60, ge=5, le=360)
    start_window: datetime
    end_window: datetime
    total_marks: float = 100.0
    shuffle_questions: bool = True
    shuffle_options: bool = True
    enforce_fullscreen: bool = True
    max_tab_switches: int = 3
    require_webcam_proctoring: bool = False
    require_device_lockdown: bool = False
    sections: list[ExamSectionCreate] = []


class ExamOut(BaseModel):
    id: str
    course_id: str
    title: str
    instructions: str | None
    duration_minutes: int
    start_window: datetime
    end_window: datetime
    total_marks: float
    shuffle_questions: bool
    shuffle_options: bool
    enforce_fullscreen: bool
    max_tab_switches: int
    require_webcam_proctoring: bool = False
    require_device_lockdown: bool = False
    status: str
    sections: list[ExamSectionOut]
    created_at: datetime


class ExamStartResponse(BaseModel):
    attempt_id: str
    exam_id: str
    started_at: datetime
    duration_seconds: int
    enforce_fullscreen: bool
    max_tab_switches: int
    require_webcam_proctoring: bool = False
    require_device_lockdown: bool = False
    questions: list[QuestionItemStudentView]
    existing_responses: dict[str, Any]


class HeartbeatEvent(BaseModel):
    type: str  # 'tab_hidden', 'fullscreen_exit', 'paste_attempt', 'heartbeat'
    timestamp: datetime | None = None
    duration_ms: int | None = None


class ExamHeartbeatRequest(BaseModel):
    attempt_id: str
    answers: dict[str, Any] = {}
    event: HeartbeatEvent | None = None


class ExamHeartbeatResponse(BaseModel):
    status: str
    saved_at: datetime
    remaining_seconds: int
    tab_blur_count: int
    warning: str | None = None


class ExamSubmitRequest(BaseModel):
    attempt_id: str
    final_answers: dict[str, Any] = {}


class ExamSubmitResponse(BaseModel):
    attempt_id: str
    status: str
    submitted_at: datetime
    auto_graded_score: float
    pending_manual_evaluation: bool
    receipt_hash: str


class ExamAttemptOut(BaseModel):
    id: str
    exam_id: str
    student_id: str
    student_name: str | None = None
    started_at: datetime
    submitted_at: datetime | None
    auto_graded_score: float
    manual_graded_score: float
    final_score: float | None
    status: str
    tab_blur_count: int
    is_flagged_for_review: bool


class CodeRunRequest(BaseModel):
    attempt_id: str | None = None
    question_id: str | None = None
    language: str = "python"
    source_code: str
    stdin: str = ""


class CodeTestCaseResult(BaseModel):
    name: str
    passed: bool
    stdin: str = ""
    expected_stdout: str = ""
    actual_stdout: str = ""
    stderr: str = ""
    timed_out: bool = False
    runtime_ms: int = 0


class CodeRunResponse(BaseModel):
    language: str
    compiler_available: bool
    compiled: bool
    timed_out: bool
    exit_code: int | None = None
    stdout: str = ""
    stderr: str = ""
    runtime_ms: int = 0
    test_results: list[CodeTestCaseResult] = []


class ProctorSnapshotRequest(BaseModel):
    attempt_id: str
    image_data_url: str  # Compact base64 JPEG <= 64KB
    face_detected: bool = True
    camera_status: str = "active"


class ProctorSnapshotResponse(BaseModel):
    recorded: bool
    event_id: str
    captured_at: datetime


class ProctorAttemptMonitorOut(BaseModel):
    attempt_id: str
    student_id: str
    student_name: str
    status: str
    started_at: datetime
    submitted_at: datetime | None = None
    tab_blur_count: int
    is_flagged_for_review: bool
    snapshot_count: int = 0
    latest_snapshot_url: str | None = None
    latest_event_type: str | None = None
    latest_event_at: datetime | None = None
    lockdown_active: bool = False


class ProctorFlagRequest(BaseModel):
    is_flagged: bool
    reason: str | None = None
