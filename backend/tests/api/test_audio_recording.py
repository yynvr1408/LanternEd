"""Recording defaults to audio only (a fraction of the cost and of students' data), with video on request."""

import pytest

from app.config import get_settings
from app.integrations import livekit
from tests.api.test_classes import _create_class, mock_livekit  # noqa: F401  (fixture reuse)


@pytest.fixture
def egress_calls(monkeypatch, mock_livekit, mock_recording_pipeline):  # noqa: F811
    calls = []
    original = livekit.start_recording

    async def spy(room_name, storage_key, **kwargs):
        calls.append({"storage_key": storage_key, **kwargs})
        return await original(room_name, storage_key, **kwargs)

    monkeypatch.setattr(livekit, "start_recording", spy)
    return calls


def _start(tclient, course, body=None):
    cls = _create_class(tclient, course["id"])
    tclient.post(f"/api/v1/classes/{cls['id']}/start")
    return tclient.post(f"/api/v1/classes/{cls['id']}/recordings/start", **({"json": body} if body is not None else {}))


def test_recording_is_audio_only_by_default(egress_calls, teacher, published_course):
    resp = _start(teacher[0], published_course)
    assert resp.status_code == 201
    assert resp.json()["audio_only"] is True
    assert egress_calls[0]["audio_only"] is True and egress_calls[0]["storage_key"].endswith(".ogg")


def test_a_teacher_can_ask_for_video(egress_calls, teacher, published_course):
    resp = _start(teacher[0], published_course, {"audio_only": False})
    assert resp.json()["audio_only"] is False
    assert egress_calls[0]["audio_only"] is False and egress_calls[0]["storage_key"].endswith(".mp4")


def test_the_institution_default_can_be_video(egress_calls, teacher, published_course, monkeypatch):
    monkeypatch.setattr(get_settings(), "recording_audio_only_default", False)
    assert _start(teacher[0], published_course).json()["audio_only"] is False
