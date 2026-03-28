'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { QuranPageViewer } from './QuranPageViewer';
import { VoiceRecorder } from './VoiceRecorder';
import { AudioPlayer } from './AudioPlayer';
import { RecitationTracker } from './RecitationTracker';
import { bilQuranService } from '@/services/bilQuranService';
import { sessionService } from '@/services/sessionService';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { quranDataService } from '@/services/quranDataService';
import { audioService } from '@/services/audioService';
import { ayahTimingService } from '@/services/ayahTimingService';
import { StudySession, HifzRitual, ReviewChunk } from '@/types/memorization';
import { Recording } from '@/types/quran';
import type { WordRevealState, RecitationResult } from '@/types/recitation';
import { useRouter } from 'next/navigation';

const uiFont = { fontFamily: "var(--font-garamond), Georgia, serif" };

type SessionPhase = 'review' | 'listen' | 'read' | 'recite' | 'surah-link' | 'complete';

interface BilQuranSessionProps {
  planId: string;
}

export function BilQuranSession({ planId }: BilQuranSessionProps) {
  const router = useRouter();
  const [session, setSession] = useState<StudySession | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('review');
  const [ritual, setRitual] = useState<HifzRitual>({
    listenCount: 0, readCount: 0, reciteCount: 0, surahLinkDone: false,
  });
  const [reviewChunk, setReviewChunk] = useState<ReviewChunk | null>(null);
  const [sessionPage, setSessionPage] = useState<number | null>(null); // The target page for the ritual
  const [viewPage, setViewPage] = useState<number | null>(null);        // The page currently being viewed
  const [sessionStartTime] = useState(Date.now());
  const [showRecorder, setShowRecorder] = useState(false);
  const [textHidden, setTextHidden] = useState(false);
  const [listenAutoPlaying, setListenAutoPlaying] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('recitation-tracking-enabled') !== 'false';
    }
    return true;
  });
  const [wordRevealState, setWordRevealState] = useState<WordRevealState | undefined>(undefined);
  const [showTracker, setShowTracker] = useState(false);

  const loadSession = useCallback(() => {
    const todaySession = sessionService.createTodaySession(planId);
    setSession(todaySession);

    // Determine starting phase
    if (todaySession.reviewChunk && !todaySession.reviewChunk.completed) {
      setPhase('review');
      const rotation = bilQuranService.getRotation(planId);
      const chunk = rotation.chunks.find(c => c.id === todaySession.reviewChunk!.chunkId);
      setReviewChunk(chunk || null);
      if (chunk && chunk.pages.length > 0) {
        setSessionPage(chunk.pages[0]);
        setViewPage(chunk.pages[0]);
        setTextHidden(true); // Review = recite from memory
      }
    } else if (todaySession.newMaterial && !todaySession.newMaterial.completed) {
      const page = todaySession.newMaterial.pageNumber;
      setSessionPage(page);
      setViewPage(page);
      // Start or resume ritual
      const progress = bilQuranService.getProgress(planId, page);
      if (progress && progress.status === 'in-ritual') {
        setRitual(progress.ritual);
        setPhase(bilQuranService.getCurrentPhase(progress.ritual) as SessionPhase);
      } else {
        bilQuranService.startRitual(planId, page);
        setPhase('listen');
      }
    } else {
      setPhase('complete');
    }
  }, [planId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Listen for range-complete event
  useEffect(() => {
    const handleRangeComplete = () => {
      setListenAutoPlaying(false);
      if (sessionPage) {
        const updatedRitual = bilQuranService.advanceListen(planId, sessionPage);
        setRitual(updatedRitual);

        if (bilQuranService.isListenComplete(updatedRitual)) {
          setPhase('read');
        }
      }
    };

    audioService.on('range-complete', handleRangeComplete);
    return () => { audioService.off('range-complete', handleRangeComplete); };
  }, [planId, sessionPage]);

  // Auto-play listen phase
  const handleStartListen = async () => {
    if (!sessionPage || listenAutoPlaying) return;

    const pageInfo = quranDataService.getPageInfo(sessionPage);
    if (!pageInfo || pageInfo.ayahs.length === 0) return;

    const primarySurah = quranDataService.getPagePrimarySurah(sessionPage);
    if (!primarySurah) return;

    const surahAyahs = pageInfo.ayahs.filter(
      (a: { sura_no: number }) => a.sura_no === primarySurah
    );
    if (surahAyahs.length === 0) return;

    const startAyah = surahAyahs[0].aya_no;
    const endAyah = surahAyahs[surahAyahs.length - 1].aya_no;

    const range = await ayahTimingService.getAyahRange(primarySurah, startAyah, endAyah);
    if (range) {
      setListenAutoPlaying(true);
      await audioService.playRange(primarySurah, range.startTime, range.endTime, 1);
    } else {
      // No timings available — fall back to playing full surah
      await audioService.play(primarySurah);
    }
  };

  const handleAdvanceListen = () => {
    if (!sessionPage) return;
    const updatedRitual = bilQuranService.advanceListen(planId, sessionPage);
    setRitual(updatedRitual);
    if (bilQuranService.isListenComplete(updatedRitual)) {
      setPhase('read');
    }
  };

  const handleAdvanceRead = () => {
    if (!sessionPage) return;
    const updatedRitual = bilQuranService.advanceRead(planId, sessionPage);
    setRitual(updatedRitual);
    if (bilQuranService.isReadComplete(updatedRitual)) {
      setPhase('recite');
      setTextHidden(true);
    }
  };

  const handleReciteResult = (errorFree: boolean) => {
    if (!sessionPage) return;
    const updatedRitual = bilQuranService.advanceRecite(planId, sessionPage, errorFree);
    setRitual(updatedRitual);

    if (bilQuranService.isReciteComplete(updatedRitual)) {
      setPhase('surah-link');
      setTextHidden(false); // Show text for surah link
    }
  };

  const handleSurahLinkComplete = () => {
    if (!sessionPage) return;
    bilQuranService.completeSurahLink(planId, sessionPage);
    setRitual(prev => ({ ...prev, surahLinkDone: true }));

    if (session) {
      memorizationPlanService.updateSession(planId, session.id, {
        newMaterial: {
          pageNumber: sessionPage,
          ritual: { ...ritual, surahLinkDone: true },
          completed: true,
        },
      });
    }

    completeSessionIfDone();
  };

  const handleReviewComplete = () => {
    if (!session || !reviewChunk) return;

    bilQuranService.completeReview(planId, reviewChunk.id);

    memorizationPlanService.updateSession(planId, session.id, {
      reviewChunk: { chunkId: reviewChunk.id, completed: true },
    });

    // Move to new material phase
    if (session.newMaterial && !session.newMaterial.completed) {
      const page = session.newMaterial.pageNumber;
      setSessionPage(page);
      setViewPage(page);
      bilQuranService.startRitual(planId, page);
      setPhase('listen');
      setTextHidden(false);
      setRitual({ listenCount: 0, readCount: 0, reciteCount: 0, surahLinkDone: false });
    } else {
      completeSessionIfDone();
    }
  };

  const completeSessionIfDone = () => {
    if (!session) return;
    const duration = Math.round((Date.now() - sessionStartTime) / 1000 / 60);
    memorizationPlanService.completeSession(planId, session.id, duration);
    setPhase('complete');
  };

  const handleRecordingComplete = (recording: Recording) => {
    // Recording saved via VoiceRecorder's internal logic
    void recording;
  };

  const handleTrackingComplete = useCallback((result: RecitationResult) => {
    setShowTracker(false);
    setWordRevealState(undefined);
    // Auto-judge based on accuracy
    const errorFree = result.accuracy >= 95;
    handleReciteResult(errorFree);
  }, [handleReciteResult]);

  const handleTrackingCancel = useCallback(() => {
    setShowTracker(false);
    setWordRevealState(undefined);
  }, []);

  const handleReviewTrackingComplete = useCallback((result: RecitationResult) => {
    setShowTracker(false);
    setWordRevealState(undefined);
    void result;
  }, []);

  const handleReviewTrackingCancel = useCallback(() => {
    setShowTracker(false);
    setWordRevealState(undefined);
  }, []);

  const toggleTracking = () => {
    const next = !trackingEnabled;
    setTrackingEnabled(next);
    localStorage.setItem('recitation-tracking-enabled', String(next));
  };

  const handleExit = () => {
    if (confirm('Are you sure you want to exit? Your progress will be saved.')) {
      router.push(`/memorization?planId=${planId}`);
    }
  };

  // Navigate back to session page
  const goToSessionPage = () => {
    if (sessionPage) setViewPage(sessionPage);
  };

  // Get surah info for the session page
  const getSurahInfo = () => {
    if (!sessionPage) return null;
    const surahNum = quranDataService.getPagePrimarySurah(sessionPage);
    if (!surahNum) return null;
    return quranDataService.getSurahInfo(surahNum);
  };

  // Get hidden ayahs — hide on session page (new material) or any review chunk page
  const getHiddenAyahs = (): number[] => {
    if (!textHidden || !viewPage) return [];

    // During review, hide text on any page that belongs to the review chunk
    if (phase === 'review' && reviewChunk) {
      if (reviewChunk.pages.includes(viewPage)) {
        const pageInfo = quranDataService.getPageInfo(viewPage);
        if (!pageInfo) return [];
        return pageInfo.ayahs.map((a: { aya_no: number }) => a.aya_no);
      }
      return [];
    }

    // During new material phases, only hide on the session page
    if (viewPage !== sessionPage) return [];
    const pageInfo = quranDataService.getPageInfo(viewPage);
    if (!pageInfo) return [];
    return pageInfo.ayahs.map((a: { aya_no: number }) => a.aya_no);
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl" style={{ color: 'var(--dim)', ...uiFont }}>Loading session...</div>
      </div>
    );
  }

  if (phase === 'complete') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">&#127881;</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)', ...uiFont }}>
            Session Complete!
          </h2>
          <p className="mb-4" style={{ color: 'var(--dim)', ...uiFont }}>
            {session.newMaterial?.completed
              ? 'New page memorized and added to your review rotation.'
              : 'Great work staying consistent!'}
          </p>
          <button
            onClick={() => router.push(`/memorization?planId=${planId}`)}
            className="px-6 py-3 text-white rounded-lg"
            style={{ background: 'var(--gold)', ...uiFont }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const surahInfo = getSurahInfo();
  const isOnSessionPage = viewPage === sessionPage;
  const surahNum = sessionPage ? quranDataService.getPagePrimarySurah(sessionPage) : null;

  const phaseLabels: Record<SessionPhase, string> = {
    review: 'Review',
    listen: 'Listen',
    read: 'Read',
    recite: 'Recite',
    'surah-link': 'Surah Link',
    complete: 'Done',
  };

  const phaseOrder: SessionPhase[] = session.reviewChunk
    ? ['review', 'listen', 'read', 'recite']
    : ['listen', 'read', 'recite'];

  return (
    <div className="flex flex-col h-screen">
      {/* Header with stepper */}
      <div className="shrink-0 p-4" style={{ background: 'var(--bar-bg)', borderBottom: '1px solid var(--divider)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-lg font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                {phaseLabels[phase]}
                <span className="text-sm font-normal ml-2" style={{ color: 'var(--dim)' }}>
                  Page {sessionPage}
                </span>
              </div>
              {surahInfo && (
                <div className="text-xs" style={{ color: 'var(--gold)', ...uiFont }}>
                  {surahInfo.englishName} ({surahInfo.nameArabic})
                </div>
              )}
            </div>
            <button onClick={handleExit} className="px-4 py-2 rounded" style={{ color: 'var(--dim)', ...uiFont }}>
              Exit
            </button>
          </div>

          {/* Phase stepper — clickable to navigate backward */}
          <div className="flex items-center gap-1">
            {phaseOrder.map((p, i) => {
              const currentIdx = phaseOrder.indexOf(phase);
              const completed = currentIdx > i;
              const active = phase === p;

              return (
                <div
                  key={p}
                  className="flex-1 h-2 rounded-full transition-all cursor-pointer"
                  style={{
                    background: active ? 'var(--gold)' : completed ? '#6B8E4E' : 'var(--divider)',
                  }}
                  onClick={() => {
                    // Only allow navigating to completed or current phases
                    if (completed || active) {
                      setPhase(p);
                      // Restore text visibility when going back
                      if (p !== 'recite') setTextHidden(false);
                      if (p === 'recite') setTextHidden(true);
                    }
                  }}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            {phaseOrder.map((p) => {
              const currentIdx = phaseOrder.indexOf(phase);
              const pIdx = phaseOrder.indexOf(p);
              return (
                <span
                  key={p}
                  className="text-[10px] cursor-pointer"
                  style={{
                    color: phase === p ? 'var(--gold)' : pIdx < currentIdx ? '#6B8E4E' : 'var(--dim)',
                    fontWeight: phase === p ? 600 : 400,
                    ...uiFont,
                  }}
                  onClick={() => {
                    if (pIdx <= currentIdx) {
                      setPhase(p);
                      if (p !== 'recite') setTextHidden(false);
                      if (p === 'recite') setTextHidden(true);
                    }
                  }}
                >
                  {phaseLabels[p]}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* "Go to session page" banner when navigated away */}
      {!isOnSessionPage && (
        <div
          className="shrink-0 px-4 py-2 text-center cursor-pointer"
          style={{ background: 'var(--gold)', color: 'var(--parchment)' }}
          onClick={goToSessionPage}
        >
          <span style={uiFont}>
            Viewing page {viewPage} — tap to return to session page {sessionPage}
          </span>
        </div>
      )}

      {/* Page Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {viewPage && (
          <QuranPageViewer
            pageNumber={viewPage}
            hiddenAyahs={getHiddenAyahs()}
            onPageChange={(newPage) => setViewPage(newPage)}
            hideNavigation={false}
            wordRevealState={showTracker ? wordRevealState : undefined}
          />
        )}
      </div>

      {/* Audio Player — fixed bar, always visible during listen/review/read */}
      {surahNum && (phase === 'review' || phase === 'listen' || phase === 'read') && (
        <div className="shrink-0">
          <AudioPlayer surahNumber={surahNum} />
        </div>
      )}

      {/* Phase Controls */}
      <div className="shrink-0 p-4" style={{ background: 'var(--bar-bg)', borderTop: '1px solid var(--divider)' }}>
        <div className="max-w-6xl mx-auto">
          {phase === 'review' && (
            <div className="space-y-3">
              {reviewChunk && (
                <div className="text-center mb-2">
                  <div className="text-sm font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                    Recite from memory
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--dim)', ...uiFont }}>
                    {reviewChunk.pages.length} page{reviewChunk.pages.length !== 1 ? 's' : ''}
                    {(() => {
                      const chunkSurah = quranDataService.getSurahInfo(reviewChunk.surahNumber);
                      return chunkSurah ? ` — ${chunkSurah.englishName}` : '';
                    })()}
                    {reviewChunk.pages.length > 1 && (
                      ` (pages ${reviewChunk.pages[0]}–${reviewChunk.pages[reviewChunk.pages.length - 1]})`
                    )}
                  </div>
                </div>
              )}

              {/* Review tracking */}
              {trackingEnabled && showTracker && viewPage && surahNum && (
                <div className="mb-3 p-3 rounded-lg" style={{ background: 'var(--surface)' }}>
                  <RecitationTracker
                    pageNumber={viewPage}
                    surahNumber={surahNum}
                    onRevealStateChange={setWordRevealState}
                    onComplete={handleReviewTrackingComplete}
                    onCancel={handleReviewTrackingCancel}
                  />
                </div>
              )}

              {!showTracker && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleReviewComplete}
                    className="py-3 text-white rounded-lg font-medium"
                    style={{ background: '#6B8E4E', ...uiFont }}
                  >
                    Completed ✓
                  </button>
                  <button
                    onClick={handleReviewComplete}
                    className="py-3 rounded-lg font-medium"
                    style={{ background: 'var(--surface)', color: 'var(--ink)', ...uiFont }}
                  >
                    Need more practice
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                {!showTracker && (
                  <button
                    onClick={() => setTextHidden(!textHidden)}
                    className="flex-1 py-2 rounded text-sm"
                    style={{ background: 'var(--surface)', color: 'var(--ink)', ...uiFont }}
                  >
                    {textHidden ? 'Peek at text' : 'Hide text again'}
                  </button>
                )}
                {trackingEnabled && (
                  <button
                    onClick={() => setShowTracker(!showTracker)}
                    className="flex-1 py-2 rounded text-sm"
                    style={{
                      background: showTracker ? 'var(--gold)' : 'var(--surface)',
                      color: showTracker ? 'var(--parchment)' : 'var(--ink)',
                      ...uiFont,
                    }}
                  >
                    {showTracker ? 'Manual mode' : 'Live tracking'}
                  </button>
                )}
              </div>
            </div>
          )}

          {phase === 'listen' && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-3 mb-1">
                <span className="text-xs font-medium" style={{ color: 'var(--dim)', ...uiFont }}>LISTEN</span>
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: i < ritual.listenCount ? 'var(--gold)' : 'var(--divider)',
                      color: i < ritual.listenCount ? 'var(--parchment)' : 'var(--dim)',
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <p className="text-center text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                Listen to the ayahs and focus on tajweed ({ritual.listenCount}/2)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleStartListen}
                  disabled={listenAutoPlaying}
                  className="py-3 text-white rounded-lg font-medium disabled:opacity-50"
                  style={{ background: 'var(--gold)', ...uiFont }}
                >
                  {listenAutoPlaying ? 'Playing...' : 'Play Ayah Range'}
                </button>
                <button
                  onClick={handleAdvanceListen}
                  className="py-3 rounded-lg font-medium"
                  style={{ background: 'var(--surface)', color: 'var(--ink)', ...uiFont }}
                >
                  Mark Listened
                </button>
              </div>
            </div>
          )}

          {phase === 'read' && (
            <div className="space-y-3">
              {/* Progress dots */}
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="text-xs font-medium mr-2" style={{ color: 'var(--dim)', ...uiFont }}>READ</span>
                {Array.from({ length: 15 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-full"
                    style={{
                      background: i < ritual.readCount ? 'var(--gold)' : 'var(--divider)',
                    }}
                  />
                ))}
              </div>
              <p className="text-center text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                Read aloud while looking at the text ({ritual.readCount}/15)
              </p>
              <button
                onClick={handleAdvanceRead}
                className="w-full py-3 text-white rounded-lg font-medium"
                style={{ background: 'var(--gold)', ...uiFont }}
              >
                Done Reading ({ritual.readCount + 1}/15)
              </button>
            </div>
          )}

          {phase === 'recite' && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-3 mb-1">
                <span className="text-xs font-medium" style={{ color: 'var(--dim)', ...uiFont }}>RECITE</span>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: i < ritual.reciteCount ? '#6B8E4E' : 'var(--divider)',
                      color: i < ritual.reciteCount ? '#fff' : 'var(--dim)',
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <p className="text-center text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                Recite from memory — text is hidden ({ritual.reciteCount}/3)
              </p>

              {/* Recitation tracker (when enabled and active) */}
              {trackingEnabled && showTracker && sessionPage && surahNum && (
                <div className="mb-3 p-3 rounded-lg" style={{ background: 'var(--surface)' }}>
                  <RecitationTracker
                    pageNumber={sessionPage}
                    surahNumber={surahNum}
                    onRevealStateChange={setWordRevealState}
                    onComplete={handleTrackingComplete}
                    onCancel={handleTrackingCancel}
                  />
                </div>
              )}

              {/* Manual controls (when tracker is not active) */}
              {!showTracker && (
                <>
                  {showRecorder && (
                    <div className="mb-3 p-3 rounded-lg" style={{ background: 'var(--surface)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium" style={{ color: 'var(--ink)', ...uiFont }}>Record Your Recitation</span>
                        <button onClick={() => setShowRecorder(false)} style={{ color: 'var(--dim)' }}>✕</button>
                      </div>
                      {sessionPage && (
                        <VoiceRecorder
                          pageNumber={sessionPage}
                          onRecordingComplete={handleRecordingComplete}
                        />
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleReciteResult(true)}
                      className="py-4 text-white rounded-lg font-medium"
                      style={{ background: '#6B8E4E', ...uiFont }}
                    >
                      Error-free ✓
                    </button>
                    <button
                      onClick={() => handleReciteResult(false)}
                      className="py-4 rounded-lg font-medium"
                      style={{ background: '#A0522D', color: '#fff', ...uiFont }}
                    >
                      Made mistake ✗
                    </button>
                  </div>
                </>
              )}

              <div className="flex gap-3">
                {!showTracker && (
                  <button
                    onClick={() => setTextHidden(!textHidden)}
                    className="flex-1 py-2 rounded text-sm"
                    style={{ background: 'var(--surface)', color: 'var(--ink)', ...uiFont }}
                  >
                    {textHidden ? 'Peek at text' : 'Hide text again'}
                  </button>
                )}
                {trackingEnabled ? (
                  <button
                    onClick={() => setShowTracker(!showTracker)}
                    className="flex-1 py-2 rounded text-sm"
                    style={{
                      background: showTracker ? 'var(--gold)' : 'var(--surface)',
                      color: showTracker ? 'var(--parchment)' : 'var(--ink)',
                      ...uiFont,
                    }}
                  >
                    {showTracker ? 'Manual mode' : 'Live tracking'}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowRecorder(!showRecorder)}
                    className="flex-1 py-2 rounded text-sm"
                    style={{ background: 'var(--surface)', color: 'var(--ink)', ...uiFont }}
                  >
                    {showRecorder ? 'Close recorder' : 'Record'}
                  </button>
                )}
              </div>

              {/* Tracking toggle */}
              <button
                onClick={toggleTracking}
                className="w-full py-1.5 text-xs rounded"
                style={{ color: 'var(--dim)', ...uiFont }}
              >
                {trackingEnabled ? 'Disable live tracking' : 'Enable live tracking'}
              </button>
            </div>
          )}

          {phase === 'surah-link' && (
            <div className="space-y-3">
              <div className="p-4 rounded-lg text-center" style={{ background: 'var(--gold-glow)' }}>
                <p className="font-medium mb-1" style={{ color: 'var(--ink)', ...uiFont }}>
                  Surah Link — Final Step
                </p>
                <p className="text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                  Recite from the <strong>beginning of the surah</strong> up to and including this page.
                  This connects the new material with what you already know.
                </p>
              </div>
              <button
                onClick={handleSurahLinkComplete}
                className="w-full py-3 text-white rounded-lg font-medium"
                style={{ background: '#6B8E4E', ...uiFont }}
              >
                Surah Link Complete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
