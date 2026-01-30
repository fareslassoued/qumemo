"""Special segment detection for Isti'adha and Basmala.

The first audio segments often contain:
- Isti'adha: أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ
- Basmala: بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ

These need to be detected and handled separately from the actual surah text.
"""

import re
from typing import Optional, Tuple
from dataclasses import dataclass


@dataclass
class SpecialSegment:
    """A detected special segment."""

    type: str  # 'isti'adha' or 'basmala'
    text: str
    start_time: float
    end_time: float


# Reference texts for special segments
ISTIADHA_TEXT = "أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ"
BASMALA_TEXT = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"

# Alternative forms
ISTIADHA_VARIANTS = [
    "أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ",
    "أعوذ بالله من الشيطان الرجيم",
    "أَعُوذُ بِاللَّهِ",
    "أعوذ بالله",
]

BASMALA_VARIANTS = [
    "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",
    "بسم الله الرحمن الرحيم",
    "بِسْمِ اللَّهِ",
    "بسم الله",
]


class SpecialSegmentDetector:
    """Detects Isti'adha and Basmala in audio segments."""

    def __init__(self, min_similarity: float = 0.6):
        """Initialize detector.

        Args:
            min_similarity: Minimum similarity score to accept a match
        """
        self.min_similarity = min_similarity

    def normalize_text(self, text: str) -> str:
        """Normalize Arabic text for comparison."""
        # Remove diacritics
        text = re.sub(r"[ًٌٍَُِّْٰ]", "", text)
        # Remove special characters
        text = re.sub(r"[۝۞۟]", "", text)
        # Normalize whitespace
        text = " ".join(text.split())
        return text.strip()

    def calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity between two texts."""
        from rapidfuzz import fuzz

        norm1 = self.normalize_text(text1)
        norm2 = self.normalize_text(text2)

        return fuzz.ratio(norm1, norm2) / 100.0

    def detect(self, transcribed_text: str) -> Optional[str]:
        """Detect if text is Isti'adha or Basmala.

        Args:
            transcribed_text: Transcribed text from ASR

        Returns:
            'isti'adha', 'basmala', or None
        """
        # Check Isti'adha variants
        for variant in ISTIADHA_VARIANTS:
            similarity = self.calculate_similarity(transcribed_text, variant)
            if similarity >= self.min_similarity:
                return "isti'adha"

        # Check Basmala variants
        for variant in BASMALA_VARIANTS:
            similarity = self.calculate_similarity(transcribed_text, variant)
            if similarity >= self.min_similarity:
                return "basmala"

        return None

    def get_reference_text(self, segment_type: str) -> str:
        """Get the full reference text for a special segment."""
        if segment_type == "isti'adha":
            return ISTIADHA_TEXT
        elif segment_type == "basmala":
            return BASMALA_TEXT
        return ""

    def is_special_segment_start(self, transcribed_text: str) -> bool:
        """Check if text starts with a special segment."""
        # Check for partial matches at the start
        normalized = self.normalize_text(transcribed_text)

        # Check if starts with Isti'adha keywords
        if any(keyword in normalized for keyword in ["اعوذ", "أعوذ"]):
            return True

        # Check if starts with Basmala keywords
        if any(keyword in normalized for keyword in ["بسم", "بسم"]):
            return True

        return False
