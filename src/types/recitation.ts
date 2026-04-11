/**
 * Types for real-time Quran recitation tracking.
 *
 * Supports word-by-word ASR matching with progressive reveal,
 * error detection, and reference audio correction.
 */

/** Word reveal state for QuranPageViewer */
export interface WordRevealState {
  /** Words revealed so far, keyed as "surah:ayah:wordIndex" */
  revealed: Set<string>;
  /** Current word being waited for (pulsing indicator) */
  currentWord?: string;
  /** Words with errors */
  errors: Set<string>;
}

/** A single word in the expected page text */
export interface ExpectedWord {
  /** Word text (with diacritics) */
  text: string;
  /** Normalized text (without diacritics) */
  normalized: string;
  /** Phoneme sequence for this word */
  phonemes: string[];
  /** Word reference key: "surah:ayah:wordIndex" */
  wordRef: string;
  /** Surah number */
  surah: number;
  /** Ayah number */
  ayah: number;
  /** 1-based word index within ayah */
  wordIndex: number;
  /** Position in the flat word array for this page */
  flatIndex: number;
}

/** Result of matching ASR text against expected words */
export interface MatchChunkResult {
  /** How far we matched (index in expected words array) */
  matchedUpTo: number;
  /** Match quality score (0-1, higher is better) */
  score: number;
  /** Indices of words that had errors */
  errorIndices: number[];
  /** Raw edit distance */
  editDistance: number;
}

/** Result of a completed recitation tracking session */
export interface RecitationResult {
  /** Number of words correctly recited */
  correctWords: number;
  /** Total words expected */
  totalWords: number;
  /** Accuracy percentage (0-100) */
  accuracy: number;
  /** Word refs that had errors */
  errors: string[];
  /** Duration in seconds */
  duration: number;
}

/** State emitted by the recitation tracker */
export interface RecitationState {
  /** Current pointer position in expected words */
  pointer: number;
  /** Total expected words */
  totalWords: number;
  /** Set of revealed word refs */
  revealedWords: Set<string>;
  /** Set of error word refs */
  errors: Set<string>;
  /** Whether ASR is actively listening */
  isListening: boolean;
  /** Current accuracy percentage */
  accuracy: number;
  /** Error mode */
  errorMode: 'strict' | 'forgiving';
  /** Whether tracking is paused (strict mode, waiting for correction) */
  isPaused: boolean;
  /** The word ref that caused the pause (strict mode) */
  pausedAtWord?: string;
}

/** ASR backend interface — pluggable speech recognition */
export interface ASRBackend {
  /** Start recognition */
  start(): void | Promise<void>;
  /** Stop recognition */
  stop(): void;
  /** Whether this backend is available in the current browser */
  isAvailable(): boolean | Promise<boolean>;
  /** Register callback for interim/final text results */
  onResult(callback: (text: string, isFinal: boolean) => void): void;
  /** Register callback for errors */
  onError(callback: (error: string) => void): void;
  /** Backend name for display */
  readonly name: string;
  /** Switch to fast mode (shorter window, faster interval) for word tracking */
  setFastMode?(enabled: boolean): void;
  /** Set prompt for context-aware decoding */
  setPrompt?(prompt: string): void;
}

/** Recitation tracker events */
export type RecitationEvent =
  | { type: 'word-revealed'; wordRef: string; index: number }
  | { type: 'error-detected'; wordRef: string; expectedWord: string; index: number }
  | { type: 'error-corrected'; wordRef: string }
  | { type: 'tracking-complete'; result: RecitationResult }
  | { type: 'state-change'; state: RecitationState }
  | { type: 'asr-error'; error: string; backend: string };

/** Word timing from aligner output */
export interface WordTiming {
  word: string;
  wordRef: string;
  start: number;
  end: number;
}
