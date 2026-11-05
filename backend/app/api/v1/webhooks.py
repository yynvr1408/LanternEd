import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.dependencies import get_db
import json

from app.integrations import livekit, razorpay
from app.services import billing_service, recording_service, summary_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)


@router.post("/livekit")
async def livekit_webhook(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """LiveKit -> us. Authenticated by LiveKit's signed JWT (not by a user session); an
    unsigned or tampered call is rejected before any state changes."""
    body = (await request.body()).decode("utf-8")
    try:
        event = livekit.verify_webhook(body, request.headers.get("authorization"))
    except ValueError:
        logger.warning("rejected LiveKit webhook with an invalid signature")
        return JSONResponse(status_code=401, content={"error": {"code": "INVALID_WEBHOOK_SIGNATURE", "message": "Invalid signature."}})
    except Exception as exc:  # signature decoding errors surface as library-specific exceptions
        if getattr(exc, "code", None) == "LIVEKIT_NOT_CONFIGURED":
            raise
        logger.warning("rejected LiveKit webhook: %s", type(exc).__name__)
        return JSONResponse(status_code=401, content={"error": {"code": "INVALID_WEBHOOK_SIGNATURE", "message": "Invalid signature."}})

    if event.event == "egress_ended":
        from livekit.api import EgressStatus

        info = event.egress_info
        duration = 0
        if info.file_results:
            duration = int(info.file_results[0].duration // 1_000_000_000)  # LiveKit reports nanoseconds
        handled, auto_job = recording_service.handle_egress_webhook(
            db,
            egress_id=info.egress_id,
            status_name=EgressStatus.Name(info.status),
            duration_seconds=duration,
            error=info.error or None,
        )
        if not handled:
            logger.info("egress_ended for unknown egress %s (ignored)", info.egress_id)
        elif auto_job is not None:
            # Real audio -> transcript -> summary, queued the moment this recording became
            # available — runs after this response is sent, so LiveKit's webhook call isn't held up.
            background_tasks.add_task(summary_service.process_summary_job, auto_job.id)
    return {"status": "ok"}


@router.post("/razorpay")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    """Razorpay -> us. Authenticated by the HMAC signature of the raw body; anything unsigned or tampered is refused
    before it can touch a subscription. Replays are harmless (applying an order twice is a no-op)."""
    body = await request.body()
    if not razorpay.verify_webhook_signature(body, request.headers.get("x-razorpay-signature")):
        logger.warning("rejected Razorpay webhook with an invalid signature")
        return JSONResponse(status_code=401, content={"error": {"code": "INVALID_WEBHOOK_SIGNATURE", "message": "Invalid signature."}})
    try:
        event = json.loads(body)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": {"code": "INVALID_BODY", "message": "Not JSON."}})
    outcome = billing_service.apply_razorpay_event(db, event if isinstance(event, dict) else {})
    logger.info("razorpay webhook outcome=%s", outcome)
    return {"status": "ok"}
