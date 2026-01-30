"""Tests for Arabic text cleaning."""

import pytest

from src.text_cleaner import TextCleaner, clean_for_alignment, split_into_words, expand_muqattaat


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


class TestMuqattaatExpansion:
    """Test Muqatta'at expansion for alignment accuracy."""

    def test_expand_alif_lam_mim_plain(self):
        """Test expansion of الم plain (without diacritics)."""
        expanded = expand_muqattaat("الم")
        # Should contain elongated forms
        assert "أالي" in expanded  # alif with elongation
        assert "لاااا" in expanded  # lam with elongation
        assert "مييي" in expanded  # mim with elongation

    def test_expand_alif_lam_mim_with_diacritics(self):
        """Test expansion of أَلَٓمِّٓۖ (actual Quran text with diacritics)."""
        expanded = expand_muqattaat("أَلَٓمِّٓۖ")
        assert "أالي" in expanded
        assert "لاااا" in expanded
        assert "مييي" in expanded

    def test_expand_alif_lam_mim_followed_by_text(self):
        """Test expansion when followed by more text."""
        text = "أَلَٓمِّٓۖ ذَٰلِكَ اَ۬لْكِتَٰبُ"
        expanded = expand_muqattaat(text)
        assert "أالي" in expanded  # alif expanded
        assert "ذَٰلِكَ" in expanded  # rest preserved

    def test_expand_alif_lam_mim_sad(self):
        """Test expansion of أَلَٓمِّٓصَٓۖ (Surah 7 - Al-A'raf)."""
        expanded = expand_muqattaat("أَلَٓمِّٓصَٓۖ")
        assert "صااا" in expanded  # sad with elongation

    def test_expand_alif_lam_ra(self):
        """Test expansion of أَلَٓرَۖ (Surah 10, 11, 12, 14, 15)."""
        expanded = expand_muqattaat("أَلَٓرَۖ")
        assert "رااا" in expanded  # ra with elongation

    def test_expand_alif_lam_mim_ra(self):
        """Test expansion of أَلَٓمِّٓرَۖ (Surah 13 - Ar-Ra'd)."""
        expanded = expand_muqattaat("أَلَٓمِّٓرَۖ")
        assert "مييي" in expanded
        assert "رااا" in expanded

    def test_expand_kaf_ha_ya_ain_sad(self):
        """Test expansion of كَٓهَيَعَٓصَٓۖ (Surah 19 - Maryam)."""
        expanded = expand_muqattaat("كَٓهَيَعَٓصَٓۖ")
        assert "كااا" in expanded  # kaf
        assert "عييي" in expanded  # ain

    def test_expand_ta_ha(self):
        """Test expansion of طَهَۖ (Surah 20 - Ta-Ha)."""
        expanded = expand_muqattaat("طَهَۖ")
        assert "طااا" in expanded
        assert "هااا" in expanded

    def test_expand_ta_sin_mim(self):
        """Test expansion of طَسِٓمِّٓۖ (Surah 26, 28)."""
        expanded = expand_muqattaat("طَسِٓمِّٓۖ")
        assert "طااا" in expanded
        assert "سييي" in expanded

    def test_expand_ta_sin(self):
        """Test expansion of طَسِٓۖ (Surah 27 - An-Naml)."""
        expanded = expand_muqattaat("طَسِٓۖ")
        assert "طااا" in expanded
        assert "سييي" in expanded

    def test_expand_ya_sin(self):
        """Test expansion of يَسِٓۖ (Surah 36 - Ya-Sin)."""
        expanded = expand_muqattaat("يَسِٓۖ")
        assert "يااا" in expanded
        assert "سييي" in expanded

    def test_expand_sad(self):
        """Test expansion of صَٓۖ (Surah 38 - Sad)."""
        expanded = expand_muqattaat("صَٓۖ")
        assert "صاااا" in expanded

    def test_expand_ha_mim(self):
        """Test expansion of حَمِٓۖ (Surah 40-46)."""
        expanded = expand_muqattaat("حَمِٓۖ")
        assert "حااا" in expanded
        assert "مييي" in expanded

    def test_expand_ain_sin_qaf(self):
        """Test expansion of عسق (Surah 42 - Ash-Shura, ayah 2)."""
        expanded = expand_muqattaat("عسق")
        assert "عييي" in expanded
        assert "قااا" in expanded

    def test_expand_qaf(self):
        """Test expansion of قَٓۖ (Surah 50 - Qaf)."""
        expanded = expand_muqattaat("قَٓۖ")
        assert "قاااا" in expanded

    def test_expand_nun(self):
        """Test expansion of نُٓۖ (Surah 68 - Al-Qalam)."""
        expanded = expand_muqattaat("نُٓۖ")
        assert "نوووو" in expanded

    def test_no_expansion_non_muqattaat(self):
        """Test that non-Muqatta'at text is not expanded."""
        text = "اِ۬لْحَمْدُ لِلهِ رَبِّ اِ۬لْعَٰلَمِينَ"
        assert expand_muqattaat(text) == text

    def test_no_expansion_empty_string(self):
        """Test empty string handling."""
        assert expand_muqattaat("") == ""
        assert expand_muqattaat(None) is None

    def test_no_expansion_muqattaat_in_middle(self):
        """Test that Muqatta'at in middle of text are not expanded."""
        text = "هذا الم نص"  # الم in middle
        assert expand_muqattaat(text) == text

    def test_longest_match_first(self):
        """Test that longer Muqatta'at are matched before shorter ones."""
        # المص should be expanded to 4 parts (with sad), not just 3
        expanded_alms = expand_muqattaat("المص")
        assert "صااا" in expanded_alms  # has sad elongation
        # المر should have ra, not just alif-lam-mim
        expanded_almr = expand_muqattaat("المر")
        assert "رااا" in expanded_almr

    def test_expansion_preserves_rest_of_text(self):
        """Test that expansion preserves surrounding text."""
        text = "أَلَٓمِّٓۖ ذَٰلِكَ اَ۬لْكِتَٰبُ"
        expanded = expand_muqattaat(text)
        # Should have elongated muqattaat followed by rest
        assert "ذَٰلِكَ اَ۬لْكِتَٰبُ" in expanded
        assert "أالي" in expanded  # elongated alif

    def test_word_count_increases(self):
        """Test that word count increases after expansion."""
        cleaner = TextCleaner()
        # Original: 1 word with diacritics
        original = "أَلَٓمِّٓۖ"
        expanded = expand_muqattaat(original)
        # Should be 3 words (elongated forms)
        assert cleaner.get_word_count(expanded) == 3
