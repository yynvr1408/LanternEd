#!/usr/bin/env python3
"""Diagnostic script for validating ElevenLabs API credentials and text-to-speech synthesis."""

import os
import sys
import tempfile
from pathlib import Path
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))


def main():
    print("=" * 70)
    print("LanternEd ElevenLabs Voice Recap Diagnostic")
    print("=" * 70)

    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    model_id = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")

    masked_key = f"{api_key[:6]}...{api_key[-4:]}" if api_key and len(api_key) > 10 else "<NOT SET>"
    print(f"API Key:   {masked_key}")
    print(f"Voice ID:  {voice_id}")
    print(f"Model ID:  {model_id}")

    if not api_key:
        print("\n[ERROR] ELEVENLABS_API_KEY is not set in backend/.env")
        sys.exit(1)

    # 1. Test client initialization and user/voice query
    print("\n[1/3] Testing ElevenLabs client authentication...")
    try:
        from elevenlabs.client import ElevenLabs
        client = ElevenLabs(api_key=api_key)
        try:
            user_info = client.user.get()
            subscription = getattr(user_info, "subscription", None)
            char_count = getattr(subscription, "character_count", "N/A")
            char_limit = getattr(subscription, "character_limit", "N/A")
            tier = getattr(subscription, "tier", "standard")
            print(f"      [OK] User profile accessed. Tier: {tier}")
            print(f"           Character Usage: {char_count} / {char_limit}")
        except Exception as perm_err:
            print(f"      [INFO] user.get() permission check skipped ({perm_err})")
            print("             Proceeding directly to text-to-speech synthesis permissions...")
    except Exception as exc:
        print(f"      [FAIL] Failed to initialize ElevenLabs client: {exc}")
        sys.exit(1)

    # 2. Test voice query
    print(f"\n[2/3] Checking configured voice ID ({voice_id})...")
    try:
        voice = client.voices.get(voice_id=voice_id)
        voice_name = getattr(voice, "name", "Unknown")
        print(f"      [OK] Voice found: '{voice_name}' (ID: {voice_id})")
    except Exception as exc:
        print(f"      [INFO] Voice lookup note: {exc}")

    # 3. Test mini text synthesis probe
    print("\n[3/3] Synthesizing brief test audio recap probe...")
    test_phrase = "Welcome to LanternEd. Low bandwidth education powered by AI."
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)

    try:
        from app.integrations.elevenlabs_service import synthesize_lecture_recap
        result = synthesize_lecture_recap(test_phrase, tmp_path)
        if result and tmp_path.exists() and tmp_path.stat().st_size > 0:
            size_kb = tmp_path.stat().st_size / 1024
            print(f"      [OK] Audio synthesized successfully! Output size: {size_kb:.1f} KB")
        else:
            print("      [FAIL] Audio synthesis returned None or empty file.")
            sys.exit(1)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()

    print("-" * 70)
    print("RESULT: ElevenLabs Text-to-Speech is fully operational for LanternEd!")
    print("=" * 70)


if __name__ == "__main__":
    main()
