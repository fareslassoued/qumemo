/**
 * Types for the live follow-along recitation feature.
 *
 * Unlike the memorization tracker (which hides text and reveals on match),
 * follow-along keeps text visible and highlights the current position
 * with a gold underline / glow effect.
 */

/** The three phases of the follow-along state machine */
export type FollowAlongPhase = 'idle' | 'detecting' | 'following';

/** Full state exposed to the UI */
export interface FollowAlongState {
  phase: FollowAlongPhase;
  /** Current page being followed (only in 'following' phase) */
  currentPage?: number;
  /** Current word pointer within the page */
  pointer: number;
  /** Total words on the current page */
  totalWords: number;
  /** The wordRef of the currently highlighted word */
  highlightedWord?: string;
  /** Latest ASR text for display */
  asrText: string;
  /** Number of ASR words heard so far (for detection phase UI) */
  asrWordCount: number;
  /** Surah info for the detected position */
  surah?: number;
  /** Ayah info for the detected position */
  ayah?: number;
  /** Error message if something went wrong */
  error?: string;
}

/** Events emitted by FollowAlongService */
export type FollowAlongEvent =
  | { type: 'state-change'; state: FollowAlongState }
  | { type: 'position-detected'; page: number; surah: number; ayah: number }
  | { type: 'page-changed'; page: number };
