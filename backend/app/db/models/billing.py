from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class CollegeSubscription(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """What a college has agreed to pay for. Records only; nothing here blocks or limits a college (a lapsed
    subscription is a conversation for a person, not an automatic lock-out of a classroom)."""

    __tablename__ = "college_subscriptions"

    college_id: Mapped[str] = mapped_column(String(36), ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False, unique=True)
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="pilot")  # pilot | standard | plus
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="trialing")  # trialing | active | past_due | canceled
    seats: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # enrolled students the price is based on
    price_per_seat_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # 1 rupee = 100 paise
    current_period_end: Mapped[datetime | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)


class BillingOrder(UUIDPrimaryKeyMixin, Base):
    """An online payment a college administrator started. The amount is computed on the server from the agreed terms
    and is what the webhook is checked against; the order becomes `paid` only through Razorpay's signed webhook."""

    __tablename__ = "billing_orders"

    college_id: Mapped[str] = mapped_column(String(36), ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False, index=True)
    razorpay_order_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    period_months: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created")  # created | paid
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
    paid_at: Mapped[datetime | None] = mapped_column(nullable=True)


class BillingPayment(UUIDPrimaryKeyMixin, Base):
    """A payment the platform administrator recorded (bank transfer, UPI, cheque...). Append-only."""

    __tablename__ = "billing_payments"

    college_id: Mapped[str] = mapped_column(String(36), ForeignKey("colleges.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)  # bank_transfer | upi | cheque | cash | other
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)  # bank / UPI / cheque reference
    period_months: Mapped[int] = mapped_column(Integer, nullable=False)
    period_end_after: Mapped[datetime] = mapped_column(nullable=False)  # the subscription's end date once this payment applied
    recorded_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(nullable=False, default=utcnow)
