from datetime import datetime
import enum

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class QuestionType(str, enum.Enum):
    mcq_single = "mcq_single"
    mcq_multi = "mcq_multi"
    coding = "coding"
    numerical = "numerical"
    subjective = "subjective"


class ExamStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    in_progress = "in_progress"
    closed = "closed"
    archived = "archived"


class AttemptStatus(str, enum.Enum):
    in_progress = "in_progress"
    submitted = "submitted"
    auto_submitted = "auto_submitted"
    evaluated = "evaluated"


class QuestionBank(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Institutional question bank grouped by subject / course."""

    __tablename__ = "question_banks"

    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    items: Mapped[list["QuestionItem"]] = relationship(
        back_populates="bank", cascade="all, delete-orphan", lazy="selectin"
    )


class QuestionItem(UUIDPrimaryKeyMixin, Base):
    """Individual question within a question bank."""

    __tablename__ = "question_items"

    bank_id: Mapped[str] = mapped_column(String(36), ForeignKey("question_banks.id", ondelete="CASCADE"), nullable=False, index=True)
    question_type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType, native_enum=False), nullable=False, default=QuestionType.mcq_single
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    # [{"id": "opt_a", "text": "Option A"}, {"id": "opt_b", "text": "Option B"}]
    options: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # ["opt_a"] or {"value": 42.0, "tolerance": 0.05} or {"expected_output": "Hello World"}
    correct_answer: Mapped[dict | list | str] = mapped_column(JSON, nullable=False, default=dict)
    # For CS coding questions: {"language": "python", "starter_code": "def solve():", "test_cases": [...]}
    code_harness: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    default_marks: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    bloom_level: Mapped[str] = mapped_column(String(50), nullable=False, default="Understand")
    course_outcome_tag: Mapped[str | None] = mapped_column(String(50), nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)

    bank: Mapped["QuestionBank"] = relationship(back_populates="items")


class Exam(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Timed, proctored examination or quiz."""

    __tablename__ = "exams"

    course_id: Mapped[str] = mapped_column(String(36), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    start_window: Mapped[datetime] = mapped_column(nullable=False)
    end_window: Mapped[datetime] = mapped_column(nullable=False)
    total_marks: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    shuffle_options: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    enforce_fullscreen: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_tab_switches: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    status: Mapped[ExamStatus] = mapped_column(
        Enum(ExamStatus, native_enum=False), nullable=False, default=ExamStatus.draft
    )
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    sections: Mapped[list["ExamSection"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan", lazy="selectin"
    )


class ExamSection(UUIDPrimaryKeyMixin, Base):
    """Section within an exam (e.g. Part A: MCQs, Part B: Coding Sandbox)."""

    __tablename__ = "exam_sections"

    exam_id: Mapped[str] = mapped_column(String(36), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    marks_per_question: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    questions_to_pick: Mapped[int | None] = mapped_column(Integer, nullable=True)
    question_bank_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("question_banks.id", ondelete="SET NULL"), nullable=True
    )

    exam: Mapped["Exam"] = relationship(back_populates="sections")


class ExamAttempt(UUIDPrimaryKeyMixin, Base):
    """A student's sitting for a proctored examination."""

    __tablename__ = "exam_attempts"
    __table_args__ = (UniqueConstraint("exam_id", "student_id", name="uq_exam_attempt_student"),)

    exam_id: Mapped[str] = mapped_column(String(36), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    auto_saved_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Answers JSON: {"q_101": "opt_a", "q_102": "def solve()..."}
    responses: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    auto_graded_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    manual_graded_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    final_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[AttemptStatus] = mapped_column(
        Enum(AttemptStatus, native_enum=False), nullable=False, default=AttemptStatus.in_progress
    )
    tab_blur_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_flagged_for_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ExamAuditLog(UUIDPrimaryKeyMixin, Base):
    """Proctoring telemetry and security audit log (fullscreen exit, tab switches, copy-paste events)."""

    __tablename__ = "exam_audit_logs"

    attempt_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exam_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 'tab_hidden', 'fullscreen_exit', 'heartbeat', 'paste'
    event_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
