"""interop packages, xapi statements, and exam webcam/device proctoring

Revision ID: d9f1aabb0018
Revises: c8e0ffee0017
Create Date: 2026-11-12 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd9f1aabb0018'
down_revision: Union[str, Sequence[str], None] = 'c8e0ffee0017'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('exams', sa.Column('require_webcam_proctoring', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('exams', sa.Column('require_device_lockdown', sa.Boolean(), nullable=False, server_default='0'))

    op.create_table(
        'interop_packages',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('course_id', sa.String(length=36), nullable=False),
        sa.Column('uploaded_by', sa.String(length=36), nullable=False),
        sa.Column('standard', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('storage_prefix', sa.String(length=512), nullable=True),
        sa.Column('entry_point', sa.String(length=512), nullable=True),
        sa.Column('launch_url', sa.String(length=1024), nullable=True),
        sa.Column('manifest_json', sa.JSON(), nullable=False),
        sa.Column('checksum_sha256', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_interop_packages_course_id'), 'interop_packages', ['course_id'], unique=False)

    op.create_table(
        'xapi_statements',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('actor_id', sa.String(length=36), nullable=False),
        sa.Column('course_id', sa.String(length=36), nullable=True),
        sa.Column('verb_id', sa.String(length=255), nullable=False),
        sa.Column('verb_display', sa.String(length=120), nullable=False),
        sa.Column('object_id', sa.String(length=255), nullable=False),
        sa.Column('object_name', sa.String(length=255), nullable=False),
        sa.Column('object_type', sa.String(length=80), nullable=False, server_default='Activity'),
        sa.Column('result_json', sa.JSON(), nullable=False),
        sa.Column('context_json', sa.JSON(), nullable=False),
        sa.Column('statement_timestamp', sa.DateTime(), nullable=False),
        sa.Column('stored_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_xapi_statements_actor_id'), 'xapi_statements', ['actor_id'], unique=False)
    op.create_index(op.f('ix_xapi_statements_course_id'), 'xapi_statements', ['course_id'], unique=False)
    op.create_index(op.f('ix_xapi_statements_stored_at'), 'xapi_statements', ['stored_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_xapi_statements_stored_at'), table_name='xapi_statements')
    op.drop_index(op.f('ix_xapi_statements_course_id'), table_name='xapi_statements')
    op.drop_index(op.f('ix_xapi_statements_actor_id'), table_name='xapi_statements')
    op.drop_table('xapi_statements')

    op.drop_index(op.f('ix_interop_packages_course_id'), table_name='interop_packages')
    op.drop_table('interop_packages')

    op.drop_column('exams', 'require_device_lockdown')
    op.drop_column('exams', 'require_webcam_proctoring')
