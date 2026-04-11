"""
Interactive mic test for the ASR server.

Records from your microphone in chunks and sends to the local whisper server
via WebSocket. Prints transcriptions as they arrive.

Usage:
    uv run python test_mic.py [--chunk-secs 4]

Requires: the ASR server running (./run.sh in another terminal)
"""

import argparse
import asyncio
import json
import signal
import subprocess
import sys

import websockets

SERVER_URL = "ws://localhost:8765/ws/transcribe"
SAMPLE_RATE = 16000


async def record_and_transcribe(chunk_secs: float):
    print("Connecting to ASR server...")
    try:
        async with websockets.connect(SERVER_URL) as ws:
            print(f"Connected to {SERVER_URL}")
            print(f"Recording {chunk_secs}s chunks at {SAMPLE_RATE}Hz")
            print("─" * 50)
            print("Start reciting. Press Ctrl+C to stop.\n")

            chunk_num = 0

            # Task to receive transcriptions
            async def receive():
                try:
                    async for message in ws:
                        data = json.loads(message)
                        if "error" in data:
                            print(f"  [ERROR] {data['error']}")
                        elif "text" in data:
                            # Print with explicit encoding for Arabic
                            text = data["text"]
                            print(f"  #{chunk_num:>2d} → {text}")
                            print()
                            sys.stdout.flush()
                except websockets.exceptions.ConnectionClosed:
                    pass

            recv_task = asyncio.create_task(receive())

            try:
                while True:
                    chunk_num += 1
                    # Record a chunk using ffmpeg (reads from default mic)
                    # -f pulse on Linux (PulseAudio), -f alsa as fallback
                    recorded = False
                    for audio_src in [("pulse", "default"), ("alsa", "default")]:
                        fmt, device = audio_src
                        proc = await asyncio.create_subprocess_exec(
                            "ffmpeg",
                            "-hide_banner", "-loglevel", "error",
                            "-f", fmt, "-i", device,
                            "-t", str(chunk_secs),
                            "-f", "webm", "-c:a", "libopus",
                            "-ar", str(SAMPLE_RATE), "-ac", "1",
                            "pipe:1",
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        stdout, stderr = await proc.communicate()

                        if proc.returncode == 0 and len(stdout) > 0:
                            recorded = True
                            break

                    if not recorded:
                        print("[ERROR] Could not record audio. Is PulseAudio/ALSA available?")
                        break

                    if len(stdout) == 0:
                        continue

                    kb = len(stdout) / 1024
                    print(f"[Chunk {chunk_num}] Sent {kb:.1f}KB ({chunk_secs}s)")
                    sys.stdout.flush()
                    await ws.send(stdout)

            except asyncio.CancelledError:
                pass
            finally:
                recv_task.cancel()
                try:
                    await recv_task
                except asyncio.CancelledError:
                    pass

    except ConnectionRefusedError:
        print("ERROR: Cannot connect to ASR server at", SERVER_URL)
        print("Make sure the server is running: ./run.sh")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Test ASR server with live mic input")
    parser.add_argument("--chunk-secs", type=float, default=5.0,
                        help="Duration of each audio chunk in seconds (default: 5)")
    args = parser.parse_args()

    loop = asyncio.new_event_loop()

    def handle_sigint(sig, frame):
        print("\n\nStopping...")
        for task in asyncio.all_tasks(loop):
            task.cancel()

    signal.signal(signal.SIGINT, handle_sigint)

    try:
        loop.run_until_complete(record_and_transcribe(args.chunk_secs))
    except asyncio.CancelledError:
        pass
    finally:
        loop.close()
        print("Done.")


if __name__ == "__main__":
    main()
