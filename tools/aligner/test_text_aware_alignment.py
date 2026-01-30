"""Test script for text-aware alignment validation.

This script demonstrates the text-aware alignment system and tests it
against problematic ayahs like Surah 40:6.
"""

import json
import logging
from pathlib import Path
from typing import List, Dict, Any

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Import the new text analysis components
from src.text_analyzer import AyahTextAnalyzer
from src.alignment_validator import TextAwareAlignmentValidator


def test_text_analysis():
    """Test the text analysis components."""
    logger.info("=== Testing Text Analysis Components ===")

    # Initialize analyzer
    analyzer = AyahTextAnalyzer(recitation_style="qalun")

    # Test problematic ayah from Surah 40:6
    problematic_ayah = "رَبَّنَا وَأَدْخِلْهُمْ جَنَّٰتِ عَدْنٍ اِ۬لتِے وَعَدتَّهُمْ وَمَن صَلَحَ مِنْ ءَابَآئِهِمْ وَأَزْوَٰجِهِمْ وَذُرِّيَّٰتِهِمْۖ إِنَّكَ أَنتَ اَ۬لْعَزِيزُ اُ۬لْحَكِيمُۖ"

    logger.info(f"Analyzing ayah: {problematic_ayah}")

    # Analyze the ayah
    analysis = analyzer.analyze_ayah(problematic_ayah)

    logger.info(f"Word count: {analysis.word_count}")
    logger.info(f"Complexity score: {analysis.complexity_score:.3f}")
    logger.info(
        f"Expected duration: {analysis.expected_duration_range[0]:.1f}s - {analysis.expected_duration_range[1]:.1f}s"
    )
    logger.info(f"Natural pause points found: {len(analysis.natural_pause_points)}")

    for i, pause in enumerate(analysis.natural_pause_points):
        logger.info(
            f"  Pause {i + 1}: {pause.pause_type} (confidence: {pause.confidence:.2f}, "
            f"duration: {pause.expected_duration:.1f}s)"
        )

    # Test segment validation
    logger.info("\n=== Testing Segment Validation ===")

    validator = TextAwareAlignmentValidator(recitation_style="qalun")

    # Test different segment scenarios
    test_segments = [
        (0.0, 8.0),  # Short segment
        (0.0, 15.0),  # Medium segment
        (0.0, 25.0),  # Long segment (potentially problematic)
    ]

    for seg_start, seg_end in test_segments:
        validation = validator._validate_segment(
            seg_start, seg_end, problematic_ayah, analysis
        )

        logger.info(f"\nSegment {seg_start:.1f}s-{seg_end:.1f}s:")
        logger.info(f"  Validation score: {validation.validation_score:.3f}")
        logger.info(f"  Is valid: {validation.is_valid}")
        if validation.issues:
            logger.info(f"  Issues: {validation.issues}")

    return analysis, validator


def test_alignment_optimization():
    """Test the alignment optimization with realistic VAD segments."""
    logger.info("\n=== Testing Alignment Optimization ===")

    # Load sample data for Surah 40
    surah_40_path = Path("output/040_timings.json")
    if not surah_40_path.exists():
        logger.error(f"Sample data not found: {surah_40_path}")
        return

    with open(surah_40_path, "r", encoding="utf-8") as f:
        surah_data = json.load(f)

    # Extract first few ayahs for testing
    test_ayahs = surah_data["ayahs"][:7]  # First 7 ayahs of Surah 40
    logger.info(f"Testing with {len(test_ayahs)} ayahs from Surah 40")

    # Simulate VAD segments (these would normally come from VAD processing)
    # This simulates segments that might have problematic splits
    simulated_vad_segments = [
        (0.0, 5.5),  # Ayah 1
        (5.5, 12.0),  # Ayah 2 - potential split point
        (12.0, 18.0),  # Ayah 3 - potential split point
        (18.0, 22.0),  # Ayah 4
        (22.0, 28.0),  # Ayah 5 - potential split point
        (28.0, 32.0),  # Ayah 6 - THIS IS THE PROBLEMATIC ONE
        (32.0, 38.0),  # Ayah 7
    ]

    # Initialize validator
    validator = TextAwareAlignmentValidator(recitation_style="qalun")

    # Run optimization
    optimization = validator.validate_and_optimize_alignment(
        simulated_vad_segments, test_ayahs, 40.0
    )

    logger.info(f"\nOptimization Results:")
    logger.info(f"Original segments: {len(optimization.original_segments)}")
    logger.info(f"Optimized segments: {len(optimization.optimized_segments)}")

    logger.info(f"\nSegment comparison:")
    for i, (orig, opt) in enumerate(
        zip(optimization.original_segments, optimization.optimized_segments)
    ):
        logger.info(
            f"Ayah {i + 1}: {orig[0]:.1f}s-{orig[1]:.1f}s -> {opt[0]:.1f}s-{opt[1]:.1f}s"
        )

    # Log improvements
    if optimization.improvements:
        logger.info(f"\nImprovements made:")
        for improvement in optimization.improvements:
            logger.info(f"  - {improvement}")

    # Log quality summary
    quality_summary = validator.get_alignment_quality_summary(
        optimization.validation_results
    )
    logger.info(f"\nAlignment Quality Summary:")
    logger.info(f"  Total segments: {quality_summary['total_segments']}")
    logger.info(f"  Valid segments: {quality_summary['valid_segments']}")
    logger.info(f"  Validation rate: {quality_summary['validation_rate']:.1%}")
    logger.info(f"  Average score: {quality_summary['average_score']:.3f}")

    if quality_summary["issue_breakdown"]:
        logger.info(f"  Issue breakdown: {quality_summary['issue_breakdown']}")


def test_specific_problematic_ayah():
    """Test the specific problematic ayah mentioned by user."""
    logger.info("\n=== Testing Specific Problematic Ayah (Surah 40:6) ===")

    # The specific ayah that was problematic
    problematic_ayah_text = (
        "وَقِهِمُ اُ۬لسَّيِّـَٔاتِۖ وَمَن تَقِ اِ۬لسَّيِّـَٔاتِ يَوْمَئِذٖ فَقَدْ رَحِمْتَهُۥۖ وَذَٰلِكَ هُوَ اَ۬لْفَوْزُ اُ۬لْعَظِيمُۖ"
    )

    logger.info(f"Analyzing problematic ayah: {problematic_ayah_text}")

    # Initialize components
    analyzer = AyahTextAnalyzer(recitation_style="qalun")
    validator = TextAwareAlignmentValidator(recitation_style="qalun")

    # Analyze the ayah
    analysis = analyzer.analyze_ayah(problematic_ayah_text)

    logger.info(f"Ayah analysis:")
    logger.info(f"  Word count: {analysis.word_count}")
    logger.info(
        f"  Expected duration: {analysis.expected_duration_range[0]:.1f}s - {analysis.expected_duration_range[1]:.1f}s"
    )
    logger.info(f"  Natural pause points: {len(analysis.natural_pause_points)}")

    # Test different segment scenarios that might occur
    test_scenarios = [
        {
            "name": "Short segment (potential under-split)",
            "segment": (0.0, 8.0),
        },
        {
            "name": "Medium segment (reasonable)",
            "segment": (0.0, 12.0),
        },
        {
            "name": "Long segment (potential over-split with internal pause)",
            "segment": (0.0, 18.0),
        },
        {
            "name": "Very long segment (definitely problematic)",
            "segment": (0.0, 25.0),
        },
    ]

    logger.info(f"\nTesting different segment scenarios:")
    for scenario in test_scenarios:
        validation = validator._validate_segment(
            scenario["segment"][0],
            scenario["segment"][1],
            problematic_ayah_text,
            analysis,
        )

        logger.info(f"\n{scenario['name']}:")
        logger.info(
            f"  Segment: {scenario['segment'][0]:.1f}s-{scenario['segment'][1]:.1f}s"
        )
        logger.info(f"  Validation score: {validation.validation_score:.3f}")
        logger.info(f"  Is valid: {validation.is_valid}")
        logger.info(f"  Duration: {validation.end_time - validation.start_time:.1f}s")
        logger.info(
            f"  Expected: {validation.confidence_breakdown.get('expected_duration', 0.0):.1f}s"
        )

        if validation.issues:
            logger.info(f"  Issues: {validation.issues}")

        # Show confidence breakdown
        logger.info(f"  Confidence breakdown:")
        logger.info(
            f"    Duration: {validation.confidence_breakdown['duration_score']:.3f}"
        )
        logger.info(
            f"    Pause points: {validation.confidence_breakdown['pause_score']:.3f}"
        )
        logger.info(
            f"    Coherence: {validation.confidence_breakdown['coherence_score']:.3f}"
        )


def main():
    """Run all tests."""
    logger.info("Starting Text-Aware Alignment Tests")

    try:
        # Test basic text analysis
        analysis, validator = test_text_analysis()

        # Test alignment optimization
        test_alignment_optimization()

        # Test specific problematic ayah
        test_specific_problematic_ayah()

        logger.info("\n=== All Tests Completed Successfully ===")

    except Exception as e:
        logger.error(f"Test failed with error: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()
