"""academic gradebook and exams

Revision ID: c8e0ffee0017
Revises: b7d0ffee0016
Create Date: 2026-11-06 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8e0ffee0017'
down_revision: Union[str, Sequence[str], None] = 'b7d0ffee0016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Gradebook Configs
    op.create_table(
        'gradebook_configs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('course_id', sa.String(length=36), nullable=False),
        sa.Column('weights', sa.JSON(), nullable=False),
        sa.Column('drop_lowest_quizzes', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('passing_grade_pct', sa.Float(), nullable=False, server_default='40.0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id', name='uq_gradebook_config_course'),
    )
    op.create_index(op.f('ix_gradebook_configs_course_id'), 'gradebook_configs', ['course_id'], unique=True)

    # 2. Course Grade Records
    op.create_table(
        'course_grade_records',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('course_id', sa.String(length=36), nullable=False),
        sa.Column('student_id', sa.String(length=36), nullable=False),
        sa.Column('component_breakdown', sa.JSON(), nullable=False),
        sa.Column('cumulative_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('letter_grade', sa.String(length=10), nullable=True),
        sa.Column('is_at_risk', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('last_computed_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id', 'student_id', name='uq_course_grade_student'),
    )
    op.create_index(op.f('ix_course_grade_records_course_id'), 'course_grade_records', ['course_id'])
    op.create_index(op.f('ix_course_grade_records_student_id'), 'course_grade_records', ['student_id'])

    # 3. Rubrics
    op.create_table(
        'rubrics',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('course_id', sa.String(length=36), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('total_points', sa.Float(), nullable=False, server_default='100.0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_rubrics_course_id'), 'rubrics', ['course_id'])

    # 4. Rubric Criteria
    op.create_table(
        'rubric_criteria',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('rubric_id', sa.String(length=36), nullable=False),
        sa.Column('criterion_name', sa.String(length=120), nullable=False),
        sa.Column('max_score', sa.Float(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('levels', sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(['rubric_id'], ['rubrics.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_rubric_criteria_rubric_id'), 'rubric_criteria', ['rubric_id'])

    # 5. Evaluation Feedbacks
    op.create_table(
        'evaluation_feedbacks',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('submission_id', sa.String(length=36), nullable=False),
        sa.Column('evaluator_id', sa.String(length=36), nullable=False),
        sa.Column('criterion_scores', sa.JSON(), nullable=False),
        sa.Column('total_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('annotated_pdf_url', sa.Text(), nullable=True),
        sa.Column('audio_note_url', sa.String(length=500), nullable=True),
        sa.Column('private_staff_notes', sa.Text(), nullable=True),
        sa.Column('published_to_student', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('evaluated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['evaluator_id'], ['users.id']),
        sa.ForeignKeyConstraint(['submission_id'], ['assignment_submissions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('submission_id', name='uq_eval_feedback_submission'),
    )
    op.create_index(op.f('ix_evaluation_feedbacks_submission_id'), 'evaluation_feedbacks', ['submission_id'])

    # 6. Question Banks
    op.create_table(
        'question_banks',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('course_id', sa.String(length=36), nullable=False),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_question_banks_course_id'), 'question_banks', ['course_id'])

    # 7. Question Items
    op.create_table(
        'question_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('bank_id', sa.String(length=36), nullable=False),
        sa.Column('question_type', sa.String(length=50), nullable=False, server_default='mcq_single'),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('options', sa.JSON(), nullable=False),
        sa.Column('correct_answer', sa.JSON(), nullable=False),
        sa.Column('code_harness', sa.JSON(), nullable=False),
        sa.Column('default_marks', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('bloom_level', sa.String(length=50), nullable=False, server_default='Understand'),
        sa.Column('course_outcome_tag', sa.String(length=50), nullable=True),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['bank_id'], ['question_banks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_question_items_bank_id'), 'question_items', ['bank_id'])

    # 8. Exams
    op.create_table(
        'exams',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('course_id', sa.String(length=36), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('start_window', sa.DateTime(), nullable=False),
        sa.Column('end_window', sa.DateTime(), nullable=False),
        sa.Column('total_marks', sa.Float(), nullable=False, server_default='100.0'),
        sa.Column('shuffle_questions', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('shuffle_options', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('enforce_fullscreen', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('max_tab_switches', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='draft'),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_exams_course_id'), 'exams', ['course_id'])

    # 9. Exam Sections
    op.create_table(
        'exam_sections',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('exam_id', sa.String(length=36), nullable=False),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('marks_per_question', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('questions_to_pick', sa.Integer(), nullable=True),
        sa.Column('question_bank_id', sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(['exam_id'], ['exams.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['question_bank_id'], ['question_banks.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_exam_sections_exam_id'), 'exam_sections', ['exam_id'])

    # 10. Exam Attempts
    op.create_table(
        'exam_attempts',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('exam_id', sa.String(length=36), nullable=False),
        sa.Column('student_id', sa.String(length=36), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('auto_saved_at', sa.DateTime(), nullable=False),
        sa.Column('client_ip', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('responses', sa.JSON(), nullable=False),
        sa.Column('auto_graded_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('manual_graded_score', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('final_score', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='in_progress'),
        sa.Column('tab_blur_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_flagged_for_review', sa.Boolean(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['exam_id'], ['exams.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('exam_id', 'student_id', name='uq_exam_attempt_student'),
    )
    op.create_index(op.f('ix_exam_attempts_exam_id'), 'exam_attempts', ['exam_id'])
    op.create_index(op.f('ix_exam_attempts_student_id'), 'exam_attempts', ['student_id'])

    # 11. Exam Audit Logs
    op.create_table(
        'exam_audit_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('attempt_id', sa.String(length=36), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('event_data', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['attempt_id'], ['exam_attempts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_exam_audit_logs_attempt_id'), 'exam_audit_logs', ['attempt_id'])


def downgrade() -> None:
    op.drop_table('exam_audit_logs')
    op.drop_table('exam_attempts')
    op.drop_table('exam_sections')
    op.drop_table('exams')
    op.drop_table('question_items')
    op.drop_table('question_banks')
    op.drop_table('evaluation_feedbacks')
    op.drop_table('rubric_criteria')
    op.drop_table('rubrics')
    op.drop_table('course_grade_records')
    op.drop_table('gradebook_configs')
