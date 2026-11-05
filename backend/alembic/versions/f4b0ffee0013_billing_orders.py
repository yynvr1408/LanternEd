"""online payment orders

Revision ID: f4b0ffee0013
Revises: e3a0ffee0012
Create Date: 2026-10-23 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f4b0ffee0013'
down_revision: Union[str, Sequence[str], None] = 'e3a0ffee0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'billing_orders',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('college_id', sa.String(length=36), nullable=False),
        sa.Column('razorpay_order_id', sa.String(length=64), nullable=False),
        sa.Column('razorpay_payment_id', sa.String(length=64), nullable=True),
        sa.Column('amount_paise', sa.Integer(), nullable=False),
        sa.Column('period_months', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['college_id'], ['colleges.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('razorpay_order_id'),
        sa.UniqueConstraint('razorpay_payment_id'),
    )
    op.create_index(op.f('ix_billing_orders_college_id'), 'billing_orders', ['college_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_billing_orders_college_id'), table_name='billing_orders')
    op.drop_table('billing_orders')
