"""Razorpay (https://razorpay.com/docs/api/orders/): server-side order creation and webhook verification.

The browser only ever receives an order id and the PUBLIC key id to open Razorpay Checkout. Whether a payment
happened is decided solely by Razorpay's signed webhook (HMAC-SHA256 of the raw body with the webhook secret);
nothing the browser reports is trusted. The secret key never leaves the server and is never logged.
"""

import hashlib
import hmac
import logging

import httpx

from app.config import get_settings
from app.core.exceptions import ServiceUnavailableError

logger = logging.getLogger(__name__)
settings = get_settings()

ORDERS_URL = "https://api.razorpay.com/v1/orders"


def create_order(*, amount_paise: int, receipt: str, notes: dict[str, str]) -> dict:
    """Creates an INR order and returns Razorpay's order object (id, amount, currency, ...)."""
    if not settings.razorpay_configured:
        raise ServiceUnavailableError("Online payments are not set up.", code="PAYMENTS_NOT_CONFIGURED")
    try:
        response = httpx.post(
            ORDERS_URL,
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            json={"amount": amount_paise, "currency": "INR", "receipt": receipt[:40], "notes": notes},
            timeout=15.0,
        )
    except httpx.HTTPError:
        logger.exception("Could not reach Razorpay.")
        raise ServiceUnavailableError("The payment service is unreachable. Try again shortly.", code="PAYMENTS_UNREACHABLE") from None
    if response.status_code >= 400:
        logger.error("Razorpay rejected an order (status=%s).", response.status_code)  # never the body
        raise ServiceUnavailableError("The payment service refused the request.", code="PAYMENTS_REFUSED")
    return response.json()


def verify_webhook_signature(body: bytes, signature: str | None) -> bool:
    secret = settings.razorpay_webhook_secret
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip())
