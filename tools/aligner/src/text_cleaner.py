"""Arabic text normalization for CTC alignment."""

import re
import unicodedata
from typing import List


# Muqatta'at (disconnected letters) expansion dictionary
# These letters at the start of 29 surahs are pronounced phonetically (e.g. "Alif Lam Mim")
# but written as single connected characters. Expansion gives the CTC aligner enough
# character slots to match the long audio duration (~10-15 seconds with Madd Lazem).
#
# Keys are BASE letters only (without diacritics). The actual Quran text has diacritics
# like أَلَٓمِّٓۖ but we strip them for matching, then replace the original word.
#
# Values include elongation characters (repeated alif/ya) to represent Madd Lazem
# (6 harakaat obligatory prolongation). This gives the CTC aligner more character
# slots to match the long audio duration of each letter (~3-4 seconds each).
MUQATTAAT_MAP = {
    "الم": "أاليييف لااااام ميييييم",
    "المص": "أاليييف لااااام ميييييم صااااد",
    "الر": "أاليييف لااااام رااااا",
    "المر": "أاليييف لااااام ميييييم رااااا",
    "كهيعص": "كااااف هاااااا ياااااا عييييين صااااد",
    "طه": "طاااااا هاااااا",
    "طسم": "طاااااا سيييييين ميييييم",
    "طس": "طاااااا سيييييين",
    "يس": "ياااااا سيييييين",
    "ص": "صاااااااد",
    "حم": "حاااااا ميييييم",
    "عسق": "عييييين سيييييين قااااف",
    "ق": "قاااااااف",
    "ن": "نوووووون",
}

# Surahs that start with Muqatta'at (for reference)
# 2, 3, 7, 10, 11, 12, 13, 14, 15, 19, 20, 26, 27, 28, 29, 30, 31, 32, 36, 38, 40, 41, 42, 43, 44, 45, 46, 50, 68

# Expected duration per Muqatta'at letter with Madd Lazem (6 harakaat)
# Based on Al-Husari Qalun recitation timing (~5 seconds per letter including pauses)
MUQATTAAT_LETTER_DURATION = 5.0  # seconds per letter

# Number of letters in each Muqatta'at pattern
MUQATTAAT_LETTER_COUNT = {
    "الم": 3,      # Alif-Lam-Mim
    "المص": 4,     # Alif-Lam-Mim-Sad
    "الر": 3,      # Alif-Lam-Ra
    "المر": 4,     # Alif-Lam-Mim-Ra
    "كهيعص": 5,    # Kaf-Ha-Ya-Ain-Sad
    "طه": 2,       # Ta-Ha
    "طسم": 3,      # Ta-Sin-Mim
    "طس": 2,       # Ta-Sin
    "يس": 2,       # Ya-Sin
    "ص": 1,        # Sad
    "حم": 2,       # Ha-Mim
    "عسق": 3,      # Ain-Sin-Qaf
    "ق": 1,        # Qaf
    "ن": 1,        # Nun
}


def get_muqattaat_expected_duration(text: str) -> float:
    """
    Get expected duration for Muqatta'at based on letter count.

    Args:
        text: First word of ayah (may have diacritics)

    Returns:
        Expected duration in seconds, or 0.0 if not Muqatta'at
    """
    if not text:
        return 0.0

    first_word = text.strip().split()[0] if text.strip() else ""
    first_word_base = _strip_diacritics(first_word)

    for key, letter_count in MUQATTAAT_LETTER_COUNT.items():
        if first_word_base == key:
            return letter_count * MUQATTAAT_LETTER_DURATION

    return 0.0


def is_muqattaat_word(word: str) -> bool:
    """Check if a word is an expanded Muqatta'at word."""
    # Check if it matches any of our elongated expansions
    for expansion in MUQATTAAT_MAP.values():
        if word in expansion.split():
            return True
    return False

# Arabic diacritics and marks to strip for Muqatta'at matching
# Includes: harakat, shadda, sukun, madda, small high marks, pause marks
_DIACRITICS_PATTERN = re.compile(
    r'[\u064B-\u0652'  # Fathatan through Sukun (harakat)
    r'\u0653-\u0655'   # Madda, Hamza above/below
    r'\u0656-\u065F'   # Subscript alef, inverted damma, etc.
    r'\u0670'          # Superscript alef
    r'\u06D6-\u06ED'   # Small high marks, pause marks (includes ۖ)
    r']'
)


def _strip_diacritics(text: str) -> str:
    """Strip Arabic diacritics for matching purposes."""
    # Also normalize hamza forms: أ إ آ ئ ؤ -> ا
    result = _DIACRITICS_PATTERN.sub('', text)
    # Normalize alif forms for matching
    result = result.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
    return result


def expand_muqattaat(text: str) -> str:
    """
    Expand Muqatta'at letters to phonetic form for alignment.

    The Muqatta'at at the start of 29 surahs cause severe misalignment because:
    - Written: `الم` (3 characters, with diacritics: أَلَٓمِّٓۖ)
    - Spoken: "Alif Laaam Miiim" (~10-15 seconds with Madd Lazem)

    This expansion gives the CTC aligner enough token slots to match the audio.

    Args:
        text: Arabic text (typically first ayah of a surah)

    Returns:
        Text with Muqatta'at expanded to phonetic form
    """
    if not text:
        return text

    stripped = text.strip()
    words = stripped.split()
    if not words:
        return text

    first_word = words[0]
    # Strip diacritics from first word for matching
    first_word_base = _strip_diacritics(first_word)

    # Sort by length (longest first) to avoid partial matches
    # e.g., "المص" should match before "الم"
    for key in sorted(MUQATTAAT_MAP.keys(), key=len, reverse=True):
        if first_word_base == key:
            # Replace the original first word (with diacritics) with expansion
            expansion = MUQATTAAT_MAP[key]
            # Reconstruct text: expansion + rest of words
            rest = ' '.join(words[1:])
            if rest:
                return f"{expansion} {rest}"
            else:
                return expansion

    return text


class TextCleaner:
    """Clean and normalize Arabic Quran text for alignment."""

    # Arabic-Indic numerals (٠-٩)
    ARABIC_INDIC_NUMERALS = r"[٠١٢٣٤٥٦٧٨٩]+"

    # Symbols to remove (section/verse markers, not part of recitation)
    SYMBOLS_TO_REMOVE = [
        "\u06de",  # ۞ Rub el Hizb (section marker)
        "\u06dd",  # ۝ End of ayah mark (if present as separate char)
    ]

    def __init__(self, remove_diacritics: bool = False):
        """
        Initialize text cleaner.

        Args:
            remove_diacritics: If True, remove Arabic diacritics (tashkeel).
                             Default False preserves them for better alignment.
        """
        self.remove_diacritics = remove_diacritics

        # Build pattern for verse numbers at end of text
        self._verse_num_pattern = re.compile(
            rf"\s*{self.ARABIC_INDIC_NUMERALS}\s*$"
        )

        # Build pattern for symbols to remove
        escaped_symbols = [re.escape(s) for s in self.SYMBOLS_TO_REMOVE]
        self._symbols_pattern = re.compile(f"[{''.join(escaped_symbols)}]")

        # Arabic diacritics (tashkeel) pattern - basic harakat only
        self._diacritics_pattern = re.compile(
            r"[\u064b-\u0652]"  # Fathatan through sukun
        )

    def clean(self, text: str) -> str:
        """
        Clean Arabic text for alignment.

        Args:
            text: Raw Arabic text from Quran data

        Returns:
            Cleaned text suitable for alignment
        """
        if not text:
            return ""

        # Normalize Unicode (NFC form)
        text = unicodedata.normalize("NFC", text)

        # Remove verse number at end (Arabic-Indic numerals)
        text = self._verse_num_pattern.sub("", text)

        # Remove section markers (Rub el Hizb, etc.)
        text = self._symbols_pattern.sub("", text)

        # Optionally remove diacritics
        if self.remove_diacritics:
            text = self._diacritics_pattern.sub("", text)

        # Normalize whitespace
        text = " ".join(text.split())

        return text.strip()

    def split_words(self, text: str) -> List[str]:
        """
        Split cleaned text into words for alignment.

        Args:
            text: Cleaned Arabic text

        Returns:
            List of words
        """
        cleaned = self.clean(text)
        if not cleaned:
            return []

        # Split on whitespace
        words = cleaned.split()

        # Filter out empty strings
        return [w for w in words if w]

    def get_word_count(self, text: str) -> int:
        """Get number of words in text."""
        return len(self.split_words(text))


def clean_for_alignment(text: str) -> str:
    """Convenience function for cleaning text."""
    cleaner = TextCleaner()
    return cleaner.clean(text)


def split_into_words(text: str) -> List[str]:
    """Convenience function for splitting text into words."""
    cleaner = TextCleaner()
    return cleaner.split_words(text)
