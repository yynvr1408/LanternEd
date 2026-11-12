"""Tests covering coding sandboxes, SCORM/H5P/xAPI/LTI interoperability, proctoring, OER packs, and offline NLP."""

import hashlib
import io
import json
import zipfile
from datetime import datetime, timedelta, timezone

from app.integrations import llm_provider


def _make_zip(files: dict[str, str | bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path, content in files.items():
            zf.writestr(path, content)
    return buf.getvalue()


def test_coding_sandbox_run_and_auto_grading(teacher, enrolled_student, published_course):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    course_id = published_course["id"]

    bank = tclient.post(f"/api/v1/courses/{course_id}/question-banks", json={"title": "CS Coding Lab"}).json()
    item = tclient.post(
        f"/api/v1/question-banks/{bank['id']}/items",
        json={
            "question_type": "coding",
            "prompt": "Read two space-separated integers and print their sum.",
            "default_marks": 10.0,
            "code_harness": {
                "language": "python",
                "starter_code": "a, b = map(int, input().split())\nprint(a + b)",
                "test_cases": [
                    {"name": "Sample", "stdin": "2 3", "expected_stdout": "5", "hidden": False},
                    {"name": "Hidden Negative", "stdin": "-4 9", "expected_stdout": "5", "hidden": True},
                ],
            },
        },
    )
    assert item.status_code == 201
    q_id = item.json()["id"]

    now = datetime.now(timezone.utc)
    exam = tclient.post(
        f"/api/v1/courses/{course_id}/exams",
        json={
            "title": "Python Lab Exam",
            "duration_minutes": 30,
            "start_window": (now - timedelta(minutes=5)).isoformat(),
            "end_window": (now + timedelta(hours=2)).isoformat(),
            "total_marks": 10.0,
            "require_webcam_proctoring": True,
            "require_device_lockdown": True,
            "sections": [{"title": "Coding", "marks_per_question": 10.0, "question_bank_id": bank["id"]}],
        },
    )
    assert exam.status_code == 201
    exam_id = exam.json()["id"]
    assert exam.json()["require_webcam_proctoring"] is True
    assert exam.json()["require_device_lockdown"] is True

    start_resp = sclient.post(f"/api/v1/exams/{exam_id}/start")
    assert start_resp.status_code == 200
    start_data = start_resp.json()
    attempt_id = start_data["attempt_id"]
    # Hidden test cases must never be leaked to students
    assert len(start_data["questions"][0]["code_harness"]["sample_test_cases"]) == 1

    run_resp = sclient.post(
        f"/api/v1/exams/{exam_id}/run-code",
        json={
            "attempt_id": attempt_id,
            "question_id": q_id,
            "language": "python",
            "source_code": "import os\na, b = map(int, input().split())\nprint(a + b)",
            "stdin": "10 20",
        },
    )
    assert run_resp.status_code == 200
    run_data = run_resp.json()
    assert run_data["compiler_available"] is True
    assert run_data["stdout"].strip() == "30"
    assert len(run_data["test_results"]) == 1
    assert run_data["test_results"][0]["passed"] is True

    # Environment secret isolation check
    leak_check = sclient.post(
        f"/api/v1/exams/{exam_id}/run-code",
        json={
            "attempt_id": attempt_id,
            "language": "python",
            "source_code": "import os; print(os.environ.get('SESSION_SECRET', 'CLEAN'))",
        },
    )
    assert leak_check.json()["stdout"].strip() == "CLEAN"

    # Submit coding solution -> auto-graded to 10/10
    submit = sclient.post(
        f"/api/v1/exams/{exam_id}/submit",
        json={
            "attempt_id": attempt_id,
            "final_answers": {
                q_id: {"language": "python", "code": "a, b = map(int, input().split())\nprint(a + b)"}
            },
        },
    )
    assert submit.status_code == 200
    assert submit.json()["auto_graded_score"] == 10.0
    assert submit.json()["pending_manual_evaluation"] is False


def test_proctoring_snapshots_and_live_monitor(teacher, enrolled_student, published_course):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    course_id = published_course["id"]
    now = datetime.now(timezone.utc)

    exam = tclient.post(
        f"/api/v1/courses/{course_id}/exams",
        json={
            "title": "Proctored Quiz",
            "duration_minutes": 20,
            "start_window": (now - timedelta(minutes=5)).isoformat(),
            "end_window": (now + timedelta(hours=1)).isoformat(),
            "total_marks": 10.0,
            "require_webcam_proctoring": True,
            "require_device_lockdown": True,
        },
    ).json()
    attempt_id = sclient.post(f"/api/v1/exams/{exam['id']}/start").json()["attempt_id"]

    snap = sclient.post(
        f"/api/v1/exams/{exam['id']}/proctor-snapshot",
        json={
            "attempt_id": attempt_id,
            "image_data_url": "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
            "face_detected": True,
            "camera_status": "active",
        },
    )
    assert snap.status_code == 200
    assert snap.json()["recorded"] is True

    monitor = tclient.get(f"/api/v1/exams/{exam['id']}/proctor-monitor")
    assert monitor.status_code == 200
    rows = monitor.json()
    assert len(rows) == 1
    assert rows[0]["snapshot_count"] == 1
    assert rows[0]["latest_snapshot_url"].startswith("data:image/jpeg")

    flagged = tclient.post(
        f"/api/v1/exams/{exam['id']}/attempts/{attempt_id}/flag",
        json={"is_flagged": True, "reason": "Manual verification requested"},
    )
    assert flagged.status_code == 200
    assert flagged.json()["is_flagged_for_review"] is True


def test_scorm_h5p_lti_xapi_and_offline_sync(teacher, enrolled_student, published_course):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    course_id = published_course["id"]

    scorm_zip = _make_zip(
        {
            "imsmanifest.xml": (
                '<manifest identifier="M1"><metadata><schema>ADL SCORM</schema>'
                "<schemaversion>1.2</schemaversion></metadata><organizations><organization>"
                "<title>Interactive Circuits Lab</title></organization></organizations>"
                '<resources><resource identifier="R1" href="module/index.html"/></resources></manifest>'
            ),
            "module/index.html": "<html><body><h1>Circuits Lab</h1></body></html>",
        }
    )
    up = tclient.post(
        f"/api/v1/interop/courses/{course_id}/import-package",
        files={"file": ("circuits.zip", scorm_zip, "application/zip")},
    )
    assert up.status_code == 201
    pkg = up.json()
    assert pkg["standard"] == "scorm_1_2"
    assert pkg["title"] == "Interactive Circuits Lab"
    assert pkg["entry_point"] == "module/index.html"

    asset = sclient.get(f"/api/v1/interop/packages/{pkg['id']}/content/module/index.html")
    assert asset.status_code == 200
    assert "Circuits Lab" in asset.text

    lti = tclient.post(
        "/api/v1/interop/lti/tools",
        json={"course_id": course_id, "title": "BodhiTree Lab", "launch_url": "https://lab.example.edu/lti"},
    )
    assert lti.status_code == 201
    launch = sclient.post(f"/api/v1/interop/lti/launch/{lti.json()['id']}")
    assert launch.status_code == 200
    assert launch.json()["id_token"].count(".") == 2

    sync_xapi = sclient.post(
        "/api/v1/sync/operations",
        json={
            "operations": [
                {
                    "operation_id": "xapi-op-1",
                    "operation_type": "xapi_statement",
                    "entity_id": course_id,
                    "payload": {
                        "verb": {"id": "http://adlnet.gov/expapi/verbs/completed", "display": {"en-US": "completed"}},
                        "object": {"id": f"urn:lanterned:scorm:{pkg['id']}", "definition": {"name": {"en-US": pkg["title"]}}},
                        "result": {"score": {"scaled": 0.95}, "completion": True},
                    },
                }
            ]
        },
    )
    assert sync_xapi.status_code == 200
    assert sync_xapi.json()["results"][0]["status"] == "accepted"

    lrs = sclient.get(f"/api/v1/interop/xapi/statements?course_id={course_id}")
    assert lrs.status_code == 200
    assert len(lrs.json()["statements"]) == 1
    assert lrs.json()["statements"][0]["result"]["score"]["scaled"] == 0.95


def test_oer_catalog_lanternpack_export_and_extractive_nlp(teacher, enrolled_student, published_course):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    course_id = published_course["id"]

    tclient.post(
        f"/api/v1/courses/{course_id}/lessons",
        json={"title": "Thermodynamics", "content": "Entropy measures disorder. Heat flows from hot to cold.", "status": "published"},
    )

    cat = sclient.get("/api/v1/oer/catalog")
    assert cat.status_code == 200
    packs = cat.json()["packs"]
    assert len(packs) >= 3

    exp = sclient.get(f"/api/v1/oer/courses/{course_id}/export-pack")
    assert exp.status_code == 200
    with zipfile.ZipFile(io.BytesIO(exp.content)) as zf:
        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["format"] == "lanternpack-v1"
        lessons_raw = zf.read("lessons.json")
        lessons_entry = next(f for f in manifest["files"] if f["path"] == "lessons.json")
        assert hashlib.sha256(lessons_raw).hexdigest() == lessons_entry["sha256"]

    # Verify extractive NLP offline summarizer extracts real definitions and keywords
    transcript = (
        "Today we study electrical circuits. Ohm's Law is defined as V equals I times R across a conductor. "
        "Important formula: electrical power equals voltage multiplied by current. "
        "Therefore doubling current quadruples resistive heat dissipation."
    )
    summary = llm_provider.generate_summary(transcript)
    assert summary["source"] == "stub"
    assert summary["offline_nlp_engine"] == "extractive-tfidf-v1"
    assert len(summary["definitions"]) >= 1
    assert len(summary["quiz_questions"]) >= 1
