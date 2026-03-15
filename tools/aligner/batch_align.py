#!/usr/bin/env python3
"""Batch alignment runner for all 114 surahs.

Downloads audio from Archive.org and runs SegmentAligner for each surah.

Usage:
    # All surahs
    uv run --extra cuda python batch_align.py --surahs all

    # Single surah
    uv run --extra cuda python batch_align.py --surahs 36

    # Range
    uv run --extra cuda python batch_align.py --surahs 1-10

    # List
    uv run --extra cuda python batch_align.py --surahs 1 2 36 67

    # Skip already-aligned surahs
    uv run --extra cuda python batch_align.py --surahs all --skip-existing
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import requests
from tqdm import tqdm

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from segment_aligner import SegmentAligner
from whisper_asr import WhisperASR
from vad_processor import VadProcessor
from quran_index import QuranIndex

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive.org/download/husari_qalun/{surah:03d}.mp3"
CACHE_DIR = Path(__file__).parent / "cache" / "mp3"
OUTPUT_DIR = Path(__file__).parent / "output"


def parse_surahs(args: list[str]) -> list[int]:
    """Parse --surahs argument into a list of surah numbers.

    Supports: 'all', single number, range ('1-10'), space-separated list.
    """
    if not args:
        return list(range(1, 115))

    if args[0] == "all":
        return list(range(1, 115))

    surahs = []
    for arg in args:
        if "-" in arg:
            parts = arg.split("-")
            start, end = int(parts[0]), int(parts[1])
            surahs.extend(range(start, end + 1))
        else:
            surahs.append(int(arg))

    # Validate
    for s in surahs:
        if not 1 <= s <= 114:
            raise ValueError(f"Invalid surah number: {s}")

    return sorted(set(surahs))


def download_mp3(surah: int) -> Path:
    """Download surah MP3 from Archive.org if not cached.

    Returns path to the cached MP3 file.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    mp3_path = CACHE_DIR / f"{surah:03d}.mp3"

    if mp3_path.exists():
        logger.info(f"Using cached audio: {mp3_path}")
        return mp3_path

    url = ARCHIVE_URL.format(surah=surah)
    logger.info(f"Downloading Surah {surah}: {url}")

    response = requests.get(url, stream=True, timeout=120)
    response.raise_for_status()

    total_size = int(response.headers.get("content-length", 0))

    with open(mp3_path, "wb") as f:
        with tqdm(
            total=total_size,
            unit="B",
            unit_scale=True,
            desc=f"Surah {surah:03d}",
            leave=False,
        ) as pbar:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                pbar.update(len(chunk))

    logger.info(f"Downloaded: {mp3_path} ({mp3_path.stat().st_size / 1024 / 1024:.1f} MB)")
    return mp3_path


def align_surah(
    surah: int,
    asr: WhisperASR,
    vad: VadProcessor,
    quran_index: QuranIndex,
    skip_existing: bool = False,
    min_score: float = 0.5,
) -> dict:
    """Align a single surah. Returns result dict with status info."""
    output_path = OUTPUT_DIR / f"{surah:03d}_timings.json"

    if skip_existing and output_path.exists():
        return {"surah": surah, "status": "skipped", "reason": "already exists"}

    start_time = time.time()

    try:
        # Download audio
        mp3_path = download_mp3(surah)

        # Create aligner with shared models
        aligner = SegmentAligner(
            surah_number=surah,
            min_match_score=min_score,
            enable_word_timings=True,
            asr=asr,
            vad=vad,
            quran_index=quran_index,
        )

        # Run alignment
        segments = aligner.align_audio(mp3_path)

        if not segments:
            return {
                "surah": surah,
                "status": "failed",
                "reason": "no segments produced",
                "duration": time.time() - start_time,
            }

        # Convert to ayah timings
        result = aligner.convert_to_ayah_timings(segments)

        # Save output
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        matched = len([s for s in segments if not s.error])
        elapsed = time.time() - start_time

        return {
            "surah": surah,
            "status": "success",
            "matched": matched,
            "total": len(segments),
            "ayahs": result["ayah_count"],
            "duration": elapsed,
            "output": str(output_path),
        }

    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"Surah {surah} failed: {e}")
        return {
            "surah": surah,
            "status": "failed",
            "reason": str(e),
            "duration": elapsed,
        }


def main():
    parser = argparse.ArgumentParser(
        description="Batch align all surahs with shared ASR/VAD models"
    )
    parser.add_argument(
        "--surahs",
        nargs="+",
        default=["all"],
        help="Surahs to align: 'all', number, range '1-10', or list '1 2 36'",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip surahs that already have output files",
    )
    parser.add_argument(
        "--min-score",
        type=float,
        default=0.5,
        help="Minimum match score threshold (0.0-1.0)",
    )
    args = parser.parse_args()

    surahs = parse_surahs(args.surahs)
    logger.info(f"Batch alignment: {len(surahs)} surahs")

    # Load shared models once
    logger.info("Loading shared models (Whisper + Silero VAD + QuranIndex)...")
    asr = WhisperASR()
    asr._load_model()  # Force eager load so the progress bar doesn't interleave
    vad = VadProcessor()
    vad._load_model()
    quran_index = QuranIndex()
    logger.info("Models loaded.")

    results = []
    success = 0
    failed = 0
    skipped = 0

    pbar = tqdm(surahs, desc="Aligning surahs", unit="surah")
    for surah in pbar:
        pbar.set_postfix_str(f"Surah {surah:03d}")
        result = align_surah(
            surah,
            asr=asr,
            vad=vad,
            quran_index=quran_index,
            skip_existing=args.skip_existing,
            min_score=args.min_score,
        )
        results.append(result)

        if result["status"] == "success":
            success += 1
        elif result["status"] == "skipped":
            skipped += 1
        else:
            failed += 1

        pbar.set_postfix_str(
            f"S{surah:03d} | ok={success} fail={failed} skip={skipped}"
        )

    # Summary
    print("\n" + "=" * 60)
    print("BATCH ALIGNMENT SUMMARY")
    print("=" * 60)
    print(f"  Total:   {len(surahs)}")
    print(f"  Success: {success}")
    print(f"  Failed:  {failed}")
    print(f"  Skipped: {skipped}")

    if failed > 0:
        print(f"\nFailed surahs:")
        for r in results:
            if r["status"] == "failed":
                print(f"  Surah {r['surah']:03d}: {r.get('reason', 'unknown')}")

    total_duration = sum(r.get("duration", 0) for r in results)
    print(f"\nTotal time: {total_duration / 60:.1f} minutes")
    print("=" * 60)

    # Exit with error code if any failures
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
