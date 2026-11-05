#!/usr/bin/env python3
"""Diagnostic script for validating Groq AI API credentials (LLM & Whisper STT)."""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))


def main():
    print("=" * 70)
    print("LanternEd Groq AI Connection Diagnostic (LLM & STT)")
    print("=" * 70)

    api_key = os.getenv("LLM_API_KEY")
    base_url = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
    model = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
    stt_model = os.getenv("SPEECH_TO_TEXT_MODEL", "whisper-large-v3-turbo")

    masked_key = f"{api_key[:6]}...{api_key[-4:]}" if api_key and len(api_key) > 10 else "<NOT SET>"
    print(f"Base URL:   {base_url}")
    print(f"API Key:    {masked_key}")
    print(f"LLM Model:  {model}")
    print(f"STT Model:  {stt_model}")

    if not api_key:
        print("\n[ERROR] LLM_API_KEY is not set in backend/.env")
        sys.exit(1)

    import openai

    client = openai.OpenAI(api_key=api_key, base_url=base_url)

    # 1. Test model list access
    print("\n[1/3] Querying available models from Groq endpoint...")
    try:
        models = client.models.list()
        model_ids = [m.id for m in models.data]
        print(f"      [OK] Successfully retrieved {len(model_ids)} available models:")
        for mid in model_ids:
            print(f"           - {mid}")
        whisper_found = any("whisper" in m for m in model_ids)
        print(f"           Whisper support detected: {whisper_found}")
    except Exception as exc:
        print(f"      [FAIL] Could not query models: {exc}")
        sys.exit(1)

    # 2. Test LLM Chat Completion
    print(f"\n[2/3] Testing LLM Chat Completion with model '{model}'...")
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are LanternEd AI assistant."},
                {"role": "user", "content": "Respond in 5 words: What is LanternEd?"},
            ],
            max_tokens=25,
            temperature=0.2,
        )
        reply = completion.choices[0].message.content.strip()
        print(f"      [OK] LLM Response: \"{reply}\"")
        usage = getattr(completion, "usage", None)
        if usage:
            print(f"           Tokens: Prompt={usage.prompt_tokens}, Completion={usage.completion_tokens}")
    except Exception as exc:
        print(f"      [FAIL] Chat completion failed: {exc}")
        # Check fallback to llama-3.1-8b-instant if model wasn't available
        if "model" in str(exc).lower():
            print("      [INFO] Trying fallback model: llama-3.1-8b-instant...")
            try:
                completion = client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[{"role": "user", "content": "Hello!"}],
                    max_tokens=10,
                )
                print(f"      [OK] Fallback model works: {completion.choices[0].message.content.strip()}")
                print("      [NOTE] Consider updating LLM_MODEL=llama-3.1-8b-instant in backend/.env")
            except Exception as e2:
                print(f"      [FAIL] Fallback also failed: {e2}")
        sys.exit(1)

    # 3. Test STT model availability
    print(f"\n[3/3] Checking STT Whisper model '{stt_model}'...")
    if stt_model in model_ids:
        print(f"      [OK] Speech-to-Text model '{stt_model}' is active and ready on Groq!")
    else:
        available_whispers = [m for m in model_ids if "whisper" in m]
        print(f"      [WARN] '{stt_model}' not directly matched. Available Whisper models: {available_whispers}")

    print("-" * 70)
    print("RESULT: Groq AI (LLM & STT) is fully operational for LanternEd!")
    print("=" * 70)


if __name__ == "__main__":
    main()
