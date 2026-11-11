import io
import json
import zipfile
from datetime import timedelta

from app.db.base import utcnow
from app.db.models.classroom import ClassRecording
from app.db.models.enums import RecordingStatus, SummaryStatus, TranscriptStatus
from app.db.models.exam import ExamAttempt
from app.db.models.summary import LectureSummary, LectureTranscript
from app.integrations import llm_provider


def test_offline_exam_submit_and_replay_via_sync_endpoint(teacher, enrolled_student, published_course, db_session):
    tclient, _tuser = teacher
    sclient, _suser = enrolled_student

    bank = tclient.post(
        f"/api/v1/courses/{published_course['id']}/question-banks",
        json={"title": "Physics Bank"},
    )
    assert bank.status_code == 201
    bank_id = bank.json()["id"]

    item = tclient.post(
        f"/api/v1/question-banks/{bank_id}/items",
        json={
            "question_type": "mcq_single",
            "prompt": "SI unit of power?",
            "options": [{"id": "a", "text": "Watt"}, {"id": "b", "text": "Joule"}],
            "correct_answer": "a",
            "default_marks": 5.0,
            "bloom_level": "Remember",
        },
    )
    assert item.status_code == 201
    q_id = item.json()["id"]

    now = utcnow()
    exam = tclient.post(
        f"/api/v1/courses/{published_course['id']}/exams",
        json={
            "title": "Midterm Quiz",
            "duration_minutes": 45,
            "start_window": (now - timedelta(minutes=5)).isoformat(),
            "end_window": (now + timedelta(hours=2)).isoformat(),
            "total_marks": 5.0,
            "sections": [{"title": "Part A", "marks_per_question": 5.0, "question_bank_id": bank_id}],
        },
    )
    assert exam.status_code == 201
    exam_id = exam.json()["id"]

    started = sclient.post(f"/api/v1/exams/{exam_id}/start")
    assert started.status_code == 200
    attempt_id = started.json()["attempt_id"]

    sync_payload = {
        "operations": [
            {
                "operation_id": "exam-op-001",
                "operation_type": "exam_submit",
                "entity_id": exam_id,
                "payload": {
                    "attempt_id": attempt_id,
                    "final_answers": {q_id: "a"},
                    "offline_events": [{"type": "tab_hidden", "timestamp": now.isoformat()}],
                },
            }
        ]
    }

    first = sclient.post("/api/v1/sync/operations", json=sync_payload)
    assert first.status_code == 200
    res1 = first.json()["results"][0]
    assert res1["status"] == "accepted"
    assert res1["server_entity_id"] == attempt_id
    assert res1["auto_graded_score"] == 5.0
    assert res1["receipt_hash"]

    # Idempotent replay on dropped network response
    replay = sclient.post("/api/v1/sync/operations", json=sync_payload)
    assert replay.status_code == 200
    assert replay.json()["results"][0] == res1

    # New operation_id targeting already-submitted attempt conflicts cleanly
    dup = sclient.post(
        "/api/v1/sync/operations",
        json={
            "operations": [
                {
                    "operation_id": "exam-op-002",
                    "operation_type": "exam_submit",
                    "entity_id": exam_id,
                    "payload": {"attempt_id": attempt_id, "final_answers": {q_id: "b"}},
                }
            ]
        },
    )
    assert dup.status_code == 200
    assert dup.json()["results"][0]["status"] == "conflict"
    assert dup.json()["results"][0]["error_code"] == "EXAM_ALREADY_SUBMITTED"

    attempt_row = db_session.get(ExamAttempt, attempt_id)
    assert attempt_row is not None
    assert attempt_row.tab_blur_count == 1
    assert attempt_row.final_score == 5.0


def test_offline_recording_progress_via_sync_endpoint(teacher, enrolled_student, published_course, db_session):
    tclient, tuser = teacher
    sclient, _suser = enrolled_student
    cls = tclient.post(
        f"/api/v1/classes?course_id={published_course['id']}",
        json={"title": "Sync Progress Lecture", "scheduled_start": "2026-11-02T10:00:00Z"},
    ).json()

    rec = ClassRecording(
        class_id=cls["id"],
        requested_by=tuser["id"],
        status=RecordingStatus.available,
        title="Signal Processing",
        is_published=True,
        duration_seconds=900,
        size_bytes=2048,
        audio_only=True,
    )
    db_session.add(rec)
    db_session.commit()

    resp = sclient.post(
        "/api/v1/sync/operations",
        json={
            "operations": [
                {
                    "operation_id": "rec-prog-001",
                    "operation_type": "recording_progress",
                    "entity_id": rec.id,
                    "payload": {"position_seconds": 420, "completed": True},
                }
            ]
        },
    )
    assert resp.status_code == 200
    assert resp.json()["results"][0]["status"] == "accepted"

    detail = sclient.get(f"/api/v1/recordings/{rec.id}")
    assert detail.status_code == 200
    assert detail.json()["progress_seconds"] == 420
    assert detail.json()["completed"] is True


def test_whiteboard_timeline_https_fallback_and_micro_bundle(teacher, enrolled_student, make_user, published_course, db_session):
    tclient, tuser = teacher
    sclient, _suser = enrolled_student
    outsider, _ = make_user(role="student")

    cls = tclient.post(
        f"/api/v1/classes?course_id={published_course['id']}",
        json={"title": "Micro-Bundle Lecture", "scheduled_start": "2026-11-02T10:00:00Z"},
    ).json()
    tclient.post(f"/api/v1/classes/{cls['id']}/start")

    wb_resp = tclient.post(
        f"/api/v1/classes/{cls['id']}/whiteboard-events",
        json={
            "events": [
                {"t_ms": 0, "msg": {"t": "open", "open": True}},
                {"t_ms": 1500, "msg": {"t": "txt", "id": "txt1", "x": 1000, "y": 1000, "s": "V = IR", "c": "#ffffff", "z": 24}},
            ]
        },
    )
    assert wb_resp.status_code == 200
    assert wb_resp.json()["recorded_events"] == 2

    cap_resp = tclient.post(
        f"/api/v1/classes/{cls['id']}/live-captions",
        json={"text": "Ohm's Law connects voltage, current, and resistance."},
    )
    assert cap_resp.status_code == 200

    feed = sclient.get(f"/api/v1/classes/{cls['id']}/fallback-feed?since_seq=0")
    assert feed.status_code == 200
    body = feed.json()
    assert len(body["events"]) == 3
    assert any(ev["kind"] == "caption" and "Ohm's Law" in ev["text"] for ev in body["events"])
    assert any(ev["kind"] == "whiteboard" and ev["msg"]["t"] == "txt" for ev in body["events"])

    delta = sclient.get(f"/api/v1/classes/{cls['id']}/fallback-feed?since_seq={body['latest_seq']}")
    assert delta.status_code == 200
    assert delta.json()["events"] == []

    # Unenrolled students are rejected cleanly
    assert outsider.get(f"/api/v1/classes/{cls['id']}/fallback-feed?since_seq=0").status_code == 403

    rec = ClassRecording(
        class_id=cls["id"],
        requested_by=tuser["id"],
        status=RecordingStatus.available,
        title="Micro Lecture",
        is_published=True,
        duration_seconds=1800,
        size_bytes=50_000_000,
        audio_only=False,
    )
    db_session.add(rec)
    db_session.flush()
    tr = LectureTranscript(class_id=cls["id"], recording_id=rec.id, content="Voltage equals current times resistance.", status=TranscriptStatus.ready)
    db_session.add(tr)
    db_session.add(
        LectureSummary(
            class_id=cls["id"],
            recording_id=rec.id,
            transcript_id=tr.id,
            content_json={"overview": "Ohm's law recap.", "key_concepts": ["V = IR"], "quiz_questions": []},
            status=SummaryStatus.completed,
        )
    )
    db_session.commit()

    detail = sclient.get(f"/api/v1/recordings/{rec.id}")
    assert detail.status_code == 200
    assert len(detail.json()["whiteboard_timeline"]) == 2

    micro = sclient.get(f"/api/v1/recordings/{rec.id}/bundle?mode=micro")
    assert micro.status_code == 200
    assert f"lesson-{cls['id']}-micro-bundle.zip" in micro.headers.get("content-disposition", "")
    with zipfile.ZipFile(io.BytesIO(micro.content), "r") as zf:
        names = zf.namelist()
        assert "metadata.json" in names
        assert "whiteboard_timeline.json" in names
        meta = json.loads(zf.read("metadata.json"))
        assert meta["bundle_mode"] == "micro"
        assert meta["audio_only"] is True
        assert meta["whiteboard_events"] == 2
        timeline = json.loads(zf.read("whiteboard_timeline.json"))
        assert timeline[1]["msg"]["s"] == "V = IR"


def test_summary_quiz_questions_and_target_language():
    out = llm_provider.generate_summary(
        "Photovoltaic efficiency drops significantly when surface dust accumulates cleanly across panels. Regular maintenance restores nominal irradiance capture.",
        target_language="te",
    )
    assert out["target_language"] == "te"
    assert isinstance(out["quiz_questions"], list)
    assert len(out["quiz_questions"]) >= 1
    first = out["quiz_questions"][0]
    assert len(first["options"]) == 4
    assert 0 <= first["answer_index"] < 4
