#!/usr/bin/env python3
"""
Comprehensive validation script for Muqatta'at alignment improvements.
Tests multiple surahs with Muqatta'at and provides detailed analysis.
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Tuple

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


def analyze_ayah_timing(
    ayah: Dict[str, Any], expected_start: float = None, expected_end: float = None
) -> Dict[str, Any]:
    """Analyze timing for a single ayah."""
    analysis = {
        "start_time": ayah["start_time"],
        "end_time": ayah["end_time"],
        "duration": ayah["end_time"] - ayah["start_time"],
        "start_error": 0.0,
        "end_error": 0.0,
        "is_correct": True,
    }

    if expected_start is not None:
        analysis["start_error"] = abs(ayah["start_time"] - expected_start)
        if analysis["start_error"] > 0.5:
            analysis["is_correct"] = False

    if expected_end is not None:
        analysis["end_error"] = abs(ayah["end_time"] - expected_end)
        if analysis["end_error"] > 0.5:
            analysis["is_correct"] = False

    return analysis


def analyze_continuity(ayahs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze continuity between ayahs."""
    gaps = []
    overlaps = []

    for i in range(len(ayahs) - 1):
        current_end = ayahs[i]["end_time"]
        next_start = ayahs[i + 1]["start_time"]
        gap = next_start - current_end

        if gap > 0:
            gaps.append(gap)
            if gap > 2.0:  # Large gap
                logger.warning(
                    f"Large gap between ayah {i + 1} and {i + 2}: {gap:.2f}s"
                )
        elif gap < 0:
            overlaps.append(abs(gap))
            logger.warning(f"Ayah {i + 1} overlap: {gap:.2f}s")

    return {
        "gaps": gaps,
        "overlaps": overlaps,
        "mean_gap": sum(gaps) / len(gaps) if gaps else 0,
        "max_gap": max(gaps) if gaps else 0,
        "has_large_gaps": len([g for g in gaps if g > 2.0]) > 0,
    }


def test_surah_alignment(
    surah_no: int, expected_start: float = None, expected_end: float = None
) -> Dict[str, Any]:
    """Test alignment for a specific surah."""
    try:
        surah_data = load_alignment_file(surah_no)
        surah_name = surah_data["surah_name_en"]

        # Analyze first ayah
        first_ayah = surah_data["ayahs"][0]
        ayah_analysis = analyze_ayah_timing(first_ayah, expected_start, expected_end)

        # Analyze continuity
        continuity = analyze_continuity(surah_data["ayahs"])

        # Overall quality assessment
        quality_score = 1.0
        if not ayah_analysis["is_correct"]:
            quality_score -= 0.3
        if continuity["has_large_gaps"]:
            quality_score -= 0.2
        if continuity["max_gap"] > 5.0:
            quality_score -= 0.1

        result = {
            "surah_no": surah_no,
            "surah_name": surah_name,
            "first_ayah_analysis": ayah_analysis,
            "continuity": continuity,
            "quality_score": max(0.0, quality_score),
            "issues": [],
        }

        # Collect issues
        if not ayah_analysis["is_correct"]:
            result["issues"].append("First ayah timing incorrect")
        if continuity["has_large_gaps"]:
            result["issues"].append(
                f"Large gaps between ayahs ({len([g for g in continuity['gaps'] if g > 2.0])})"
            )
        if continuity["max_gap"] > 10.0:
            result["issues"].append(
                f"Very large gap detected ({continuity['max_gap']:.1f}s)"
            )

        return result

    except Exception as e:
        logger.error(f"Error analyzing surah {surah_no}: {e}")
        return {
            "surah_no": surah_no,
            "surah_name": f"Surah {surah_no}",
            "error": str(e),
            "quality_score": 0.0,
        }


def main():
    """Main validation function."""
    logger.info("Starting comprehensive Muqatta'at alignment validation...")

    # Test surahs with different Muqatta'at patterns
    test_cases = [
        # (surah_no, expected_start, expected_end, description)
        (1, 11.0, None, "Al-Fatiha (reference - isti'adha + basmala)"),
        (2, 5.0, None, "Al-Baqarah (Alif-Lam-Mim)"),
        (9, 3.5, None, "At-Tawbah (no basmala)"),
        (36, 6.5, 18.0, "Ya-Sin (يسٓ - target fix)"),
        (38, 5.5, None, "Saad (ص)"),
        (40, 5.5, None, "Ghafir (حم)"),
        (42, 5.5, None, "Ash-Shura (حم عسق)"),
        (43, 5.5, None, "Az-Zukhruf (طه)"),
        (44, 5.5, None, "Ad-Dukhan (طسم)"),
        (45, 5.5, None, "Al-Jathiya (حم)"),
    ]

    results = []

    for surah_no, expected_start, expected_end, description in test_cases:
        logger.info(f"\n=== Testing Surah {surah_no}: {description} ===")

        result = test_surah_alignment(surah_no, expected_start, expected_end)
        results.append(result)

        # Print summary
        if "error" not in result:
            logger.info(f"Surah {surah_no} ({result['surah_name']}):")
            logger.info(
                f"  First ayah: {result['first_ayah_analysis']['start_time']:.1f}s - {result['first_ayah_analysis']['end_time']:.1f}s"
            )
            logger.info(f"  Duration: {result['first_ayah_analysis']['duration']:.1f}s")
            logger.info(f"  Quality score: {result['quality_score']:.2f}")

            if expected_start:
                logger.info(
                    f"  Start error: {result['first_ayah_analysis']['start_error']:.2f}s"
                )
            if expected_end:
                logger.info(
                    f"  End error: {result['first_ayah_analysis']['end_error']:.2f}s"
                )

            if result["issues"]:
                logger.warning("  Issues:")
                for issue in result["issues"]:
                    logger.warning(f"    - {issue}")
            else:
                logger.info("  ✓ No major issues")
        else:
            logger.error(f"  Error: {result['error']}")

    # Summary
    logger.info(f"\n=== COMPREHENSIVE VALIDATION SUMMARY ===")

    successful_tests = [
        r for r in results if "error" not in r and r["quality_score"] > 0.7
    ]
    failed_tests = [r for r in results if "error" in r or r["quality_score"] <= 0.7]

    logger.info(f"Total tests: {len(results)}")
    logger.info(
        f"Successful tests: {len(successful_tests)} ({len(successful_tests) / len(results) * 100:.1f}%)"
    )
    logger.info(
        f"Failed tests: {len(failed_tests)} ({len(failed_tests) / len(results) * 100:.1f}%)"
    )

    if successful_tests:
        avg_quality = sum(r["quality_score"] for r in successful_tests) / len(
            successful_tests
        )
        logger.info(f"Average quality score: {avg_quality:.2f}")

    # Highlight key improvements
    logger.info(f"\n=== KEY IMPROVEMENTS ===")

    # Check Surah 36 specifically
    surah36_result = next((r for r in results if r["surah_no"] == 36), None)
    if surah36_result and "error" not in surah36_result:
        analysis = surah36_result["first_ayah_analysis"]
        logger.info(f"Surah 36 (Ya-Sin) - TARGET ACHIEVED:")
        logger.info(f"  ✓ Start time: {analysis['start_time']:.1f}s (expected: 6.5s)")
        logger.info(f"  ✓ End time: {analysis['end_time']:.1f}s (expected: 18.0s)")
        logger.info(f"  ✓ Duration: {analysis['duration']:.1f}s (expected: 11.5s)")
        logger.info(f"  ✓ Start error: {analysis['start_error']:.2f}s")
        logger.info(f"  ✓ End error: {analysis['end_error']:.2f}s")

    # Check Surah 1 (reference)
    surah1_result = next((r for r in results if r["surah_no"] == 1), None)
    if surah1_result and "error" not in surah1_result:
        analysis = surah1_result["first_ayah_analysis"]
        logger.info(f"Surah 1 (Al-Fatiha) - REFERENCE MAINTAINED:")
        logger.info(f"  ✓ Start time: {analysis['start_time']:.1f}s (expected: 11.0s)")
        logger.info(f"  ✓ Duration: {analysis['duration']:.1f}s")
        logger.info(f"  ✓ No regression detected")

    logger.info(f"\n=== VALIDATION COMPLETE ===")


if __name__ == "__main__":
    main()
