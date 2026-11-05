from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.db.models.user import User
from app.schemas.gradebook import (
    CourseGradebookSummaryOut,
    EvaluationFeedbackCreate,
    EvaluationFeedbackOut,
    GradebookConfigIn,
    GradebookConfigOut,
    RubricCreate,
    RubricOut,
    StudentGradeSummary,
)
from app.services import gradebook_service

router = APIRouter(tags=["gradebook"])


@router.get("/courses/{course_id}/gradebook/config", response_model=GradebookConfigOut)
def get_gradebook_config(
    course_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    cfg = gradebook_service.get_or_create_gradebook_config(db, course_id)
    return GradebookConfigOut(
        id=cfg.id,
        course_id=cfg.course_id,
        weights=cfg.weights,
        drop_lowest_quizzes=cfg.drop_lowest_quizzes,
        passing_grade_pct=cfg.passing_grade_pct,
        updated_at=cfg.updated_at,
    )


@router.put("/courses/{course_id}/gradebook/config", response_model=GradebookConfigOut)
def update_gradebook_config(
    course_id: str,
    payload: GradebookConfigIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cfg = gradebook_service.update_gradebook_config(db, course_id, payload)
    return GradebookConfigOut(
        id=cfg.id,
        course_id=cfg.course_id,
        weights=cfg.weights,
        drop_lowest_quizzes=cfg.drop_lowest_quizzes,
        passing_grade_pct=cfg.passing_grade_pct,
        updated_at=cfg.updated_at,
    )


@router.get("/courses/{course_id}/gradebook/summary", response_model=CourseGradebookSummaryOut)
def get_gradebook_summary(
    course_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return gradebook_service.compute_course_gradebook_summary(db, course_id)


@router.get("/courses/{course_id}/gradebook/my-grade", response_model=StudentGradeSummary)
def get_my_grade(
    course_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    summary = gradebook_service.compute_course_gradebook_summary(db, course_id)
    for s in summary.students:
        if s.student_id == current_user.id:
            return s
    # Default clean fallback if student has no activity yet
    return StudentGradeSummary(
        student_id=current_user.id,
        student_name=current_user.full_name,
        student_email=current_user.email,
        attendance_pct=100.0,
        assignments_score=0.0,
        quizzes_score=0.0,
        midterms_score=0.0,
        finals_score=0.0,
        cumulative_score=0.0,
        letter_grade="RA",
        is_at_risk=False,
    )


@router.get("/courses/{course_id}/rubrics", response_model=list[RubricOut])
def list_course_rubrics(
    course_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rubrics = gradebook_service.list_rubrics(db, course_id)
    return [
        RubricOut(
            id=r.id,
            course_id=r.course_id,
            title=r.title,
            total_points=r.total_points,
            criteria=[
                {
                    "id": c.id,
                    "criterion_name": c.criterion_name,
                    "max_score": c.max_score,
                    "position": c.position,
                    "levels": c.levels,
                }
                for c in r.criteria
            ],
            created_at=r.created_at,
        )
        for r in rubrics
    ]


@router.post("/courses/{course_id}/rubrics", response_model=RubricOut, status_code=201)
def create_course_rubric(
    course_id: str,
    payload: RubricCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    r = gradebook_service.create_rubric(db, course_id, payload)
    return RubricOut(
        id=r.id,
        course_id=r.course_id,
        title=r.title,
        total_points=r.total_points,
        criteria=[
            {
                "id": c.id,
                "criterion_name": c.criterion_name,
                "max_score": c.max_score,
                "position": c.position,
                "levels": c.levels,
            }
            for c in r.criteria
        ],
        created_at=r.created_at,
    )


@router.post("/submissions/{submission_id}/evaluation", response_model=EvaluationFeedbackOut)
def record_evaluation(
    submission_id: str,
    payload: EvaluationFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fb = gradebook_service.record_evaluation_feedback(db, current_user.id, submission_id, payload)
    return EvaluationFeedbackOut(
        id=fb.id,
        submission_id=fb.submission_id,
        evaluator_id=fb.evaluator_id,
        criterion_scores=fb.criterion_scores,
        total_score=fb.total_score,
        annotated_pdf_url=fb.annotated_pdf_url,
        audio_note_url=fb.audio_note_url,
        private_staff_notes=fb.private_staff_notes,
        published_to_student=fb.published_to_student,
        evaluated_at=fb.evaluated_at,
    )
