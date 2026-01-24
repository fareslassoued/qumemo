#!/usr/bin/env python3
"""
Quran Audio Aligner - CTC forced alignment for Qaloon recitation.

Usage:
    uv run python aligner.py --surah 1
    uv run python aligner.py --surah 1 2 3
    uv run python aligner.py --surah 1-10
    uv run python aligner.py --surah all --export-hf
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List

from tqdm import tqdm

from src.audio_processor import AudioProcessor
from src.ctc_aligner import CTCAligner
from src.output_formatter import OutputFormatter
from src.utils import parse_surah_range, setup_logging

# Path to Quran data
QURAN_DATA_PATH = Path(__file__).parent.parent.parent / "src" / "data" / "quran" / "QaloonData_v10.json"


def load_quran_data() -> List[Dict[str, Any]]:
    """Load Quran data from JSON file."""
    if not QURAN_DATA_PATH.exists():
        raise FileNotFoundError(f"Quran data not found: {QURAN_DATA_PATH}")

    with open(QURAN_DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_surah_ayahs(quran_data: List[Dict], surah_no: int) -> List[Dict]:
    """Extract ayahs for a specific surah."""
    return [ayah for ayah in quran_data if ayah.get("sura_no") == surah_no]


def get_surah_info(ayahs: List[Dict]) -> Dict[str, str]:
    """Get surah name info from ayah data."""
    if not ayahs:
        return {"ar": "", "en": ""}
    return {
        "ar": ayahs[0].get("sura_name_ar", ""),
        "en": ayahs[0].get("sura_name_en", ""),
    }


def process_surah(
    surah_no: int,
    quran_data: List[Dict],
    audio_processor: AudioProcessor,
    aligner: CTCAligner,
    formatter: OutputFormatter,
    skip_existing: bool = False,
    logger: logging.Logger = None,
) -> bool:
    """
    Process a single surah.

    Returns True on success, False on failure.
    """
    log = logger or logging.getLogger(__name__)

    # Check if already processed
    if skip_existing:
        existing = formatter.load_surah_json(surah_no)
        if existing:
            log.info(f"Skipping surah {surah_no} (already exists)")
            return True

    try:
        # Get ayahs for this surah
        ayahs = get_surah_ayahs(quran_data, surah_no)
        if not ayahs:
            log.warning(f"No ayahs found for surah {surah_no}")
            return False

        surah_info = get_surah_info(ayahs)
        log.info(f"Processing surah {surah_no}: {surah_info['ar']} ({len(ayahs)} ayahs)")

        # Download and convert audio
        log.info("  Downloading/converting audio...")
        wav_path, duration = audio_processor.process_surah(surah_no)
        log.info(f"  Audio duration: {duration:.1f}s")

        # Run alignment
        log.info("  Running CTC alignment...")
        aligned_ayahs = aligner.align_surah(wav_path, ayahs)

        # Save output
        output_path = formatter.save_surah_json(
            surah_no=surah_no,
            surah_name_ar=surah_info["ar"],
            surah_name_en=surah_info["en"],
            aligned_ayahs=aligned_ayahs,
        )
        log.info(f"  Saved: {output_path}")

        return True

    except Exception as e:
        log.error(f"Failed to process surah {surah_no}: {e}")
        return False


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Quran Audio Aligner - CTC forced alignment for Qaloon recitation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  uv run python aligner.py --surah 1
  uv run python aligner.py --surah 1 2 3
  uv run python aligner.py --surah 1-10
  uv run python aligner.py --surah all --skip-existing
  uv run python aligner.py --surah all --export-hf
        """,
    )

    parser.add_argument(
        "--surah",
        nargs="+",
        default=["1"],
        help="Surah number(s) to process. Use 'all' for all surahs, "
             "ranges like '1-10', or lists like '1 2 3'",
    )
    parser.add_argument(
        "--device",
        choices=["cuda", "cpu"],
        default=None,
        help="Device to use for alignment (auto-detects if not specified)",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip surahs that already have timing files",
    )
    parser.add_argument(
        "--export-hf",
        action="store_true",
        help="Export results as HuggingFace Dataset",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-download and re-process audio",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    # Set up logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logger = setup_logging(level=log_level)

    # Parse surah numbers
    surahs = []
    for s in args.surah:
        surahs.extend(parse_surah_range(s))
    surahs = sorted(set(surahs))

    if not surahs:
        logger.error("No valid surah numbers specified")
        sys.exit(1)

    logger.info(f"Processing {len(surahs)} surah(s): {surahs}")

    # Load Quran data
    try:
        quran_data = load_quran_data()
        logger.info(f"Loaded {len(quran_data)} ayahs from Quran data")
    except FileNotFoundError as e:
        logger.error(str(e))
        sys.exit(1)

    # Initialize components
    base_dir = Path(__file__).parent
    audio_processor = AudioProcessor(cache_dir=base_dir / "cache")
    aligner = CTCAligner(device=args.device)
    formatter = OutputFormatter(output_dir=base_dir / "output")

    # Process surahs
    success_count = 0
    failed_surahs = []

    for surah_no in tqdm(surahs, desc="Processing surahs", unit="surah"):
        success = process_surah(
            surah_no=surah_no,
            quran_data=quran_data,
            audio_processor=audio_processor,
            aligner=aligner,
            formatter=formatter,
            skip_existing=args.skip_existing,
            logger=logger,
        )

        if success:
            success_count += 1
        else:
            failed_surahs.append(surah_no)

    # Summary
    logger.info(f"\nCompleted: {success_count}/{len(surahs)} surahs")
    if failed_surahs:
        logger.warning(f"Failed surahs: {failed_surahs}")

    # Export HuggingFace dataset if requested
    if args.export_hf:
        logger.info("Exporting HuggingFace dataset...")
        aligned_surahs = formatter.collect_all_jsons()
        if aligned_surahs:
            formatter.export_huggingface_dataset(aligned_surahs)
            logger.info("HuggingFace dataset exported successfully")
        else:
            logger.warning("No aligned surahs found to export")

    # Print stats
    stats = formatter.get_alignment_stats()
    logger.info(f"\nAlignment stats:")
    logger.info(f"  Surahs aligned: {stats['surahs_aligned']}/114")
    logger.info(f"  Total ayahs: {stats['total_ayahs']}")
    logger.info(f"  Total words: {stats['total_words']}")

    sys.exit(0 if not failed_surahs else 1)


if __name__ == "__main__":
    main()
