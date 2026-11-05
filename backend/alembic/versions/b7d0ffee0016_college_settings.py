"""college settings

Revision ID: b7d0ffee0016
Revises: b6d0ffee0015
Create Date: 2026-11-05 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7d0ffee0016'
down_revision: Union[str, Sequence[str], None] = 'b6d0ffee0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'college_settings',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('college_id', sa.String(length=36), nullable=False),
        sa.Column('institution_type', sa.String(length=50), nullable=False),
        sa.Column('approval_mode', sa.String(length=50), nullable=False),
        sa.Column('allowed_email_domains_json', sa.String(length=1000), nullable=False),
        sa.Column('features_json', sa.String(length=2000), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['college_id'], ['colleges.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_college_settings_college_id'), 'college_settings', ['college_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_college_settings_college_id'), table_name='college_settings')
    op.drop_table('college_settings')
