from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.core.permissions import require_role
from app.dependencies import get_current_user, get_db
from app.db.models.enums import UserRole
from app.db.models.user import User
from app.schemas.classroom import (
    ClassCreate,
    ClassOut,
    ClassUpdate,
    FallbackFeedOut,
    JoinTokenResponse,
    LiveCaptionIn,
    ParticipantOut,
    RecordingOut,
    StartRecordingRequest,
    WhiteboardEventBatchRequest,
)
from datetime import timedelta

from app.services import classroom_service, rate_limit_service, recording_service, summary_service

router = APIRouter(prefix="/classes", tags=["classes"])


@router.get("", response_model=list[ClassOut])
def list_classes(limit: int = 50, offset: int = 0, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    classes = classroom_service.list_classes_for_user(db, user, limit=limit, offset=offset)
    return [ClassOut.model_validate(c) for c in classes]


@router.post("", response_model=ClassOut, status_code=201)
def create_class(payload: ClassCreate, course_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_role(user, UserRole.teacher)
    cls = classroom_service.create_class(
        db,
        user,
        course_id,
        title=payload.title,
        scheduled_start=payload.scheduled_start,
        scheduled_end=payload.scheduled_end,
        section_ids=payload.section_ids,
        all_branch_sections=payload.all_branch_sections,
    )
    return ClassOut.model_validate(cls)


@router.get("/{class_id}", response_model=ClassOut)
def get_class(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    classroom_service.assert_can_view_class(db, user, cls)
    return ClassOut.model_validate(cls)


@router.patch("/{class_id}", response_model=ClassOut)
def update_class(class_id: str, payload: ClassUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    classroom_service.assert_teaches_class(db, user, cls)
    cls = classroom_service.update_class(db, cls, **payload.model_dump())
    return ClassOut.model_validate(cls)


@router.post("/{class_id}/cancel", response_model=ClassOut)
def cancel_class(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    cls = classroom_service.cancel_class(db, user, cls)
    return ClassOut.model_validate(cls)


@router.post("/{class_id}/start", response_model=ClassOut)
async def start_class(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    cls = await classroom_service.start_class(db, user, cls)
    return ClassOut.model_validate(cls)


@router.post("/{class_id}/end", response_model=ClassOut)
async def end_class(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    cls = await classroom_service.end_class(db, user, cls)
    return ClassOut.model_validate(cls)


@router.post("/{class_id}/join-token", response_model=JoinTokenResponse)
def join_token(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    rate_limit_service.enforce(db, f"join-token:{user.id}", limit=120, window=timedelta(minutes=10))  # generous: reconnects re-ask
    return classroom_service.issue_join_token(db, user, cls)


@router.get("/{class_id}/participants", response_model=list[ParticipantOut])
def list_participants(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    classroom_service.assert_teaches_class(db, user, cls)
    return [ParticipantOut.model_validate(p) for p in classroom_service.list_participants(db, cls)]


@router.post("/{class_id}/participants/{student_id}/remove", status_code=204)
async def remove_participant(
    class_id: str, student_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    cls = classroom_service.get_class_or_404(db, class_id)
    await classroom_service.remove_participant(db, user, cls, student_id)


@router.post("/{class_id}/recording-consent", status_code=204)
def accept_recording_consent(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    classroom_service.accept_recording_consent(db, user, cls)


@router.post("/{class_id}/speak-requests", status_code=204)
async def request_to_speak(class_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    await classroom_service.request_to_speak(db, user, cls)


@router.post("/{class_id}/participants/{student_id}/grant-mic", status_code=204)
async def grant_mic(
    class_id: str, student_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    cls = classroom_service.get_class_or_404(db, class_id)
    await classroom_service.set_mic_permission(db, user, cls, student_id, granted=True)


@router.post("/{class_id}/participants/{student_id}/revoke-mic", status_code=204)
async def revoke_mic(
    class_id: str, student_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    cls = classroom_service.get_class_or_404(db, class_id)
    await classroom_service.set_mic_permission(db, user, cls, student_id, granted=False)


@router.post("/{class_id}/recordings/start", response_model=RecordingOut, status_code=201)
async def start_recording(
    class_id: str,
    payload: StartRecordingRequest | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Optional body {"audio_only": bool}; omitted = the institution default (audio only unless configured otherwise)."""
    cls = classroom_service.get_class_or_404(db, class_id)
    recording = await recording_service.start_recording(db, user, cls, audio_only=payload.audio_only if payload else None)
    return RecordingOut.model_validate(recording)


@router.post("/{class_id}/recordings/{recording_id}/stop", response_model=RecordingOut)
async def stop_recording(class_id: str, recording_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cls = classroom_service.get_class_or_404(db, class_id)
    recording = recording_service.get_recording_or_404(db, recording_id)
    recording = await recording_service.stop_recording(db, user, cls, recording)
    return RecordingOut.model_validate(recording)


@router.get("/{class_id}/recordings", response_model=list[RecordingOut])
async def list_recordings(
    class_id: str, background_tasks: BackgroundTasks, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    cls = classroom_service.get_class_or_404(db, class_id)
    classroom_service.assert_enrolled_in_class(db, user, cls)
    recordings = [r for r in recording_service.list_recordings_for_class(db, cls) if recording_service.can_access(db, user, r)]
    refreshed = []
    for r in recordings:
        r, auto_job = await recording_service.refresh_status(db, r)
        if auto_job is not None:
            background_tasks.add_task(summary_service.process_summary_job, auto_job.id)
        refreshed.append(r)
    return [RecordingOut.model_validate(r) for r in refreshed]


@router.get("/recordings/{recording_id}/download")
def download_recording(recording_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Kept for existing clients; same authorization + signed URL as /recordings/{id}/playback."""
    recording = recording_service.get_recording_or_404(db, recording_id)
    info = recording_service.playback_info(db, user, recording)
    return RedirectResponse(url=info["url"])


@router.post("/{class_id}/whiteboard-events")
def push_whiteboard_events(
    class_id: str,
    payload: WhiteboardEventBatchRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Records teacher whiteboard strokes for offline replay & HTTPS fallback streaming."""
    cls = classroom_service.get_class_or_404(db, class_id)
    count = classroom_service.append_whiteboard_events(db, user, cls, [ev.model_dump() for ev in payload.events])
    return {"class_id": class_id, "recorded_events": count}


@router.post("/{class_id}/live-captions")
def push_live_caption(
    class_id: str,
    payload: LiveCaptionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Publishes a lightweight HTTPS live text caption/note when WebRTC degrades."""
    cls = classroom_service.get_class_or_404(db, class_id)
    entry = classroom_service.append_live_caption(db, user, cls, payload.text, author=payload.author)
    return entry


@router.get("/{class_id}/fallback-feed", response_model=FallbackFeedOut)
def get_fallback_feed(
    class_id: str,
    since_seq: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Polled over HTTPS (<2 KB/s) during severe WebRTC degradation or firewall UDP blocks."""
    cls = classroom_service.get_class_or_404(db, class_id)
    return classroom_service.get_fallback_feed(db, user, cls, since_seq=since_seq)


@router.get("/{class_id}/bundle")
def download_class_bundle(
    class_id: str,
    background_tasks: BackgroundTasks,
    mode: str = Query(default="full", pattern="^(full|micro)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a self-contained offline lesson bundle (.zip) for a class containing its summary,
    available recordings, whiteboard timeline, and metadata."""
    cls = classroom_service.get_class_or_404(db, class_id)
    bundle_path = classroom_service.build_class_bundle(db, user, cls, mode=mode)
    background_tasks.add_task(bundle_path.unlink, missing_ok=True)
    suffix = "-micro" if mode == "micro" else ""
    filename = f"class-{cls.id}{suffix}-bundle.zip"
    return FileResponse(bundle_path, media_type="application/zip", filename=filename)
