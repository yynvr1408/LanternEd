from datetime import datetime
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.db.base import utcnow
from app.db.models.assignment import Assignment, AssignmentSubmission
from app.db.models.classroom import Class, ClassParticipant
from app.db.models.course import Course, CourseEnrollment
from app.db.models.enums import EnrollmentStatus
from app.db.models.exam import AttemptStatus, Exam, ExamAttempt
from app.db.models.gradebook import CourseGradeRecord, EvaluationFeedback, GradebookConfig, Rubric, RubricCriterion
from app.db.models.user import User
from app.schemas.gradebook import (
    CourseGradebookSummaryOut,
    EvaluationFeedbackCreate,
    GradebookConfigIn,
    RubricCreate,
    StudentGradeSummary,
)

DEFAULT_WEIGHTS = {
    "assignments": 0.30,
    "quizzes": 0.20,
    "midterms": 0.20,
    "finals": 0.20,
    "attendance": 0.10,
}


def get_or_create_gradebook_config(db: Session, course_id: str) -> GradebookConfig:
    cfg = db.execute(select(GradebookConfig).where(GradebookConfig.course_id == course_id)).scalar_one_or_none()
    if not cfg:
        cfg = GradebookConfig(
            course_id=course_id,
            weights=DEFAULT_WEIGHTS,
            drop_lowest_quizzes=1,
            passing_grade_pct=40.0,
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def update_gradebook_config(db: Session, course_id: str, payload: GradebookConfigIn) -> GradebookConfig:
    cfg = get_or_create_gradebook_config(db, course_id)
    # Validate weights sum
    total = sum(payload.weights.values())
    if abs(total - 1.0) > 0.05 and abs(total - 100.0) > 1.0:
        raise ValidationError("Gradebook weights must sum to 100% (or 1.0).")

    normalized = {}
    for k, v in payload.weights.items():
        normalized[k] = round(v / total, 4) if total > 1.5 else round(v, 4)

    cfg.weights = normalized
    cfg.drop_lowest_quizzes = payload.drop_lowest_quizzes
    cfg.passing_grade_pct = payload.passing_grade_pct
    cfg.updated_at = utcnow()
    db.commit()
    db.refresh(cfg)
    return cfg


def _letter_grade(score: float, pass_threshold: float) -> str:
    if score >= 90:
        return "A+"
    if score >= 80:
        return "A"
    if score >= 70:
        return "B"
    if score >= 60:
        return "C"
    if score >= pass_threshold:
        return "D"
    return "RA"


def compute_course_gradebook_summary(db: Session, course_id: str) -> CourseGradebookSummaryOut:
    course = db.get(Course, course_id)
    if not course:
        raise NotFoundError("Course not found.")

    cfg = get_or_create_gradebook_config(db, course_id)
    weights = cfg.weights

    # Get all active enrolled students
    enrollments = db.execute(
        select(CourseEnrollment)
        .where(CourseEnrollment.course_id == course_id, CourseEnrollment.status == EnrollmentStatus.active)
    ).scalars().all()

    student_ids = [e.student_id for e in enrollments]
    users_by_id = {u.id: u for u in db.execute(select(User).where(User.id.in_(student_ids))).scalars().all()} if student_ids else {}

    # Get course assignments
    assignments = db.execute(select(Assignment).where(Assignment.course_id == course_id)).scalars().all()
    asg_ids = [a.id for a in assignments]
    asg_max_score = {a.id: a.max_score for a in assignments}

    submissions_by_student: dict[str, list[AssignmentSubmission]] = {}
    if asg_ids and student_ids:
        subs = db.execute(
            select(AssignmentSubmission).where(
                AssignmentSubmission.assignment_id.in_(asg_ids),
                AssignmentSubmission.student_id.in_(student_ids),
            )
        ).scalars().all()
        for s in subs:
            submissions_by_student.setdefault(s.student_id, []).append(s)

    # Get course attendance
    classes = db.execute(select(Class).where(Class.course_id == course_id)).scalars().all()
    class_ids = [c.id for c in classes]
    total_classes = len(class_ids)

    participants_by_student: dict[str, int] = {}
    if class_ids and student_ids:
        part_counts = db.execute(
            select(ClassParticipant.user_id, func.count(ClassParticipant.id))
            .where(ClassParticipant.class_id.in_(class_ids), ClassParticipant.user_id.in_(student_ids))
            .group_by(ClassParticipant.user_id)
        ).all()
        for uid, count in part_counts:
            participants_by_student[uid] = count

    # Get exam attempts
    exams = db.execute(select(Exam).where(Exam.course_id == course_id)).scalars().all()
    exam_ids = [e.id for e in exams]
    exam_max_marks = {e.id: e.total_marks for e in exams}

    attempts_by_student: dict[str, list[ExamAttempt]] = {}
    if exam_ids and student_ids:
        att_list = db.execute(
            select(ExamAttempt).where(
                ExamAttempt.exam_id.in_(exam_ids),
                ExamAttempt.student_id.in_(student_ids),
                ExamAttempt.status.in_([AttemptStatus.submitted, AttemptStatus.auto_submitted, AttemptStatus.evaluated]),
            )
        ).scalars().all()
        for att in att_list:
            attempts_by_student.setdefault(att.student_id, []).append(att)

    # Compute per student
    students_summary: list[StudentGradeSummary] = []
    at_risk_count = 0
    total_cumulative = 0.0

    for sid in student_ids:
        user = users_by_id.get(sid)
        name = user.full_name if user else "Student"
        email = user.email if user else ""

        # Attendance %
        attended = participants_by_student.get(sid, 0)
        attendance_pct = round((attended / total_classes * 100.0), 1) if total_classes > 0 else 100.0

        # Assignments avg %
        user_subs = submissions_by_student.get(sid, [])
        asg_pct_list = []
        for sub in user_subs:
            max_s = asg_max_score.get(sub.assignment_id, 100) or 100
            score = sub.score if sub.score is not None else 0.0
            asg_pct_list.append((score / max_s) * 100.0)
        asg_avg = sum(asg_pct_list) / len(asg_pct_list) if asg_pct_list else 0.0

        # Exams avg %
        user_atts = attempts_by_student.get(sid, [])
        exam_pct_list = []
        for att in user_atts:
            max_m = exam_max_marks.get(att.exam_id, 100.0) or 100.0
            score = (att.final_score if att.final_score is not None else (att.auto_graded_score + att.manual_graded_score))
            exam_pct_list.append((score / max_m) * 100.0)
        exam_avg = sum(exam_pct_list) / len(exam_pct_list) if exam_pct_list else 0.0

        # Weighted calculation
        asg_w = weights.get("assignments", 0.30)
        quiz_w = weights.get("quizzes", 0.20)
        mid_w = weights.get("midterms", 0.20)
        fin_w = weights.get("finals", 0.20)
        att_w = weights.get("attendance", 0.10)

        cumulative = round(
            (asg_avg * asg_w)
            + (exam_avg * (quiz_w + mid_w + fin_w))
            + (attendance_pct * att_w),
            1,
        )

        is_at_risk = cumulative < cfg.passing_grade_pct or attendance_pct < 75.0
        if is_at_risk:
            at_risk_count += 1
        total_cumulative += cumulative

        letter = _letter_grade(cumulative, cfg.passing_grade_pct)

        students_summary.append(
            StudentGradeSummary(
                student_id=sid,
                student_name=name,
                student_email=email,
                attendance_pct=attendance_pct,
                assignments_score=round(asg_avg, 1),
                quizzes_score=round(exam_avg, 1),
                midterms_score=round(exam_avg, 1),
                finals_score=round(exam_avg, 1),
                cumulative_score=cumulative,
                letter_grade=letter,
                is_at_risk=is_at_risk,
            )
        )

    class_avg = round(total_cumulative / len(student_ids), 1) if student_ids else 0.0

    return CourseGradebookSummaryOut(
        course_id=course_id,
        course_title=course.title,
        weights=weights,
        roster_size=len(student_ids),
        at_risk_count=at_risk_count,
        class_average_pct=class_avg,
        students=students_summary,
    )


def create_rubric(db: Session, course_id: str, payload: RubricCreate) -> Rubric:
    course = db.get(Course, course_id)
    if not course:
        raise NotFoundError("Course not found.")

    rubric = Rubric(course_id=course_id, title=payload.title, total_points=payload.total_points)
    db.add(rubric)
    db.flush()

    for idx, c in enumerate(payload.criteria):
        crit = RubricCriterion(
            rubric_id=rubric.id,
            criterion_name=c.criterion_name,
            max_score=c.max_score,
            position=c.position or idx,
            levels=c.levels,
        )
        db.add(crit)

    db.commit()
    db.refresh(rubric)
    return rubric


def list_rubrics(db: Session, course_id: str) -> list[Rubric]:
    return db.execute(select(Rubric).where(Rubric.course_id == course_id)).scalars().all()


def record_evaluation_feedback(
    db: Session, evaluator_id: str, submission_id: str, payload: EvaluationFeedbackCreate
) -> EvaluationFeedback:
    sub = db.get(AssignmentSubmission, submission_id)
    if not sub:
        raise NotFoundError("Submission not found.")

    feedback = db.execute(
        select(EvaluationFeedback).where(EvaluationFeedback.submission_id == submission_id)
    ).scalar_one_or_none()

    if not feedback:
        feedback = EvaluationFeedback(
            submission_id=submission_id,
            evaluator_id=evaluator_id,
            criterion_scores=payload.criterion_scores,
            total_score=payload.total_score,
            annotated_pdf_url=payload.annotated_pdf_url,
            audio_note_url=payload.audio_note_url,
            private_staff_notes=payload.private_staff_notes,
            published_to_student=payload.published_to_student,
        )
        db.add(feedback)
    else:
        feedback.evaluator_id = evaluator_id
        feedback.criterion_scores = payload.criterion_scores
        feedback.total_score = payload.total_score
        feedback.annotated_pdf_url = payload.annotated_pdf_url
        feedback.audio_note_url = payload.audio_note_url
        feedback.private_staff_notes = payload.private_staff_notes
        feedback.published_to_student = payload.published_to_student
        feedback.evaluated_at = utcnow()

    # Synchronize score with parent submission
    sub.score = payload.total_score
    sub.graded_at = utcnow()
    sub.graded_by = evaluator_id
    db.commit()
    db.refresh(feedback)
    return feedback
