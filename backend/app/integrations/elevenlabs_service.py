"""ElevenLabs text-to-speech integration for concise, low-bandwidth audio lecture summaries."""

import logging
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_RECAP_CHARS = 2500


def _truncate_text(text: str, max_chars: int = MAX_RECAP_CHARS) -> str:
    cleaned = text.strip()
    if len(cleaned) <= max_chars:
        return cleaned

    # Attempt to cut at a sentence boundary before max_chars
    truncated = cleaned[:max_chars]
    last_period = truncated.rfind(".")
    last_newline = truncated.rfind("\n")
    cutoff = max(last_period, last_newline)

    if cutoff > max_chars * 0.7:  # Keep at least 70% of max length
        return truncated[: cutoff + 1].strip()

    # Fallback: break at last word boundary
    last_space = truncated.rfind(" ")
    if last_space > 0:
        return truncated[:last_space].strip() + "..."
    return truncated + "..."


def is_configured() -> bool:
    return bool(settings.elevenlabs_api_key and settings.elevenlabs_api_key.strip())


def synthesize_lecture_recap(summary_text: str, output_path: str | Path) -> str | None:
    """Synthesize a concise ~2-minute audio recap of the lecture summary.

    Safe for low-bandwidth mobile connections (~1.2 MB MP3 using mp3_44100_128).
    Gracefully returns None if credentials are missing, quota is exceeded, or API call fails.
    """
    if not is_configured():
        logger.warning("ELEVENLABS_API_KEY is not configured; skipping lecture audio recap.")
        return None

    if not summary_text or not summary_text.strip():
        logger.warning("Empty summary text provided to synthesize_lecture_recap; skipping.")
        return None

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)

    text_to_speak = _truncate_text(summary_text, MAX_RECAP_CHARS)
    voice_id = settings.elevenlabs_voice_id or "21m00Tcm4TlvDq8ikWAM"
    model_id = settings.elevenlabs_model_id or "eleven_turbo_v2_5"

    try:
        from elevenlabs.client import ElevenLabs

        client = ElevenLabs(api_key=settings.elevenlabs_api_key)
        audio_stream = client.text_to_speech.convert(
            voice_id=voice_id,
            text=text_to_speak,
            model_id=model_id,
            output_format="mp3_44100_128",
        )

        with open(out_file, "wb") as f:
            for chunk in audio_stream:
                if chunk:
                    f.write(chunk)

        if not out_file.exists() or out_file.stat().st_size == 0:
            logger.error("ElevenLabs synthesis produced empty output file at %s", out_file)
            return None

        logger.info(
            "Successfully synthesized lecture recap (%d bytes) to %s",
            out_file.stat().st_size,
            out_file,
        )
        return str(out_file)

    except Exception as exc:  # Catch quota, auth, network errors
        logger.error(
            "ElevenLabs audio recap synthesis failed: %s (type=%s)",
            exc,
            type(exc).__name__,
            exc_info=True,
        )
        return None
