from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.core.permissions import require_role
from app.db.models.enums import UserRole
from app.db.models.user import User
from app.schemas.exam import (
    CodeRunRequest,
    CodeRunResponse,
    ExamAttemptOut,
    ExamCreate,
    ExamHeartbeatRequest,
    ExamHeartbeatResponse,
    ExamOut,
    ExamStartResponse,
    ExamSubmitRequest,
    ExamSubmitResponse,
    ProctorAttemptMonitorOut,
    ProctorFlagRequest,
    ProctorSnapshotRequest,
    ProctorSnapshotResponse,
    QuestionBankCreate,
    QuestionBankOut,
    QuestionItemCreate,
    QuestionItemOut,
)
from app.services import exam_service

router = APIRouter(tags=["exams"])


@router.get("/courses/{course_id}/exams", response_model=list[ExamOut])
def list_exams(
    course_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exams = exam_service.list_course_exams(db, course_id)
    return [
        ExamOut(
            id=e.id,
            course_id=e.course_id,
            title=e.title,
            instructions=e.instructions,
            duration_minutes=e.duration_minutes,
            start_window=e.start_window,
            end_window=e.end_window,
            total_marks=e.total_marks,
            shuffle_questions=e.shuffle_questions,
            shuffle_options=e.shuffle_options,
            enforce_fullscreen=e.enforce_fullscreen,
            max_tab_switches=e.max_tab_switches,
            require_webcam_proctoring=bool(getattr(e, "require_webcam_proctoring", False)),
            require_device_lockdown=bool(getattr(e, "require_device_lockdown", False)),
            status=e.status.value if hasattr(e.status, "value") else str(e.status),
            sections=[
                {
                    "id": s.id,
                    "title": s.title,
                    "position": s.position,
                    "marks_per_question": s.marks_per_question,
                    "questions_to_pick": s.questions_to_pick,
                    "question_bank_id": s.question_bank_id,
                }
                for s in e.sections
            ],
            created_at=e.created_at,
        )
        for e in exams
    ]


@router.post("/courses/{course_id}/exams", response_model=ExamOut, status_code=201)
def create_exam(
    course_id: str,
    payload: ExamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    e = exam_service.create_exam(db, course_id, current_user.id, payload)
    return ExamOut(
        id=e.id,
        course_id=e.course_id,
        title=e.title,
        instructions=e.instructions,
        duration_minutes=e.duration_minutes,
        start_window=e.start_window,
        end_window=e.end_window,
        total_marks=e.total_marks,
        shuffle_questions=e.shuffle_questions,
        shuffle_options=e.shuffle_options,
        enforce_fullscreen=e.enforce_fullscreen,
        max_tab_switches=e.max_tab_switches,
        require_webcam_proctoring=bool(getattr(e, "require_webcam_proctoring", False)),
        require_device_lockdown=bool(getattr(e, "require_device_lockdown", False)),
        status=e.status.value if hasattr(e.status, "value") else str(e.status),
        sections=[
            {
                "id": s.id,
                "title": s.title,
                "position": s.position,
                "marks_per_question": s.marks_per_question,
                "questions_to_pick": s.questions_to_pick,
                "question_bank_id": s.question_bank_id,
            }
            for s in e.sections
        ],
        created_at=e.created_at,
    )


@router.post("/exams/{exam_id}/start", response_model=ExamStartResponse)
def start_exam(
    exam_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return exam_service.start_exam_attempt(db, exam_id, current_user.id, client_ip, user_agent)


@router.post("/exams/{exam_id}/heartbeat", response_model=ExamHeartbeatResponse)
def exam_heartbeat(
    exam_id: str,
    payload: ExamHeartbeatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return exam_service.record_heartbeat(db, current_user.id, payload)


@router.post("/exams/{exam_id}/submit", response_model=ExamSubmitResponse)
def submit_exam(
    exam_id: str,
    payload: ExamSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return exam_service.submit_exam_attempt(db, current_user.id, payload)


@router.get("/exams/{exam_id}/attempts", response_model=list[ExamAttemptOut])
def list_attempts(
    exam_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    attempts = exam_service.list_exam_attempts(db, exam_id)
    return [
        ExamAttemptOut(
            id=a.id,
            exam_id=a.exam_id,
            student_id=a.student_id,
            started_at=a.started_at,
            submitted_at=a.submitted_at,
            auto_graded_score=a.auto_graded_score,
            manual_graded_score=a.manual_graded_score,
            final_score=a.final_score,
            status=a.status.value if hasattr(a.status, "value") else str(a.status),
            tab_blur_count=a.tab_blur_count,
            is_flagged_for_review=a.is_flagged_for_review,
        )
        for a in attempts
    ]


@router.get("/courses/{course_id}/question-banks", response_model=list[QuestionBankOut])
def list_question_banks(
    course_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    banks = exam_service.list_question_banks(db, course_id)
    return [
        QuestionBankOut(
            id=b.id,
            course_id=b.course_id,
            title=b.title,
            description=b.description,
            item_count=len(b.items),
            created_at=b.created_at,
        )
        for b in banks
    ]


@router.post("/courses/{course_id}/question-banks", response_model=QuestionBankOut, status_code=201)
def create_question_bank(
    course_id: str,
    payload: QuestionBankCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    b = exam_service.create_question_bank(db, course_id, current_user.id, payload)
    return QuestionBankOut(
        id=b.id,
        course_id=b.course_id,
        title=b.title,
        description=b.description,
        item_count=0,
        created_at=b.created_at,
    )


@router.post("/question-banks/{bank_id}/items", response_model=QuestionItemOut, status_code=201)
def add_question(
    bank_id: str,
    payload: QuestionItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    it = exam_service.add_question_item(db, bank_id, payload)
    return QuestionItemOut(
        id=it.id,
        bank_id=it.bank_id,
        question_type=it.question_type.value if hasattr(it.question_type, "value") else str(it.question_type),
        prompt=it.prompt,
        options=it.options,
        default_marks=it.default_marks,
        bloom_level=it.bloom_level,
        course_outcome_tag=it.course_outcome_tag,
        explanation=it.explanation,
    )


@router.post("/exams/{exam_id}/run-code", response_model=CodeRunResponse)
def run_code_sandbox(
    exam_id: str,
    payload: CodeRunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return exam_service.run_code_for_exam(db, current_user.id, exam_id, payload)


@router.post("/exams/{exam_id}/proctor-snapshot", response_model=ProctorSnapshotResponse)
def upload_proctor_snapshot(
    exam_id: str,
    payload: ProctorSnapshotRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return exam_service.record_proctor_snapshot(db, current_user.id, exam_id, payload)


@router.get("/exams/{exam_id}/proctor-monitor", response_model=list[ProctorAttemptMonitorOut])
def proctor_monitor(
    exam_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_role(current_user, UserRole.teacher)
    return exam_service.get_proctor_monitor(db, exam_id)


@router.post("/exams/{exam_id}/attempts/{attempt_id}/flag", response_model=ProctorAttemptMonitorOut)
def update_attempt_flag(
    exam_id: str,
    attempt_id: str,
    payload: ProctorFlagRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_role(current_user, UserRole.teacher)
    return exam_service.set_attempt_flag(db, exam_id, attempt_id, payload)
