"""college roster entries (pre-approved emails)

Revision ID: a9c0ffee0008
Revises: 6b6b8795461f
Create Date: 2026-10-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9c0ffee0008'
down_revision: Union[str, Sequence[str], None] = '6b6b8795461f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'college_roster_entries',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('college_id', sa.String(length=36), nullable=False),
        sa.Column('email', sa.String(length=320), nullable=False),
        sa.Column('full_name', sa.String(length=160), nullable=True),
        sa.Column('role', sa.Enum('student', 'teacher', 'admin', name='userrole', native_enum=False), nullable=False),
        sa.Column('branch_id', sa.String(length=36), nullable=True),
        sa.Column('section_id', sa.String(length=36), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('claimed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['branch_id'], ['college_branches.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['college_id'], ['colleges.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['section_id'], ['college_sections.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('college_id', 'email', name='uq_roster_college_email'),
    )
    op.create_index(op.f('ix_college_roster_entries_college_id'), 'college_roster_entries', ['college_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_college_roster_entries_college_id'), table_name='college_roster_entries')
    op.drop_table('college_roster_entries')
