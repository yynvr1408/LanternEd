import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

try:
    import elevenlabs.client as el_client
except ImportError:
    import sys
    el_client = MagicMock()
    sys.modules["elevenlabs"] = MagicMock()
    sys.modules["elevenlabs.client"] = el_client

import pytest
from app.db.models.classroom import ClassRecording
from app.db.models.enums import RecordingStatus, SummaryStatus
from app.db.models.summary import LectureSummary
from app.integrations import elevenlabs_service
from app.workflows.post_class_pipeline import (
    process_lecture_pipeline,
    task_elevenlabs_voiceover,
    task_save_summary_record,
    task_summarize,
    task_transcribe,
)


@pytest.fixture
def processing_recording(mock_recording_pipeline, fake_storage, teacher, published_course):
    tclient, _ = teacher
    cls = tclient.post(
        f"/api/v1/classes?course_id={published_course['id']}", json={"title": "Webhook", "scheduled_start": "2026-11-02T10:00:00Z"}
    ).json()
    tclient.post(f"/api/v1/classes/{cls['id']}/start")
    rec = tclient.post(f"/api/v1/classes/{cls['id']}/recordings/start").json()
    tclient.post(f"/api/v1/classes/{cls['id']}/recordings/{rec['id']}/stop")
    return {"tclient": tclient, "cls": cls, "rec": rec, "storage": fake_storage, "egress": mock_recording_pipeline["last_egress_id"]}


def test_elevenlabs_truncate_text():
    short_text = "This is a brief summary of the lesson."
    assert elevenlabs_service._truncate_text(short_text) == short_text

    long_text = "Word " * 600  # 3000 chars
    truncated = elevenlabs_service._truncate_text(long_text, max_chars=2500)
    assert len(truncated) <= 2505
    assert truncated.endswith("...")


def test_elevenlabs_synthesize_unconfigured(monkeypatch, tmp_path):
    monkeypatch.setattr(elevenlabs_service.settings, "elevenlabs_api_key", None)
    out_file = tmp_path / "test.mp3"
    result = elevenlabs_service.synthesize_lecture_recap("Hello world", out_file)
    assert result is None
    assert not out_file.exists()


def test_elevenlabs_synthesize_success(monkeypatch, tmp_path):
    monkeypatch.setattr(elevenlabs_service.settings, "elevenlabs_api_key", "test-key")
    out_file = tmp_path / "test.mp3"

    mock_client = MagicMock()
    mock_client.text_to_speech.convert.return_value = [b"fake-mp3-chunk-1", b"fake-mp3-chunk-2"]

    with patch.object(el_client, "ElevenLabs", return_value=mock_client):
        result = elevenlabs_service.synthesize_lecture_recap("Important concepts discussed today.", out_file)
        assert result == str(out_file)
        assert out_file.exists()
        assert out_file.read_bytes() == b"fake-mp3-chunk-1fake-mp3-chunk-2"


def test_elevenlabs_synthesize_error_handled_gracefully(monkeypatch, tmp_path):
    monkeypatch.setattr(elevenlabs_service.settings, "elevenlabs_api_key", "test-key")
    out_file = tmp_path / "test.mp3"

    mock_client = MagicMock()
    mock_client.text_to_speech.convert.side_effect = RuntimeError("Quota exceeded (429)")

    with patch.object(el_client, "ElevenLabs", return_value=mock_client):
        result = elevenlabs_service.synthesize_lecture_recap("Important concepts discussed today.", out_file)
        assert result is None


def test_workflow_task_transcribe_and_summarize(tmp_path):
    mock_ctx = MagicMock()

    # task_transcribe with fallback
    with patch("app.workflows.post_class_pipeline.get_storage") as mock_storage:
        mock_storage.return_value.fetch_to_path.side_effect = lambda key, path: path.touch()
        transcript = task_transcribe.func(mock_ctx, "recordings/test.mp4")
        assert "Lecture recording" in transcript

    # task_summarize
    summary_json_str = task_summarize.func(mock_ctx, "Introduction to binary search and algorithms.")
    data = json.loads(summary_json_str)
    assert "overview" in data or isinstance(data, dict)


def test_workflow_task_elevenlabs_voiceover_and_save(db_session):
    from datetime import datetime, timezone
    from app.db.models.classroom import Class
    from app.db.models.course import Course
    from app.db.models.user import User
    from app.db.models.enums import UserRole

    teacher_user = User(id="tch-123", email="t123@example.com", full_name="Teacher 123", role=UserRole.teacher, password_hash="pw")
    course = Course(id="crs-123", teacher_id="tch-123", title="Course 123")
    cls_row = Class(id="cls-123", course_id="crs-123", teacher_id="tch-123", title="Class 123", scheduled_start=datetime.now(timezone.utc))
    db_session.add_all([teacher_user, course, cls_row])
    db_session.commit()

    mock_ctx = MagicMock()
    summary_dict = {
        "overview": "Binary search divides the sorted array in half repeatedly.",
        "key_concepts": ["Divide and conquer", "Logarithmic time O(log n)"],
    }
    summary_json = json.dumps(summary_dict)

    with patch("app.workflows.post_class_pipeline.synthesize_lecture_recap", return_value=None):
        # Graceful when ElevenLabs fails or is not configured
        r2_key = task_elevenlabs_voiceover.func(mock_ctx, "cls-123", summary_json)
        assert r2_key == ""

    # task_save_summary_record creates a row with is_approved=False
    save_result = task_save_summary_record.func(mock_ctx, "cls-123", summary_json, "")
    assert save_result["class_id"] == "cls-123"
    assert save_result["is_approved"] is False

    row = db_session.query(LectureSummary).filter_by(class_id="cls-123").first()
    assert row is not None
    assert row.status == SummaryStatus.needs_review
    assert row.is_approved is False
    assert row.content_json["overview"] == summary_dict["overview"]


def test_workflow_process_lecture_pipeline_orchestrator():
    mock_ctx = MagicMock()

    async def mock_run(task_fn, *args):
        if task_fn == task_transcribe:
            return "Transcribed audio text"
        if task_fn == task_summarize:
            return json.dumps({"overview": "Overview of math lecture", "key_concepts": ["Calculus"]})
        if task_fn == task_elevenlabs_voiceover:
            return "summaries/cls-999/audio_recap.mp3"
        if task_fn == task_save_summary_record:
            return {"summary_id": "sum-999", "class_id": args[0], "is_approved": False}
        return None

    mock_ctx.run = AsyncMock(side_effect=mock_run)

    result = asyncio.run(process_lecture_pipeline.func(mock_ctx, "cls-999", "recordings/cls-999.mp4"))
    assert result["status"] == "completed"
    assert result["class_id"] == "cls-999"
    assert result["audio_recap_key"] == "summaries/cls-999/audio_recap.mp3"


def test_livekit_webhook_triggers_render_workflow(client, processing_recording, monkeypatch):
    from tests.api.test_livekit_webhook import _egress_ended, _signed_headers
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "render_api_key", "rnd_test_api_key")

    mock_run = MagicMock()
    mock_run.id = "run_wf_abc123"

    mock_render_client = MagicMock()
    mock_render_client.workflows.start_task = AsyncMock(return_value=mock_run)

    rec, storage, cls = (
        processing_recording["rec"],
        processing_recording["storage"],
        processing_recording["cls"],
    )
    storage.put(rec["id"], cls["id"], size=4321)

    with patch("app.api.v1.webhooks.RenderAsync", return_value=mock_render_client):
        body = _egress_ended(processing_recording["egress"], "EGRESS_COMPLETE")
        resp = client.post("/api/v1/webhooks/livekit", content=body, headers=_signed_headers(body))

        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "Workflow triggered"
        assert data.get("run_id") == "run_wf_abc123"
        mock_render_client.workflows.start_task.assert_awaited_once()
        args = mock_render_client.workflows.start_task.call_args[0]
        assert args[0] == "lanterned-audio-pipeline/process_lecture_pipeline"
        assert args[1][0] == cls["id"]
