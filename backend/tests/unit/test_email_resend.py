"""Resend delivery: used when configured, never leaks the code into logs, degrades safely on failure."""

import logging

import httpx
import pytest

from app.integrations import email


@pytest.fixture
def resend(monkeypatch):
    monkeypatch.setattr(email.settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(email.settings, "email_from", "LanternEd <no-reply@example.test>")
    sent = []

    def fake_post(url, **kwargs):
        sent.append((url, kwargs))
        return httpx.Response(200, json={"id": "abc"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(email.httpx, "post", fake_post)
    return sent


@pytest.mark.parametrize(
    "sender,subject_word",
    [
        (email.send_otp_email, "password reset"),
        (email.send_login_approval_otp_email, "sign-in"),
        (email.send_registration_otp_email, "Verify your email"),
        (email.send_college_deletion_otp_email, "college deletion"),
    ],
)
def test_each_otp_email_goes_through_resend_with_the_code(resend, sender, subject_word):
    assert sender(to="asha@example.com", otp="482913", ttl_minutes=5) is True
    url, kwargs = resend[0]
    assert url == email.RESEND_API_URL and kwargs["headers"]["Authorization"] == "Bearer re_test_key"
    body = kwargs["json"]
    assert body["to"] == ["asha@example.com"] and body["from"] == "LanternEd <no-reply@example.test>"
    assert subject_word.lower() in body["subject"].lower()
    assert "482913" in body["text"] and "482913" in body["html"] and "5 minutes" in body["text"]


def test_resend_is_preferred_over_emailjs_when_both_are_configured(resend, monkeypatch):
    monkeypatch.setattr(email.settings, "emailjs_service_id", "svc")
    monkeypatch.setattr(email.settings, "emailjs_template_id", "tpl")
    monkeypatch.setattr(email.settings, "emailjs_public_key", "pub")
    email.send_otp_email(to="a@example.com", otp="111111", ttl_minutes=5)
    assert [u for u, _ in resend] == [email.RESEND_API_URL]


def test_a_failed_send_returns_false_and_never_logs_the_code(monkeypatch, caplog):
    monkeypatch.setattr(email.settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(email.settings, "email_from", "x@example.test")
    monkeypatch.setattr(
        email.httpx, "post", lambda url, **kw: httpx.Response(422, text="bad: 987654", request=httpx.Request("POST", url))
    )
    with caplog.at_level(logging.DEBUG):
        assert email.send_otp_email(to="a@example.com", otp="987654", ttl_minutes=5) is False
    assert "987654" not in caplog.text


def test_a_network_error_returns_false(monkeypatch):
    monkeypatch.setattr(email.settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(email.settings, "email_from", "x@example.test")

    def boom(url, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(email.httpx, "post", boom)
    assert email.send_registration_otp_email(to="a@example.com", otp="123456", ttl_minutes=5) is False


def test_email_configured_reflects_either_provider(monkeypatch):
    s = email.settings
    for name in ("resend_api_key", "email_from", "emailjs_service_id", "emailjs_template_id", "emailjs_public_key"):
        monkeypatch.setattr(s, name, None)
    assert s.email_configured is False
    monkeypatch.setattr(s, "resend_api_key", "k")
    assert s.email_configured is False  # a key without a from-address cannot send
    monkeypatch.setattr(s, "email_from", "a@example.test")
    assert s.email_configured is True
