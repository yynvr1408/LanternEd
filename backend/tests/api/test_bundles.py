import io
import json
import zipfile
import pytest

from app.db.models.enums import RecordingStatus, SummaryStatus, TranscriptStatus
from app.db.models.classroom import ClassRecording
from app.db.models.summary import LectureSummary, LectureTranscript


def _create_and_start_class(client, course_id):
    cls = client.post(
        f"/api/v1/classes?course_id={course_id}",
        json={"title": "Bundle test class", "scheduled_start": "2026-11-02T10:00:00Z"},
    ).json()
    client.post(f"/api/v1/classes/{cls['id']}/start")
    return cls


def test_download_recording_bundle(teacher, enrolled_student, published_course, db_session):
    tclient, _tuser = teacher
    sclient, _suser = enrolled_student
    cls = _create_and_start_class(tclient, published_course["id"])

    # Create an available recording in the db
    rec = ClassRecording(
        class_id=cls["id"],
        requested_by=_tuser["id"],
        status=RecordingStatus.available,
        title="Test recording for bundle",
        is_published=True,
        duration_seconds=3600,
        size_bytes=1024,
        audio_only=False,
    )
    db_session.add(rec)
    db_session.flush()

    # Add transcript
    transcript = LectureTranscript(
        class_id=cls["id"],
        recording_id=rec.id,
        content="Welcome to this lecture on solar PV efficiency and cell dust derating.",
        status=TranscriptStatus.ready,
    )
    db_session.add(transcript)

    # Add summary
    summary_data = {
        "overview": "Comprehensive overview of photovoltaic dust derating.",
        "key_concepts": [
            {"concept": "Dust Derating", "explanation": "Dust reduces solar absorption by up to 20%."},
            {"concept": "PV Efficiency", "explanation": "Efficiency measures electrical power output per unit area."}
        ],
        "revision_questions": ["What is dust derating?", "How does temperature affect cell efficiency?"],
        "teacher_notes": "Emphasize weekly cleaning schedules in dry seasons."
    }
    summary = LectureSummary(
        class_id=cls["id"],
        recording_id=rec.id,
        transcript_id=transcript.id,
        content_json=summary_data,
        status=SummaryStatus.completed,
    )
    db_session.add(summary)
    db_session.commit()

    # Student downloads bundle
    resp = sclient.get(f"/api/v1/recordings/{rec.id}/bundle")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert f"lesson-{cls['id']}-bundle.zip" in resp.headers.get("content-disposition", "")

    # Inspect zip contents
    with zipfile.ZipFile(io.BytesIO(resp.content), "r") as zf:
        namelist = zf.namelist()
        assert "metadata.json" in namelist
        assert "summary.json" in namelist
        assert "summary.md" in namelist
        assert "transcript.txt" in namelist

        # Validate metadata
        meta = json.loads(zf.read("metadata.json"))
        assert meta["recording_id"] == rec.id
        assert meta["class_id"] == cls["id"]
        assert meta["duration_seconds"] == 3600

        # Validate summary
        sum_content = json.loads(zf.read("summary.json"))
        assert sum_content["overview"] == summary_data["overview"]

        # Validate markdown formatting
        md_text = zf.read("summary.md").decode("utf-8")
        assert "## Overview" in md_text
        assert "## Key Concepts" in md_text
        assert "Dust Derating" in md_text

        # Validate transcript
        transcript_text = zf.read("transcript.txt").decode("utf-8")
        assert "solar PV efficiency" in transcript_text


def test_download_class_bundle_without_recording(teacher, enrolled_student, published_course, db_session):
    tclient, _tuser = teacher
    sclient, _suser = enrolled_student
    cls = _create_and_start_class(tclient, published_course["id"])

    # Add approved class summary
    summary_data = {
        "overview": "Class overview without recording media.",
        "key_concepts": [{"concept": "Offline Bundles", "explanation": "Packaged zip streams."}],
    }
    summary = LectureSummary(
        class_id=cls["id"],
        content_json=summary_data,
        status=SummaryStatus.completed,
    )
    db_session.add(summary)
    db_session.commit()

    resp = sclient.get(f"/api/v1/classes/{cls['id']}/bundle")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(resp.content), "r") as zf:
        namelist = zf.namelist()
        assert "metadata.json" in namelist
        assert "summary.json" in namelist
        assert "summary.md" in namelist


def test_recording_not_ready_returns_conflict(teacher, published_course, db_session):
    tclient, _tuser = teacher
    cls = _create_and_start_class(tclient, published_course["id"])

    rec = ClassRecording(
        class_id=cls["id"],
        requested_by=_tuser["id"],
        status=RecordingStatus.recording,  # not ready
        title="Active recording",
    )
    db_session.add(rec)
    db_session.commit()

    resp = tclient.get(f"/api/v1/recordings/{rec.id}/bundle")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "RECORDING_NOT_READY"


def test_unauthorized_student_cannot_download_bundle(teacher, make_user, published_course, db_session):
    tclient, _tuser = teacher
    cls = _create_and_start_class(tclient, published_course["id"])

    rec = ClassRecording(
        class_id=cls["id"],
        requested_by=_tuser["id"],
        status=RecordingStatus.available,
        is_published=False,  # Unpublished
        title="Secret lecture",
    )
    db_session.add(rec)
    db_session.commit()

    # Other student (not enrolled)
    client, _other_user = make_user(role="student")
    resp = client.get(f"/api/v1/recordings/{rec.id}/bundle")
    assert resp.status_code in (403, 404)
