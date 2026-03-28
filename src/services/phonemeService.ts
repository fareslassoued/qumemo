/**
 * Arabic to phoneme mapping for Qalun recitation style.
 *
 * TypeScript port of tools/aligner/src/phoneme_mapper.py.
 * Pure functions, no dependencies — maps Arabic text to IPA-like phonemes
 * for use in constrained DP matching against expected Quran text.
 */

export interface PhonemeMapping {
  word: string;
  phonemes: string[];
  isMuqattaat: boolean;
}

// Arabic letter → phoneme mapping (simplified IPA-like)
const LETTER_TO_PHONEME: Record<string, string> = {
  // Consonants
  'ا': 'a',    // Alif - vowel carrier
  'أ': 'ʔ',    // Hamza on alif
  'إ': 'ʔ',    // Hamza below alif
  'ٱ': 'a',    // Alif wasla (elided)
  'ء': 'ʔ',    // Hamza
  'آ': 'ʔaː',  // Madda
  'ب': 'b',
  'ت': 't',
  'ث': 'θ',
  'ج': 'dʒ',
  'ح': 'ħ',
  'خ': 'x',
  'د': 'd',
  'ذ': 'ð',
  'ر': 'r',
  'ز': 'z',
  'س': 's',
  'ش': 'ʃ',
  'ص': 'sˤ',
  'ض': 'dˤ',
  'ط': 'tˤ',
  'ظ': 'ðˤ',
  'ع': 'ʕ',
  'غ': 'ɣ',
  'ف': 'f',
  'ق': 'q',
  'ك': 'k',
  'ل': 'l',
  'م': 'm',
  'ن': 'n',
  'ه': 'h',
  'و': 'w',
  'ي': 'j',
  'ة': 'h',    // Ta marbuta
  // Qalun-specific variants
  'ۥ': 'uː',
  'ۦ': 'iː',
  'ۤ': '',     // Small high meem (ignored)
  'ٔ': 'ʔ',
  'ٕ': 'ʔ',
  'ٓ': 'ʔ',    // Maddah
  'ٖ': 'a',    // Small alif
  'ٗ': 'uː',
  '٘': 'iː',
  'ٙ': 'a',
  'ٚ': 'u',
  'ٛ': 'ʃ',
  'ٜ': 'aː',
};

// Vowel markers (diacritics) → phonemes
const VOWEL_TO_PHONEME: Record<string, string> = {
  'َ': 'a',    // Fatha
  'ِ': 'i',    // Kasra
  'ُ': 'u',    // Damma
  'ً': 'an',   // Fathatan
  'ٍ': 'in',   // Kasratan
  'ٌ': 'un',   // Dammatan
  'ْ': '',     // Sukun (no vowel)
  'ّ': '',     // Shadda (handled separately)
  'ٰ': 'aː',  // Alif khanjariyya
  'ٖ': 'a',   // Subscript alif
};

// Muqatta'at letters — disconnected letter sequences at surah beginnings
const MUQATTAAT_LETTERS: Record<string, string> = {
  // Long madd (كم عسل نقص)
  'ك': 'kaːf',
  'م': 'miːm',
  'ع': 'ʕaːjn',
  'س': 'siːn',
  'ل': 'laːm',
  'ن': 'nuːn',
  'ق': 'qaːf',
  'ص': 'sˤaːd',
  // Short (no madd tawil)
  'ا': 'ʔalif',
  'ر': 'raː',
  'ه': 'haː',
  'ي': 'jaː',
  'ط': 'tˤaː',
  'ح': 'ħaː',
};

// Characters to skip during phoneme extraction
const SKIP_CHARS = new Set('۝۞۟١٢٣٤٥٦٧٨٩٠');

/**
 * Normalize Arabic text for matching.
 * Strips ALL diacritics, tajweed marks, waqf signs, and Qalun-specific annotations.
 * Normalizes hamza variants, removes tatweel.
 */
export function normalizeArabic(text: string): string {
  // Remove tatweel (kashida)
  let result = text.replace(/ـ/g, '');

  // Normalize hamza variants → bare alif
  result = result.replace(/[أإآٱ]/g, 'ا');

  // Strip ALL Arabic diacritics and marks using Unicode ranges:
  // U+064B-065F: Arabic tashkil (fatha, kasra, damma, shadda, sukun, etc.)
  // U+0670:      Superscript alif
  // U+06D6-06DC: Small high marks (waqf, sajda, etc.)
  // U+06DF-06E4: Small letters/marks
  // U+06E7-06E8: Small letters
  // U+06EA-06ED: Additional marks (empty centre stop, small meem, etc.)
  // U+0653:      Maddah above
  // U+0654-0655: Hamza above/below
  result = result.replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED\u0653-\u0655]/g, '');

  return result.trim();
}

/**
 * Check if a word is a disconnected Muqatta'at letter.
 */
function isMuqattaatLetter(word: string): boolean {
  if (word.length <= 2) {
    const baseChar = word[0] || '';
    return baseChar in MUQATTAAT_LETTERS;
  }
  return false;
}

/**
 * Convert a single Arabic word to a phoneme sequence.
 */
export function wordToPhonemes(word: string, isMuqattaat = false): string[] {
  const normalized = normalizeArabic(word);
  const phonemes: string[] = [];

  if (isMuqattaat && normalized.length === 1 && normalized in MUQATTAAT_LETTERS) {
    return [...MUQATTAAT_LETTERS[normalized]];
  }

  let i = 0;
  while (i < normalized.length) {
    const char = normalized[i];

    // Skip special markers
    if (SKIP_CHARS.has(char)) {
      i++;
      continue;
    }

    // Get base phoneme for letter
    if (char in LETTER_TO_PHONEME) {
      const phoneme = LETTER_TO_PHONEME[char];
      phonemes.push(phoneme);
    }

    // Check for vowel diacritic on next character
    if (i + 1 < normalized.length && normalized[i + 1] in VOWEL_TO_PHONEME) {
      const vowel = VOWEL_TO_PHONEME[normalized[i + 1]];
      if (vowel && phonemes.length > 0) {
        phonemes[phonemes.length - 1] = phonemes[phonemes.length - 1] + vowel;
      }
      i++;
    }

    i++;
  }

  return phonemes;
}

/**
 * Convert full text to phoneme mappings (one per word).
 */
export function textToPhonemes(text: string): PhonemeMapping[] {
  const words = text.split(/\s+/);
  const mappings: PhonemeMapping[] = [];

  for (const word of words) {
    if (!word) continue;

    const muqattaat = isMuqattaatLetter(word);
    const phonemes = wordToPhonemes(word, muqattaat);
    mappings.push({ word, phonemes, isMuqattaat: muqattaat });
  }

  return mappings;
}

/**
 * Flatten phoneme mappings to a single sequence with word boundary tracking.
 * Returns [flatPhonemes, wordBoundaries] where wordBoundaries[i] = word index for phoneme i.
 */
export function flattenPhonemes(mappings: PhonemeMapping[]): [string[], number[]] {
  const flatPhonemes: string[] = [];
  const wordBoundaries: number[] = [];

  for (let wordIdx = 0; wordIdx < mappings.length; wordIdx++) {
    for (const phoneme of mappings[wordIdx].phonemes) {
      flatPhonemes.push(phoneme);
      wordBoundaries.push(wordIdx);
    }
  }

  return [flatPhonemes, wordBoundaries];
}
