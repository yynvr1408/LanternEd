#!/usr/bin/env python3
"""Diagnostic script for validating LiveKit Cloud credentials and API connectivity."""

import asyncio
import os
import sys
import uuid
from pathlib import Path
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))


async def main():
    print("=" * 70)
    print("LanternEd LiveKit Cloud Connection Diagnostic")
    print("=" * 70)

    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    print(f"Server URL:     {url or '<NOT SET>'}")
    masked_key = f"{api_key[:6]}...{api_key[-4:]}" if api_key and len(api_key) > 10 else "<NOT SET>"
    print(f"API Key:        {masked_key}")
    print(f"API Secret:     {'[CONFIGURED]' if api_secret else '<NOT SET>'}")

    if not (url and api_key and api_secret):
        print("\n[ERROR] LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must all be set in backend/.env")
        sys.exit(1)

    # 1. Test token generation
    print("\n[1/3] Testing JWT access token minting...")
    from app.integrations import livekit
    test_room = f"test-probe-{uuid.uuid4().hex[:8]}"
    token = livekit.generate_access_token(
        identity="probe-tester",
        name="Connectivity Probe",
        room_name=test_room,
        can_publish=True,
    )
    if token and len(token) > 20:
        print(f"      [OK] JWT generated successfully ({len(token)} chars).")
    else:
        print("      [FAIL] Token generation returned empty or invalid token.")
        sys.exit(1)

    # 2. Test live server room creation
    print(f"\n[2/3] Testing LiveKit Cloud API room creation (Room: {test_room})...")
    from livekit import api
    client = api.LiveKitAPI(url, api_key, api_secret)
    try:
        room = await client.room.create_room(api.CreateRoomRequest(name=test_room, empty_timeout=60))
        print(f"      [OK] Room created successfully! (SID: {room.sid}, Name: {room.name})")
    except Exception as exc:
        print(f"      [FAIL] Could not connect to LiveKit server: {exc}")
        await client.aclose()
        sys.exit(1)

    # 3. Test room cleanup (deletion)
    print(f"\n[3/3] Testing room deletion probe...")
    try:
        await client.room.delete_room(api.DeleteRoomRequest(room=test_room))
        print("      [OK] Probe room deleted successfully.")
    except Exception as exc:
        print(f"      [WARN] Could not clean up probe room: {exc}")
    finally:
        await client.aclose()

    print("-" * 70)
    print("RESULT: LiveKit Cloud is fully configured and operational for LanternEd!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
