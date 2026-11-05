from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.db.models.user import User
from app.schemas.summary import JobStatusOut, SummaryEdit, SummaryJobOut, SummaryJobRequest, SummaryOut
from datetime import timedelta

from app.services import classroom_service, rate_limit_service, summary_service

router = APIRouter(tags=["summaries"])


def _to_summary_out(summary) -> SummaryOut:
    out = SummaryOut.model_validate(summary)
    if getattr(summary, "status", None) and summary.status.value == "completed":
        out.is_approved = True
    if getattr(summary, "audio_recap_key", None):
        try:
            from app.integrations.object_storage import get_storage
            from app.config import get_settings
            target = get_storage().download_target(summary.audio_recap_key, ttl_seconds=get_settings().signed_url_ttl_seconds)
            out.audio_recap_url = target.get("url")
        except Exception:
            pass
    return out


@router.post("/classes/{class_id}/summary-jobs", response_model=SummaryJobOut, status_code=202)
def create_summary_job(
    class_id: str,
    payload: SummaryJobRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cls = classroom_service.get_class_or_404(db, class_id)
    rate_limit_service.enforce(db, f"summary-jobs:{user.id}", limit=30, window=timedelta(hours=1))  # each job is paid AI work
    job = summary_service.request_summary(
        db, user, cls, transcript_text=payload.transcript_text, resource_id=payload.resource_id
    )
    background_tasks.add_task(summary_service.process_summary_job, job.id)
    return SummaryJobOut(job_id=job.id, status=job.status)


@router.get("/classes/{class_id}/summary", response_model=SummaryOut)
def get_class_summary(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    summary = summary_service.get_summary_for_class(db, user, cls)
    return _to_summary_out(summary)


@router.get("/summaries", response_model=list[SummaryOut])
def list_summaries(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_to_summary_out(s) for s in summary_service.list_summaries(db, user)]


@router.get("/jobs/{job_id}", response_model=JobStatusOut)
def get_job(job_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = summary_service.get_job_or_404(db, job_id)
    summary_service.assert_can_view_job(db, user, job)
    return JobStatusOut(
        id=job.id, job_type=job.job_type.value, status=job.status, attempts=job.attempts,
        error_code=job.error_code, error_message=job.error_message, completed_at=job.completed_at,
    )


@router.patch("/summaries/{summary_id}", response_model=SummaryOut)
def edit_summary(summary_id: str, payload: SummaryEdit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.db.models.summary import LectureSummary
    from app.core.exceptions import NotFoundError

    summary = db.get(LectureSummary, summary_id)
    if not summary:
        raise NotFoundError("Summary not found.")
    summary = summary_service.edit_summary(db, user, summary, payload.model_dump())
    return _to_summary_out(summary)


@router.post("/summaries/{summary_id}/approve", response_model=SummaryOut)
def approve_summary(summary_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.db.models.summary import LectureSummary
    from app.core.exceptions import NotFoundError

    summary = db.get(LectureSummary, summary_id)
    if not summary:
        raise NotFoundError("Summary not found.")
    summary = summary_service.approve_summary(db, user, summary)
    return _to_summary_out(summary)


@router.post("/summaries/{summary_id}/request-changes", response_model=SummaryOut)
def request_summary_changes(
    summary_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.db.models.summary import LectureSummary
    from app.core.exceptions import NotFoundError

    summary = db.get(LectureSummary, summary_id)
    if not summary:
        raise NotFoundError("Summary not found.")
    summary, job = summary_service.request_changes(db, user, summary)
    background_tasks.add_task(summary_service.process_summary_job, job.id)
    return _to_summary_out(summary)
