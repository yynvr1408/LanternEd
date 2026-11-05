#!/usr/bin/env python3
"""
LanternEd - Resend Email & OTP Diagnostic Tool
=============================================

Tests your Resend API key and sender address by dispatching a real test OTP email.

Usage:
    # Uses RESEND_API_KEY and EMAIL_FROM from backend/.env:
    python scripts/test_resend_email.py --to user@example.com

    # Or specify credentials explicitly:
    python scripts/test_resend_email.py \
        --to user@example.com \
        --api-key "re_xxxxxxxxx" \
        --from-email "LanternEd <onboarding@resend.dev>"
"""

import sys
import os
import argparse
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings


def main():
    parser = argparse.ArgumentParser(description="Test Resend Email Delivery")
    parser.add_argument("--to", required=True, help="Recipient email address for the test OTP")
    parser.add_argument("--api-key", help="Resend API Key (re_...)")
    parser.add_argument("--from-email", help="Verified sender address (e.g., LanternEd <onboarding@resend.dev>)")
    parser.add_argument("--kind", choices=["reset", "login", "registration", "deletion"], default="registration", help="Email template type")
    args = parser.parse_args()

    settings = get_settings()
    api_key = args.api_key or os.environ.get("RESEND_API_KEY") or settings.resend_api_key
    from_email = args.from_email or os.environ.get("EMAIL_FROM") or settings.email_from

    print("=" * 70)
    print("LanternEd Resend Email & OTP Diagnostic")
    print("=" * 70)

    if not api_key or not from_email:
        print("[!] Incomplete Resend configuration.")
        print(f"    RESEND_API_KEY: {'*' * 8 if api_key else '<NOT SET>'}")
        print(f"    EMAIL_FROM:     {from_email or '<NOT SET>'}")
        print("\nTo configure, set in backend/.env:")
        print("    RESEND_API_KEY=re_123456789...")
        print("    EMAIL_FROM=LanternEd <onboarding@resend.dev>  # or verified domain")
        sys.exit(1)

    print(f"Recipient:  {args.to}")
    print(f"Sender:     {from_email}")
    print(f"API Key:    {api_key[:6]}...{api_key[-4:] if len(api_key) > 10 else ''}")
    print(f"Email Type: {args.kind}")

    import httpx
    from app.integrations import email

    test_otp = "849201"
    print(f"\nSending test OTP ({test_otp}) via Resend REST API...")

    # Override settings in runtime if flags were provided
    if args.api_key:
        settings.resend_api_key = args.api_key
    if args.from_email:
        settings.email_from = args.from_email

    success = email._send_resend(
        to_email=args.to,
        kind=args.kind,
        otp=test_otp,
        ttl_minutes=5
    )

    if success:
        print("\n[SUCCESS] Test email dispatched successfully via Resend!")
        print("Check your inbox (or spam folder) for the verification code.")
    else:
        print("\n[ERROR] Resend failed to dispatch the test email.")
        print("\nTroubleshooting Tips:")
        print("1. If using Resend sandbox (onboarding@resend.dev), you can ONLY send to the email address registered with your Resend account.")
        print("2. For custom domains, verify that SPF and DKIM DNS records are verified in the Resend Domains dashboard.")
        print("3. Ensure your API key starts with 're_' and has 'Sending access'.")
        sys.exit(1)

    print("=" * 70)


if __name__ == "__main__":
    main()
