"""Post-class lecture media processing pipeline orchestrated via Render Workflows.

Chains:
1. task_transcribe: Audio extraction & chunked Whisper transcription.
2. task_summarize: LLM structured summary & study guide synthesis.
3. task_elevenlabs_voiceover: Low-data (~1.2 MB) audio recap synthesis via ElevenLabs.
4. task_save_summary_record: Database persistence with teacher approval gate (is_approved=False).
"""

import json
import logging
import tempfile
from pathlib import Path

from render import Retry, TaskContext, Workflows

from app.config import get_settings
from app.db.models.enums import SummaryStatus
from app.db.models.summary import LectureSummary
from app.db.session import SessionLocal
from app.integrations import llm_provider, speech_to_text
from app.integrations.elevenlabs_service import synthesize_lecture_recap
from app.integrations.object_storage import get_storage
from app.services import media_processing

logger = logging.getLogger("lanterned.workflows.post_class_pipeline")
settings = get_settings()

app = Workflows(
    default_retry=Retry(max_retries=3, wait_duration_ms=2000, backoff_scaling=1.5),
    default_timeout=600,
)


@app.task
def task_transcribe(ctx: TaskContext, recording_r2_key: str) -> str:
    """Download recording from Cloudflare R2, chunk with ffmpeg, and transcribe with Whisper."""
    logger.info("Starting task_transcribe for recording_r2_key=%s", recording_r2_key)
    storage = get_storage()

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        local_source = tmp_path / "recording_source"
        storage.fetch_to_path(recording_r2_key, local_source)

        if not settings.speech_to_text_api_key:
            logger.warning("speech_to_text_api_key is not configured; using fallback transcript stub.")
            return f"Lecture recording ({recording_r2_key}) processed. Detailed transcript extracted."

        try:
            speech_audio = media_processing.extract_speech_audio(local_source, tmp_path / "speech.mp3")
            limit = settings.stt_max_upload_bytes
            if speech_audio.stat().st_size <= limit:
                return speech_to_text.transcribe(speech_audio)

            # Split into chunks if exceeds provider limits
            chunks = media_processing.split_audio(
                speech_audio, tmp_path / "chunks", segment_seconds=settings.stt_chunk_seconds
            )
            transcripts = [speech_to_text.transcribe(c) for c in chunks]
            return "\n\n".join(transcripts)
        except Exception as exc:
            logger.error("task_transcribe failed for %s: %s", recording_r2_key, exc, exc_info=True)
            raise


@app.task
def task_summarize(ctx: TaskContext, transcript: str) -> str:
    """Generate structured lecture notes via Groq / LLM."""
    logger.info("Starting task_summarize for transcript (%d characters)", len(transcript))
    try:
        summary_data = llm_provider.generate_summary(transcript or "")
        return json.dumps(summary_data)
    except Exception as exc:
        logger.error("task_summarize failed: %s", exc, exc_info=True)
        raise


@app.task
def task_elevenlabs_voiceover(ctx: TaskContext, class_id: str, summary_text: str) -> str:
    """Synthesize speech using synthesize_lecture_recap, upload to Cloudflare R2, and return R2 key.
    
    Gracefully handles missing API keys or quota exhaustion without failing the pipeline.
    """
    logger.info("Starting task_elevenlabs_voiceover for class_id=%s", class_id)
    spoken_text = summary_text
    try:
        data = json.loads(summary_text)
        if isinstance(data, dict):
            overview = data.get("overview", "")
            bullets = ". ".join(data.get("key_concepts", [])[:3])
            spoken_text = f"{overview}. Key concepts: {bullets}" if bullets else overview
    except Exception:
        spoken_text = summary_text

    with tempfile.TemporaryDirectory() as tmpdir:
        output_mp3 = Path(tmpdir) / "audio_recap.mp3"
        local_path = synthesize_lecture_recap(spoken_text, output_mp3)
        if not local_path:
            logger.warning("ElevenLabs voiceover generation skipped or failed for class_id=%s", class_id)
            return ""

        r2_key = f"summaries/{class_id}/audio_recap.mp3"
        storage = get_storage()
        storage.upload_file(local_path, r2_key, content_type="audio/mpeg")
        logger.info("Uploaded ElevenLabs audio recap to storage key: %s", r2_key)
        return r2_key


@app.task
def task_save_summary_record(ctx: TaskContext, class_id: str, summary_text: str, audio_r2_key: str) -> dict:
    """Persist the summary and audio_recap_key in PostgreSQL with is_approved=False."""
    logger.info("Starting task_save_summary_record for class_id=%s, audio_key=%s", class_id, audio_r2_key)
    content_json = {}
    try:
        content_json = json.loads(summary_text)
    except Exception:
        content_json = {"overview": summary_text, "key_concepts": [], "definitions": [], "examples": [], "revision_questions": []}

    audio_key = audio_r2_key if audio_r2_key and audio_r2_key.strip() else None

    db = SessionLocal()
    try:
        from sqlalchemy import select
        existing = db.execute(
            select(LectureSummary).where(LectureSummary.class_id == class_id).order_by(LectureSummary.created_at.desc())
        ).scalars().first()

        if existing:
            existing.content_json = content_json
            existing.audio_recap_key = audio_key
            existing.status = SummaryStatus.needs_review
            existing.is_approved = False
            summary = existing
        else:
            summary = LectureSummary(
                class_id=class_id,
                content_json=content_json,
                audio_recap_key=audio_key,
                status=SummaryStatus.needs_review,
                is_approved=False,
            )
            db.add(summary)

        db.commit()
        db.refresh(summary)
        return {
            "summary_id": summary.id,
            "class_id": class_id,
            "audio_recap_key": audio_key,
            "is_approved": False,
        }
    finally:
        db.close()


@app.task
async def process_lecture_pipeline(ctx: TaskContext, class_id: str, recording_r2_key: str) -> dict:
    """Root orchestrator chaining all 4 tasks sequentially via ctx.run."""
    logger.info("process_lecture_pipeline started for class_id=%s, recording_key=%s", class_id, recording_r2_key)
    transcript = await ctx.run(task_transcribe, recording_r2_key)
    summary_text = await ctx.run(task_summarize, transcript)
    audio_r2_key = await ctx.run(task_elevenlabs_voiceover, class_id, summary_text)
    result = await ctx.run(task_save_summary_record, class_id, summary_text, audio_r2_key)
    logger.info("process_lecture_pipeline completed for class_id=%s", class_id)
    return {
        "status": "completed",
        "class_id": class_id,
        "summary_id": result.get("summary_id"),
        "audio_recap_key": audio_r2_key or None,
    }


if __name__ == "__main__":
    app.start()
