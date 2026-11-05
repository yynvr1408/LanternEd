from datetime import datetime
from pydantic import BaseModel, Field


class GradebookConfigIn(BaseModel):
    # e.g. {"assignments": 0.25, "quizzes": 0.15, "midterm": 0.20, "final": 0.30, "attendance": 0.10}
    weights: dict[str, float]
    drop_lowest_quizzes: int = Field(default=1, ge=0, le=10)
    passing_grade_pct: float = Field(default=40.0, ge=0.0, le=100.0)


class GradebookConfigOut(BaseModel):
    id: str
    course_id: str
    weights: dict[str, float]
    drop_lowest_quizzes: int
    passing_grade_pct: float
    updated_at: datetime


class StudentGradeSummary(BaseModel):
    student_id: str
    student_name: str
    student_email: str
    attendance_pct: float
    assignments_score: float
    quizzes_score: float
    midterms_score: float
    finals_score: float
    cumulative_score: float
    letter_grade: str
    is_at_risk: bool


class CourseGradebookSummaryOut(BaseModel):
    course_id: str
    course_title: str
    weights: dict[str, float]
    roster_size: int
    at_risk_count: int
    class_average_pct: float
    students: list[StudentGradeSummary]


class RubricCriterionIn(BaseModel):
    criterion_name: str
    max_score: float
    position: int = 0
    levels: list[dict] = []  # [{"points": 10, "label": "Exemplary", "description": "..."}]


class RubricCriterionOut(BaseModel):
    id: str
    criterion_name: str
    max_score: float
    position: int
    levels: list[dict]


class RubricCreate(BaseModel):
    title: str
    total_points: float = 100.0
    criteria: list[RubricCriterionIn] = []


class RubricOut(BaseModel):
    id: str
    course_id: str
    title: str
    total_points: float
    criteria: list[RubricCriterionOut]
    created_at: datetime


class EvaluationFeedbackCreate(BaseModel):
    criterion_scores: dict[str, float]  # {"crit_1": 10.0, "crit_2": 8.5}
    total_score: float
    annotated_pdf_url: str | None = None
    audio_note_url: str | None = None
    private_staff_notes: str | None = None
    published_to_student: bool = True


class EvaluationFeedbackOut(BaseModel):
    id: str
    submission_id: str
    evaluator_id: str
    criterion_scores: dict[str, float]
    total_score: float
    annotated_pdf_url: str | None
    audio_note_url: str | None
    private_staff_notes: str | None
    published_to_student: bool
    evaluated_at: datetime
