"""Arabic text normalization for CTC alignment."""

import re
import unicodedata
from typing import List


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
