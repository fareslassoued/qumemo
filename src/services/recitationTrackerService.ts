/**
 * Recitation tracker — orchestrates mic → ASR → match → reveal.
 *
 * Pluggable ASR backends: Web Speech API (streaming) or HF Inference API (chunked).
 * Auto-selects best available backend. Emits events for UI updates.
 */

import { buildPageWordIndex, matchChunk, matchWordQuick } from './recitationMatcherService';
import { normalizeArabic } from './phonemeService';
import { LocalWhisperBackend, WebSpeechBackend, HFInferenceBackend } from './asrBackends';
import type {
  ASRBackend,
  ExpectedWord,
  RecitationEvent,
  RecitationResult,
  RecitationState,
  WordRevealState,
} from '@/types/recitation';

type EventCallback = (event: RecitationEvent) => void;

/** How many expected words to search ahead during interim matching */
const INTERIM_SEARCH_WINDOW = 4;

// ─── Recitation Tracker Service ─────────────────────────

class RecitationTrackerService {
  private backend: ASRBackend | null = null;
  private expectedWords: ExpectedWord[] = [];
  private pointer = 0;
  private revealedWords = new Set<string>();
  private errors = new Set<string>();
  private listeners: Set<EventCallback> = new Set();
  private errorMode: 'strict' | 'forgiving' = 'forgiving';
  private isPaused = false;
  private pausedAtWord?: string;
  private isListening = false;
  private startTime = 0;
  // Track which words from interim results we've already processed
  private lastInterimWordCount = 0;
  // Live ASR text for display
  private lastASRText = '';

  /**
   * Start tracking recitation for a page.
   */
  async startTracking(
    pageNumber: number,
    options: { errorMode?: 'strict' | 'forgiving'; preferredBackend?: 'local' | 'webspeech' | 'hf' } = {},
  ): Promise<boolean> {
    this.stopTracking();

    this.expectedWords = buildPageWordIndex(pageNumber);
    this.pointer = 0;
    this.revealedWords = new Set();
    this.errors = new Set();
    this.errorMode = options.errorMode || 'forgiving';
    this.isPaused = false;
    this.pausedAtWord = undefined;
    this.startTime = Date.now();
    this.lastInterimWordCount = 0;
    this.lastASRText = '';

    console.log(`[Tracker] Starting for page ${pageNumber}, ${this.expectedWords.length} words`);
    console.log(`[Tracker] First 5 expected:`, this.expectedWords.slice(0, 5).map(w => w.normalized));

    if (this.expectedWords.length === 0) return false;

    // Select and start backend, with fallback on start failure
    const backends = await this.getAvailableBackends(options.preferredBackend);
    if (backends.length === 0) {
      console.error('[Tracker] No ASR backend available!');
      return false;
    }

    for (const backend of backends) {
      console.log(`[Tracker] Trying backend: ${backend.name}`);

      backend.onResult((text, isFinal) => {
        this.handleASRResult(text, isFinal);
      });

      backend.onError((error) => {
        console.warn(`[Tracker] ASR error (${backend.name}):`, error);
        this.emit({ type: 'asr-error', error, backend: backend.name });
      });

      try {
        await backend.start();
        this.backend = backend;
        console.log(`[Tracker] Using backend: ${backend.name}`);
        break;
      } catch (e) {
        console.warn(`[Tracker] Backend ${backend.name} failed to start:`, e);
        this.emit({ type: 'asr-error', error: `${backend.name} failed: ${e}`, backend: backend.name });
      }
    }

    if (!this.backend) {
      console.error('[Tracker] All backends failed to start');
      return false;
    }

    this.isListening = true;
    this.emitStateChange();

    return true;
  }

  /**
   * Stop tracking and return results.
   */
  stopTracking(): RecitationResult | null {
    if (!this.isListening) return null;

    this.isListening = false;
    this.backend?.stop();
    this.backend = null;

    const duration = (Date.now() - this.startTime) / 1000;
    const totalWords = this.expectedWords.length;
    const correctWords = this.revealedWords.size - this.errors.size;

    const result: RecitationResult = {
      correctWords: Math.max(0, correctWords),
      totalWords,
      accuracy: totalWords > 0 ? (Math.max(0, correctWords) / totalWords) * 100 : 0,
      errors: [...this.errors],
      duration,
    };

    this.emit({ type: 'tracking-complete', result });
    this.emitStateChange();

    return result;
  }

  /**
   * Handle ASR result (interim or final).
   */
  private handleASRResult(text: string, isFinal: boolean): void {
    if (this.isPaused || this.pointer >= this.expectedWords.length) return;

    this.lastASRText = text;

    if (isFinal) {
      // On final result: match ALL words against expected
      console.log(`[Tracker] Final match: "${text}" | pointer=${this.pointer}`);
      this.lastInterimWordCount = 0; // Reset for next speech segment

      const result = matchChunk(text, this.expectedWords, this.pointer);
      if (result) {
        console.log(`[Tracker] Matched up to ${result.matchedUpTo}, score=${result.score.toFixed(2)}, errors=${result.errorIndices.length}`);
        this.processMatchResult(result.matchedUpTo, result.errorIndices);
      } else {
        console.log(`[Tracker] No match found for final text`);
      }
    } else {
      // On interim/cumulative result: sequential matching with narrow window.
      const asrWords = text.split(/\s+/).filter(Boolean);

      // Detect text regression: the sliding window dropped old audio,
      // shrinking the text. Only re-process the TAIL of the ASR output
      // (the most recent recitation) to avoid jumping the pointer ahead.
      if (asrWords.length < this.lastInterimWordCount && asrWords.length > 0) {
        console.log(`[Tracker] Text regression (${this.lastInterimWordCount}→${asrWords.length}), processing tail only`);
        this.lastInterimWordCount = Math.max(0, asrWords.length - 3);
      }

      if (asrWords.length > this.lastInterimWordCount) {
        // Normal path: only process new words
        const newWords = asrWords.slice(this.lastInterimWordCount);
        this.lastInterimWordCount = asrWords.length;

        for (const word of newWords) {
          if (this.pointer >= this.expectedWords.length) break;

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

          if (bestIdx >= 0 && bestScore >= 0.45) {
            console.log(`[Tracker] Interim match: "${word}" → expected[${bestIdx}]="${this.expectedWords[bestIdx].normalized}" (score=${bestScore.toFixed(2)})`);
            this.revealUpTo(bestIdx + 1, []);
          }
        }
      }
    }

    // Always emit state change so UI can show live ASR text
    this.emitStateChange();
  }

  /**
   * Process a match result: reveal words, detect errors.
   */
  private processMatchResult(matchedUpTo: number, errorIndices: number[]): void {
    if (this.errorMode === 'strict' && errorIndices.length > 0) {
      const firstError = errorIndices[0];
      this.revealUpTo(firstError, []);

      const errorWord = this.expectedWords[firstError];
      this.errors.add(errorWord.wordRef);
      this.isPaused = true;
      this.pausedAtWord = errorWord.wordRef;

      this.emit({
        type: 'error-detected',
        wordRef: errorWord.wordRef,
        expectedWord: errorWord.text,
        index: firstError,
      });

      this.emitStateChange();
      return;
    }

    this.revealUpTo(matchedUpTo, errorIndices);
  }

  /**
   * Reveal words from current pointer up to targetIndex.
   */
  private revealUpTo(targetIndex: number, errorIndices: number[]): void {
    const errorSet = new Set(errorIndices);

    for (let i = this.pointer; i < targetIndex && i < this.expectedWords.length; i++) {
      const word = this.expectedWords[i];
      this.revealedWords.add(word.wordRef);

      if (errorSet.has(i)) {
        this.errors.add(word.wordRef);
        this.emit({
          type: 'error-detected',
          wordRef: word.wordRef,
          expectedWord: word.text,
          index: i,
        });
      } else {
        this.emit({ type: 'word-revealed', wordRef: word.wordRef, index: i });
      }
    }

    this.pointer = Math.max(this.pointer, targetIndex);

    if (this.pointer >= this.expectedWords.length) {
      this.completeTracking();
      return;
    }

    this.emitStateChange();
  }

  /**
   * Complete tracking when all words are matched.
   */
  private completeTracking(): void {
    this.isListening = false;
    this.backend?.stop();

    const duration = (Date.now() - this.startTime) / 1000;
    const totalWords = this.expectedWords.length;
    const correctWords = totalWords - this.errors.size;

    this.emit({
      type: 'tracking-complete',
      result: {
        correctWords,
        totalWords,
        accuracy: totalWords > 0 ? (correctWords / totalWords) * 100 : 0,
        errors: [...this.errors],
        duration,
      },
    });

    this.emitStateChange();
  }

  /**
   * Correct error in strict mode — resume tracking past the error word.
   */
  correctError(): void {
    if (!this.isPaused || !this.pausedAtWord) return;

    const wordRef = this.pausedAtWord;
    this.revealedWords.add(wordRef);
    this.isPaused = false;
    this.pausedAtWord = undefined;
    this.pointer++;

    this.emit({ type: 'error-corrected', wordRef });

    if (this.pointer >= this.expectedWords.length) {
      this.completeTracking();
      return;
    }

    this.emitStateChange();
  }

  /**
   * Get current state for UI rendering.
   */
  getState(): RecitationState {
    return {
      pointer: this.pointer,
      totalWords: this.expectedWords.length,
      revealedWords: new Set(this.revealedWords),
      errors: new Set(this.errors),
      isListening: this.isListening,
      accuracy: this.expectedWords.length > 0
        ? ((this.revealedWords.size - this.errors.size) / this.expectedWords.length) * 100
        : 0,
      errorMode: this.errorMode,
      isPaused: this.isPaused,
      pausedAtWord: this.pausedAtWord,
    };
  }

  /**
   * Get WordRevealState for QuranPageViewer rendering.
   */
  getWordRevealState(): WordRevealState {
    const currentWord = this.pointer < this.expectedWords.length
      ? this.expectedWords[this.pointer].wordRef
      : undefined;

    return {
      revealed: new Set(this.revealedWords),
      currentWord: this.isPaused ? this.pausedAtWord : currentWord,
      errors: new Set(this.errors),
    };
  }

  /**
   * Get the expected words array.
   */
  getExpectedWords(): ExpectedWord[] {
    return this.expectedWords;
  }

  /**
   * Get latest ASR text for debug display.
   */
  getLastASRText(): string {
    return this.lastASRText;
  }

  /**
   * Get the active backend name for display.
   */
  getBackendName(): string {
    return this.backend?.name || '';
  }

  /**
   * Set error mode.
   */
  setErrorMode(mode: 'strict' | 'forgiving'): void {
    this.errorMode = mode;
    this.emitStateChange();
  }

  /**
   * Check if tracking is active.
   */
  isActive(): boolean {
    return this.isListening;
  }

  // ─── Word similarity (for conservative interim matching) ──

  private wordSimilarity(asrWord: string, expectedNormalized: string): number {
    const a = normalizeArabic(asrWord);
    const b = expectedNormalized;
    if (a.length === 0 && b.length === 0) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Simple Levenshtein
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

  // ─── Backend selection ──────────────────────────────────

  private async getAvailableBackends(preferred?: 'local' | 'webspeech' | 'hf'): Promise<ASRBackend[]> {
    const localWhisper = new LocalWhisperBackend();
    const webSpeech = new WebSpeechBackend();
    const hf = new HFInferenceBackend();

    const available: ASRBackend[] = [];

    // Check availability (LocalWhisper is async)
    const localOk = await localWhisper.isAvailable();
    const webOk = webSpeech.isAvailable();
    const hfOk = hf.isAvailable();

    // Build ordered list: preferred first, then default priority
    const priorityOrder: ASRBackend[] = [];

    if (preferred === 'local' && localOk) priorityOrder.push(localWhisper);
    if (preferred === 'webspeech' && webOk) priorityOrder.push(webSpeech);
    if (preferred === 'hf' && hfOk) priorityOrder.push(hf);

    // Default priority: Local Whisper > Web Speech > HF
    if (localOk && !priorityOrder.includes(localWhisper)) priorityOrder.push(localWhisper);
    if (webOk && !priorityOrder.includes(webSpeech)) priorityOrder.push(webSpeech);
    if (hfOk && !priorityOrder.includes(hf)) priorityOrder.push(hf);

    return priorityOrder;
  }

  // ─── Event system ───────────────────────────────────────

  on(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: RecitationEvent): void {
    for (const cb of this.listeners) {
      cb(event);
    }
  }

  private emitStateChange(): void {
    this.emit({ type: 'state-change', state: this.getState() });
  }
}

// Export singleton
export const recitationTrackerService = new RecitationTrackerService();
