'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { followAlongService } from '@/services/followAlongService';
import { quranDataService } from '@/services/quranDataService';
import { QuranPageViewer } from '@/components/QuranPageViewer';
import type { FollowAlongState, FollowAlongEvent } from '@/types/followAlong';
import type { WordRevealState } from '@/types/recitation';
import Link from 'next/link';

const uiFont = { fontFamily: 'var(--font-garamond), Georgia, serif' };

export function FollowAlongPage() {
  const [state, setState] = useState<FollowAlongState>({
    phase: 'idle',
    pointer: 0,
    totalWords: 0,
    asrText: '',
    asrWordCount: 0,
  });
  const [wordRevealState, setWordRevealState] = useState<WordRevealState | undefined>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [blindMode, setBlindMode] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe to service events
  useEffect(() => {
    const handleEvent = (event: FollowAlongEvent) => {
      if (event.type === 'state-change') {
        setState(event.state);

        // Update word reveal state for QuranPageViewer
        if (event.state.phase === 'following') {
          setWordRevealState({
            revealed: followAlongService.getMatchedWords(),
            currentWord: followAlongService.getCurrentWord(),
            errors: new Set(),
          });
        }
      }
    };

    unsubRef.current = followAlongService.on(handleEvent);
    return () => { unsubRef.current?.(); };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (followAlongService.getPhase() !== 'idle') {
        followAlongService.stop();
      }
    };
  }, []);

  const handleStart = useCallback(async () => {
    setStarting(true);
    setError('');
    const ok = await followAlongService.start();
    setStarting(false);
    if (!ok) {
      setError('ASR server not available. Start the local whisper server at localhost:8765.');
    }
  }, []);

  const handleStop = useCallback(() => {
    followAlongService.stop();
    setWordRevealState(undefined);
  }, []);

  const pageInfo = state.currentPage ? quranDataService.getPageInfo(state.currentPage) : null;
  const surahName = pageInfo?.ayahs[0]?.sura_name_en || '';
  const surahNameAr = pageInfo?.ayahs[0]?.sura_name_ar || '';

  // ─── Idle phase ───────────────────────────────────────
  if (state.phase === 'idle') {
    return (
      <div
        className="flex flex-col h-screen items-center justify-center px-6"
        style={{ background: 'var(--parchment)' }}
      >
        {/* Back to reader */}
        <Link
          href="/"
          className="absolute top-4 left-4 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ color: 'var(--dim)' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="text-center max-w-sm space-y-6">
          {/* Mic icon */}
          <div
            className="w-20 h-20 mx-auto rounded-full flex items-center justify-center"
            style={{ background: 'var(--surface)', border: '2px solid var(--gold)' }}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} style={{ color: 'var(--gold)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          </div>

          <div>
            <h1 className="text-xl font-medium mb-2" style={{ color: 'var(--ink)', ...uiFont }}>
              Follow Along
            </h1>
            <p className="text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
              Start reciting from anywhere in the Quran. The app will detect your position and follow along word by word.
            </p>
          </div>

          <button
            onClick={handleStart}
            disabled={starting}
            className="w-full py-3 rounded-lg font-medium text-sm transition-opacity disabled:opacity-50"
            style={{ background: 'var(--gold)', color: 'var(--parchment)', ...uiFont }}
          >
            {starting ? 'Connecting...' : 'Start Reciting'}
          </button>

          {error && (
            <p className="text-xs" style={{ color: '#A0522D', ...uiFont }}>{error}</p>
          )}
        </div>
      </div>
    );
  }

  // ─── Detecting phase ──────────────────────────────────
  if (state.phase === 'detecting') {
    return (
      <div
        className="flex flex-col h-screen items-center justify-center px-6"
        style={{ background: 'var(--parchment)' }}
      >
        <div className="text-center max-w-sm space-y-6">
          {/* Pulsing mic */}
          <div
            className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mic-pulse"
            style={{ background: 'var(--gold)' }}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} style={{ color: 'var(--parchment)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          </div>

          <div>
            <h2 className="text-lg font-medium mb-1" style={{ color: 'var(--ink)', ...uiFont }}>
              Listening...
            </h2>
            <p className="text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
              {state.asrWordCount > 0
                ? `${state.asrWordCount} words heard`
                : 'Waiting for speech...'}
            </p>
          </div>

          {/* Live ASR text */}
          {state.asrText && (
            <div
              className="p-3 rounded-lg text-sm text-right max-h-32 overflow-y-auto"
              dir="rtl"
              style={{ background: 'var(--surface)', color: 'var(--dim)', fontFamily: 'var(--font-qaloon)' }}
            >
              {state.asrText}
            </div>
          )}

          {/* No match warning */}
          {state.error && (
            <p className="text-xs" style={{ color: '#A0522D', ...uiFont }}>{state.error}</p>
          )}

          <button
            onClick={handleStop}
            className="w-full py-2 rounded text-sm"
            style={{ background: 'var(--surface)', color: 'var(--ink)', ...uiFont }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ─── Following phase ──────────────────────────────────
  const progress = state.totalWords > 0
    ? Math.round((state.pointer / state.totalWords) * 100)
    : 0;

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--parchment)' }}>
      {/* Top bar */}
      <div
        className="shrink-0 flex items-center h-12 px-3 gap-2 border-b"
        style={{ background: 'var(--bar-bg)', borderColor: 'var(--divider)' }}
        dir="ltr"
      >
        {/* Close — 44px minimum touch target */}
        <button
          onClick={handleStop}
          className="w-11 h-11 flex items-center justify-center rounded-full -ml-1"
          style={{ color: 'var(--dim)' }}
          title="Stop"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Center info */}
        <div className="flex-1 text-center leading-tight">
          <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)', ...uiFont }}>
            {surahName}
          </div>
          <div className="text-[10px] tracking-wider" style={{ color: 'var(--dim)', ...uiFont }}>
            Page {state.currentPage} · Juz {pageInfo?.juz}
          </div>
        </div>

        {/* Mic indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: '#6B8E4E', animation: 'word-pulse 1.2s ease-in-out infinite' }}
          />
          <span className="text-[10px]" style={{ color: 'var(--dim)', ...uiFont }}>
            {state.pointer}/{state.totalWords}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1" style={{ background: 'var(--divider)' }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progress}%`, background: 'var(--gold)' }}
        />
      </div>

      {/* Quran content */}
      <div className="flex-1 overflow-hidden">
        <QuranPageViewer
          pageNumber={state.currentPage || 1}
          hideNavigation={true}
          wordRevealState={wordRevealState}
          highlightMode={blindMode ? 'reveal' : 'follow'}
        />
      </div>

      {/* Bottom status bar */}
      <div
        className="shrink-0 py-3 px-4 border-t flex items-center gap-3"
        style={{ background: 'var(--bar-bg)', borderColor: 'var(--divider)' }}
      >
        <button
          onClick={handleStop}
          className="px-5 py-2.5 rounded-lg text-sm font-medium shrink-0 touch-manipulation"
          style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--divider)', ...uiFont }}
        >
          Stop
        </button>

        {/* Blind mode toggle */}
        <button
          onClick={() => setBlindMode(!blindMode)}
          className="p-2.5 rounded-lg shrink-0 touch-manipulation"
          style={{ 
            background: blindMode ? 'var(--gold)' : 'var(--surface)',
            color: blindMode ? 'var(--parchment)' : 'var(--dim)',
            border: '1px solid var(--divider)'
          }}
          title={blindMode ? 'Show text' : 'Hide text (blind mode)'}
        >
          {blindMode ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>

        {/* ASR text preview */}
        <div
          className="flex-1 text-xs truncate"
          dir="rtl"
          style={{ color: 'var(--dim)', fontFamily: 'var(--font-qaloon)' }}
        >
          {state.asrText || '...'}
        </div>
      </div>
    </div>
  );
}
