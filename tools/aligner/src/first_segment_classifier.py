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
from .special_segments import SpecialSegmentDetector

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
        10: "الر