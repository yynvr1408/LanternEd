"""An empty numeric line copied from .env.example must mean 'not set', never crash startup."""

import pytest

from app.config import Settings


@pytest.mark.parametrize(
    "name,expected_attr,expected",
    [
        ("RECORDING_RETENTION_DAYS", "recording_retention_days", None),
        ("AUDIT_LOG_RETENTION_DAYS", "audit_log_retention_days", None),
        ("NOTIFICATION_RETENTION_DAYS", "notification_retention_days", 90),
        ("SENTRY_TRACES_SAMPLE_RATE", "sentry_traces_sample_rate", 0.0),
    ],
)
def test_blank_means_the_default(monkeypatch, name, expected_attr, expected):
    monkeypatch.setenv(name, "")
    assert getattr(Settings(), expected_attr) == expected


def test_real_values_still_parse(monkeypatch):
    monkeypatch.setenv("RECORDING_RETENTION_DAYS", "180")
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0.25")
    s = Settings()
    assert s.recording_retention_days == 180 and s.sentry_traces_sample_rate == 0.25


def test_garbage_is_still_rejected(monkeypatch):
    monkeypatch.setenv("RECORDING_RETENTION_DAYS", "soon")
    with pytest.raises(Exception):
        Settings()
