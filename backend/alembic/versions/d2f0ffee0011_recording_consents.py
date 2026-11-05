"""recording consents

Revision ID: d2f0ffee0011
Revises: c1e0ffee0010
Create Date: 2026-10-23 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2f0ffee0011'
down_revision: Union[str, Sequence[str], None] = 'c1e0ffee0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'recording_consents',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('class_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('accepted_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['class_id'], ['classes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('class_id', 'user_id', name='uq_recording_consent_class_user'),
    )
    op.create_index(op.f('ix_recording_consents_class_id'), 'recording_consents', ['class_id'], unique=False)
    op.create_index(op.f('ix_recording_consents_user_id'), 'recording_consents', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_recording_consents_user_id'), table_name='recording_consents')
    op.drop_index(op.f('ix_recording_consents_class_id'), table_name='recording_consents')
    op.drop_table('recording_consents')
