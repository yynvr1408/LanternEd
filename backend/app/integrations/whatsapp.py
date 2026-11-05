"""WhatsApp Cloud API (https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages).

A message the business starts must use a template Meta has approved; this sends one generic template with two
variables (a short title and a detail line). Returns an error CODE instead of raising so the worker can decide whether
to retry. The phone number is personal data: it is never logged, only the HTTP status is.
"""

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

API_URL = "https://graph.facebook.com/v20.0/{phone_number_id}/messages"
# Statuses that will not get better by retrying (bad number, template not approved, policy).
PERMANENT_STATUSES = {400, 401, 403, 404}


def send_template(*, to_phone: str, title: str, detail: str) -> tuple[bool, str | None]:
    """Returns (sent, error_code). error_code is "retry" for a temporary failure, or a short permanent reason."""
    if not settings.whatsapp_configured:
        return False, "not_configured"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone.lstrip("+"),
        "type": "template",
        "template": {
            "name": settings.whatsapp_template_name,
            "language": {"code": settings.whatsapp_template_language},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": title[:100]}, {"type": "text", "text": (detail or "Open LanternEd for details.")[:200]}]}
            ],
        },
    }
    try:
        response = httpx.post(
            API_URL.format(phone_number_id=settings.whatsapp_phone_number_id),
            headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
            json=payload,
            timeout=15.0,
        )
    except httpx.HTTPError:
        logger.warning("WhatsApp unreachable")
        return False, "retry"
    if response.status_code < 300:
        return True, None
    logger.warning("WhatsApp rejected a message (status=%s)", response.status_code)
    return False, f"http_{response.status_code}" if response.status_code in PERMANENT_STATUSES else "retry"
