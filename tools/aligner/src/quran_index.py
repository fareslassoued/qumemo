"""Quran word-level index builder from QaloonData.

Creates a flattened word index with global positions for fast alignment.
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


logger = logging.getLogger(__name__)


@dataclass
class WordInfo:
    """Information about a single word in the Quran."""

    global_idx: int  # Global word index across all Quran
    surah: int  # Surah number
    ayah: int  # Ayah number within surah
    word: int  # Word number within ayah
    text: str  # Original Arabic text
    phonemes: List[str]  # Phoneme sequence
    sura_name_en: str  # English surah name
    sura_name_ar: str  # Arabic surah name


class QuranIndex:
    """Word-level index of the Quran for fast alignment.

    Builds a flattened representation where each word has a global position.
    This enables O(1) lookup and efficient window-based searching.
    """

    def __init__(self, data_path: Optional[Path] = None):
        """Initialize the Quran index.

        Args:
            data_path: Path to QaloonData_v10.json
        """
        if data_path is None:
            # Try multiple possible locations
            possible_paths = [
                # From aligner/src/ -> qumemo root -> src/data/
                Path(__file__).parent.parent.parent.parent
                / "src"
                / "data"
                / "quran"
                / "QaloonData_v10.json",
                # From tools/aligner/src/ -> tools/ -> src/data/
                Path(__file__).parent.parent
                / "src"
                / "data"
                / "quran"
                / "QaloonData_v10.json",
                # Relative from current working directory
                Path("src/data/quran/QaloonData_v10.json"),
                # Absolute fallback
                Path("/home/far3s/qumemo/src/data/quran/QaloonData_v10.json"),
            ]

            for path in possible_paths:
                if path.exists():
                    data_path = path
                    break

            if data_path is None:
                raise FileNotFoundError(
                    "Could not find QaloonData_v10.json. Please specify data_path explicitly."
                )

        self.data_path = data_path
        self.words: List[WordInfo] = []
        self.surah_map: Dict[int, Tuple[int, int]] = {}  # surah -> (start_idx, end_idx)
        self.ayah_map: Dict[
            Tuple[int, int], Tuple[int, int]
        ] = {}  # (surah, ayah) -> (start_idx, end_idx)

        self._build_index()

    def _build_index(self):
        """Build the word index from QaloonData."""
        logger.info(f"Building Quran index from {self.data_path}")

        with open(self.data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        global_idx = 0
        current_surah = None
        surah_start = 0

        try:
            from .phoneme_mapper import ArabicPhonemeMapper
        except ImportError:
            from phoneme_mapper import ArabicPhonemeMapper

        phoneme_mapper = ArabicPhonemeMapper()

        for entry in data:
            surah = entry["sura_no"]
            ayah = entry["aya_no"]
            ayah_text = entry["aya_text"]
            sura_name_en = entry.get("sura_name_en", "")
            sura_name_ar = entry.get("sura_name_ar", "")

            # Track surah boundaries
            if current_surah != surah:
                if current_surah is not None:
                    # Close previous surah
                    self.surah_map[current_surah] = (surah_start, global_idx - 1)
                current_surah = surah
                surah_start = global_idx

            # Split ayah text into words
            # Remove ayah marker (number at end) and split
            words = self._split_ayah_text(ayah_text)

            ayah_start = global_idx

            for word_idx, word_text in enumerate(words):
                # Get phonemes for this word
                phoneme_mappings = phoneme_mapper.text_to_phonemes(word_text)
                phonemes = []
                for mapping in phoneme_mappings:
                    phonemes.extend(mapping.phonemes)

                word_info = WordInfo(
                    global_idx=global_idx,
                    surah=surah,
                    ayah=ayah,
                    word=word_idx + 1,  # 1-based
                    text=word_text,
                    phonemes=phonemes,
                    sura_name_en=sura_name_en,
                    sura_name_ar=sura_name_ar,
                )
                self.words.append(word_info)
                global_idx += 1

            # Track ayah boundaries
            self.ayah_map[(surah, ayah)] = (ayah_start, global_idx - 1)

        # Close last surah
        if current_surah is not None:
            self.surah_map[current_surah] = (surah_start, global_idx - 1)

        logger.info(
            f"Index built: {len(self.words)} words across {len(self.surah_map)} surahs"
        )

    def _split_ayah_text(self, text: str) -> List[str]:
        """Split ayah text into individual words.

        Removes ayah number markers and splits by spaces.
        """
        import re

        # Remove ayah number markers (Arabic numerals at end)
        # Pattern: space followed by Arabic digits
        text = re.sub(r"\s+[٠١٢٣٤٥٦٧٨٩]+$", "", text.strip())

        # Split by spaces
        words = [w.strip() for w in text.split() if w.strip()]

        return words

    def get_surah_range(self, surah: int) -> Tuple[int, int]:
        """Get global word range for a surah.

        Returns:
            Tuple of (start_global_idx, end_global_idx)
        """
        return self.surah_map.get(surah, (0, 0))

    def get_ayah_range(self, surah: int, ayah: int) -> Tuple[int, int]:
        """Get global word range for an ayah.

        Returns:
            Tuple of (start_global_idx, end_global_idx)
        """
        return self.ayah_map.get((surah, ayah), (0, 0))

    def get_word(self, global_idx: int) -> Optional[WordInfo]:
        """Get word info by global index."""
        if 0 <= global_idx < len(self.words):
            return self.words[global_idx]
        return None

    def get_text_window(self, start_idx: int, end_idx: int) -> str:
        """Get concatenated text for a window of words."""
        words = []
        for i in range(max(0, start_idx), min(len(self.words), end_idx + 1)):
            words.append(self.words[i].text)
        return " ".join(words)

    def get_phoneme_window(
        self, start_idx: int, end_idx: int
    ) -> Tuple[List[str], List[int]]:
        """Get flattened phonemes for a window with word boundary info.

        Returns:
            Tuple of (phonemes, word_indices)
            where word_indices[i] is the global word index for phonemes[i]
        """
        phonemes = []
        word_indices = []

        for i in range(max(0, start_idx), min(len(self.words), end_idx + 1)):
            word_phonemes = self.words[i].phonemes
            phonemes.extend(word_phonemes)
            word_indices.extend([i] * len(word_phonemes))

        return phonemes, word_indices

    def ref_to_indices(self, ref: str) -> Optional[Tuple[int, int]]:
        """Convert reference string to global indices.

        Args:
            ref: Reference like "2:255:1" or "36:1:1-36:1:10"

        Returns:
            Tuple of (start_global_idx, end_global_idx) or None
        """
        try:
            if "-" in ref:
                # Range reference
                start_ref, end_ref = ref.split("-")
                start_parts = start_ref.split(":")
                end_parts = end_ref.split(":")

                start_surah = int(start_parts[0])
                start_ayah = int(start_parts[1])
                start_word = int(start_parts[2]) if len(start_parts) > 2 else 1

                end_surah = int(end_parts[0])
                end_ayah = int(end_parts[1])
                end_word = int(end_parts[2]) if len(end_parts) > 2 else 1

                # Convert to global indices
                ayah_start, ayah_end = self.get_ayah_range(start_surah, start_ayah)
                start_idx = ayah_start + (start_word - 1)

                ayah_start, ayah_end = self.get_ayah_range(end_surah, end_ayah)
                end_idx = ayah_start + (end_word - 1)

                return (start_idx, end_idx)
            else:
                # Single word reference
                parts = ref.split(":")
                surah = int(parts[0])
                ayah = int(parts[1])
                word = int(parts[2]) if len(parts) > 2 else 1

                ayah_start, ayah_end = self.get_ayah_range(surah, ayah)
                idx = ayah_start + (word - 1)

                return (idx, idx)
        except (ValueError, IndexError) as e:
            logger.warning(f"Failed to parse reference {ref}: {e}")
            return None

    def get_surah_ayah_count(self, surah: int) -> int:
        """Get number of ayahs in a surah."""
        start, end = self.get_surah_range(surah)
        if start == end == 0:
            return 0

        # Count unique ayah numbers
        ayahs = set()
        for i in range(start, end + 1):
            ayahs.add(self.words[i].ayah)

        return len(ayahs)
