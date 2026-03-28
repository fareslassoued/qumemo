/**
 * Recitation matcher — matches ASR text against expected Quran words.
 *
 * Uses normalized Arabic text comparison with edit distance tolerance.
 * Much simpler and more robust than phoneme-level DP for the browser use case,
 * where we know exactly what page the user is reciting and their approximate position.
 */

import { quranDataService } from './quranDataService';
import { normalizeArabic } from './phonemeService';
import { getAyahTextWithoutNumber } from '@/utils/ayahUtils';
import type { ExpectedWord, MatchChunkResult } from '@/types/recitation';

/**
 * Build a flat array of expected words for a page, with pre-normalized text.
 */
export function buildPageWordIndex(pageNumber: number): ExpectedWord[] {
  const pageInfo = quranDataService.getPageInfo(pageNumber);
  if (!pageInfo) return [];

  const words: ExpectedWord[] = [];
  let flatIndex = 0;

  for (const ayah of pageInfo.ayahs) {
    const ayahText = getAyahTextWithoutNumber(ayah.aya_text);
    const ayahWords = ayahText.split(/\s+/).filter(Boolean);

    for (let wi = 0; wi < ayahWords.length; wi++) {
      const wordText = ayahWords[wi];

      words.push({
        text: wordText,
        normalized: normalizeArabic(wordText),
        phonemes: [],  // Not used in simplified matching
        wordRef: `${ayah.sura_no}:${ayah.aya_no}:${wi + 1}`,
        surah: ayah.sura_no,
        ayah: ayah.aya_no,
        wordIndex: wi + 1,
        flatIndex,
      });

      flatIndex++;
    }
  }

  return words;
}

/**
 * Compute Levenshtein edit distance between two strings.
 */
function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Compute normalized similarity between two Arabic words (0-1, higher = better match).
 * Uses edit distance on normalized (diacritic-stripped) text.
 */
function wordSimilarity(asrWord: string, expectedWord: string): number {
  const a = normalizeArabic(asrWord);
  const b = expectedWord; // Already normalized

  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const dist = editDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

/** Minimum similarity to accept a word match */
const MIN_WORD_SIMILARITY = 0.40;

/** How far ahead to search for a matching word */
const SEARCH_WINDOW = 8;

/**
 * Match ALL words from ASR text against expected words starting from pointer.
 *
 * This is the main entry point. It processes each ASR word sequentially,
 * trying to match it against expected words in a window around the current position.
 *
 * Returns how far the pointer should advance and any detected errors.
 */
export function matchChunk(
  asrText: string,
  expectedWords: ExpectedWord[],
  pointer: number,
): MatchChunkResult | null {
  if (!asrText.trim() || expectedWords.length === 0) return null;

  const asrWords = asrText.split(/\s+/).filter(Boolean);
  if (asrWords.length === 0) return null;

  let currentPointer = pointer;
  const errorIndices: number[] = [];
  let totalScore = 0;
  let matchCount = 0;

  for (const asrWord of asrWords) {
    if (currentPointer >= expectedWords.length) break;

    // Search for best match in window
    const windowEnd = Math.min(expectedWords.length, currentPointer + SEARCH_WINDOW);
    let bestIdx = -1;
    let bestSim = 0;

    for (let i = currentPointer; i < windowEnd; i++) {
      const sim = wordSimilarity(asrWord, expectedWords[i].normalized);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestSim >= MIN_WORD_SIMILARITY) {
      // Mark skipped words as errors
      for (let i = currentPointer; i < bestIdx; i++) {
        errorIndices.push(i);
      }
      currentPointer = bestIdx + 1;
      totalScore += bestSim;
      matchCount++;
    }
    // If no match found, skip this ASR word (ASR noise) — don't advance pointer
  }

  if (matchCount === 0) return null;

  return {
    matchedUpTo: currentPointer,
    score: totalScore / matchCount,
    errorIndices,
    editDistance: errorIndices.length,
  };
}

/**
 * Match a single ASR word against expected words near the pointer.
 * Used for real-time interim matching of individual words.
 */
export function matchWordQuick(
  asrWord: string,
  expectedWords: ExpectedWord[],
  pointer: number,
): { matchedIndex: number; score: number } | null {
  if (!asrWord.trim() || pointer >= expectedWords.length) return null;

  const windowEnd = Math.min(expectedWords.length, pointer + SEARCH_WINDOW);
  let bestMatch = -1;
  let bestScore = 0;

  for (let i = pointer; i < windowEnd; i++) {
    const sim = wordSimilarity(asrWord, expectedWords[i].normalized);
    if (sim > bestScore) {
      bestScore = sim;
      bestMatch = i;
    }
  }

  if (bestMatch === -1 || bestScore < MIN_WORD_SIMILARITY) return null;
  return { matchedIndex: bestMatch, score: bestScore };
}
