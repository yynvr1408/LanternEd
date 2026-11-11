import hashlib
import json
import random
from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationFailedError
from app.db.base import utcnow
from app.db.models.course import Course, CourseEnrollment
from app.db.models.enums import EnrollmentStatus
from app.db.models.exam import (
    AttemptStatus,
    Exam,
    ExamAttempt,
    ExamAuditLog,
    ExamSection,
    ExamStatus,
    QuestionBank,
    QuestionItem,
    QuestionType,
)
from app.schemas.exam import (
    ExamCreate,
    ExamHeartbeatRequest,
    ExamHeartbeatResponse,
    ExamStartResponse,
    ExamSubmitRequest,
    ExamSubmitResponse,
    QuestionBankCreate,
    QuestionItemCreate,
    QuestionItemStudentView,
)


def create_question_bank(db: Session, course_id: str, creator_id: str, payload: QuestionBankCreate) -> QuestionBank:
    course = db.get(Course, course_id)
    if not course:
        raise NotFoundError("Course not found.")
    bank = QuestionBank(
        course_id=course_id,
        created_by=creator_id,
        title=payload.title,
        description=payload.description,
    )
    db.add(bank)
    db.commit()
    db.refresh(bank)
    return bank


def list_question_banks(db: Session, course_id: str) -> list[QuestionBank]:
    return db.execute(select(QuestionBank).where(QuestionBank.course_id == course_id)).scalars().all()


def add_question_item(db: Session, bank_id: str, payload: QuestionItemCreate) -> QuestionItem:
    bank = db.get(QuestionBank, bank_id)
    if not bank:
        raise NotFoundError("Question bank not found.")
    item = QuestionItem(
        bank_id=bank_id,
        question_type=QuestionType(payload.question_type),
        prompt=payload.prompt,
        options=payload.options,
        correct_answer=payload.correct_answer,
        code_harness=payload.code_harness,
        default_marks=payload.default_marks,
        bloom_level=payload.bloom_level,
        course_outcome_tag=payload.course_outcome_tag,
        explanation=payload.explanation,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def create_exam(db: Session, course_id: str, creator_id: str, payload: ExamCreate) -> Exam:
    course = db.get(Course, course_id)
    if not course:
        raise NotFoundError("Course not found.")

    exam = Exam(
        course_id=course_id,
        title=payload.title,
        instructions=payload.instructions,
        duration_minutes=payload.duration_minutes,
        start_window=payload.start_window,
        end_window=payload.end_window,
        total_marks=payload.total_marks,
        shuffle_questions=payload.shuffle_questions,
        shuffle_options=payload.shuffle_options,
        enforce_fullscreen=payload.enforce_fullscreen,
        max_tab_switches=payload.max_tab_switches,
        status=ExamStatus.published,
        created_by=creator_id,
    )
    db.add(exam)
    db.flush()

    for idx, s in enumerate(payload.sections):
        sec = ExamSection(
            exam_id=exam.id,
            title=s.title,
            position=s.position or idx,
            marks_per_question=s.marks_per_question,
            questions_to_pick=s.questions_to_pick,
            question_bank_id=s.question_bank_id,
        )
        db.add(sec)

    db.commit()
    db.refresh(exam)
    return exam


def list_course_exams(db: Session, course_id: str) -> list[Exam]:
    return db.execute(select(Exam).where(Exam.course_id == course_id)).scalars().all()


def get_exam_or_404(db: Session, exam_id: str) -> Exam:
    exam = db.get(Exam, exam_id)
    if not exam:
        raise NotFoundError("Exam not found.")
    return exam


def start_exam_attempt(
    db: Session, exam_id: str, student_id: str, client_ip: str | None = None, user_agent: str | None = None
) -> ExamStartResponse:
    exam = get_exam_or_404(db, exam_id)
    now = utcnow()

    # Check enrollment
    enrolled = db.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.course_id == exam.course_id,
            CourseEnrollment.student_id == student_id,
            CourseEnrollment.status == EnrollmentStatus.active,
        )
    ).scalar_one_or_none()
    if not enrolled:
        raise ForbiddenError("You are not enrolled in this course.")

    # Check window (with 10-minute early grace)
    if now < exam.start_window - timedelta(minutes=10):
        raise ForbiddenError("Examination has not started yet.")
    if now > exam.end_window:
        raise ForbiddenError("Examination testing window has closed.")

    # Check existing attempt
    attempt = db.execute(
        select(ExamAttempt).where(ExamAttempt.exam_id == exam_id, ExamAttempt.student_id == student_id)
    ).scalar_one_or_none()

    if attempt and attempt.status in (AttemptStatus.submitted, AttemptStatus.auto_submitted, AttemptStatus.evaluated):
        raise ConflictError("You have already submitted this examination.")

    if not attempt:
        attempt = ExamAttempt(
            exam_id=exam_id,
            student_id=student_id,
            started_at=now,
            auto_saved_at=now,
            client_ip=client_ip,
            user_agent=user_agent,
            responses={},
            status=AttemptStatus.in_progress,
        )
        db.add(attempt)
        db.commit()
        db.refresh(attempt)

    # Collect questions across sections
    questions: list[QuestionItemStudentView] = []
    for sec in exam.sections:
        if sec.question_bank_id:
            items = db.execute(
                select(QuestionItem).where(QuestionItem.bank_id == sec.question_bank_id)
            ).scalars().all()
            if sec.questions_to_pick and len(items) > sec.questions_to_pick:
                items = random.sample(items, sec.questions_to_pick)
            for it in items:
                opts = list(it.options)
                if exam.shuffle_options and it.question_type in (QuestionType.mcq_single, QuestionType.mcq_multi):
                    random.shuffle(opts)
                questions.append(
                    QuestionItemStudentView(
                        id=it.id,
                        question_type=it.question_type.value if hasattr(it.question_type, 'value') else str(it.question_type),
                        prompt=it.prompt,
                        options=opts,
                        default_marks=sec.marks_per_question or it.default_marks,
                    )
                )

    if exam.shuffle_questions:
        random.shuffle(questions)

    # Calculate remaining time
    elapsed = (now - attempt.started_at).total_seconds()
    total_allowed = exam.duration_minutes * 60
    remaining = max(0, int(total_allowed - elapsed))

    return ExamStartResponse(
        attempt_id=attempt.id,
        exam_id=exam.id,
        started_at=attempt.started_at,
        duration_seconds=remaining,
        enforce_fullscreen=exam.enforce_fullscreen,
        max_tab_switches=exam.max_tab_switches,
        questions=questions,
        existing_responses=attempt.responses or {},
    )


def _apply_security_event(
    db: Session,
    attempt: ExamAttempt,
    exam: Exam,
    *,
    event_type: str,
    timestamp: str,
    duration_ms: int | None = None,
) -> str | None:
    """Appends an ExamAuditLog row and updates tab-switch violation flags consistently."""
    log = ExamAuditLog(
        attempt_id=attempt.id,
        event_type=event_type,
        event_data={"timestamp": str(timestamp), "duration_ms": duration_ms},
    )
    db.add(log)
    if event_type in ("tab_hidden", "fullscreen_exit"):
        attempt.tab_blur_count += 1
        if attempt.tab_blur_count >= exam.max_tab_switches:
            attempt.is_flagged_for_review = True
            return f"Alert: You have reached {attempt.tab_blur_count}/{exam.max_tab_switches} security violations. Your test has been flagged for institutional review."
        return f"Warning: Security violation detected ({attempt.tab_blur_count}/{exam.max_tab_switches}). Please stay in full-screen."
    return None


def record_heartbeat(db: Session, student_id: str, payload: ExamHeartbeatRequest) -> ExamHeartbeatResponse:
    attempt = db.get(ExamAttempt, payload.attempt_id)
    if not attempt:
        raise NotFoundError("Exam attempt not found.")
    if attempt.student_id != student_id:
        raise ForbiddenError("Unauthorized attempt access.")
    if attempt.status != AttemptStatus.in_progress:
        raise ConflictError("Examination attempt is already finalized.")

    exam = db.get(Exam, attempt.exam_id)
    now = utcnow()

    # Save answers
    if payload.answers:
        merged = dict(attempt.responses or {})
        merged.update(payload.answers)
        attempt.responses = merged

    attempt.auto_saved_at = now

    warning = None
    if payload.event:
        warning = _apply_security_event(
            db,
            attempt,
            exam,
            event_type=payload.event.type,
            timestamp=str(payload.event.timestamp),
            duration_ms=payload.event.duration_ms,
        )

    db.commit()

    # Remaining seconds
    elapsed = (now - attempt.started_at).total_seconds()
    total_allowed = exam.duration_minutes * 60
    remaining = max(0, int(total_allowed - elapsed))

    return ExamHeartbeatResponse(
        status="acknowledged",
        saved_at=now,
        remaining_seconds=remaining,
        tab_blur_count=attempt.tab_blur_count,
        warning=warning,
    )


def submit_exam_attempt(
    db: Session,
    student_id: str,
    payload: ExamSubmitRequest,
    *,
    commit: bool = True,
    as_of=None,
    offline_events: list[dict] | None = None,
    enforce_grace: bool = False,
) -> ExamSubmitResponse:
    attempt = db.get(ExamAttempt, payload.attempt_id)
    if not attempt:
        raise NotFoundError("Exam attempt not found.")
    if attempt.student_id != student_id:
        raise ForbiddenError("Unauthorized attempt access.")
    if attempt.status != AttemptStatus.in_progress:
        raise ConflictError("Examination attempt is already submitted.", code="EXAM_ALREADY_SUBMITTED")

    exam = db.get(Exam, attempt.exam_id)
    now = utcnow()
    if enforce_grace:
        grace = timedelta(hours=get_settings().offline_submission_grace_hours)
        hard_deadline = max(attempt.started_at + timedelta(minutes=exam.duration_minutes), exam.end_window) + grace
        if now > hard_deadline:
            raise ConflictError("The offline grace window for submitting this exam has closed.", code="EXAM_EXPIRED")

    submitted_ts = as_of or now
    for ev in offline_events or []:
        if isinstance(ev, dict) and ev.get("type"):
            _apply_security_event(
                db,
                attempt,
                exam,
                event_type=str(ev["type"])[:50],
                timestamp=str(ev.get("timestamp") or submitted_ts.isoformat()),
                duration_ms=ev.get("duration_ms"),
            )

    final_responses = dict(attempt.responses or {})
    final_responses.update(payload.final_answers)
    attempt.responses = final_responses
    attempt.submitted_at = submitted_ts
    attempt.status = AttemptStatus.submitted

    # Auto-grading for MCQs and numerical questions
    auto_score = 0.0
    has_subjective = False

    question_ids = list(final_responses.keys())
    if question_ids:
        items = db.execute(select(QuestionItem).where(QuestionItem.id.in_(question_ids))).scalars().all()
        items_map = {it.id: it for it in items}

        for qid, student_ans in final_responses.items():
            it = items_map.get(qid)
            if not it:
                continue

            marks = it.default_marks
            qtype = it.question_type.value if hasattr(it.question_type, 'value') else str(it.question_type)

            if qtype == "mcq_single":
                correct = it.correct_answer
                if isinstance(correct, list) and len(correct) > 0:
                    correct = correct[0]
                if str(student_ans).strip() == str(correct).strip():
                    auto_score += marks
            elif qtype == "mcq_multi":
                correct = it.correct_answer if isinstance(it.correct_answer, list) else [it.correct_answer]
                ans_list = student_ans if isinstance(student_ans, list) else [student_ans]
                if set(str(x).strip() for x in ans_list) == set(str(x).strip() for x in correct):
                    auto_score += marks
            elif qtype == "numerical":
                try:
                    c_val = float(it.correct_answer.get("value", 0) if isinstance(it.correct_answer, dict) else it.correct_answer)
                    tol = float(it.correct_answer.get("tolerance", 0.01) if isinstance(it.correct_answer, dict) else 0.01)
                    s_val = float(student_ans)
                    if abs(s_val - c_val) <= tol:
                        auto_score += marks
                except (ValueError, TypeError):
                    pass
            elif qtype in ("coding", "subjective"):
                has_subjective = True

    attempt.auto_graded_score = auto_score
    if not has_subjective:
        attempt.final_score = auto_score
        attempt.status = AttemptStatus.evaluated

    # Generate receipt hash
    receipt_data = f"{attempt.id}:{student_id}:{submitted_ts.isoformat()}:{auto_score}"
    receipt_hash = hashlib.sha256(receipt_data.encode()).hexdigest()

    if commit:
        db.commit()
        db.refresh(attempt)
    else:
        db.flush()

    return ExamSubmitResponse(
        attempt_id=attempt.id,
        status=attempt.status.value if hasattr(attempt.status, 'value') else str(attempt.status),
        submitted_at=submitted_ts,
        auto_graded_score=round(auto_score, 2),
        pending_manual_evaluation=has_subjective,
        receipt_hash=receipt_hash,
    )


def list_exam_attempts(db: Session, exam_id: str) -> list[ExamAttempt]:
    return db.execute(select(ExamAttempt).where(ExamAttempt.exam_id == exam_id)).scalars().all()
