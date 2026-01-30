"""Ayah text analysis for intelligent alignment validation.

This module provides text-aware validation to prevent false splits within ayahs
when there are legitimate pauses in the recitation.
"""

import re
import unicodedata
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class PausePoint:
    """Represents a potential pause point within an ayah."""

    position: int  # Character position in text
    pause_type: str  # 'grammatical', 'natural', 'mandatory'
    confidence: float  # 0.0-1.0
    expected_duration: float  # Expected pause duration in seconds


@dataclass
class AyahAnalysis:
    """Analysis result for a single ayah."""

    text: str
    word_count: int
    natural_pause_points: List[PausePoint]
    expected_duration_range: Tuple[float, float]  # (min, max) expected duration
    complexity_score: float  # 0.0-1.0, higher = more complex/longer


class AyahTextAnalyzer:
    """Analyzes ayah text structure to identify legitimate pause points."""

    def __init__(self, recitation_style: str = "qalun"):
        """Initialize analyzer for specific recitation style.

        Args:
            recitation_style: Recitation style (e.g., 'qalun', 'hafs', etc.)
        """
        self.recitation_style = recitation_style

        # Base pause durations in seconds for Al-Husari Qalun recitation
        self.base_pause_durations = {
            "grammatical": 1.5,  # Natural grammatical pauses
            "natural": 2.0,  # Natural breathing pauses
            "mandatory": 2.5,  # Waqf (stop) markers
        }

        # Style-specific adjustments
        self.style_adjustments = {
            "qalun": {
                "speed_factor": 0.9,
                "pause_factor": 1.1,
            },  # Slower, longer pauses
            "hafs": {"speed_factor": 1.0, "pause_factor": 1.0},
        }

        # Arabic grammatical patterns that indicate natural pauses
        self.pause_patterns = [
            r"\s+وَ\s+",  # Wa (and) conjunctions
            r"\s+فَ\s+",  # Fa (then) conjunctions
            r"\s+فِي\s+",  # Fi (in) prepositions
            r"\s+عَلَى\s+",  # Ala (on) prepositions
            r"\s+مِن\s+",  # Min (from) prepositions
            r"\s+إِلَى\s+",  # Ila (to) prepositions
            r"\s+بِ\s+",  # Bi (with) prepositions
        ]

        # Waqf (stop) markers in Arabic text
        self.waqf_markers = [
            "۝",  # Small high stop
            "۞",  # Round stop
            "۟",  # Cornered stop
            "ۤ",  # Small
            "ۥ",  # Small
            "ۦ",  # Small
            "ٓ",  # High maddah
            "ٔ",  # Kasra
            "ٕ",  # Kasra
            "ٖ",  # Kasra
            "ٗ",  # Kasra
            "٘",  # Fatha
            "ٙ",  # Damma
            "ٚ",  # Sukun
            "ٛ",  # Shaddah
            "ٜ",  # Maddah
        ]

        # Word duration estimates (seconds per word) for Qalun recitation
        self.word_duration_base = {
            "short": 0.8,  # 1-2 syllables
            "medium": 1.2,  # 3-4 syllables
            "long": 1.8,  # 5+ syllables
        }

    def analyze_ayah(self, ayah_text: str) -> AyahAnalysis:
        """Analyze a single ayah for text structure and pause points.

        Args:
            ayah_text: The ayah text to analyze

        Returns:
            AyahAnalysis with detailed breakdown
        """
        # Clean and normalize text
        clean_text = self._clean_text(ayah_text)

        # Count words and estimate complexity
        word_count = self._count_words(clean_text)
        complexity_score = self._calculate_complexity(clean_text, word_count)

        # Find natural pause points
        pause_points = self._identify_pause_points(clean_text)

        # Calculate expected duration range
        expected_duration = self._calculate_expected_duration(
            word_count, complexity_score
        )

        return AyahAnalysis(
            text=clean_text,
            word_count=word_count,
            natural_pause_points=pause_points,
            expected_duration_range=expected_duration,
            complexity_score=complexity_score,
        )

    def _clean_text(self, text: str) -> str:
        """Clean and normalize Arabic text."""
        # Remove diacritics but keep basic characters
        cleaned = unicodedata.normalize("NFKC", text)

        # Remove specific non-essential characters
        cleaned = re.sub(r"[ً-٩]", "", cleaned)  # Remove diacritics and numbers
        cleaned = re.sub(
            r"[\u064B-\u065F]", "", cleaned
        )  # Remove additional diacritics

        # Normalize whitespace
        cleaned = re.sub(r"\s+", " ", cleaned).strip()

        return cleaned

    def _count_words(self, text: str) -> int:
        """Count words in Arabic text."""
        # Split by spaces and filter out empty strings
        words = [word for word in text.split(" ") if word.strip()]
        return len(words)

    def _calculate_complexity(self, text: str, word_count: int) -> float:
        """Calculate complexity score for the ayah.

        Args:
            text: Cleaned ayah text
            word_count: Number of words in ayah

        Returns:
            Complexity score 0.0-1.0
        """
        if word_count == 0:
            return 0.0

        # Base complexity from word count
        word_complexity = min(word_count / 20.0, 1.0)  # Normalize to 0-1

        # Check for complex patterns (long words, repeated structures)
        long_words = len(re.findall(r"[^\s]{8,}", text))  # 8+ character words
        long_word_complexity = min(long_words / 5.0, 0.3)  # Max 30% contribution

        # Check for grammatical complexity
        grammatical_markers = len(re.findall(r"[فوويبفيمنعلإ]", text))
        grammar_complexity = min(
            grammatical_markers / 20.0, 0.2
        )  # Max 20% contribution

        total_complexity = word_complexity + long_word_complexity + grammar_complexity
        return min(total_complexity, 1.0)

    def _identify_pause_points(self, text: str) -> List[PausePoint]:
        """Identify natural and grammatical pause points in the text.

        Args:
            text: Cleaned ayah text

        Returns:
            List of PausePoint objects
        """
        pause_points = []

        # Check for waqf markers first (highest priority)
        for i, char in enumerate(text):
            if char in self.waqf_markers:
                pause_points.append(
                    PausePoint(
                        position=i,
                        pause_type="mandatory",
                        confidence=1.0,
                        expected_duration=self._get_pause_duration("mandatory"),
                    )
                )

        # Check for grammatical patterns
        for pattern in self.pause_patterns:
            for match in re.finditer(pattern, text):
                pause_points.append(
                    PausePoint(
                        position=match.start(),
                        pause_type="grammatical",
                        confidence=0.8,
                        expected_duration=self._get_pause_duration("grammatical"),
                    )
                )

        # Check for natural pause points (between long words/phrases)
        words = text.split()
        for i in range(len(words) - 1):
            current_word = words[i]
            next_word = words[i + 1]

            # Natural pause between long words
            if len(current_word) > 6 or len(next_word) > 6:
                # Find approximate position in original text
                position = text.find(current_word) + len(current_word)
                pause_points.append(
                    PausePoint(
                        position=position,
                        pause_type="natural",
                        confidence=0.6,
                        expected_duration=self._get_pause_duration("natural"),
                    )
                )

        # Sort by position and remove duplicates
        pause_points = sorted(pause_points, key=lambda p: p.position)
        unique_points = []
        seen_positions = set()

        for point in pause_points:
            if point.position not in seen_positions:
                unique_points.append(point)
                seen_positions.add(point.position)

        return unique_points

    def _get_pause_duration(self, pause_type: str) -> float:
        """Get adjusted pause duration for specific type and recitation style."""
        base_duration = self.base_pause_durations.get(pause_type, 1.0)
        style_factor = self.style_adjustments.get(self.recitation_style, {}).get(
            "pause_factor", 1.0
        )
        return base_duration * style_factor

    def _calculate_expected_duration(
        self, word_count: int, complexity_score: float
    ) -> Tuple[float, float]:
        """Calculate expected duration range for an ayah.

        Args:
            word_count: Number of words in ayah
            complexity_score: Complexity score 0.0-1.0

        Returns:
            Tuple of (min_duration, max_duration) in seconds
        """
        if word_count == 0:
            return (0.0, 0.0)

        # Base duration estimation
        avg_word_duration = 1.2  # Average seconds per word for Qalun
        base_duration = word_count * avg_word_duration

        # Adjust for complexity
        complexity_factor = 1.0 + (
            complexity_score * 0.5
        )  # Up to 50% longer for complex

        # Calculate range
        min_duration = base_duration * 0.8  # 20% faster
        max_duration = (
            base_duration * complexity_factor * 1.2
        )  # 20% slower + complexity

        return (round(min_duration, 1), round(max_duration, 1))

    def validate_segment_split(
        self,
        segment_start: float,
        segment_end: float,
        ayah_analysis: AyahAnalysis,
        adjacent_ayah_text: Optional[str] = None,
    ) -> Dict[str, float]:
        """Validate whether a segment split is textually appropriate.

        Args:
            segment_start: Start time of segment
            segment_end: End time of segment
            ayah_analysis: Analysis of the current ayah
            adjacent_ayah_text: Text of adjacent ayah (if any)

        Returns:
            Dictionary with validation scores and reasoning
        """
        segment_duration = segment_end - segment_start

        # Check if duration is within expected range
        min_duration, max_duration = ayah_analysis.expected_duration_range
        duration_score = self._score_duration(
            segment_duration, min_duration, max_duration
        )

        # Check for pause points within the segment
        pause_score = self._score_pause_points(
            segment_start, segment_end, ayah_analysis
        )

        # Check segment coherence (does it make linguistic sense?)
        coherence_score = self._score_text_coherence(
            ayah_analysis.text, segment_start, segment_end
        )

        # Overall validation score
        overall_score = duration_score * 0.4 + pause_score * 0.3 + coherence_score * 0.3

        return {
            "overall_score": overall_score,
            "duration_score": duration_score,
            "pause_score": pause_score,
            "coherence_score": coherence_score,
            "segment_duration": segment_duration,
            "expected_duration": (min_duration + max_duration) / 2,
            "is_valid_split": overall_score > 0.6,  # Threshold for valid split
        }

    def _score_duration(
        self, actual_duration: float, min_duration: float, max_duration: float
    ) -> float:
        """Score how well the segment duration matches expectations."""
        if min_duration <= actual_duration <= max_duration:
            return 1.0  # Perfect match

        # Outside expected range, penalize proportionally
        if actual_duration < min_duration:
            # Too short - penalize severely
            return max(0.0, actual_duration / min_duration * 0.5)
        else:
            # Too long - penalize less severely
            return max(
                0.0, 1.0 - ((actual_duration - max_duration) / max_duration) * 0.3
            )

    def _score_pause_points(
        self, segment_start: float, segment_end: float, ayah_analysis: AyahAnalysis
    ) -> float:
        """Score how well pause points align with segment boundaries."""
        if not ayah_analysis.natural_pause_points:
            return 1.0  # No pause points to consider

        # Find pause points within this time range (rough estimate)
        # This is simplified - in practice, we'd need audio-text alignment
        segment_duration = segment_end - segment_start
        expected_pauses = max(1, int(segment_duration / 2.0))  # Rough estimate

        actual_pauses = len(ayah_analysis.natural_pause_points)

        # Score based on number of pauses matching expectations
        if actual_pauses == expected_pauses:
            return 1.0
        elif actual_pauses < expected_pauses:
            return max(0.0, actual_pauses / expected_pauses)
        else:
            return max(0.0, expected_pauses / actual_pauses)

    def _score_text_coherence(
        self, text: str, segment_start: float, segment_end: float
    ) -> float:
        """Score the linguistic coherence of a potential segment."""
        # Simplified coherence scoring
        # In practice, this would use more sophisticated NLP

        # Prefer segments that don't split important grammatical structures
        coherence_factors = []

        # Check if segment splits conjunctions (bad)
        if re.search(r"\s+وَ\s*\S*$", text):  # Ends with wa-conjunction
            coherence_factors.append(0.3)

        # Check if segment splits prepositional phrases (bad)
        if re.search(r"\s+في|على|من|إلى|ب|\s+لِ\s*\S*$", text):
            coherence_factors.append(0.4)

        # Check if segment starts/ends with natural breaks (good)
        if re.match(r"^(فَ|وَ|فِي|عَلَى|مِن|إِلَى|بِ)", text):
            coherence_factors.append(0.8)

        if re.search(r"(۝|۞|۟|ۤ|ۥ|ۦ|ٓ|ٔ|ٕ|ٖ|ٗ|٘|ٙ|ٚ|ٛ|ٜ)$", text):
            coherence_factors.append(0.9)

        # Return average coherence score
        if coherence_factors:
            return sum(coherence_factors) / len(coherence_factors)
        return 0.7  # Default coherence score

    def suggest_segment_boundaries(
        self, ayah_analysis: AyahAnalysis, audio_duration: float
    ) -> List[float]:
        """Suggest optimal segment boundaries based on text analysis.

        Args:
            ayah_analysis: Analysis of the ayah
            audio_duration: Total duration of ayah audio

        Returns:
            List of suggested boundary timestamps
        """
        boundaries = [0.0]  # Always start at beginning

        if not ayah_analysis.natural_pause_points:
            boundaries.append(audio_duration)
            return boundaries

        # Calculate pause-influenced boundaries
        current_position = 0.0
        remaining_duration = audio_duration

        for pause_point in ayah_analysis.natural_pause_points:
            # Estimate position based on pause importance
            pause_weight = pause_point.confidence * pause_point.expected_duration
            position_ratio = pause_weight / (audio_duration * 0.3)  # Normalize
            boundary_position = current_position + remaining_duration * position_ratio

            # Only add boundary if it makes sense
            if boundary_position > current_position + 0.5:  # Minimum 0.5s separation
                boundaries.append(boundary_position)
                current_position = boundary_position
                remaining_duration = audio_duration - current_position

        boundaries.append(audio_duration)  # Always end at audio end
        return boundaries
