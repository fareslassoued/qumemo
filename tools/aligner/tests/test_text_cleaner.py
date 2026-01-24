"""Tests for Arabic text cleaning."""

import pytest

from src.text_cleaner import TextCleaner, clean_for_alignment, split_into_words


class TestTextCleaner:
    """Test cases for TextCleaner."""

    @pytest.fixture
    def cleaner(self):
        return TextCleaner()

    def test_remove_arabic_indic_verse_numbers(self, cleaner):
        """Test removal of Arabic-Indic verse numbers at end."""
        # Single digit
        assert cleaner.clean("اِ۬لْحَمْدُ لِلهِ رَبِّ اِ۬لْعَٰلَمِينَ ١") == \
            "اِ۬لْحَمْدُ لِلهِ رَبِّ اِ۬لْعَٰلَمِينَ"

        # Double digit
        assert cleaner.clean("وَمَا يُضِلُّ بِهِۦٓ إِلَّا اَ۬لْفَٰسِقِينَ ٢٦") == \
            "وَمَا يُضِلُّ بِهِۦٓ إِلَّا اَ۬لْفَٰسِقِينَ"

        # Triple digit
        assert cleaner.clean("لَّا يَسْتَوُۥنَ عِندَ اَ۬للَّهِ ١٠٠") == \
            "لَّا يَسْتَوُۥنَ عِندَ اَ۬للَّهِ"

    def test_preserve_arabic_text(self, cleaner):
        """Test that Arabic text is preserved."""
        text = "اِ۬لْحَمْدُ لِلهِ رَبِّ اِ۬لْعَٰلَمِينَ"
        assert cleaner.clean(text) == text

    def test_remove_rub_el_hizb(self, cleaner):
        """Test removal of Rub el Hizb symbol."""
        assert cleaner.clean("۞ وَاِذْ قَالَ") == "وَاِذْ قَالَ"
        assert cleaner.clean("وَقَالَ ۞ رَبُّكَ") == "وَقَالَ رَبُّكَ"

    def test_normalize_whitespace(self, cleaner):
        """Test whitespace normalization."""
        assert cleaner.clean("  اِ۬لْحَمْدُ   لِلهِ  ") == "اِ۬لْحَمْدُ لِلهِ"

    def test_empty_string(self, cleaner):
        """Test empty string handling."""
        assert cleaner.clean("") == ""
        assert cleaner.clean("   ") == ""

    def test_split_words_basic(self, cleaner):
        """Test word splitting."""
        text = "اِ۬لْحَمْدُ لِلهِ رَبِّ اِ۬لْعَٰلَمِينَ ١"
        words = cleaner.split_words(text)
        assert len(words) == 4
        assert words[0] == "اِ۬لْحَمْدُ"
        assert words[-1] == "اِ۬لْعَٰلَمِينَ"

    def test_word_count(self, cleaner):
        """Test word counting."""
        text = "اِ۬لْحَمْدُ لِلهِ رَبِّ اِ۬لْعَٰلَمِينَ ١"
        assert cleaner.get_word_count(text) == 4

    def test_convenience_functions(self):
        """Test module-level convenience functions."""
        text = "اِ۬لْحَمْدُ لِلهِ ١"
        assert clean_for_alignment(text) == "اِ۬لْحَمْدُ لِلهِ"
        assert split_into_words(text) == ["اِ۬لْحَمْدُ", "لِلهِ"]


class TestDiacriticsRemoval:
    """Test optional diacritics removal."""

    def test_preserve_diacritics_by_default(self):
        """Test that diacritics are preserved by default."""
        cleaner = TextCleaner(remove_diacritics=False)
        text = "اَلْحَمْدُ"  # With harakat
        cleaned = cleaner.clean(text)
        # Should preserve the diacritics
        assert "َ" in cleaned or "ْ" in cleaned or "ُ" in cleaned

    def test_remove_diacritics_when_enabled(self):
        """Test diacritics removal when enabled."""
        cleaner = TextCleaner(remove_diacritics=True)
        # Text with common diacritics
        text = "مَلِكِ"  # With fatha, kasra
        cleaned = cleaner.clean(text)
        # Should not contain common diacritics
        assert "َ" not in cleaned  # fatha
        assert "ِ" not in cleaned  # kasra


class TestRealQuranData:
    """Test with real Quran text samples."""

    @pytest.fixture
    def cleaner(self):
        return TextCleaner()

    def test_al_fatiha_ayah_1(self, cleaner):
        """Test Al-Fatiha ayah 1."""
        text = "اِ۬لْحَمْدُ لِلهِ رَبِّ اِ۬لْعَٰلَمِينَ ١"
        words = cleaner.split_words(text)
        assert len(words) == 4
        # Verse number should be removed
        assert "١" not in cleaner.clean(text)

    def test_al_baqarah_ayah_1(self, cleaner):
        """Test Al-Baqarah ayah 1 (with huruf muqatta'at)."""
        text = "أَلَٓمِّٓۖ ذَٰلِكَ اَ۬لْكِتَٰبُ لَا رَيْبَۖ فِيهِ هُدىٗ لِّلْمُتَّقِينَ ١"
        words = cleaner.split_words(text)
        # Should handle complex text
        assert len(words) >= 5

    def test_unicode_normalization(self, cleaner):
        """Test that Unicode is properly normalized."""
        # Same text in different Unicode forms should produce same result
        text1 = "الله"  # Precomposed
        text2 = "الله"  # Same visually
        assert cleaner.clean(text1) == cleaner.clean(text2)
