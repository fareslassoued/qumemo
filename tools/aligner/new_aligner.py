#!/usr/bin/env python3
"""New Quran Aligner - Phoneme-based alignment for Qalun recitation.

Entry point for the new aligner implementation.
Usage: python new_aligner.py --surah 36 --audio /path/to/audio.mp3
"""

import argparse
import json
import logging
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from segment_aligner import SegmentAligner

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(
        description="Align Quran audio to text using phoneme-based matching"
    )
    parser.add_argument("--surah", type=int, required=True, help="Surah number (1-114)")
    parser.add_argument("--audio", type=str, required=True, help="Path to audio file")
    parser.add_argument(
        "--output", type=str, help="Output JSON path (default: output/XXX_timings.json)"
    )
    parser.add_argument(
        "--min-score",
        type=float,
        default=0.5,
        help="Minimum match score threshold (0.0-1.0)",
    )
    parser.add_argument(
        "--no-word-timings",
        action="store_true",
        help="Disable word-level timing generation",
    )

    args = parser.parse_args()

    # Validate surah number
    if not (1 <= args.surah <= 114):
        logger.error(f"Invalid surah number: {args.surah}")
        sys.exit(1)

    # Validate audio file
    audio_path = Path(args.audio)
    if not audio_path.exists():
        logger.error(f"Audio file not found: {audio_path}")
        sys.exit(1)

    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_dir = Path(__file__).parent / "output"
        output_dir.mkdir(exist_ok=True)
        output_path = output_dir / f"{args.surah:03d}_timings.json"

    logger.info(f"Aligning Surah {args.surah}")
    logger.info(f"Audio: {audio_path}")
    logger.info(f"Output: {output_path}")

    # Initialize aligner
    aligner = SegmentAligner(
        surah_number=args.surah,
        min_match_score=args.min_score,
        enable_word_timings=not args.no_word_timings,
    )

    # Run alignment
    try:
        segments = aligner.align_audio(audio_path)

        if not segments:
            logger.error("Alignment failed - no segments produced")
            sys.exit(1)

        # Convert to ayah timings
        result = aligner.convert_to_ayah_timings(segments)

        # Save output
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        # Print summary
        matched = len([s for s in segments if not s.error])
        logger.info(f"✓ Alignment complete: {matched}/{len(segments)} segments matched")
        logger.info(f"✓ Output saved: {output_path}")

        # Print first few ayah timings
        print("\nFirst few ayahs:")
        for ayah in result["ayahs"][:5]:
            print(
                f"  Ayah {ayah['aya_no']}: {ayah['start_time']:.1f}s - {ayah['end_time']:.1f}s"
            )

    except Exception as e:
        logger.error(f"Alignment failed: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
