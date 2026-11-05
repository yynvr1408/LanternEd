import asyncio
import contextlib
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router
from app.config import get_settings
from app.core.exceptions import AppError, app_error_handler
from app.core.logging import configure_logging
from app.core.middleware import OriginCheckMiddleware, RequestIdMiddleware

configure_logging()
logger = logging.getLogger("lanterned")

settings = get_settings()

if settings.sentry_dsn:
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.app_env,
            send_default_pii=False,  # no cookies, auth headers, IPs or user details leave the server
            traces_sample_rate=settings.sentry_traces_sample_rate,
        )
    except ImportError:
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed; error tracking is off.")


async def _embedded_worker_loop() -> None:
    """The standalone worker's pass, repeated inside the API process (see Settings.embedded_worker)."""
    from app import worker

    logger.info("embedded worker started (every %.0fs)", settings.embedded_worker_interval_seconds)
    while True:
        try:
            await asyncio.to_thread(worker.run_once)  # blocking DB and HTTP work stays off the event loop
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - one bad pass must not end the loop
            logger.exception("embedded worker pass failed")
        await asyncio.sleep(settings.embedded_worker_interval_seconds)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.is_production and (settings.session_secret == "dev-secret-change-me" or len(settings.session_secret) < 16):
        raise RuntimeError("SESSION_SECRET must be set to a real secret (16+ characters) in production.")
    if settings.is_production and not settings.teacher_invite_code:
        logger.warning("TEACHER_INVITE_CODE is unset — teacher self-registration is closed in production.")
    if settings.is_production and not os.environ.get("FORWARDED_ALLOW_IPS"):
        logger.warning(
            "FORWARDED_ALLOW_IPS is not set — behind a reverse proxy every user would share one per-IP rate-limit bucket."
        )
    if not settings.livekit_configured:
        logger.warning("LiveKit is not configured — classroom start/join endpoints will return 503.")
    if not settings.llm_configured:
        logger.warning("No LLM provider configured — lecture summaries will use the labeled stub provider.")
    if not settings.email_configured:
        logger.warning("EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_PUBLIC_KEY not configured — OTP emails will not be sent.")
    from app.db.session import SessionLocal
    from app.services import admin_service

    with SessionLocal() as db:
        try:
            admin_service.bootstrap_admin(db)
        except Exception:  # a missing table (migrations not yet applied) must not stop the API from starting
            logger.exception("Administrator bootstrap failed.")
    worker_task = asyncio.create_task(_embedded_worker_loop()) if settings.embedded_worker else None
    try:
        yield
    finally:
        if worker_task is not None:
            worker_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await worker_task


# The interactive docs and OpenAPI schema are a development aid; don't publish the full API map in production.
_docs = {"docs_url": None, "redoc_url": None, "openapi_url": None} if settings.is_production else {}
app = FastAPI(title="LanternED API", lifespan=lifespan, **_docs)

app.add_middleware(OriginCheckMiddleware, allowed_origin=settings.frontend_origin)
app.add_middleware(RequestIdMiddleware)  # added after, so it wraps the origin check and its refusals carry a request id
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Browsers on another origin can only read these response headers if they are exposed; resumable
    # downloads need Content-Range to learn a file's real size and verify each chunk.
    expose_headers=["Content-Range", "Accept-Ranges", "X-Request-ID"],
)
# Every JSON response (class/course lists, summaries, ...) goes out compressed on a slow link.
# minimum_size skips the overhead on tiny payloads where compression wouldn't pay for itself.
app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_exception_handler(AppError, app_error_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_FAILED",
                "message": "Request validation failed.",
                "request_id": request_id,
                "details": {"errors": exc.errors()},
            }
        },
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc: StarletteHTTPException):
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "HTTP_ERROR", "message": str(exc.detail), "request_id": request_id, "details": {}}},
    )


app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health():
    from sqlalchemy import text
    from app.db.session import SessionLocal

    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:
        logger.error("health check database connectivity failed: %s", type(exc).__name__)
        return JSONResponse(status_code=503, content={"status": "degraded", "error": "database_unavailable"})


@app.get("/ready")
def ready():
    from sqlalchemy import text

    from app.db.session import SessionLocal

    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ready"}
    except Exception as exc:
        logger.error("readiness check failed: %s", type(exc).__name__)
        return JSONResponse(status_code=503, content={"status": "not_ready"})  # no internals in a public endpoint
