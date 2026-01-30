"""Arabic to phoneme mapping for Qalun recitation style.

Implements phoneme mapping based on the reference implementation:
https://huggingface.co/spaces/hetchyy/Quran-segmentation-transcription
"""

import re
from typing import List, Dict, Tuple
from dataclasses import dataclass


@dataclass
class PhonemeMapping:
    """Result of phoneme mapping for a word."""

    word: str
    phonemes: List[str]
    is_muqattaat: bool = False


class ArabicPhonemeMapper:
    """Maps Arabic text to phonemes for alignment purposes.

    Follows Qalun phonetic rules and handles special characters.
    """

    def __init__(self):
        # Arabic letter to phoneme mapping (simplified IPA-like)
        self.letter_to_phoneme = {
            # Consonants
            "ا": "a",  # Alif - vowel carrier
            "أ": "ʔ",  # Hamza on alif
            "إ": "ʔ",  # Hamza below alif
            "ٱ": "a",  # Alif wasla (elided)
            "ء": "ʔ",  # Hamza
            "آ": "ʔaː",  # Madda
            "ب": "b",
            "ت": "t",
            "ث": "θ",
            "ج": "dʒ",
            "ح": "ħ",
            "خ": "x",
            "د": "d",
            "ذ": "ð",
            "ر": "r",
            "ز": "z",
            "س": "s",
            "ش": "ʃ",
            "ص": "sˤ",
            "ض": "dˤ",
            "ط": "tˤ",
            "ظ": "ðˤ",
            "ع": "ʕ",
            "غ": "ɣ",
            "ف": "f",
            "ق": "q",
            "ك": "k",
            "ل": "l",
            "م": "m",
            "ن": "n",
            "ه": "h",
            "و": "w",
            "ي": "j",
            "ة": "h",  # Ta marbuta
            # Qalun-specific variants
            "ۥ": "uː",  # Small waw (damma)
            "ۦ": "iː",  # Small ya (kasra)
            "ۤ": "",  # Small high meem (ignored in phonemes)
            "ٔ": "ʔ",  # Small hamza
            "ٕ": "ʔ",  # Another hamza variant
            "ٓ": "ʔ",  # Maddah
            "ٖ": "a",  # Small alif
            "ٗ": "uː",  # Small damma
            "٘": "iː",  # Small kasra
            "ٙ": "a",  # Small fatha
            "ٚ": "u",  # Small damma
            "ٛ": "ʃ",  # Small shadda base
            "ٜ": "aː",  # Small maddah
        }

        # Vowel markers (diacritics) to phonemes
        self.vowel_to_phoneme = {
            "َ": "a",  # Fatha
            "ِ": "i",  # Kasra
            "ُ": "u",  # Damma
            "ً": "an",  # Fathatan
            "ٍ": "in",  # Kasratan
            "ٌ": "un",  # Dammatan
            "ْ": "",  # Sukun (no vowel)
            "ّ": "",  # Shadda (handled separately)
            "ٰ": "aː",  # Alif khanjariyya
            "ٖ": "a",  # Subscript alif
        }

        # Muqatta'at letters (disconnected letter sequences)
        self.muqattaat_letters = {
            "ا": "ʔaː",  # Alif
            "ل": "laːm",  # Lam
            "م": "miːm",  # Mim
            "ص": "sˤaːd",  # Sad
            "ر": "raːʔ",  # Ra
            "ك": "kaːf",  # Kaf
            "ه": "haːʔ",  # Ha
            "ي": "jaːʔ",  # Ya
            "ع": "ʕaːjn",  # Ayn
            "ط": "tˤaːʔ",  # Ta
            "س": "siːn",  # Sin
            "ح": "ħaːʔ",  # Ha
            "ق": "qaːf",  # Qaf
            "ن": "nuːn",  # Nun
        }

    def normalize_arabic(self, text: str) -> str:
        """Normalize Arabic text for phoneme processing."""
        # Remove tatweel (kashida)
        text = re.sub(r"[ـ]", "", text)

        # Normalize hamza variants
        text = re.sub(r"[أإآٱ]", "ا", text)

        # Strip diacritics (vowel marks) to improve ASR matching tolerance
        # This helps match ASR output which may have different diacritics than Quran text
        diacritics = "ًٌٍَُِّْٰٖٜٗ٘ٙٚٛ"
        for d in diacritics:
            text = text.replace(d, "")

        return text.strip()

    def word_to_phonemes(self, word: str, is_muqattaat: bool = False) -> List[str]:
        """Convert a single word to phoneme sequence.

        Args:
            word: Arabic word text
            is_muqattaat: Whether this is a Muqatta'at letter

        Returns:
            List of phonemes
        """
        word = self.normalize_arabic(word)
        phonemes = []

        if is_muqattaat and len(word) == 1 and word in self.muqattaat_letters:
            # Special handling for Muqatta'at letters
            return list(self.muqattaat_letters[word])

        i = 0
        while i < len(word):
            char = word[i]

            # Skip word-boundary markers (special symbols)
            if char in "۝۞۟١٢٣٤٥٦٧٨٩٠":
                i += 1
                continue

            # Get base phoneme for letter
            if char in self.letter_to_phoneme:
                phoneme = self.letter_to_phoneme[char]
                phonemes.append(phoneme)

            # Check for vowel diacritic on next character
            if i + 1 < len(word) and word[i + 1] in self.vowel_to_phoneme:
                vowel = self.vowel_to_phoneme[word[i + 1]]
                if vowel and phonemes:
                    # Append vowel to last consonant
                    phonemes[-1] = phonemes[-1] + vowel
                i += 1

            i += 1

        return phonemes

    def text_to_phonemes(self, text: str) -> List[PhonemeMapping]:
        """Convert full text to phoneme mappings.

        Args:
            text: Arabic text (may contain multiple words)

        Returns:
            List of PhonemeMapping objects
        """
        # Split into words
        words = text.split()
        mappings = []

        for word in words:
            if not word:
                continue

            # Check if this is a Muqatta'at letter (single letter + sukun/jazm)
            is_muqattaat = self._is_muqattaat_letter(word)

            phonemes = self.word_to_phonemes(word, is_muqattaat)
            mappings.append(
                PhonemeMapping(word=word, phonemes=phonemes, is_muqattaat=is_muqattaat)
            )

        return mappings

    def _is_muqattaat_letter(self, word: str) -> bool:
        """Check if word is a disconnected Muqatta'at letter."""
        # Single Arabic letter with optional sukun/jazm marker
        if len(word) <= 2:  # Letter + diacritic or just letter
            base_char = word[0] if word else ""
            if base_char in self.muqattaat_letters:
                return True
        return False

    def flatten_phonemes(
        self, mappings: List[PhonemeMapping]
    ) -> Tuple[List[str], List[int]]:
        """Flatten phoneme mappings to sequence with word boundaries.

        Args:
            mappings: List of PhonemeMapping objects

        Returns:
            Tuple of (flat_phonemes, word_boundaries)
            where word_boundaries[i] = index of word that phoneme i belongs to
        """
        flat_phonemes = []
        word_boundaries = []

        for word_idx, mapping in enumerate(mappings):
            for phoneme in mapping.phonemes:
                flat_phonemes.append(phoneme)
                word_boundaries.append(word_idx)

        return flat_phonemes, word_boundaries
