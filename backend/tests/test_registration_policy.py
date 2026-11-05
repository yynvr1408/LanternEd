"""Test registration policy: ensure tests run when executed from tests/test_registration_policy.py."""

from tests.api.test_registration_policy import (  # noqa: F401
    invite_required,
    test_a_blocked_email_cannot_register_as_student_or_teacher,
    test_a_blocked_email_check_is_case_and_whitespace_insensitive,
    test_a_student_cannot_register_as_teacher_by_sending_an_invite_for_students,
    test_blocked_email_domains_can_be_configured_via_settings,
    test_extra_blocked_emails_can_be_configured_via_settings,
    test_legitimate_emails_pass_policy_validation,
    test_role_cannot_be_escalated_through_profile_update,
    test_student_registration_never_needs_an_invite,
    test_teacher_registration_is_closed_in_production_without_an_invite_code,
    test_teacher_registration_needs_the_invite_code,
)
