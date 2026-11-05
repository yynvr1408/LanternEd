"""billing records: college subscriptions and recorded payments

Revision ID: c1e0ffee0010
Revises: b0d0ffee0009
Create Date: 2026-10-23 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1e0ffee0010'
down_revision: Union[str, Sequence[str], None] = 'b0d0ffee0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'college_subscriptions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('college_id', sa.String(length=36), nullable=False),
        sa.Column('plan', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('seats', sa.Integer(), nullable=False),
        sa.Column('price_per_seat_paise', sa.Integer(), nullable=False),
        sa.Column('current_period_end', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['college_id'], ['colleges.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('college_id'),
    )
    op.create_table(
        'billing_payments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('college_id', sa.String(length=36), nullable=False),
        sa.Column('amount_paise', sa.Integer(), nullable=False),
        sa.Column('method', sa.String(length=20), nullable=False),
        sa.Column('reference', sa.String(length=120), nullable=True),
        sa.Column('period_months', sa.Integer(), nullable=False),
        sa.Column('period_end_after', sa.DateTime(), nullable=False),
        sa.Column('recorded_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['college_id'], ['colleges.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['recorded_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_billing_payments_college_id'), 'billing_payments', ['college_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_billing_payments_college_id'), table_name='billing_payments')
    op.drop_table('billing_payments')
    op.drop_table('college_subscriptions')
