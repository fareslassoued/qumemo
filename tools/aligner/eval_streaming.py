#!/usr/bin/env python3
"""Streaming pipeline simulation — measures real-world matching reliability.

Unlike eval_asr.py (which transcribes each ayah in isolation), this replays
audio through the same accumulation + matching logic as the live pipeline:
  audio chunks → growing PCM buffer → Whisper re-transcription → cumulative
  text → "new word" extraction via word counter → interim matching (2-word window)

This captures the drift/desync bugs that per-ayah benchmarks miss entirely.

Usage:
    uv run python eval_streaming.py --model tarteel-base-ct2 --eval-set short --config pre-fix
    uv run python eval_streaming.py --model tarteel-base-ct2 --eval-set short --config post-fix
    uv run python eval_streaming.py --compare
"""

import argparse
import json
import logging
import re
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from statistics import mean, median
from typing import Any

import numpy as np

from eval_asr import EvalASR, SAMPLE_RATE, load_audio, load_ground_truth
from eval_config import (
    CACHE_WAV_DIR,
    EVAL_SETS,
    MODELS,
    REPORTS_DIR,
    ModelConfig,
    normalize_arabic,
)
from eval_detection import word_similarity, _strip_ayah_number

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("eval_streaming")


# ─── Configuration ──────────────────────────────────────────


@dataclass
class StreamingConfig:
    """Parameters that mirror the server + client pipeline behavior."""

    name: str = "pre-fix"

    # Server: audio chunking
    chunk_duration_s: float = 1.5  # MediaRecorder.start(1500)
    min_new_seconds: float = 0.5  # ~MIN_NEW_BYTES=8000 / 16000Hz
    min_audio_s: float = 2.0  # Server MIN_AUDIO_SECONDS

    # Server: sliding window (None = full buffer, i.e. current behavior)
    window_seconds: float | None = None

    # Server: stability-based final emission (None = never, i.e. current)
    stability_threshold: int | None = None

    # Client: interim matching
    interim_window: int = 2  # pointer + N look-ahead
    interim_threshold: float = 0.45  # similarity threshold

    # Client: matchChunk on final results
    use_matchChunk_on_final: bool = False
    matchChunk_window: int = 8  # SEARCH_WINDOW in TS
    matchChunk_threshold: float = 0.40  # MIN_WORD_SIMILARITY in TS


# Pre-defined configs
CONFIGS: dict[str, StreamingConfig] = {
    "pre-fix": StreamingConfig(name="pre-fix"),
    "post-fix": StreamingConfig(
        name="post-fix",
        interim_window=4,
        use_matchChunk_on_final=True,
        window_seconds=15.0,
        stability_threshold=3,
    ),
}


# ─── Streaming simulation results ───────────────────────────


@dataclass
class StreamingResult:
    """Results from simulating one surah through the pipeline."""

    surah_no: int
    surah_name: str
    total_ref_words: int
    final_pointer: int
    end_to_end_match_rate: float
    total_transcription_events: int
    events_that_advanced: int
    pointer_advancement_rate: float
    stall_count: int  # episodes of 3+ events with no advancement
    max_stall_s: float
    mean_stall_s: float
    audio_duration_s: float
    wall_time_s: float
    pointer_trace: list[tuple[float, int]] = field(default_factory=list)


# ─── Core simulation ────────────────────────────────────────


def _match_chunk(
    asr_words: list[str],
    ref_words: list[str],
    pointer: int,
    window: int,
    threshold: float,
) -> int:
    """Simulate matchChunk: match ASR words against ref with wide window.

    Returns new pointer position.
    """
    for hyp_word in asr_words:
        if pointer >= len(ref_words):
            break

        window_end = min(len(ref_words), pointer + window)
        best_sim = 0.0
        best_idx = -1

        for i in range(pointer, window_end):
            sim = word_similarity(hyp_word, ref_words[i])
            if sim > best_sim:
                best_sim = sim
                best_idx = i

        if best_idx >= 0 and best_sim >= threshold:
            pointer = best_idx + 1

    return pointer


def simulate_surah(
    asr: EvalASR,
    surah_no: int,
    audio: np.ndarray,
    gt: dict[str, Any],
    config: StreamingConfig,
    sr: int = SAMPLE_RATE,
) -> StreamingResult:
    """Run full streaming simulation for one surah."""

    name = gt.get("surah_name_en", f"Surah {surah_no}")

    # Build reference word list (same as buildPageWordIndex in TS)
    ref_words: list[str] = []
    for ayah in gt["ayahs"]:
        text = _strip_ayah_number(ayah["aya_text"])
        for w in text.split():
            norm = normalize_arabic(w)
            if norm:
                ref_words.append(norm)

    if not ref_words:
        return StreamingResult(
            surah_no=surah_no, surah_name=name,
            total_ref_words=0, final_pointer=0, end_to_end_match_rate=0,
            total_transcription_events=0, events_that_advanced=0,
            pointer_advancement_rate=0, stall_count=0, max_stall_s=0,
            mean_stall_s=0, audio_duration_s=0, wall_time_s=0,
        )

    # Audio chunking
    chunk_samples = int(config.chunk_duration_s * sr)
    min_new_samples = int(config.min_new_seconds * sr)
    min_audio_samples = int(config.min_audio_s * sr)

    # Server state
    accumulated_pcm = np.array([], dtype=np.float32)
    samples_at_last_transcription = 0
    prev_text = ""
    stable_count = 0
    segment_text_parts: list[str] = []  # finalized segments

    # Client state
    pointer = 0
    processed_word_count = 0

    # Metrics
    pointer_trace: list[tuple[float, int]] = []
    total_events = 0
    events_advanced = 0
    no_advance_streak = 0
    stall_episodes: list[float] = []  # stall durations in seconds
    stall_start_time: float | None = None

    wall_start = time.monotonic()

    num_chunks = len(audio) // chunk_samples + (1 if len(audio) % chunk_samples else 0)

    for chunk_idx in range(num_chunks):
        chunk_start = chunk_idx * chunk_samples
        chunk_end = min(len(audio), chunk_start + chunk_samples)
        chunk = audio[chunk_start:chunk_end]

        accumulated_pcm = np.concatenate([accumulated_pcm, chunk])

        # Check if enough new data for transcription
        new_samples = len(accumulated_pcm) - samples_at_last_transcription
        if new_samples < min_new_samples:
            continue
        if len(accumulated_pcm) < min_audio_samples:
            continue

        samples_at_last_transcription = len(accumulated_pcm)

        # Apply sliding window if configured
        if config.window_seconds is not None:
            window_samples = int(config.window_seconds * sr)
            pcm_to_transcribe = accumulated_pcm[-window_samples:]
        else:
            pcm_to_transcribe = accumulated_pcm

        # Transcribe
        full_asr_text = asr.transcribe(pcm_to_transcribe, sr)
        if not full_asr_text:
            continue

        # Build cumulative text (finalized segments + window)
        window_text = full_asr_text
        if segment_text_parts:
            full_text = " ".join(segment_text_parts) + " " + window_text
        else:
            full_text = window_text

        if full_text == prev_text:
            stable_count += 1
        else:
            stable_count = 0

        # Check for stability-based final
        is_final = False
        if (
            config.stability_threshold is not None
            and stable_count >= config.stability_threshold
            and window_text.strip()
        ):
            is_final = True
            segment_text_parts.append(window_text.strip())
            stable_count = 0

        if full_text == prev_text and not is_final:
            continue  # No change in text, skip matching

        prev_text = full_text
        total_events += 1
        old_pointer = pointer
        timestamp = chunk_idx * config.chunk_duration_s

        if is_final and config.use_matchChunk_on_final:
            # matchChunk path: wide window recovery on current window only
            # (finalized segments are already matched — don't re-feed them)
            final_words = normalize_arabic(window_text).split()
            processed_word_count = 0  # Reset (same as client on final)
            pointer = _match_chunk(
                final_words, ref_words, pointer,
                config.matchChunk_window, config.matchChunk_threshold,
            )
        else:
            # Interim path: narrow window, only "new" words
            asr_words = normalize_arabic(full_text).split()

            # Detect text regression (sliding window dropped old audio,
            # shrinking the text). Only re-process the TAIL (last 3 words)
            # — the most recent recitation. Resetting to 0 would re-process
            # ALL words through the interim window, jumping the pointer ahead.
            if len(asr_words) < processed_word_count and len(asr_words) > 0:
                processed_word_count = max(0, len(asr_words) - 3)

            if len(asr_words) > processed_word_count:
                new_words = asr_words[processed_word_count:]
                processed_word_count = len(asr_words)

                for word in new_words:
                    if pointer >= len(ref_words):
                        break
                    window_end = min(len(ref_words), pointer + config.interim_window)
                    best_sim = 0.0
                    best_idx = -1

                    for i in range(pointer, window_end):
                        sim = word_similarity(word, ref_words[i])
                        if sim > best_sim:
                            best_sim = sim
                            best_idx = i

                    if best_idx >= 0 and best_sim >= config.interim_threshold:
                        pointer = best_idx + 1

        if is_final:
            processed_word_count = 0  # Always reset on final

        # Track advancement
        if pointer > old_pointer:
            events_advanced += 1
            no_advance_streak = 0
            if stall_start_time is not None:
                stall_dur = timestamp - stall_start_time
                stall_episodes.append(stall_dur)
                stall_start_time = None
        else:
            no_advance_streak += 1
            if no_advance_streak == 3 and stall_start_time is None:
                # Stall started 3 events ago
                stall_start_time = timestamp - 2 * config.chunk_duration_s

        pointer_trace.append((timestamp, pointer))

    # Close any open stall
    if stall_start_time is not None:
        total_dur = len(audio) / sr
        stall_episodes.append(total_dur - stall_start_time)

    wall_time = time.monotonic() - wall_start
    audio_dur = len(audio) / sr

    return StreamingResult(
        surah_no=surah_no,
        surah_name=name,
        total_ref_words=len(ref_words),
        final_pointer=min(pointer, len(ref_words)),
        end_to_end_match_rate=min(pointer, len(ref_words)) / len(ref_words) if ref_words else 0,
        total_transcription_events=total_events,
        events_that_advanced=events_advanced,
        pointer_advancement_rate=events_advanced / total_events if total_events else 0,
        stall_count=len(stall_episodes),
        max_stall_s=max(stall_episodes) if stall_episodes else 0,
        mean_stall_s=mean(stall_episodes) if stall_episodes else 0,
        audio_duration_s=audio_dur,
        wall_time_s=wall_time,
        pointer_trace=pointer_trace,
    )


# ─── Evaluation runner ──────────────────────────────────────


def run_streaming_eval(
    model_config: ModelConfig,
    eval_set: str,
    config: StreamingConfig,
) -> dict[str, Any]:
    """Run streaming simulation across all surahs in the eval set."""

    surahs = EVAL_SETS[eval_set]
    asr = EvalASR(model_config)
    results: list[StreamingResult] = []

    for surah_no in surahs:
        logger.info(f"Surah {surah_no}...")
        gt = load_ground_truth(surah_no)
        if gt is None:
            continue

        wav_path = CACHE_WAV_DIR / f"{surah_no:03d}.wav"
        if not wav_path.exists():
            logger.warning(f"  No audio: {wav_path}")
            continue

        audio = load_audio(wav_path)
        audio_dur = len(audio) / SAMPLE_RATE
        n_words = sum(
            len(_strip_ayah_number(a["aya_text"]).split())
            for a in gt["ayahs"]
        )
        logger.info(f"  {gt.get('surah_name_en', '')}: {n_words} words, {audio_dur:.0f}s audio")

        result = simulate_surah(asr, surah_no, audio, gt, config)

        logger.info(
            f"  Match={result.end_to_end_match_rate:.1%} "
            f"Advance={result.pointer_advancement_rate:.1%} "
            f"Stalls={result.stall_count} "
            f"MaxStall={result.max_stall_s:.1f}s "
            f"({result.total_transcription_events} events)"
        )

        results.append(result)

    # Aggregate
    if not results:
        return {}

    match_rates = [r.end_to_end_match_rate for r in results]
    advance_rates = [r.pointer_advancement_rate for r in results]
    stall_counts = [r.stall_count for r in results]

    aggregate = {
        "match_rate_mean": mean(match_rates),
        "match_rate_median": median(match_rates),
        "advancement_rate_mean": mean(advance_rates),
        "advancement_rate_median": median(advance_rates),
        "total_stalls": sum(stall_counts),
        "max_stall_s": max(r.max_stall_s for r in results) if results else 0,
        "total_wall_time_s": sum(r.wall_time_s for r in results),
    }

    per_surah = {}
    for r in results:
        per_surah[str(r.surah_no)] = {
            "name": r.surah_name,
            "ref_words": r.total_ref_words,
            "final_pointer": r.final_pointer,
            "match_rate": r.end_to_end_match_rate,
            "advancement_rate": r.pointer_advancement_rate,
            "events": r.total_transcription_events,
            "events_advanced": r.events_that_advanced,
            "stalls": r.stall_count,
            "max_stall_s": r.max_stall_s,
            "audio_s": r.audio_duration_s,
            "wall_s": r.wall_time_s,
        }

    return {
        "model": model_config.name,
        "eval_set": eval_set,
        "config": asdict(config),
        "per_surah": per_surah,
        "aggregate": aggregate,
    }


# ─── Reporting ──────────────────────────────────────────────


def print_streaming_summary(data: dict[str, Any]) -> None:
    """Print human-readable streaming eval summary."""

    agg = data["aggregate"]
    config_name = data["config"]["name"]

    print()
    print("═" * 60)
    print(f"  Streaming Eval: {data['model']} ({config_name})")
    print("═" * 60)
    print(f"  Match Rate:      {agg['match_rate_mean']:.1%}   (median {agg['match_rate_median']:.1%})")
    print(f"  Advancement:     {agg['advancement_rate_mean']:.1%}   (median {agg['advancement_rate_median']:.1%})")
    print(f"  Total Stalls:    {agg['total_stalls']}")
    print(f"  Worst Stall:     {agg['max_stall_s']:.1f}s")
    print()
    print("  Per-surah:")

    surahs = sorted(
        data["per_surah"].items(),
        key=lambda x: x[1]["match_rate"],
    )
    for sno, s in surahs:
        bar_len = int(s["match_rate"] * 30)
        bar = "█" * bar_len + "░" * (30 - bar_len)
        print(
            f"    {int(sno):>3} {s['name']:<22} {bar} {s['match_rate']:.1%}"
            f"  adv={s['advancement_rate']:.0%}  stalls={s['stalls']}"
        )

    print("═" * 60)
    print()


def save_streaming_report(data: dict[str, Any]) -> Path:
    """Save streaming eval report as JSON."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    config_name = data["config"]["name"]
    filename = f"streaming_{data['model']}_{data['eval_set']}_{config_name}_{ts}.json"
    path = REPORTS_DIR / filename
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"Report saved: {path}")
    return path


def print_streaming_comparison() -> None:
    """Compare all streaming reports."""
    reports = sorted(REPORTS_DIR.glob("streaming_*.json"))
    if not reports:
        print("No streaming reports found.")
        return

    rows: list[dict[str, Any]] = []
    for rp in reports:
        data = json.loads(rp.read_text())
        agg = data.get("aggregate", {})
        rows.append({
            "model": data.get("model", "?"),
            "set": data.get("eval_set", "?"),
            "config": data.get("config", {}).get("name", "?"),
            "match": agg.get("match_rate_mean"),
            "advance": agg.get("advancement_rate_mean"),
            "stalls": agg.get("total_stalls"),
            "max_stall": agg.get("max_stall_s"),
        })

    # Print markdown table
    print()
    print("| Model              | Set   | Config   | Match  | Advance | Stalls | MaxStall |")
    print("|--------------------|-------|----------|--------|---------|--------|----------|")
    for r in rows:
        match_s = f"{r['match']:.1%}" if r["match"] is not None else "-"
        adv_s = f"{r['advance']:.1%}" if r["advance"] is not None else "-"
        stall_s = str(r["stalls"]) if r["stalls"] is not None else "-"
        ms_s = f"{r['max_stall']:.1f}s" if r["max_stall"] is not None else "-"
        print(f"| {r['model']:<18} | {r['set']:<5} | {r['config']:<8} | {match_s:>6} | {adv_s:>7} | {stall_s:>6} | {ms_s:>8} |")
    print()


# ─── CLI ────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Streaming pipeline simulation eval")
    parser.add_argument("--model", choices=list(MODELS.keys()), default="tarteel-base-ct2")
    parser.add_argument("--eval-set", choices=list(EVAL_SETS.keys()), default="short")
    parser.add_argument("--config", choices=list(CONFIGS.keys()), default="pre-fix")
    parser.add_argument("--compare", action="store_true", help="Compare all streaming reports")
    args = parser.parse_args()

    if args.compare:
        print_streaming_comparison()
        return

    model_config = MODELS[args.model]
    config = CONFIGS[args.config]

    logger.info(
        f"Streaming eval: {args.model} on {args.eval_set} set, config={config.name} "
        f"(window={config.interim_window}, final={config.use_matchChunk_on_final}, "
        f"sliding={config.window_seconds}s)"
    )

    data = run_streaming_eval(model_config, args.eval_set, config)
    if not data:
        logger.error("No results produced")
        sys.exit(1)

    print_streaming_summary(data)
    save_streaming_report(data)


if __name__ == "__main__":
    main()
