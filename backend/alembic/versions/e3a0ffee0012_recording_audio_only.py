"""recording audio_only flag

Revision ID: e3a0ffee0012
Revises: d2f0ffee0011
Create Date: 2026-10-23 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3a0ffee0012'
down_revision: Union[str, Sequence[str], None] = 'd2f0ffee0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('class_recordings') as batch_op:
        batch_op.add_column(sa.Column('audio_only', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table('class_recordings') as batch_op:
        batch_op.drop_column('audio_only')
