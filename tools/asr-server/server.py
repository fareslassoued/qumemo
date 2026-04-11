"""
Local faster-whisper ASR server for Quran recitation tracking.

Loads tarteel-ai/whisper-base-ar-quran at startup and exposes:
  GET  /health           — readiness probe
  WS   /ws/transcribe    — streaming audio → text via WebSocket

Audio arrives as WebM/Opus chunks from the browser's MediaRecorder,
decoded to 16 kHz mono PCM via ffmpeg subprocess.
"""

import io
import logging
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("asr-server")

# ── Model ────────────────────────────────────────────────

MODEL_ID = "tarteel-ai/whisper-base-ar-quran"
COMPUTE_TYPE = "int8"  # float16 for GPU, int8 for CPU
DEVICE = "auto"        # auto-detects CUDA if available
CT2_DIR = Path(__file__).parent / ".ct2-models" / "whisper-base-ar-quran"

model: WhisperModel | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    if not (CT2_DIR / "model.bin").exists():
        logger.error(
            "CT2 model not found at %s\n"
            "Run the conversion first:  uv run python convert_model.py",
            CT2_DIR,
        )
        sys.exit(1)

    logger.info("Loading CT2 model from %s (compute_type=%s) ...", CT2_DIR, COMPUTE_TYPE)
    model = WhisperModel(str(CT2_DIR), device=DEVICE, compute_type=COMPUTE_TYPE)
    logger.info("Model loaded, ready to serve.")
    yield
    model = None


app = FastAPI(title="Quran ASR Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ───────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok" if model else "loading",
        "model": MODEL_ID,
        "device": DEVICE,
    }


# ── Audio decoding ───────────────────────────────────────

def decode_webm_to_pcm(webm_bytes: bytes) -> np.ndarray | None:
    """Decode WebM/Opus to 16 kHz mono float32 via ffmpeg."""
    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-i", "pipe:0",
                "-f", "s16le", "-ar", "16000", "-ac", "1",
                "pipe:1",
            ],
            input=webm_bytes,
            capture_output=True,
            timeout=10,
        )
        if proc.returncode != 0 or len(proc.stdout) == 0:
            return None
        pcm = np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0
        return pcm
    except Exception as e:
        logger.warning("ffmpeg decode failed: %s", e)
        return None


# ── WebSocket transcription ──────────────────────────────

# Minimum audio (seconds) before first transcription attempt
MIN_AUDIO_SECONDS = 2.0
# Minimum NEW bytes before re-decoding + transcribing
MIN_NEW_BYTES = 8000
SAMPLE_RATE = 16000
# Sliding window: only transcribe the last N seconds of audio.
# Prevents growing latency and Whisper's 30s attention window truncation.
WINDOW_SECONDS = 15.0
# Emit is_final=true when transcription text stabilizes for N consecutive
# transcriptions. This triggers matchChunk recovery in the client.
STABILITY_THRESHOLD = 3


@app.websocket("/ws/transcribe")
async def ws_transcribe(ws: WebSocket):
    await ws.accept()
    logger.info("WebSocket client connected")

    # Accumulate raw WebM bytes — they form one continuous stream
    # (first chunk has header, subsequent chunks are cluster continuations)
    webm_buffer = io.BytesIO()
    bytes_at_last_transcription = 0
    prev_text = ""
    stable_count = 0
    segment_text_parts: list[str] = []  # finalized segments
    chunk_count = 0

    try:
        while True:
            data = await ws.receive_bytes()
            webm_buffer.write(data)
            chunk_count += 1

            # Only attempt transcription when enough new data arrived
            current_size = webm_buffer.tell()
            new_bytes = current_size - bytes_at_last_transcription
            if new_bytes < MIN_NEW_BYTES:
                continue

            if model is None:
                await ws.send_json({"error": "Model not loaded"})
                continue

            # Decode the FULL accumulated WebM stream to PCM
            # (ffmpeg needs the WebM header from chunk 0)
            pcm = decode_webm_to_pcm(webm_buffer.getvalue())
            if pcm is None:
                logger.debug("Decode failed at %d bytes (%d chunks)", current_size, chunk_count)
                continue

            audio_duration = len(pcm) / SAMPLE_RATE
            if audio_duration < MIN_AUDIO_SECONDS:
                continue

            bytes_at_last_transcription = current_size

            # Sliding window: only transcribe the last WINDOW_SECONDS of PCM
            window_samples = int(WINDOW_SECONDS * SAMPLE_RATE)
            pcm_window = pcm[-window_samples:] if len(pcm) > window_samples else pcm

            segments, _info = model.transcribe(
                pcm_window,
                language="ar",
                beam_size=5,
                vad_filter=True,
            )
            window_text = " ".join(seg.text.strip() for seg in segments).strip()

            if not window_text:
                continue

            # Build cumulative text: finalized segments + current window
            if segment_text_parts:
                full_text = " ".join(segment_text_parts) + " " + window_text
            else:
                full_text = window_text

            # Track stability for final emission
            if full_text == prev_text:
                stable_count += 1
            else:
                stable_count = 0

            # Stability check: emit final when text hasn't changed
            if stable_count >= STABILITY_THRESHOLD and window_text.strip():
                logger.info("FINAL (stable, %.1fs): %s", audio_duration, full_text)
                await ws.send_json({
                    "text": full_text,
                    "is_final": True,
                })
                segment_text_parts.append(window_text.strip())
                stable_count = 0
                prev_text = ""
            elif full_text != prev_text:
                logger.info("Transcribed (%.1fs, %d chunks): %s",
                            audio_duration, chunk_count, full_text)
                await ws.send_json({
                    "text": full_text,
                    "is_final": False,
                })
                prev_text = full_text

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
        # Send final on disconnect so client can process remaining text
        if prev_text:
            full_text = (" ".join(segment_text_parts) + " " + prev_text).strip()
            try:
                await ws.send_json({"text": full_text, "is_final": True})
            except Exception:
                pass
    except Exception as e:
        logger.error("WebSocket error: %s", e)
    finally:
        webm_buffer.close()


# ── Entry point ──────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
