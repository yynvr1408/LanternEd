from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class GradebookConfig(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Configurable Continuous Internal Assessment (CIA) syllabus weighting rules for a course."""

    __tablename__ = "gradebook_configs"

    course_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    # Weights stored as normalized decimals summing to 1.0 (e.g. {"assignments": 0.25, "quizzes": 0.15, "midterm": 0.20, "final": 0.30, "attendance": 0.10})
    weights: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    drop_lowest_quizzes: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    passing_grade_pct: Mapped[float] = mapped_column(Float, nullable=False, default=40.0)


class CourseGradeRecord(UUIDPrimaryKeyMixin, Base):
    """Cached aggregate grade calculation for a student in a course."""

    __tablename__ = "course_grade_records"
    __table_args__ = (UniqueConstraint("course_id", "student_id", name="uq_course_grade_student"),)

    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    component_breakdown: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    cumulative_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    letter_grade: Mapped[str | None] = mapped_column(String(10), nullable=True)  # 'A+', 'A', 'B', 'C', 'RA'
    is_at_risk: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_computed_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)


class Rubric(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Multi-dimensional evaluation rubric for grading assignments and subjective questions."""

    __tablename__ = "rubrics"

    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    total_points: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)

    criteria: Mapped[list["RubricCriterion"]] = relationship(
        back_populates="rubric", cascade="all, delete-orphan", lazy="selectin"
    )


class RubricCriterion(UUIDPrimaryKeyMixin, Base):
    """A single criterion (e.g. Code Correctness, Architecture, Documentation) within a rubric."""

    __tablename__ = "rubric_criteria"

    rubric_id: Mapped[str] = mapped_column(String(36), ForeignKey("rubrics.id", ondelete="CASCADE"), nullable=False, index=True)
    criterion_name: Mapped[str] = mapped_column(String(120), nullable=False)
    max_score: Mapped[float] = mapped_column(Float, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # [{"points": 10, "label": "Exemplary", "description": "..."}, {"points": 5, "label": "Developing"}]
    levels: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    rubric: Mapped["Rubric"] = relationship(back_populates="criteria")


class EvaluationFeedback(UUIDPrimaryKeyMixin, Base):
    """Detailed split-screen evaluation feedback, criteria scoring, and teacher annotations for a submission."""

    __tablename__ = "evaluation_feedbacks"

    submission_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assignment_submissions.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    evaluator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    # Criterion score breakdown e.g. {"crit_1": 10.0, "crit_2": 8.5}
    criterion_scores: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    total_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    annotated_pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_note_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    private_staff_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_to_student: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    evaluated_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
