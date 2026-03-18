/**
 * Quran-wide inverted index for location detection.
 *
 * Builds a flat array of ~93k words across all 604 pages, plus an inverted
 * index mapping normalized words to their global positions. Used by the
 * follow-along feature to detect WHERE in the Quran a user is reciting
 * from just their speech input.
 *
 * Detection algorithm:
 * 1. Strip known preamble (isti'adha, bismillah) from ASR text
 * 2. Try up to 3 distinct anchor words (uncommon words with < 500 hits)
 * 3. For each anchor's candidates, score by sequential forward matching
 * 4. Best candidate with score >= 0.40 and >= 3 matches wins
 */

import { quranDataService } from './quranDataService';
import { normalizeArabic } from './phonemeService';
import { getAyahTextWithoutNumber } from '@/utils/ayahUtils';
import { buildPageWordIndex } from './recitationMatcherService';

export interface GlobalWord {
  normalized: string;
  surah: number;
  ayah: number;
  wordIndex: number;   // 1-based within ayah
  page: number;
  globalPosition: number;
}

export interface PositionResult {
  page: number;
  pageWordOffset: number;  // index in buildPageWordIndex() array
  confidence: number;       // 0-1
  surah: number;
  ayah: number;
}

export interface PositionCandidate {
  globalPosition: number;
  page: number;
  pageWordOffset: number;
  surah: number;
  ayah: number;
  score: number;       // matched / total ASR words
  matchCount: number;  // absolute matched words
}

/** Maximum inverted index hits before we skip a word as too common */
const MAX_ANCHOR_HITS = 500;
/** Minimum matches to accept a position */
const MIN_MATCHES = 4;
/** Minimum score (matched/total) to accept */
const MIN_SCORE = 0.45;
/** Max words we can skip between ASR words and expected words */
const SKIP_TOLERANCE = 3;
/** Minimum word similarity for a match */
const MIN_SIMILARITY = 0.40;
/** How many distinct anchors to try */
const MAX_ANCHORS = 3;
/** Don't even attempt detection until we have this many post-preamble words */
const MIN_ASR_WORDS = 5;

/**
 * Known preamble phrases to strip from ASR text before detection.
 * Normalized (no diacritics). Includes common ASR variants.
 *
 * Isti'adha: أعوذ بالله من الشيطان الرجيم (and variants)
 * Bismillah: بسم الله الرحمن الرحيم
 */
const PREAMBLE_WORDS = new Set([
  // Isti'adha words (normalized)
  'اعوذ', 'بالله', 'الشيطان', 'الرجيم',
  // Common ASR mis-splits of isti'adha
  'عوذ', 'شيطان', 'رجيم',
]);

/**
 * Full preamble sequences to strip as contiguous runs.
 * We try to match the longest prefix of ASR words against these.
 */
const PREAMBLE_SEQUENCES: string[][] = [
  // Full isti'adha + bismillah
  ['اعوذ', 'بالله', 'من', 'الشيطان', 'الرجيم', 'بسم', 'الله', 'الرحمن', 'الرحيم'],
  // Isti'adha only
  ['اعوذ', 'بالله', 'من', 'الشيطان', 'الرجيم'],
  // Bismillah only
  ['بسم', 'الله', 'الرحمن', 'الرحيم'],
];

class QuranSearchIndex {
  private allWords: GlobalWord[] = [];
  private invertedIndex: Map<string, number[]> = new Map();
  private built = false;

  /**
   * Lazy-build the index on first use.
   * Iterates all 604 pages, splitting each ayah into normalized words.
   */
  ensureBuilt(): void {
    if (this.built) return;

    const startTime = performance.now();
    let globalPos = 0;

    for (let page = 1; page <= 604; page++) {
      const pageInfo = quranDataService.getPageInfo(page);
      if (!pageInfo) continue;

      for (const ayah of pageInfo.ayahs) {
        const ayahText = getAyahTextWithoutNumber(ayah.aya_text);
        const words = ayahText.split(/\s+/).filter(Boolean);

        for (let wi = 0; wi < words.length; wi++) {
          const normalized = normalizeArabic(words[wi]);

          const gw: GlobalWord = {
            normalized,
            surah: ayah.sura_no,
            ayah: ayah.aya_no,
            wordIndex: wi + 1,
            page,
            globalPosition: globalPos,
          };
          this.allWords.push(gw);

          // Add to inverted index
          if (!this.invertedIndex.has(normalized)) {
            this.invertedIndex.set(normalized, []);
          }
          this.invertedIndex.get(normalized)!.push(globalPos);

          globalPos++;
        }
      }
    }

    this.built = true;
    const elapsed = (performance.now() - startTime).toFixed(1);
    console.log(`[QuranSearchIndex] Built: ${this.allWords.length} words, ${this.invertedIndex.size} unique, ${elapsed}ms`);
  }

  /**
   * Strip known preamble (isti'adha + bismillah) from the beginning of ASR words.
   * Tries to match the longest known preamble sequence, with fuzzy matching
   * to handle ASR variations.
   */
  private stripPreamble(normalizedAsr: string[]): string[] {
    if (normalizedAsr.length === 0) return normalizedAsr;

    let bestStripLen = 0;

    for (const seq of PREAMBLE_SEQUENCES) {
      // Try matching this preamble sequence against the start of ASR words
      let seqPtr = 0;
      let asrPtr = 0;

      while (seqPtr < seq.length && asrPtr < normalizedAsr.length) {
        const sim = this.wordSimilarity(normalizedAsr[asrPtr], seq[seqPtr]);
        if (sim >= 0.50) {
          // Matched — advance both
          seqPtr++;
          asrPtr++;
        } else if (PREAMBLE_WORDS.has(normalizedAsr[asrPtr])) {
          // ASR word is a known preamble word but didn't match current seq position
          // — skip it (ASR may have reordered or inserted extra words)
          asrPtr++;
        } else {
          // Hit a non-preamble word — stop
          break;
        }
      }

      // Accept if we matched at least 60% of the preamble sequence
      if (seqPtr >= seq.length * 0.6 && asrPtr > bestStripLen) {
        bestStripLen = asrPtr;
      }
    }

    if (bestStripLen > 0) {
      console.log(`[QuranSearchIndex] Stripped ${bestStripLen} preamble words: [${normalizedAsr.slice(0, bestStripLen).join(', ')}]`);
      return normalizedAsr.slice(bestStripLen);
    }

    return normalizedAsr;
  }

  /**
   * Find the most likely position in the Quran for the given ASR words.
   * Thin wrapper over findTopCandidates — returns the single best candidate.
   */
  findPosition(asrWords: string[]): PositionResult | null {
    const candidates = this.findTopCandidates(asrWords, 1);
    if (candidates.length === 0) return null;

    const c = candidates[0];
    return {
      page: c.page,
      pageWordOffset: c.pageWordOffset,
      confidence: c.score,
      surah: c.surah,
      ayah: c.ayah,
    };
  }

  /**
   * Return the number of post-preamble words in the given ASR input.
   * Useful for callers that need to check word count without duplicating
   * the preamble-stripping logic.
   */
  getPostPreambleWordCount(asrWords: string[]): number {
    if (asrWords.length === 0) return 0;
    const normalizedAsr = asrWords.map(w => normalizeArabic(w)).filter(w => w.length > 0);
    const stripped = this.stripPreamble(normalizedAsr);
    return stripped.length;
  }

  /**
   * Find top-N candidate positions in the Quran for the given ASR words.
   *
   * Algorithm:
   * 1. Normalize and strip preamble from ASR words
   * 2. Collect up to MAX_ANCHORS distinct anchor words (< MAX_ANCHOR_HITS each)
   * 3. For each anchor's candidate positions, score by sequential forward matching
   * 4. Deduplicate by surah:ayah (keep highest score), return top N
   */
  findTopCandidates(asrWords: string[], maxCandidates = 3): PositionCandidate[] {
    this.ensureBuilt();

    if (asrWords.length === 0) return [];

    let normalizedAsr = asrWords.map(w => normalizeArabic(w)).filter(w => w.length > 0);
    if (normalizedAsr.length < 2) return [];

    // Strip isti'adha + bismillah preamble
    normalizedAsr = this.stripPreamble(normalizedAsr);
    if (normalizedAsr.length < MIN_ASR_WORDS) {
      console.log(`[QuranSearchIndex] Only ${normalizedAsr.length} words after preamble strip (need ${MIN_ASR_WORDS}), waiting...`);
      return [];
    }

    console.log(`[QuranSearchIndex] Finding position for ${normalizedAsr.length} words: [${normalizedAsr.slice(0, 8).join(', ')}${normalizedAsr.length > 8 ? '...' : ''}]`);

    // Collect up to MAX_ANCHORS distinct anchor words
    const anchors: { idx: number; positions: number[] }[] = [];
    const usedNormalized = new Set<string>();

    for (let i = 0; i < normalizedAsr.length && anchors.length < MAX_ANCHORS; i++) {
      const word = normalizedAsr[i];
      if (usedNormalized.has(word)) continue;

      const hits = this.invertedIndex.get(word);
      if (hits && hits.length > 0 && hits.length < MAX_ANCHOR_HITS) {
        anchors.push({ idx: i, positions: hits });
        usedNormalized.add(word);
      }
    }

    // Fallback: if no anchors found under MAX_ANCHOR_HITS, try any word with hits
    if (anchors.length === 0) {
      for (let i = 0; i < normalizedAsr.length; i++) {
        const word = normalizedAsr[i];
        if (usedNormalized.has(word)) continue;

        const hits = this.invertedIndex.get(word);
        if (hits && hits.length > 0) {
          anchors.push({ idx: i, positions: hits });
          usedNormalized.add(word);
          break; // Just one fallback anchor
        }
      }
    }

    if (anchors.length === 0) {
      console.log(`[QuranSearchIndex] No anchors found`);
      return [];
    }

    console.log(`[QuranSearchIndex] Using ${anchors.length} anchors: ${anchors.map(a => `"${normalizedAsr[a.idx]}"(${a.positions.length} hits)`).join(', ')}`);

    // Collect all qualifying candidates, deduplicated by surah:ayah
    const candidateMap = new Map<string, { score: number; matchCount: number; globalPos: number }>();

    for (const anchor of anchors) {
      for (const anchorGlobalPos of anchor.positions) {
        for (let slack = 0; slack <= 1; slack++) {
          const startPos = anchorGlobalPos - anchor.idx - slack;
          if (startPos < 0) continue;

          const { matched, firstMatchPos } = this.scoreCandidate(normalizedAsr, startPos);
          const score = normalizedAsr.length > 0 ? matched / normalizedAsr.length : 0;

          if (matched >= MIN_MATCHES && score >= MIN_SCORE) {
            const globalPos = firstMatchPos >= 0 ? firstMatchPos : startPos;
            const word = this.allWords[globalPos];
            if (!word) continue;

            const key = `${word.surah}:${word.ayah}`;
            const existing = candidateMap.get(key);
            if (!existing || score > existing.score || (score === existing.score && matched > existing.matchCount)) {
              candidateMap.set(key, { score, matchCount: matched, globalPos });
            }
          }
        }
      }
    }

    if (candidateMap.size === 0) {
      console.log(`[QuranSearchIndex] No candidates found`);
      return [];
    }

    // Sort by score descending, take top N
    const sorted = [...candidateMap.entries()]
      .sort((a, b) => b[1].score - a[1].score || b[1].matchCount - a[1].matchCount)
      .slice(0, maxCandidates);

    // Resolve each candidate's page/pageWordOffset
    const results: PositionCandidate[] = [];
    for (const [, { score, matchCount, globalPos }] of sorted) {
      const matchedWord = this.allWords[globalPos];
      if (!matchedWord) continue;

      const page = matchedWord.page;
      const pageWords = buildPageWordIndex(page);

      let pageWordOffset = 0;
      for (let i = 0; i < pageWords.length; i++) {
        if (
          pageWords[i].surah === matchedWord.surah &&
          pageWords[i].ayah === matchedWord.ayah &&
          pageWords[i].wordIndex === matchedWord.wordIndex
        ) {
          pageWordOffset = i;
          break;
        }
      }

      results.push({
        globalPosition: globalPos,
        page,
        pageWordOffset,
        surah: matchedWord.surah,
        ayah: matchedWord.ayah,
        score,
        matchCount,
      });
    }

    console.log(`[QuranSearchIndex] Candidates: ${results.map(c => `${c.surah}:${c.ayah} (${c.score.toFixed(2)}, ${c.matchCount} matches)`).join(' | ')}`);

    return results;
  }

  /**
   * Score a candidate start position by sequential forward matching.
   * Returns the number of ASR words matched and the global position of the first match.
   */
  private scoreCandidate(
    normalizedAsr: string[],
    startPos: number,
  ): { matched: number; firstMatchPos: number } {
    let matched = 0;
    let expectedPtr = startPos;
    let firstMatchPos = -1;

    for (let ai = 0; ai < normalizedAsr.length; ai++) {
      if (expectedPtr >= this.allWords.length) break;

      // Try matching this ASR word against the next few expected words
      const searchEnd = Math.min(this.allWords.length, expectedPtr + SKIP_TOLERANCE + 1);

      for (let ei = expectedPtr; ei < searchEnd; ei++) {
        const sim = this.wordSimilarity(normalizedAsr[ai], this.allWords[ei].normalized);
        if (sim >= MIN_SIMILARITY) {
          matched++;
          if (firstMatchPos < 0) firstMatchPos = ei;
          expectedPtr = ei + 1;
          break;
        }
      }
      // If no match found, skip this ASR word (noise) — don't advance expectedPtr
    }

    return { matched, firstMatchPos };
  }

  /**
   * Levenshtein-based similarity between two normalized Arabic strings.
   */
  private wordSimilarity(a: string, b: string): number {
    if (a === b) return 1; // Fast path for exact match
    if (a.length === 0 && b.length === 0) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const curr = [i];
      for (let j = 1; j <= n; j++) {
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
      prev = curr;
    }
    return 1 - prev[n] / Math.max(m, n);
  }
}

export const quranSearchIndex = new QuranSearchIndex();
