#!/usr/bin/env python3
"""
Validation script for Muqatta'at alignment issues.
Tests Surah 1 (reference) and Surah 36 (problematic).
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Any

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def load_alignment_file(surah_no: int) -> Dict[str, Any]:
    """Load alignment file for a surah."""
    output_dir = Path(__file__).parent.parent / "output"
    file_path = output_dir / f"{surah_no:03d}_timings.json"

    if not file_path.exists():
        raise FileNotFoundError(f"Alignment file not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def analyze_surah_alignment(
    surah_data: Dict[str, Any], expected_start: float = None, expected_end: float = None
) -> Dict[str, Any]:
    """Analyze alignment for a surah."""
    surah_no = surah_data["surah_no"]
    surah_name = surah_data["surah_name_en"]

    analysis = {
        "surah_no": surah_no,
        "surah_name": surah_name,
        "ayah_count": surah_data["ayah_count"],
        "first_ayah": surah_data["ayahs"][0],
        "issues": [],
        "quality_score": 1.0,
    }

    # Check first ayah timing
    first_ayah = surah_data["ayahs"][0]
    actual_start = first_ayah["start_time"]
    actual_end = first_ayah["end_time"]
    actual_duration = actual_end - actual_start

    if expected_start is not None:
        start_error = abs(actual_start - expected_start)
        analysis["start_error"] = start_error
        if start_error > 0.5:
            analysis["issues"].append(
                f"Start time error: {start_error:.2f}s (expected {expected_start}s, got {actual_start}s)"
            )

    if expected_end is not None:
        end_error = abs(actual_end - expected_end)
        analysis["end_error"] = end_error
        if end_error > 0.5:
            analysis["issues"].append(
                f"End time error: {end_error:.2f}s (expected {expected_end}s, got {actual_end}s)"
            )

    # Check duration reasonableness
    if actual_duration < 5.0:
        analysis["issues"].append(
            f"Short duration: {actual_duration:.2f}s (may be too short)"
        )
    elif actual_duration > 20.0:
        analysis["issues"].append(
            f"Long duration: {actual_duration:.2f}s (may be too long)"
        )

    # Check continuity between ayahs
    for i in range(len(surah_data["ayahs"]) - 1):
        current_end = surah_data["ayahs"][i]["end_time"]
        next_start = surah_data["ayahs"][i + 1]["start_time"]
        gap = next_start - current_end

        if gap < 0:
            analysis["issues"].append(f"Ayah {i + 1} overlap: {gap:.2f}s")
        elif gap > 2.0:
            analysis["issues"].append(
                f"Large gap between ayah {i + 1} and {i + 2}: {gap:.2f}s"
            )

    # Calculate quality score
    if analysis["issues"]:
        analysis["quality_score"] = max(0.0, 1.0 - len(analysis["issues"]) * 0.1)

    return analysis


def main():
    """Main validation function."""
    logger.info("Starting alignment validation...")

    # Test Surah 1 (reference - should be correct)
    logger.info("\n=== Analyzing Surah 1 (Reference) ===")
    try:
        surah1_data = load_alignment_file(1)
        surah1_analysis = analyze_surah_alignment(surah1_data)

        logger.info(f"Surah 1 ({surah1_data['surah_name_en']}):")
        logger.info(
            f"  First ayah: {surah1_data['ayahs'][0]['start_time']:.1f}s - {surah1_data['ayahs'][0]['end_time']:.1f}s"
        )
        logger.info(
            f"  Duration: {surah1_data['ayahs'][0]['end_time'] - surah1_data['ayahs'][0]['start_time']:.1f}s"
        )
        logger.info(f"  Quality score: {surah1_analysis['quality_score']:.2f}")

        if surah1_analysis["issues"]:
            logger.warning("  Issues found:")
            for issue in surah1_analysis["issues"]:
                logger.warning(f"    - {issue}")
        else:
            logger.info("  ✓ No issues found")

    except Exception as e:
        logger.error(f"Error analyzing Surah 1: {e}")

    # Test Surah 36 (problematic - should be 6.5s - 18s)
    logger.info("\n=== Analyzing Surah 36 (Target Fix) ===")
    try:
        surah36_data = load_alignment_file(36)
        surah36_analysis = analyze_surah_alignment(
            surah36_data, expected_start=6.5, expected_end=18.0
        )

        logger.info(f"Surah 36 ({surah36_data['surah_name_en']}):")
        logger.info(
            f"  First ayah: {surah36_data['ayahs'][0]['start_time']:.1f}s - {surah36_data['ayahs'][0]['end_time']:.1f}s"
        )
        logger.info(
            f"  Duration: {surah36_data['ayahs'][0]['end_time'] - surah36_data['ayahs'][0]['start_time']:.1f}s"
        )
        logger.info(f"  Expected: 6.5s - 18.0s (11.5s duration)")
        logger.info(f"  Quality score: {surah36_analysis['quality_score']:.2f}")

        if surah36_analysis["issues"]:
            logger.warning("  Issues found:")
            for issue in surah36_analysis["issues"]:
                logger.warning(f"    - {issue}")
        else:
            logger.info("  ✓ No issues found")

        # Calculate specific errors
        if "start_error" in surah36_analysis:
            logger.info(f"  Start time error: {surah36_analysis['start_error']:.2f}s")
        if "end_error" in surah36_analysis:
            logger.info(f"  End time error: {surah36_analysis['end_error']:.2f}s")

    except Exception as e:
        logger.error(f"Error analyzing Surah 36: {e}")

    logger.info("\n=== Validation Complete ===")


if __name__ == "__main__":
    main()
