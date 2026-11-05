import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
try:
    from render import RenderAsync
except ImportError:
    RenderAsync = None

from app.config import get_settings
from app.db.models.classroom import ClassRecording
from app.dependencies import get_db
import json

from app.integrations import livekit, razorpay
from app.services import billing_service, recording_service, summary_service

settings = get_settings()

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
            # Check if Render Workflows dispatch is configured
            recording = db.execute(
                select(ClassRecording).where(ClassRecording.egress_id == info.egress_id)
            ).scalar_one_or_none()

            if settings.render_api_key and recording and recording.storage_key and RenderAsync is not None:
                try:
                    render_client = RenderAsync(token=settings.render_api_key)
                    run = await render_client.workflows.start_task(
                        "lanterned-audio-pipeline/process_lecture_pipeline",
                        [recording.class_id, recording.storage_key],
                    )
                    run_id = getattr(run, "id", str(run))
                    logger.info("Dispatched Render workflow run_id=%s for class_id=%s", run_id, recording.class_id)
                    return {"status": "Workflow triggered", "run_id": run_id}
                except Exception as exc:
                    logger.error("Failed to trigger Render workflow: %s; falling back to local processing", exc, exc_info=True)
                    background_tasks.add_task(summary_service.process_summary_job, auto_job.id)
            else:
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
