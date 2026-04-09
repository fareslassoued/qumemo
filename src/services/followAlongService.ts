/**
 * Follow-along service — two-phase recitation position detection and tracking.
 *
 * Phase 1 (detecting): Accumulates ASR words and queries the Quran-wide
 * inverted index to find where the user is reciting.
 *
 * Phase 2 (following): Tracks word-by-word on the detected page using the
 * same sequential matching as the recitation tracker, but with visible text
 * and gold highlight instead of hidden/reveal.
 */

import { AndroidBridgeBackend, LocalWhisperBackend } from './asrBackends';
import { buildPageWordIndex, matchChunk } from './recitationMatcherService';
import { normalizeArabic } from './phonemeService';
import { quranSearchIndex, type PositionCandidate, type PositionResult } from './quranSearchIndex';
import type { ASRBackend, ExpectedWord } from '@/types/recitation';
import type { FollowAlongEvent, FollowAlongPhase, FollowAlongState } from '@/types/followAlong';

type EventCallback = (event: FollowAlongEvent) => void;

/** How many ASR words without a match before showing a hint */
const NO_MATCH_THRESHOLD = 15;
/** Minimum similarity for word matching in following phase */
const FOLLOW_MIN_SIMILARITY = 0.45;
/** How many expected words to search ahead during interim matching */
const INTERIM_SEARCH_WINDOW = 6;
/** How many tail words from each ASR interim to process (covers ~2-3s of new speech) */
const TAIL_WORDS_TO_PROCESS = 10;

// ─── Candidate accumulation constants ────────────────────
/** Don't lock until we have this many post-preamble ASR words */
const MIN_ACCUMULATION_WORDS = 8;
/** Immediate lock: score must be at least this high */
const HIGH_CONFIDENCE_SCORE = 0.70;
/** Immediate lock: must match at least this many words */
const HIGH_CONFIDENCE_MATCHES = 6;
/** Stable dominance: same #1 for this many consecutive calls */
const STABLE_DOMINANCE_CALLS = 3;
/** Clear winner: score must be >= this ratio × runner-up score */
const CLEAR_WINNER_RATIO = 2.0;
/** All lock conditions require at least this score */
const LOCK_MIN_SCORE = 0.50;

interface CandidateTracker {
  bestScore: number;
  bestMatchCount: number;
  page: number;
  pageWordOffset: number;
  surah: number;
  ayah: number;
  seenCount: number;
}

class FollowAlongService {
  private phase: FollowAlongPhase = 'idle';
  private backend: ASRBackend | null = null;
  private currentPage = 0;
  private expectedWords: ExpectedWord[] = [];
  private pointer = 0;
  private matchedWords = new Set<string>();
  private listeners = new Set<EventCallback>();

  // ASR accumulation
  private cumulativeAsrWords: string[] = [];
  private lastAsrText = '';

  // Detection state
  private detectionSurah = 0;
  private detectionAyah = 0;

  // Candidate accumulation (multi-call lock logic)
  private candidateHistory: Map<string, CandidateTracker> = new Map();
  private consecutiveTopCandidate: string | null = null;
  private consecutiveTopCount = 0;
  private detectionCallIndex = 0;

  /**
   * Start the follow-along: open mic, enter detecting phase.
   * Returns false if the ASR backend is unavailable.
   */
  async start(): Promise<boolean> {
    this.stop();

    // Pre-build the search index (lazy, only first time)
    quranSearchIndex.ensureBuilt();

    // Try Android bridge first (on-device), fall back to local server
    const androidBridge = new AndroidBridgeBackend();
    const localWhisper = new LocalWhisperBackend();

    let backend;
    if (androidBridge.isAvailable()) {
      backend = androidBridge;
    } else if (await localWhisper.isAvailable()) {
      backend = localWhisper;
    } else {
      return false;
    }

    backend.onResult((text, isFinal) => {
      this.handleASR(text, isFinal);
    });

    backend.onError((error) => {
      console.warn('[FollowAlong] ASR error:', error);
    });

    try {
      await backend.start();
    } catch (e) {
      console.error('[FollowAlong] Backend start failed:', e);
      return false;
    }

    this.backend = backend;
    this.phase = 'detecting';
    this.cumulativeAsrWords = [];
    this.lastAsrText = '';
    this.candidateHistory.clear();
    this.consecutiveTopCandidate = null;
    this.consecutiveTopCount = 0;
    this.detectionCallIndex = 0;
    this.emitStateChange();

    console.log('[FollowAlong] Started — detecting phase');
    return true;
  }

  /**
   * Stop everything and return to idle.
   */
  stop(): void {
    this.backend?.stop();
    this.backend = null;
    this.phase = 'idle';
    this.currentPage = 0;
    this.expectedWords = [];
    this.pointer = 0;
    this.matchedWords.clear();
    this.cumulativeAsrWords = [];
    this.lastAsrText = '';
    this.detectionSurah = 0;
    this.detectionAyah = 0;
    this.candidateHistory.clear();
    this.consecutiveTopCandidate = null;
    this.consecutiveTopCount = 0;
    this.detectionCallIndex = 0;
    this.emitStateChange();
  }

  /**
   * Get current phase.
   */
  getPhase(): FollowAlongPhase {
    return this.phase;
  }

  // ─── ASR handling ─────────────────────────────────────

  private handleASR(text: string, isFinal: boolean): void {
    this.lastAsrText = text;

    if (this.phase === 'detecting') {
      this.handleDetection(text);
    } else if (this.phase === 'following') {
      this.handleFollowing(text, isFinal);
    }
  }

  /**
   * Phase 1: Accumulate ASR words across detection calls, only lock when
   * one candidate is clearly dominant. Three lock conditions:
   *
   * 1. High confidence — score >= 0.70 AND matchCount >= 6 (immediate lock)
   * 2. Stable dominance — same #1 for 3+ consecutive calls AND score >= 0.50
   * 3. Clear winner — score >= 0.50 AND (no runner-up OR score >= 2× runner-up)
   *
   * All conditions require at least MIN_ACCUMULATION_WORDS post-preamble words.
   */
  private handleDetection(text: string): void {
    const words = text.split(/\s+/).filter(Boolean);
    this.cumulativeAsrWords = words;

    // Don't spam detection on every interim — wait for enough words
    if (words.length < 4) {
      this.emitStateChange();
      return;
    }

    // Check post-preamble word count
    const postPreambleCount = quranSearchIndex.getPostPreambleWordCount(words);

    const candidates = quranSearchIndex.findTopCandidates(words, 3);
    if (candidates.length === 0) {
      this.emitStateChange();
      return;
    }

    this.detectionCallIndex++;

    // Update candidate history — merge new scores, increment seenCount
    for (const c of candidates) {
      const key = `${c.surah}:${c.ayah}`;
      const existing = this.candidateHistory.get(key);
      if (existing) {
        existing.seenCount++;
        if (c.score > existing.bestScore || (c.score === existing.bestScore && c.matchCount > existing.bestMatchCount)) {
          existing.bestScore = c.score;
          existing.bestMatchCount = c.matchCount;
          existing.page = c.page;
          existing.pageWordOffset = c.pageWordOffset;
        }
      } else {
        this.candidateHistory.set(key, {
          bestScore: c.score,
          bestMatchCount: c.matchCount,
          page: c.page,
          pageWordOffset: c.pageWordOffset,
          surah: c.surah,
          ayah: c.ayah,
          seenCount: 1,
        });
      }
    }

    // Track consecutive #1 candidate
    const topKey = `${candidates[0].surah}:${candidates[0].ayah}`;
    if (topKey === this.consecutiveTopCandidate) {
      this.consecutiveTopCount++;
    } else {
      this.consecutiveTopCandidate = topKey;
      this.consecutiveTopCount = 1;
    }

    const top = candidates[0];
    const runnerUp = candidates.length > 1 ? candidates[1] : null;

    console.log(`[FollowAlong] Detection call #${this.detectionCallIndex}: top=${top.surah}:${top.ayah} (${top.score.toFixed(2)}, ${top.matchCount}m), ` +
      `runner-up=${runnerUp ? `${runnerUp.surah}:${runnerUp.ayah} (${runnerUp.score.toFixed(2)})` : 'none'}, ` +
      `consecutive=${this.consecutiveTopCount}, postWords=${postPreambleCount}`);

    // All lock conditions gate on minimum word count
    if (postPreambleCount < MIN_ACCUMULATION_WORDS) {
      this.emitStateChange();
      return;
    }

    // Condition 1: High confidence — lock immediately
    if (top.score >= HIGH_CONFIDENCE_SCORE && top.matchCount >= HIGH_CONFIDENCE_MATCHES) {
      console.log(`[FollowAlong] LOCK (high confidence): ${top.surah}:${top.ayah}, score=${top.score.toFixed(2)}, matches=${top.matchCount}`);
      this.lockFromCandidate(top);
      return;
    }

    // Condition 2: Stable dominance — same #1 for N consecutive calls
    if (this.consecutiveTopCount >= STABLE_DOMINANCE_CALLS && top.score >= LOCK_MIN_SCORE) {
      console.log(`[FollowAlong] LOCK (stable dominance): ${top.surah}:${top.ayah}, ${this.consecutiveTopCount} consecutive, score=${top.score.toFixed(2)}`);
      this.lockFromCandidate(top);
      return;
    }

    // Condition 3: Clear winner — no runner-up, or score >= 2× runner-up
    if (top.score >= LOCK_MIN_SCORE) {
      if (!runnerUp || top.score >= runnerUp.score * CLEAR_WINNER_RATIO) {
        console.log(`[FollowAlong] LOCK (clear winner): ${top.surah}:${top.ayah}, score=${top.score.toFixed(2)}, ` +
          `runner-up=${runnerUp ? runnerUp.score.toFixed(2) : 'none'}`);
        this.lockFromCandidate(top);
        return;
      }
    }

    // No lock yet — emit state so UI shows word count
    this.emitStateChange();
  }

  /**
   * Convert a PositionCandidate into a PositionResult and lock.
   */
  private lockFromCandidate(c: PositionCandidate): void {
    this.lockPosition({
      page: c.page,
      pageWordOffset: c.pageWordOffset,
      confidence: c.score,
      surah: c.surah,
      ayah: c.ayah,
    });
  }

  /**
   * Phase 2: Match ASR words against expected page words sequentially.
   *
   * Sliding-window aware: the ASR re-transcribes the last N seconds each call,
   * so we always process the TAIL of the output where new speech lives.
   * Words already behind this.pointer are safely ignored by the matching loop.
   */
  private handleFollowing(text: string, isFinal: boolean): void {
    if (this.pointer >= this.expectedWords.length) return;

    const asrWords = text.split(/\s+/).filter(Boolean);
    if (asrWords.length === 0) return;

    if (isFinal) {
      // Final result (on stop): run matchChunk with wide window for recovery
      console.log(`[FollowAlong] Final match: "${text.slice(0, 80)}..." | pointer=${this.pointer}`);
      const result = matchChunk(text, this.expectedWords, this.pointer);
      if (result) {
        for (let i = this.pointer; i < result.matchedUpTo; i++) {
          this.matchedWords.add(this.expectedWords[i].wordRef);
        }
        this.pointer = result.matchedUpTo;
        if (this.pointer >= this.expectedWords.length) {
          this.advanceToNextPage();
        }
      }
    } else {
      // Interim: always process the tail — new speech is at the end of the window
      const tailStart = Math.max(0, asrWords.length - TAIL_WORDS_TO_PROCESS);
      const tailWords = asrWords.slice(tailStart);

      for (const word of tailWords) {
        if (this.pointer >= this.expectedWords.length) {
          this.advanceToNextPage();
          break;
        }

        const windowEnd = Math.min(this.expectedWords.length, this.pointer + INTERIM_SEARCH_WINDOW);
        let bestScore = 0;
        let bestIdx = -1;

        for (let i = this.pointer; i < windowEnd; i++) {
          const sim = this.wordSimilarity(word, this.expectedWords[i].normalized);
          if (sim > bestScore) {
            bestScore = sim;
            bestIdx = i;
          }
        }

        if (bestIdx >= 0 && bestScore >= FOLLOW_MIN_SIMILARITY) {
          for (let i = this.pointer; i <= bestIdx; i++) {
            this.matchedWords.add(this.expectedWords[i].wordRef);
          }
          this.pointer = bestIdx + 1;
        }
      }
    }

    this.emitStateChange();
  }

  /**
   * Lock into a detected position — transition from detecting to following.
   */
  private lockPosition(result: PositionResult): void {
    this.phase = 'following';
    // Switch ASR to fast mode: shorter window + faster interval for word tracking
    this.backend?.setFastMode?.(true);
    this.currentPage = result.page;
    this.detectionSurah = result.surah;
    this.detectionAyah = result.ayah;
    this.expectedWords = buildPageWordIndex(result.page);
    this.pointer = result.pageWordOffset;
    this.matchedWords.clear();

    // Mark words before the detection point as already matched
    for (let i = 0; i < result.pageWordOffset; i++) {
      this.matchedWords.add(this.expectedWords[i].wordRef);
    }

    // Emit position-detected event
    this.emit({
      type: 'position-detected',
      page: result.page,
      surah: result.surah,
      ayah: result.ayah,
    });

    this.emitStateChange();

    console.log(`[FollowAlong] Locked: page ${result.page}, offset ${result.pageWordOffset}/${this.expectedWords.length}`);
  }

  /**
   * Advance to the next page when we've matched all words on the current page.
   */
  private advanceToNextPage(): void {
    if (this.currentPage >= 604) {
      // End of Quran — stop gracefully
      this.stop();
      return;
    }

    const nextPage = this.currentPage + 1;
    this.currentPage = nextPage;
    this.expectedWords = buildPageWordIndex(nextPage);
    this.pointer = 0;
    this.matchedWords.clear();

    this.emit({ type: 'page-changed', page: nextPage });
    this.emitStateChange();

    console.log(`[FollowAlong] Advanced to page ${nextPage}, ${this.expectedWords.length} words`);
  }

  // ─── Word similarity ─────────────────────────────────

  private wordSimilarity(asrWord: string, expectedNormalized: string): number {
    const a = normalizeArabic(asrWord);
    const b = expectedNormalized;
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

  // ─── Event system ─────────────────────────────────────

  on(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: FollowAlongEvent): void {
    for (const cb of this.listeners) {
      cb(event);
    }
  }

  private emitStateChange(): void {
    const currentWord = this.pointer < this.expectedWords.length
      ? this.expectedWords[this.pointer].wordRef
      : undefined;

    const state: FollowAlongState = {
      phase: this.phase,
      currentPage: this.currentPage || undefined,
      pointer: this.pointer,
      totalWords: this.expectedWords.length,
      highlightedWord: currentWord,
      asrText: this.lastAsrText,
      asrWordCount: this.cumulativeAsrWords.length,
      surah: this.detectionSurah || undefined,
      ayah: this.detectionAyah || undefined,
    };

    // Add hint if too many words without a match
    if (this.phase === 'detecting' && this.cumulativeAsrWords.length >= NO_MATCH_THRESHOLD) {
      state.error = 'Could not detect position — try a more distinctive passage.';
    }

    this.emit({ type: 'state-change', state });
  }

  /**
   * Get the set of matched word refs (for highlight rendering).
   */
  getMatchedWords(): Set<string> {
    return new Set(this.matchedWords);
  }

  /**
   * Get the current highlighted word ref.
   */
  getCurrentWord(): string | undefined {
    if (this.pointer < this.expectedWords.length) {
      return this.expectedWords[this.pointer].wordRef;
    }
    return undefined;
  }
}

export const followAlongService = new FollowAlongService();
