"""A student's voice is only put on a recording after they have accepted the recording notice."""

from tests.api.test_classes import _create_class, mock_livekit  # noqa: F401  (fixture reuse)


def _live_recorded_class(tclient, course, mock_recording_pipeline):
    cls = _create_class(tclient, course["id"])
    tclient.post(f"/api/v1/classes/{cls['id']}/start")
    assert tclient.post(f"/api/v1/classes/{cls['id']}/recordings/start").status_code in (200, 201)
    return cls


def test_speaking_during_a_recording_needs_the_notice_to_be_accepted(
    mock_livekit, mock_recording_pipeline, teacher, enrolled_student, published_course  # noqa: F811
):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    cls = _live_recorded_class(tclient, published_course, mock_recording_pipeline)
    assert sclient.post(f"/api/v1/classes/{cls['id']}/join-token").json()["recording_active"] is True

    refused = sclient.post(f"/api/v1/classes/{cls['id']}/speak-requests")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "RECORDING_CONSENT_REQUIRED"

    assert sclient.post(f"/api/v1/classes/{cls['id']}/recording-consent").status_code == 204
    assert sclient.post(f"/api/v1/classes/{cls['id']}/recording-consent").status_code == 204  # idempotent
    assert sclient.post(f"/api/v1/classes/{cls['id']}/speak-requests").status_code == 204


def test_no_notice_is_needed_when_nothing_is_being_recorded(mock_livekit, teacher, enrolled_student, published_course):  # noqa: F811
    tclient, _ = teacher
    sclient, _ = enrolled_student
    cls = _create_class(tclient, published_course["id"])
    tclient.post(f"/api/v1/classes/{cls['id']}/start")
    sclient.post(f"/api/v1/classes/{cls['id']}/join-token")
    assert sclient.post(f"/api/v1/classes/{cls['id']}/speak-requests").status_code == 204


def test_consent_is_per_class_and_only_for_enrolled_students(
    mock_livekit, mock_recording_pipeline, teacher, enrolled_student, published_course, make_user  # noqa: F811
):
    tclient, _ = teacher
    sclient, _ = enrolled_student
    first = _live_recorded_class(tclient, published_course, mock_recording_pipeline)
    other = _create_class(tclient, published_course["id"])
    sclient.post(f"/api/v1/classes/{first['id']}/recording-consent")

    tclient.post(f"/api/v1/classes/{other['id']}/start")
    tclient.post(f"/api/v1/classes/{other['id']}/recordings/start")
    sclient.post(f"/api/v1/classes/{other['id']}/join-token")
    assert sclient.post(f"/api/v1/classes/{other['id']}/speak-requests").status_code == 409  # a different class

    stranger, _ = make_user(role="student", prefix="stranger")
    assert stranger.post(f"/api/v1/classes/{first['id']}/recording-consent").status_code in (403, 404)
    assert tclient.post(f"/api/v1/classes/{first['id']}/recording-consent").status_code in (403, 404)
