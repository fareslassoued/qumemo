'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { recitationTrackerService } from '@/services/recitationTrackerService';
import { audioService } from '@/services/audioService';
import { ayahTimingService } from '@/services/ayahTimingService';
import type {
  RecitationState,
  RecitationResult,
  RecitationEvent,
  WordRevealState,
} from '@/types/recitation';

const uiFont = { fontFamily: 'var(--font-garamond), Georgia, serif' };

interface RecitationTrackerProps {
  pageNumber: number;
  /** Called when word reveal state changes (for QuranPageViewer) */
  onRevealStateChange: (state: WordRevealState) => void;
  /** Called when tracking completes with final result */
  onComplete: (result: RecitationResult) => void;
  /** Called when user cancels tracking */
  onCancel: () => void;
  /** Primary surah number on this page (for error audio playback) */
  surahNumber: number;
}

export function RecitationTracker({
  pageNumber,
  onRevealStateChange,
  onComplete,
  onCancel,
}: RecitationTrackerProps) {
  const [state, setState] = useState<RecitationState | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [asrText, setAsrText] = useState('');
  const [backendName, setBackendName] = useState('');
  const [asrResultCount, setAsrResultCount] = useState(0);
  const [asrError, setAsrError] = useState('');
  const [errorMode, setErrorMode] = useState<'strict' | 'forgiving'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('recitation-error-mode') as 'strict' | 'forgiving') || 'forgiving';
    }
    return 'forgiving';
  });
  const [playingError, setPlayingError] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  // Use refs for callbacks to avoid re-subscribing on every render
  const onRevealStateChangeRef = useRef(onRevealStateChange);
  onRevealStateChangeRef.current = onRevealStateChange;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Subscribe to tracker events (stable — no callback deps)
  useEffect(() => {
    const handleEvent = (event: RecitationEvent) => {
      if (event.type === 'state-change') {
        setState(event.state);
        const text = recitationTrackerService.getLastASRText();
        if (text) {
          setAsrText(prev => {
            if (prev !== text) setAsrResultCount(c => c + 1);
            return text;
          });
        }
        onRevealStateChangeRef.current(recitationTrackerService.getWordRevealState());
      } else if (event.type === 'tracking-complete') {
        onCompleteRef.current(event.result);
        setIsStarted(false);
      } else if (event.type === 'asr-error') {
        setAsrError(`${event.backend}: ${event.error}`);
      }
    };

    unsubRef.current = recitationTrackerService.on(handleEvent);

    return () => {
      unsubRef.current?.();
    };
  }, []);

  // Stop tracking on unmount to clean up mic/WebSocket
  useEffect(() => {
    return () => {
      if (recitationTrackerService.isActive()) {
        recitationTrackerService.stopTracking();
      }
    };
  }, []);

  // Save error mode preference
  useEffect(() => {
    localStorage.setItem('recitation-error-mode', errorMode);
    if (isStarted) {
      recitationTrackerService.setErrorMode(errorMode);
    }
  }, [errorMode, isStarted]);

  const handleStart = useCallback(async () => {
    const success = await recitationTrackerService.startTracking(pageNumber, { errorMode });
    if (success) {
      setIsStarted(true);
      setBackendName(recitationTrackerService.getBackendName());
      // Emit initial reveal state (all hidden)
      onRevealStateChange(recitationTrackerService.getWordRevealState());
    } else {
      // Show error if no backend available
      setAsrText('No speech recognition available. Start the local whisper server or use Chrome for Web Speech API.');
    }
  }, [pageNumber, errorMode, onRevealStateChange]);

  const handleStop = useCallback(() => {
    recitationTrackerService.stopTracking();
    setIsStarted(false);
  }, []);

  const handleCorrectError = useCallback(() => {
    recitationTrackerService.correctError();
  }, []);

  const handlePlayErrorWord = useCallback(async () => {
    if (!state?.pausedAtWord) return;

    const parts = state.pausedAtWord.split(':');
    if (parts.length !== 3) return;

    const surah = parseInt(parts[0]);
    const ayah = parseInt(parts[1]);

    const range = await ayahTimingService.getAyahRange(surah, ayah, ayah);
    if (range) {
      setPlayingError(true);
      await audioService.playRange(surah, range.startTime, range.endTime, 1);

      const onRangeComplete = () => {
        setPlayingError(false);
        audioService.off('range-complete', onRangeComplete);
      };
      audioService.on('range-complete', onRangeComplete);
    }
  }, [state?.pausedAtWord]);

  const progress = state
    ? Math.round((state.pointer / Math.max(state.totalWords, 1)) * 100)
    : 0;

  const errorCount = state?.errors.size || 0;

  // Not started yet — show start button + mode toggle
  if (!isStarted) {
    return (
      <div className="space-y-3">
        <div className="text-center">
          <div className="text-sm font-medium mb-1" style={{ color: 'var(--ink)', ...uiFont }}>
            Live Recitation Tracking
          </div>
          <p className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>
            Recite aloud — words appear as you speak
          </p>
        </div>

        {/* Error mode toggle */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>Mode:</span>
          <button
            onClick={() => setErrorMode('forgiving')}
            className="px-3 py-1 rounded text-xs"
            style={{
              background: errorMode === 'forgiving' ? 'var(--gold)' : 'var(--surface)',
              color: errorMode === 'forgiving' ? 'var(--parchment)' : 'var(--dim)',
              ...uiFont,
            }}
          >
            Forgiving
          </button>
          <button
            onClick={() => setErrorMode('strict')}
            className="px-3 py-1 rounded text-xs"
            style={{
              background: errorMode === 'strict' ? 'var(--gold)' : 'var(--surface)',
              color: errorMode === 'strict' ? 'var(--parchment)' : 'var(--dim)',
              ...uiFont,
            }}
          >
            Strict
          </button>
        </div>

        <button
          onClick={handleStart}
          className="w-full py-3 text-white rounded-lg font-medium"
          style={{ background: 'var(--gold)', ...uiFont }}
        >
          Start Reciting
        </button>

        <button
          onClick={onCancel}
          className="w-full py-2 rounded text-sm"
          style={{ background: 'var(--surface)', color: 'var(--dim)', ...uiFont }}
        >
          Skip tracking
        </button>

        {/* Error display */}
        {asrText && !isStarted && (
          <p className="text-xs text-center" style={{ color: '#A0522D', ...uiFont }}>{asrText}</p>
        )}
      </div>
    );
  }

  // Active tracking UI
  return (
    <div className="space-y-3">
      {/* Mic indicator + progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: state?.isPaused ? '#A0522D' : '#6B8E4E',
              animation: state?.isListening && !state?.isPaused ? 'word-pulse 1.2s ease-in-out infinite' : 'none',
            }}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--dim)', ...uiFont }}>
            {state?.isPaused ? 'Paused — error' : 'Listening...'}
          </span>
          {backendName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)', color: 'var(--dim)' }}>
              {backendName}
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>
          {state?.pointer || 0}/{state?.totalWords || 0}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full" style={{ background: 'var(--divider)' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress}%`, background: errorCount > 0 ? '#A0522D' : 'var(--gold)' }}
        />
      </div>

      {/* Live ASR text — shows what speech recognition is hearing */}
      {asrText ? (
        <div
          className="p-2 rounded text-sm text-right"
          dir="rtl"
          style={{ background: 'var(--surface)', color: 'var(--dim)', fontFamily: 'var(--font-qaloon)' }}
        >
          {asrText}
        </div>
      ) : isStarted && asrResultCount === 0 && (
        <div className="p-2 rounded text-xs text-center" style={{ background: 'var(--surface)', color: 'var(--dim)', ...uiFont }}>
          Waiting for speech... speak clearly into your microphone
        </div>
      )}

      {/* ASR error display */}
      {asrError && (
        <div className="text-xs text-center" style={{ color: '#A0522D', ...uiFont }}>
          {asrError}
        </div>
      )}

      {/* Error info + correction (strict mode) */}
      {state?.isPaused && state?.pausedAtWord && (
        <div className="p-3 rounded-lg" style={{ background: 'rgba(160, 82, 45, 0.1)' }}>
          <p className="text-sm mb-2" style={{ color: '#A0522D', ...uiFont }}>
            Error detected — correct and continue
          </p>
          <div className="flex gap-2">
            <button
              onClick={handlePlayErrorWord}
              disabled={playingError}
              className="flex-1 py-2 rounded text-sm disabled:opacity-50"
              style={{ background: 'var(--surface)', color: 'var(--ink)', ...uiFont }}
            >
              {playingError ? 'Playing...' : 'Hear correct'}
            </button>
            <button
              onClick={handleCorrectError}
              className="flex-1 py-2 rounded text-sm text-white"
              style={{ background: '#6B8E4E', ...uiFont }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--dim)', ...uiFont }}>
        <span>Accuracy: {Math.round(state?.accuracy || 0)}%</span>
        {errorCount > 0 && (
          <span style={{ color: '#A0522D' }}>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
        )}
        <span className="capitalize">{errorMode}</span>
      </div>

      {/* Stop button */}
      <button
        onClick={handleStop}
        className="w-full py-2 rounded text-sm"
        style={{ background: 'var(--surface)', color: 'var(--ink)', ...uiFont }}
      >
        Stop tracking
      </button>
    </div>
  );
}
