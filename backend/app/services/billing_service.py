"""Subscription records and manually recorded payments for colleges. Money moves outside the app (bank
transfer, UPI, cheque); the platform administrator records it here so renewals and seat usage are visible."""

import calendar
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, ValidationFailedError
from app.db.base import utcnow
from app.db.models.billing import BillingOrder, BillingPayment, CollegeSubscription
from app.db.models.college import College
from app.db.models.enums import UserRole, UserStatus
from app.db.models.user import User
from app.integrations import razorpay
from app.services import audit_service

PLANS = {"pilot", "standard", "plus"}
STATUSES = {"trialing", "active", "past_due", "canceled"}
METHODS = {"bank_transfer", "upi", "cheque", "cash", "other"}


def add_months(moment: datetime, months: int) -> datetime:
    month_index = moment.month - 1 + months
    year, month = moment.year + month_index // 12, month_index % 12 + 1
    return moment.replace(year=year, month=month, day=min(moment.day, calendar.monthrange(year, month)[1]))


def get_subscription(db: Session, college_id: str) -> CollegeSubscription | None:
    return db.execute(select(CollegeSubscription).where(CollegeSubscription.college_id == college_id)).scalar_one_or_none()


def active_students(db: Session, college_id: str) -> int:
    return db.execute(
        select(func.count(User.id)).where(User.college_id == college_id, User.role == UserRole.student, User.status == UserStatus.active)
    ).scalar_one()


def upsert_subscription(
    db: Session, admin_id: str, college: College, *, plan: str, status: str, seats: int, price_per_seat_paise: int,
    current_period_end: datetime | None, notes: str | None,
) -> CollegeSubscription:
    if plan not in PLANS:
        raise ValidationFailedError(f"Plan must be one of {sorted(PLANS)}.", code="INVALID_PLAN")
    if status not in STATUSES:
        raise ValidationFailedError(f"Status must be one of {sorted(STATUSES)}.", code="INVALID_STATUS")
    sub = get_subscription(db, college.id)
    if sub is None:
        sub = CollegeSubscription(college_id=college.id)
        db.add(sub)
    sub.plan, sub.status, sub.seats = plan, status, seats
    sub.price_per_seat_paise, sub.current_period_end, sub.notes = price_per_seat_paise, current_period_end, (notes or "").strip() or None
    db.commit()
    db.refresh(sub)
    audit_service.record(db, actor_id=admin_id, action="subscription_updated", resource_type="college", resource_id=college.id)
    return sub


def record_payment(
    db: Session, admin_id: str | None, college: College, *, amount_paise: int, method: str, reference: str | None, period_months: int
) -> BillingPayment:
    """Applies a received payment: extends the subscription from the later of today and its current end, and
    makes it active. Needs an existing subscription so the amount is always tied to agreed terms."""
    # "razorpay" is only ever set by the verified webhook (admin_id None), never by a person recording a payment
    if method not in (METHODS if admin_id is not None else METHODS | {"razorpay"}):
        raise ValidationFailedError(f"Method must be one of {sorted(METHODS)}.", code="INVALID_METHOD")
    sub = get_subscription(db, college.id)
    if sub is None:
        raise ConflictError("Set up the college's subscription before recording a payment.", code="NO_SUBSCRIPTION")
    start = max(utcnow(), sub.current_period_end or utcnow())
    new_end = add_months(start, period_months)
    sub.current_period_end, sub.status = new_end, "active"
    payment = BillingPayment(
        college_id=college.id, amount_paise=amount_paise, method=method, reference=(reference or "").strip() or None,
        period_months=period_months, period_end_after=new_end, recorded_by=admin_id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    audit_service.record(db, actor_id=admin_id, action="payment_recorded", resource_type="college", resource_id=college.id)
    return payment


def order_amount_paise(sub: CollegeSubscription, period_months: int) -> int:
    """What the college owes for `period_months`: its agreed annual value, pro-rated by months."""
    return round(sub.seats * sub.price_per_seat_paise * period_months / 12)


def create_online_order(db: Session, user_id: str, college: College, *, period_months: int) -> dict:
    """Starts an online payment for the amount the agreed terms imply. The client never names the amount."""
    from app.config import get_settings

    if not get_settings().razorpay_configured:
        raise ConflictError("Online payment is not available for this installation.", code="PAYMENTS_NOT_CONFIGURED")
    if period_months < 1 or period_months > 36:
        raise ValidationFailedError("Choose between 1 and 36 months.", code="INVALID_PERIOD")
    sub = get_subscription(db, college.id)
    if sub is None or sub.status == "canceled":
        raise ConflictError("This college has no active subscription to pay for. Contact LanternED.", code="NO_SUBSCRIPTION")
    amount = order_amount_paise(sub, period_months)
    if amount < 100:  # Razorpay's minimum is 100 paise (Rs 1)
        raise ConflictError("No amount is due under the agreed terms. Contact LanternED.", code="NOTHING_DUE")
    order = razorpay.create_order(
        amount_paise=amount, receipt=f"col-{college.id[:8]}-{int(utcnow().timestamp())}",
        notes={"college_id": college.id, "period_months": str(period_months)},
    )
    db.add(BillingOrder(
        college_id=college.id, razorpay_order_id=order["id"], amount_paise=amount, period_months=period_months, created_by=user_id,
    ))
    db.commit()
    audit_service.record(db, actor_id=user_id, action="online_payment_started", resource_type="college", resource_id=college.id)
    return {"order_id": order["id"], "amount_paise": amount, "currency": "INR", "key_id": get_settings().razorpay_key_id}


def apply_razorpay_event(db: Session, event: dict) -> str:
    """Applies a VERIFIED Razorpay webhook event. Idempotent. Returns a short outcome for logging."""
    if event.get("event") not in {"payment.captured", "order.paid"}:
        return "ignored_event"
    payment = (event.get("payload", {}).get("payment") or {}).get("entity") or {}
    order_entity = (event.get("payload", {}).get("order") or {}).get("entity") or {}
    order_id = payment.get("order_id") or order_entity.get("id")
    payment_id = payment.get("id")
    order = db.execute(select(BillingOrder).where(BillingOrder.razorpay_order_id == order_id)).scalar_one_or_none() if order_id else None
    if order is None:
        return "unknown_order"
    if order.status == "paid":
        return "already_applied"
    amount = payment.get("amount", order_entity.get("amount_paid"))
    if amount != order.amount_paise or payment.get("currency", "INR") != "INR":
        return "amount_mismatch"  # never credit a different amount than the one we asked for
    college = db.get(College, order.college_id)
    if college is None or not payment_id:
        return "invalid"
    if db.execute(select(BillingOrder.id).where(BillingOrder.razorpay_payment_id == payment_id)).first():
        return "already_applied"
    record_payment(db, None, college, amount_paise=order.amount_paise, method="razorpay", reference=payment_id, period_months=order.period_months)
    order = db.get(BillingOrder, order.id)
    order.status, order.razorpay_payment_id, order.paid_at = "paid", payment_id, utcnow()
    db.commit()
    return "applied"


def list_payments(db: Session, college_id: str) -> list[BillingPayment]:
    return list(db.execute(select(BillingPayment).where(BillingPayment.college_id == college_id).order_by(BillingPayment.created_at.desc())).scalars())


def razorpay_enabled() -> bool:
    from app.config import get_settings

    return get_settings().razorpay_configured


def summary(db: Session, college: College) -> dict:
    sub = get_subscription(db, college.id)
    students = active_students(db, college.id)
    now = utcnow()
    state = None
    if sub is not None:
        end = sub.current_period_end
        state = "canceled" if sub.status == "canceled" else "expired" if end is not None and end < now else sub.status
    return {
        "college_id": college.id,
        "subscription": sub,
        "active_students": students,
        "over_seats": max(0, students - sub.seats) if sub and sub.seats else 0,
        "annual_value_paise": sub.seats * sub.price_per_seat_paise if sub else 0,
        "state": state,
        "online_payments_enabled": razorpay_enabled(),
        "payments": list_payments(db, college.id),
    }


def renewals(db: Session, *, within_days: int) -> list[dict]:
    """Subscriptions that end within `within_days` (or already have), soonest first: who to call this week."""
    horizon = utcnow() + timedelta(days=within_days)
    rows = db.execute(
        select(CollegeSubscription, College)
        .join(College, College.id == CollegeSubscription.college_id)
        .where(CollegeSubscription.status != "canceled", CollegeSubscription.current_period_end.is_not(None), CollegeSubscription.current_period_end <= horizon)
        .order_by(CollegeSubscription.current_period_end)
    ).all()
    return [
        {"college_id": c.id, "college_name": c.name, "plan": s.plan, "status": s.status, "seats": s.seats,
         "current_period_end": s.current_period_end, "overdue": s.current_period_end < utcnow()}
        for s, c in rows
    ]
