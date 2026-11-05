"""college administrator requests

Revision ID: b6d0ffee0015
Revises: a5c0ffee0014
Create Date: 2026-10-23 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b6d0ffee0015'
down_revision: Union[str, Sequence[str], None] = 'a5c0ffee0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'college_admin_requests',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('college_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('message', sa.String(length=500), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('rejected_reason', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('decided_by', sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(['college_id'], ['colleges.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['decided_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_college_admin_requests_college_id'), 'college_admin_requests', ['college_id'], unique=False)
    op.create_index(op.f('ix_college_admin_requests_user_id'), 'college_admin_requests', ['user_id'], unique=False)
    op.create_index(op.f('ix_college_admin_requests_status'), 'college_admin_requests', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_college_admin_requests_status'), table_name='college_admin_requests')
    op.drop_index(op.f('ix_college_admin_requests_user_id'), table_name='college_admin_requests')
    op.drop_index(op.f('ix_college_admin_requests_college_id'), table_name='college_admin_requests')
    op.drop_table('college_admin_requests')
