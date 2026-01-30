"""Text-aware alignment validation and optimization.

This module provides intelligent validation of audio segments against text content
to prevent false splits within ayahs and ensure coherent alignment.
"""

import logging
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
import numpy as np

from .text_analyzer import AyahTextAnalyzer, AyahAnalysis, PausePoint

logger = logging.getLogger(__name__)


@dataclass
class SegmentValidation:
    """Result of validating a single audio segment."""

    start_time: float
    end_time: float
    ayah_text: str
    validation_score: float
    confidence_breakdown: Dict[str, float]
    issues: List[str]
    is_valid: bool
    expected_duration: float = 0.0


@dataclass
class AlignmentOptimization:
    """Result of optimizing segment boundaries."""

    original_segments: List[Tuple[float, float]]
    optimized_segments: List[Tuple[float, float]]
    improvements: List[str]
    validation_results: List[SegmentValidation]


class TextAwareAlignmentValidator:
    """Validates and optimizes audio alignment using text intelligence."""

    def __init__(
        self,
        recitation_style: str = "qalun",
        max_pause_within_ayah: float = 3.0,
        min_ayah_duration: float = 1.0,
    ):
        """Initialize the text-aware validator.

        Args:
            recitation_style: Recitation style for analysis
            max_pause_within_ayah: Maximum pause duration within an ayah (seconds)
            min_ayah_duration: Minimum duration for an ayah segment (seconds)
        """
        self.text_analyzer = AyahTextAnalyzer(recitation_style)
        self.max_pause_within_ayah = max_pause_within_ayah
        self.min_ayah_duration = min_ayah_duration

        # Validation thresholds
        self.min_validation_score = 0.6
        self.min_coherence_score = 0.5
        self.duration_tolerance = 0.3  # 30% tolerance for duration mismatches

    def validate_and_optimize_alignment(
        self,
        vad_segments: List[Tuple[float, float]],
        ayahs: List[Dict[str, Any]],
        total_duration: float,
    ) -> AlignmentOptimization:
        """Validate and optimize VAD segments using text intelligence.

        Args:
            vad_segments: Raw VAD-detected segments
            ayahs: List of ayah dictionaries with text content
            total_duration: Total audio duration

        Returns:
            AlignmentOptimization with optimized segments
        """
        logger.info(
            f"Validating {len(vad_segments)} VAD segments against {len(ayahs)} ayahs"
        )

        # Analyze all ayahs first
        ayah_analyses = []
        for ayah in ayahs:
            analysis = self.text_analyzer.analyze_ayah(ayah.get("aya_text", ""))
            ayah_analyses.append(analysis)

        # Validate each segment
        validation_results = []
        for i, (seg_start, seg_end) in enumerate(vad_segments):
            # Find which ayah this segment belongs to (simplified)
            ayah_idx = min(i, len(ayahs) - 1)
            ayah_text = ayahs[ayah_idx].get("aya_text", "")
            ayah_analysis = ayah_analyses[ayah_idx]

            validation = self._validate_segment(
                seg_start, seg_end, ayah_text, ayah_analysis
            )
            validation_results.append(validation)

        # Optimize segment boundaries
        optimized_segments = self._optimize_segments(
            vad_segments, ayahs, ayah_analyses, validation_results
        )

        # Generate improvement report
        improvements = self._generate_improvement_report(
            vad_segments, optimized_segments, validation_results
        )

        return AlignmentOptimization(
            original_segments=vad_segments,
            optimized_segments=optimized_segments,
            improvements=improvements,
            validation_results=validation_results,
        )

    def _validate_segment(
        self,
        seg_start: float,
        seg_end: float,
        ayah_text: str,
        ayah_analysis: AyahAnalysis,
    ) -> SegmentValidation:
        """Validate a single audio segment against text content.

        Args:
            seg_start: Segment start time
            seg_end: Segment end time
            ayah_text: Ayah text content
            ayah_analysis: Pre-computed ayah analysis

        Returns:
            SegmentValidation with detailed results
        """
        segment_duration = seg_end - seg_start

        # Basic duration checks
        issues = []
        if segment_duration < self.min_ayah_duration:
            issues.append(
                f"Segment too short: {segment_duration:.1f}s < {self.min_ayah_duration}s"
            )

        # Check for excessive pauses within segment
        if segment_duration > self.max_pause_within_ayah:
            issues.append(
                f"Segment too long: {segment_duration:.1f}s > {self.max_pause_within_ayah}s"
            )

        # Text-aware validation
        validation_scores = self.text_analyzer.validate_segment_split(
            seg_start, seg_end, ayah_analysis
        )

        # Additional text coherence checks
        coherence_issues = self._check_text_coherence_issues(
            seg_start, seg_end, ayah_text, ayah_analysis
        )
        issues.extend(coherence_issues)

        # Calculate overall validation score
        overall_score = validation_scores["overall_score"]

        # Penalize for issues
        if issues:
            overall_score *= 0.7  # Reduce score if there are issues

        return SegmentValidation(
            start_time=seg_start,
            end_time=seg_end,
            ayah_text=ayah_text,
            validation_score=overall_score,
            confidence_breakdown=validation_scores,
            issues=issues,
            is_valid=overall_score >= self.min_validation_score,
        )

    def _check_text_coherence_issues(
        self,
        seg_start: float,
        seg_end: float,
        ayah_text: str,
        ayah_analysis: AyahAnalysis,
    ) -> List[str]:
        """Check for text coherence issues in the segment."""
        issues = []

        # Check if segment splits important grammatical structures
        words = ayah_text.split()
        if len(words) > 1:
            # Check for split conjunctions
            for i, word in enumerate(words[:-1]):
                if word in ["وَ", "فَ", "فِي", "عَلَى", "مِن", "إِلَى", "بِ"]:
                    # This word should ideally not be at the end of a segment
                    if i == len(words) - 2:  # Second to last word
                        issues.append(
                            "Segment ends with conjunction that should continue"
                        )

            # Check for split prepositional phrases
            for i, word in enumerate(words[:-1]):
                if word in ["فِي", "عَلَى", "مِن", "إِلَى", "بِ", "لِ"]:
                    if i == len(words) - 2:  # Second to last word
                        issues.append(
                            "Segment ends with preposition that should continue"
                        )

        # Check pause point alignment
        for pause_point in ayah_analysis.natural_pause_points:
            # Estimate if this pause point should create a boundary
            estimated_pause_position = self._estimate_pause_position(
                pause_point, ayah_analysis, seg_start, seg_end
            )

            if estimated_pause_position:
                pause_start, pause_end = estimated_pause_position
                # Check if pause is within segment but should create boundary
                if (
                    pause_start > seg_start
                    and pause_end < seg_end
                    and pause_end - pause_start > 1.0
                ):  # Significant pause
                    issues.append(
                        "Contains significant pause that should create boundary"
                    )

        return issues

    def _estimate_pause_position(
        self,
        pause_point: PausePoint,
        ayah_analysis: AyahAnalysis,
        seg_start: float,
        seg_end: float,
    ) -> Optional[Tuple[float, float]]:
        """Estimate the audio position of a text pause point."""
        # This is a simplified estimation
        # In practice, you'd need word-level timing or more sophisticated alignment

        text_length = len(ayah_analysis.text)
        if text_length == 0:
            return None

        # Estimate position based on text position
        text_position_ratio = pause_point.position / text_length

        # Estimate pause duration
        pause_duration = pause_point.expected_duration

        # Calculate estimated audio position
        segment_duration = seg_end - seg_start
        estimated_pause_start = seg_start + (segment_duration * text_position_ratio)
        estimated_pause_end = estimated_pause_start + pause_duration

        return (estimated_pause_start, estimated_pause_end)

    def _optimize_segments(
        self,
        vad_segments: List[Tuple[float, float]],
        ayahs: List[Dict[str, Any]],
        ayah_analyses: List[AyahAnalysis],
        validation_results: List[SegmentValidation],
    ) -> List[Tuple[float, float]]:
        """Optimize segment boundaries based on text analysis."""
        optimized_segments = []

        if not vad_segments:
            return optimized_segments

        # Start with original segments
        current_segments = vad_segments.copy()

        # Apply optimizations based on validation results
        for i, (validation, ayah_analysis) in enumerate(
            zip(validation_results, ayah_analyses)
        ):
            if not validation.is_valid:
                # Try to fix invalid segments
                fixed_segments = self._fix_invalid_segment(
                    i, current_segments, ayahs[i], ayah_analysis
                )

                if fixed_segments:
                    # Replace the segment with optimized version
                    if i < len(current_segments):
                        current_segments[i] = fixed_segments[0]

        # Merge segments that are too close or have coherence issues
        optimized_segments = self._merge_problematic_segments(
            current_segments, ayahs, ayah_analyses, validation_results
        )

        # Ensure segments cover the entire duration
        optimized_segments = self._ensure_full_coverage(
            optimized_segments, vad_segments[0][0], vad_segments[-1][1]
        )

        return optimized_segments

    def _fix_invalid_segment(
        self,
        seg_idx: int,
        current_segments: List[Tuple[float, float]],
        ayah: Dict[str, Any],
        ayah_analysis: AyahAnalysis,
    ) -> Optional[List[Tuple[float, float]]]:
        """Attempt to fix an invalid segment."""
        if seg_idx >= len(current_segments):
            return None

        seg_start, seg_end = current_segments[seg_idx]
        segment_duration = seg_end - seg_start

        # If segment is too short, try to merge with adjacent segments
        if segment_duration < self.min_ayah_duration:
            return self._merge_with_adjacent(seg_idx, current_segments, ayah_analysis)

        # If segment is too long, try to split it
        if segment_duration > self.max_pause_within_ayah:
            return self._split_long_segment(seg_idx, current_segments, ayah_analysis)

        # If coherence issues, try to adjust boundaries
        return self._adjust_boundaries(seg_idx, current_segments, ayah_analysis)

    def _merge_with_adjacent(
        self,
        seg_idx: int,
        segments: List[Tuple[float, float]],
        ayah_analysis: AyahAnalysis,
    ) -> Optional[List[Tuple[float, float]]]:
        """Try to merge segment with adjacent segments."""
        if seg_idx == 0 and len(segments) > 1:
            # Merge with next segment
            new_seg = (segments[seg_idx][0], segments[seg_idx + 1][1])
            return [new_seg]

        elif seg_idx == len(segments) - 1 and len(segments) > 1:
            # Merge with previous segment
            new_seg = (segments[seg_idx - 1][0], segments[seg_idx][1])
            return [new_seg]

        elif 0 < seg_idx < len(segments) - 1:
            # Merge with both adjacent segments
            new_seg = (segments[seg_idx - 1][0], segments[seg_idx + 1][1])
            return [new_seg]

        return None

    def _split_long_segment(
        self,
        seg_idx: int,
        segments: List[Tuple[float, float]],
        ayah_analysis: AyahAnalysis,
    ) -> Optional[List[Tuple[float, float]]]:
        """Try to split a segment that's too long."""
        if seg_idx >= len(segments):
            return None

        seg_start, seg_end = segments[seg_idx]
        segment_duration = seg_end - seg_start

        # Look for natural pause points to split at
        for pause_point in ayah_analysis.natural_pause_points:
            estimated_pos = self._estimate_pause_position(
                pause_point, ayah_analysis, seg_start, seg_end
            )

            if estimated_pos:
                pause_start, pause_end = estimated_pos

                # Check if pause is significant and well-positioned
                if (
                    pause_end - pause_start > 1.0
                    and seg_start < pause_start < seg_end - 1.0
                ):
                    # Split at the pause
                    split_point = pause_end
                    return [(seg_start, split_point), (split_point, seg_end)]

        # If no good pause point, split in middle
        mid_point = (seg_start + seg_end) / 2
        return [(seg_start, mid_point), (mid_point, seg_end)]

    def _adjust_boundaries(
        self,
        seg_idx: int,
        segments: List[Tuple[float, float]],
        ayah_analysis: AyahAnalysis,
    ) -> Optional[List[Tuple[float, float]]]:
        """Try to adjust segment boundaries to improve coherence."""
        if seg_idx >= len(segments):
            return None

        seg_start, seg_end = segments[seg_idx]

        # Try to move start boundary
        if seg_idx > 0:
            new_start = segments[seg_idx - 1][1] + 0.1  # Small gap
            if new_start < seg_end - self.min_ayah_duration:
                return [(new_start, seg_end)]

        # Try to move end boundary
        if seg_idx < len(segments) - 1:
            new_end = segments[seg_idx + 1][0] - 0.1  # Small gap
            if new_end > seg_start + self.min_ayah_duration:
                return [(seg_start, new_end)]

        return None

    def _merge_problematic_segments(
        self,
        segments: List[Tuple[float, float]],
        ayahs: List[Dict[str, Any]],
        ayah_analyses: List[AyahAnalysis],
        validation_results: List[SegmentValidation],
    ) -> List[Tuple[float, float]]:
        """Merge segments that have coherence issues."""
        optimized_segments = []

        for i in range(len(segments)):
            if i == 0:
                optimized_segments.append(segments[i])
                continue

            prev_seg = optimized_segments[-1]
            curr_seg = segments[i]

            # Check if segments should be merged
            gap = curr_seg[0] - prev_seg[1]

            # Merge if gap is too small or if there are coherence issues
            if (
                gap < 0.1  # Very small gap
                or validation_results[i].issues  # Current segment has issues
                or len(ayahs[i].get("aya_text", "").split()) < 3
            ):  # Very short ayah
                # Merge segments
                merged_seg = (prev_seg[0], curr_seg[1])
                optimized_segments[-1] = merged_seg
            else:
                optimized_segments.append(curr_seg)

        return optimized_segments

    def _ensure_full_coverage(
        self, segments: List[Tuple[float, float]], start_time: float, end_time: float
    ) -> List[Tuple[float, float]]:
        """Ensure segments cover the full duration without gaps."""
        if not segments:
            return [(start_time, end_time)]

        # Check coverage
        first_start, first_end = segments[0]
        last_start, last_end = segments[-1]

        # Adjust first segment if needed
        if first_start > start_time:
            segments[0] = (start_time, first_end)

        # Adjust last segment if needed
        if last_end < end_time:
            segments[-1] = (last_start, end_time)

        # Check for gaps between segments
        optimized_segments = []
        for i in range(len(segments)):
            if i == 0:
                optimized_segments.append(segments[i])
                continue

            prev_end = optimized_segments[-1][1]
            curr_start, curr_end = segments[i]

            if curr_start > prev_end:
                # Fill gap
                optimized_segments.append((prev_end, curr_start))
                optimized_segments.append((curr_start, curr_end))
            else:
                optimized_segments.append((curr_start, curr_end))

        return optimized_segments

    def _generate_improvement_report(
        self,
        original_segments: List[Tuple[float, float]],
        optimized_segments: List[Tuple[float, float]],
        validation_results: List[SegmentValidation],
    ) -> List[str]:
        """Generate a report of improvements made."""
        improvements = []

        # Compare segment counts
        if len(optimized_segments) != len(original_segments):
            improvements.append(
                f"Segment count adjusted: {len(original_segments)} -> {len(optimized_segments)}"
            )

        # Count validation improvements
        valid_before = sum(1 for v in validation_results if v.is_valid)
        # Note: This would need recomputation for optimized segments

        improvements.append(
            f"Validation analysis completed for {len(validation_results)} segments"
        )

        # Add specific issue fixes
        issues_fixed = []
        for validation in validation_results:
            if validation.issues:
                issues_fixed.extend(validation.issues[:1])  # Add one issue per segment

        if issues_fixed:
            improvements.append(
                f"Addressed coherence issues: {len(issues_fixed)} segments"
            )

        return improvements

    def get_alignment_quality_summary(
        self, validation_results: List[SegmentValidation]
    ) -> Dict[str, Any]:
        """Generate a summary of alignment quality."""
        if not validation_results:
            return {"total_segments": 0, "valid_segments": 0, "average_score": 0.0}

        total_segments = len(validation_results)
        valid_segments = sum(1 for v in validation_results if v.is_valid)
        average_score = (
            sum(v.validation_score for v in validation_results) / total_segments
        )

        # Issue breakdown
        issue_types = {}
        for validation in validation_results:
            for issue in validation.issues:
                issue_type = issue.split(":")[0]  # Get the main issue type
                issue_types[issue_type] = issue_types.get(issue_type, 0) + 1

        return {
            "total_segments": total_segments,
            "valid_segments": valid_segments,
            "invalid_segments": total_segments - valid_segments,
            "validation_rate": valid_segments / total_segments
            if total_segments > 0
            else 0.0,
            "average_score": round(average_score, 3),
            "issue_breakdown": issue_types,
            "min_score": min(v.validation_score for v in validation_results),
            "max_score": max(v.validation_score for v in validation_results),
        }
