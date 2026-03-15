"""Enhanced first segment classification for surah starts.

Classifies the first few audio segments to determine:
- Isti'adha (أعوذ بالله من الشيطان الرجيم)
- Basmala (بسم الله الرحمن الرحيم)
- Muqatta'at letters (surahs starting with disconnected letters like يس, المص, etc.)
- Ayah 1 (direct start without special segments)

Handles cases where ASR misses or mis-transcribes the Basmala.
"""

import logging
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass

try:
    from .special_segments import SpecialSegmentDetector
except ImportError:
    from special_segments import SpecialSegmentDetector

logger = logging.getLogger(__name__)


@dataclass
class SegmentClassification:
    """Classification result for a segment."""

    segment_idx: int
    segment_type: str  # 'isti'adha', 'basmala', 'muqattaat', 'ayah1', 'unknown'
    confidence: float
    transcribed_text: str
    start_time: float
    end_time: float


class FirstSegmentClassifier:
    """Classifies first segments of a surah recording.

    Analyzes the first 3-4 segments together to determine structure:
    - Isti'adha only
    - Isti'adha + Basmala
    - Isti'adha + Basmala + Ayah1
    - Isti'adha + Muqatta'at (for surahs like 36, starting with يس)
    - Direct Ayah1 start
    """

    # Muqatta'at surahs that start with disconnected letters
    # Format: surah_no -> first_ayah_text (typically just the letters)
    MUQATTAAT_SURAHS = {
        2: "الم",  # Al-Baqarah
        3: "الم",  # Al-Imran
        7: "المص",  # Al-A'raf
        10: "الر",  # Yunus
        11: "الر",  # Hud
        12: "الر",  # Yusuf
        13: "المر",  # Ar-Ra'd
        14: "الر",  # Ibrahim
        15: "الر",  # Al-Hijr
        19: "كهيعص",  # Maryam
        20: "طه",  # Ta-Ha
        26: "طسم",  # Ash-Shu'ara
        27: "طس",  # An-Naml
        28: "طسم",  # Al-Qasas
        29: "الم",  # Al-Ankabut
        30: "الم",  # Ar-Rum
        31: "الم",  # Luqman
        32: "الم",  # As-Sajda
        36: "يس",  # Ya-Sin
        38: "ص",  # Sad
        40: "حم",  # Ghafir
        41: "حم",  # Fussilat
        42: "حم عسق",  # Ash-Shura (2 Muqattaat segments: حم + عسق)
        43: "حم",  # Az-Zukhruf
        44: "حم",  # Ad-Dukhan
        45: "حم",  # Al-Jathiya
        46: "حم",  # Al-Ahqaf
        50: "ق",  # Qaf
        68: "ن",  # Al-Qalam
    }

    def __init__(self, surah_number: int):
        """Initialize classifier for a specific surah.

        Args:
            surah_number: The surah number to classify
        """
        self.surah_number = surah_number
        self.special_detector = SpecialSegmentDetector(min_similarity=0.5)
        self.is_muqattaat = surah_number in self.MUQATTAAT_SURAHS
        self.muqattaat_text = self.MUQATTAAT_SURAHS.get(surah_number, "")

    def classify_first_segments(
        self,
        segments: List[Tuple[float, float, str]],
    ) -> Tuple[List[SegmentClassification], int]:
        """Classify the first segments of a recording.

        Args:
            segments: List of (start_time, end_time, transcribed_text) for first segments

        Returns:
            Tuple of (classifications, word_pointer) where word_pointer is where
            Quran text matching should begin (0 for start, or offset for skipped segments)
        """
        if not segments:
            return [], 0

        # Classify each segment
        classifications = []
        for i, (start, end, text) in enumerate(segments):
            classification = self._classify_segment(i, start, end, text)
            classifications.append(classification)
            logger.info(
                f"First segment {i + 1} ({start:.3f}s-{end:.3f}s): "
                f"'{text}' -> {classification.segment_type} (confidence: {classification.confidence:.2f})"
            )

        # Determine overall structure
        structure = self._determine_structure(classifications)
        logger.info(f"Detected structure: {structure}")

        return classifications, structure

    def _classify_segment(
        self, idx: int, start: float, end: float, text: str
    ) -> SegmentClassification:
        """Classify a single segment."""
        text_lower = text.lower().strip()

        # Check for Isti'adha (always first if present)
        if idx == 0:
            istiadha_type = self.special_detector.detect(text)
            if istiadha_type == "isti'adha":
                return SegmentClassification(
                    segment_idx=idx,
                    segment_type="isti'adha",
                    confidence=0.9,
                    transcribed_text=text,
                    start_time=start,
                    end_time=end,
                )

        # Check for Basmala (second segment typically)
        if idx <= 1:  # Can be segment 1 or 2
            basmala_type = self.special_detector.detect(text)
            if basmala_type == "basmala":
                return SegmentClassification(
                    segment_idx=idx,
                    segment_type="basmala",
                    confidence=0.9,
                    transcribed_text=text,
                    start_time=start,
                    end_time=end,
                )

            # Check for partial Basmala match
            if self._is_partial_basmala(text):
                return SegmentClassification(
                    segment_idx=idx,
                    segment_type="basmala_partial",
                    confidence=0.7,
                    transcribed_text=text,
                    start_time=start,
                    end_time=end,
                )

        # Check for Muqatta'at letters (surahs with disconnected letters)
        if self.is_muqattaat and idx <= 2:
            if self._is_muqattaat_text(text):
                return SegmentClassification(
                    segment_idx=idx,
                    segment_type="muqattaat",
                    confidence=0.85,
                    transcribed_text=text,
                    start_time=start,
                    end_time=end,
                )

        # Default: this is Ayah 1 content
        return SegmentClassification(
            segment_idx=idx,
            segment_type="ayah1",
            confidence=0.8,
            transcribed_text=text,
            start_time=start,
            end_time=end,
        )

    def _is_partial_basmala(self, text: str) -> bool:
        """Check if text is a partial match for Basmala."""
        basmala_keywords = ["بسم", "الله", "الرحمن", "الرحيم"]
        text_normalized = self.special_detector.normalize_text(text)
        matches = sum(1 for kw in basmala_keywords if kw in text_normalized)
        return matches >= 2  # At least 2 keywords match

    def _is_muqattaat_text(self, text: str) -> bool:
        """Check if text is a Muqatta'at segment (disconnected letters only).

        Muqattaat segments are short and contain primarily the disconnected
        letters with minimal extra content. Regular ayah text that happens
        to contain those letters must NOT match.
        """
        if not self.muqattaat_text:
            return False

        text_normalized = self.special_detector.normalize_text(text)

        if not text_normalized:
            return False

        # Build list of candidates: full muqattaat + individual parts
        # (e.g. "حم عسق" -> ["حم عسق", "حم", "عسق"])
        candidates = [self.special_detector.normalize_text(self.muqattaat_text)]
        if " " in self.muqattaat_text:
            for part in self.muqattaat_text.split():
                normed = self.special_detector.normalize_text(part)
                if normed:
                    candidates.append(normed)

        for candidate in candidates:
            if not candidate:
                continue

            # Muqattaat segments are short — reject if text is much longer
            if len(text_normalized) > len(candidate) * 3 + 5:
                continue

            # Use full-text similarity (not per-character)
            try:
                from rapidfuzz import fuzz

                similarity = fuzz.ratio(text_normalized, candidate) / 100.0
                if similarity >= 0.5:
                    return True
            except ImportError:
                if candidate in text_normalized or text_normalized in candidate:
                    return True

        return False

    def _determine_structure(self, classifications: List[SegmentClassification]) -> int:
        """Determine the Quran text structure and return word pointer offset.

        Returns:
            Word pointer offset where matching should begin
            (0 = start from beginning, >0 = skip N words)
        """
        types = [c.segment_type for c in classifications]

        # Count special segments
        istiadha_count = types.count("isti'adha")
        basmala_count = types.count("basmala") + types.count("basmala_partial")
        muqattaat_count = types.count("muqattaat")

        logger.info(
            f"Structure analysis: {istiadha_count} isti'adha, "
            f"{basmala_count} basmala, {muqattaat_count} muqattaat"
        )

        # For Surah 36 and similar: Isti'adha + [missing Basmala] + Muqatta'at + Ayah1
        if self.is_muqattaat:
            # Check if we have Muqatta'at detected
            if muqattaat_count > 0:
                # Great! We found the Muqatta'at letters
                # The next segment should be Ayah 1 proper
                logger.info(f"Muqatta'at surah {self.surah_number}: letters detected")

                # If Basmala was not detected, we need to handle it specially
                if basmala_count == 0:
                    logger.warning(
                        f"Basmala not detected for Muqatta'at surah {self.surah_number}. "
                        f"This is expected - some recitations skip Basmala for Muqatta'at surahs."
                    )

                return 0  # Start matching from word 0 (pointer will handle it)

            # No Muqatta'at detected - this is a problem
            # The ASR probably merged it with Ayah 1
            logger.warning(
                f"Muqatta'at letters not detected for surah {self.surah_number}. "
                f"ASR may have merged them with Ayah 1 text."
            )

        # For regular surahs: Isti'adha + Basmala + Ayah1
        # If Basmala missing but expected, we need to detect this
        if istiadha_count > 0 and basmala_count == 0:
            # Check if this is a surah that should have Basmala
            # Most surahs except Surah 9 (At-Tawbah) have Basmala
            if self.surah_number != 9:
                logger.warning(
                    f"Basmala not detected but expected for surah {self.surah_number}. "
                    f"ASR may have missed it or merged it with Ayah 1."
                )

        return 0  # Always start from beginning, we'll handle gaps during matching

    def should_insert_missing_basmala(
        self, classifications: List[SegmentClassification]
    ) -> bool:
        """Determine if we should insert a synthetic Basmala segment."""
        types = [c.segment_type for c in classifications]

        # Only insert if:
        # 1. We have Isti'adha detected
        # 2. We DON'T have Basmala detected
        # 3. This surah should have Basmala (not Surah 9)
        # 4. This is NOT a Muqatta'at surah (they often skip Basmala)
        has_istiadha = "isti'adha" in types
        has_basmala = "basmala" in types or "basmala_partial" in types
        should_have_basmala = self.surah_number != 9

        # Muqatta'at surahs often skip Basmala between Isti'adha and Muqatta'at letters
        # Don't insert synthetic Basmala for these surahs
        if self.is_muqattaat:
            logger.info(
                f"Surah {self.surah_number} is Muqatta'at - skipping Basmala insertion check"
            )
            return False

        if has_istiadha and not has_basmala and should_have_basmala:
            # Check timing - is there a gap between Isti'adha and Ayah 1?
            istiadha_end = 0
            ayah1_start = float("inf")

            for c in classifications:
                if c.segment_type == "isti'adha":
                    istiadha_end = max(istiadha_end, c.end_time)
                elif c.segment_type == "ayah1":
                    ayah1_start = min(ayah1_start, c.start_time)

            gap = ayah1_start - istiadha_end
            if gap > 2.0:  # Gap > 2 seconds suggests missing Basmala
                logger.info(
                    f"Detected {gap:.1f}s gap between Isti'adha and Ayah 1, "
                    f"suggesting missing Basmala"
                )
                return True

        return False

    def get_synthetic_basmala_timing(
        self, istiadha_end: float, ayah1_start: float
    ) -> Tuple[float, float]:
        """Calculate timing for a synthetic Basmala segment."""
        # Basmala typically takes ~2-3 seconds
        # Place it between Isti'adha and Ayah 1
        duration = min(3.0, (ayah1_start - istiadha_end) * 0.5)
        start = istiadha_end + 0.1  # Small gap after Isti'adha
        end = start + duration
        return start, end
