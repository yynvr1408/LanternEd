"""Standalone background worker: `python -m app.worker` (or `--once` for a single pass).

Picks up queued summary/transcription jobs the API didn't finish (restart, crash, retryable
failure) and processes them. Safe to run alongside the API and in several copies: every job
is claimed atomically in summary_service."""

import argparse
import logging
import time

from app.config import get_settings
from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.services import audit_service, notification_service, rate_limit_service, recording_service, summary_service

logger = logging.getLogger("lanterned.worker")


def run_once() -> int:
    settings = get_settings()
    with SessionLocal() as db:
        requeued = summary_service.requeue_retryable_jobs(db)
        job_ids = summary_service.queued_job_ids(db)
        # Piggybacks on this same periodic pass rather than needing its own schedule — a cheap,
        # indexed DELETE that's a no-op most of the time, keeping the rate-limit table from
        # growing without bound (see rate_limit_service.prune_expired).
        pruned = rate_limit_service.prune_expired(db)
        # Opt-in only: audit events are a security trail, kept forever unless a retention policy
        # is explicitly configured (see audit_service.prune_expired).
        pruned_audit = (
            audit_service.prune_expired(db, retention_days=settings.audit_log_retention_days)
            if settings.audit_log_retention_days
            else 0
        )
        expired_recordings = (
            recording_service.archive_expired(db, retention_days=settings.recording_retention_days)
            if settings.recording_retention_days
            else 0
        )
        pruned_notifications = notification_service.prune(db, retention_days=settings.notification_retention_days)
    if expired_recordings:
        logger.info("archived %d recording(s) past retention", expired_recordings)
    if pruned_notifications:
        logger.info("pruned %d old notification(s)", pruned_notifications)
    if requeued:
        logger.info("requeued %d retryable job(s)", requeued)
    if pruned:
        logger.info("pruned %d expired rate-limit bucket(s)", pruned)
    if pruned_audit:
        logger.info("pruned %d expired audit event(s)", pruned_audit)
    if settings.whatsapp_configured:
        with SessionLocal() as db:
            delivered = notification_service.deliver_pending(db)
        if delivered:
            logger.info("sent %d WhatsApp message(s)", delivered)
    for job_id in job_ids:
        summary_service.process_summary_job(job_id)
    return len(job_ids)


def main() -> None:
    parser = argparse.ArgumentParser(description="LanternED background worker")
    parser.add_argument("--once", action="store_true", help="process the queue once and exit")
    parser.add_argument("--interval", type=float, default=5.0, help="seconds between polls")
    args = parser.parse_args()

    configure_logging()
    if args.once:
        logger.info("processed %d job(s)", run_once())
        return
    logger.info("worker started (poll every %.1fs)", args.interval)
    while True:
        try:
            run_once()
        except Exception:  # noqa: BLE001 - the loop must survive a bad poll
            logger.exception("worker poll failed")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
