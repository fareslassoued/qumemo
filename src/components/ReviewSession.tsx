'use client';

import React, { useState, useEffect } from 'react';
import { QuranPageViewer } from './QuranPageViewer';
import { VoiceRecorder } from './VoiceRecorder';
import { AudioPlayer } from './AudioPlayer';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { reviewQueueService } from '@/services/reviewQueueService';
import { spacedRepetitionService } from '@/services/spacedRepetitionService';
import { quranDataService } from '@/services/quranDataService';
import { StudySession } from '@/types/memorization';
import { Recording } from '@/types/quran';
import { useRouter } from 'next/navigation';
import { getCurrentSurahForPage } from '@/utils/surahDetection';

const uiFont = { fontFamily: "var(--font-garamond), Georgia, serif" };

interface ReviewSessionProps {
  planId: string;
}

export function ReviewSession({ planId }: ReviewSessionProps) {
  const router = useRouter();
  const [session, setSession] = useState<StudySession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewPage, setViewPage] = useState<number | null>(null); // Current page being viewed
  const [memorizationAyahsHidden, setMemorizationAyahsHidden] = useState(true);
  const [showGrading, setShowGrading] = useState(false);
  const [sessionStartTime] = useState(Date.now());
  const [reviewStartTime, setReviewStartTime] = useState<number | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);

  const loadSession = () => {
    const todaySession = reviewQueueService.getOrCreateTodaySession(planId);
    setSession(todaySession);

    // Set initial view page
    if (todaySession.reviewQueue.length > 0 || todaySession.newMaterial.length > 0) {
      const firstPage = (todaySession.reviewQueue.length > 0)
        ? todaySession.reviewQueue[0]
        : todaySession.newMaterial[0];
      setViewPage(firstPage);
      setReviewStartTime(Date.now());
    }
  };

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const getCurrentSurah = (pageNumber: number): number | null => {
    if (!session) return null;

    // Check if this page is part of new material queue
    const isPageInNewMaterial = session.newMaterial.includes(pageNumber);

    // Use shared utility function
    return getCurrentSurahForPage(planId, pageNumber, isPageInNewMaterial);
  };

  // Calculate which ayahs to hide on the given page
  const getHiddenAyahsForPage = (pageNumber: number): number[] => {
    if (!memorizationAyahsHidden) return [];

    const pageInfo = quranDataService.getPageInfo(pageNumber);
    if (!pageInfo) return [];

    // Get the session page (what we're supposed to be memorizing)
    const sessionPage = getPageAtIndex(currentIndex);
    if (!sessionPage) return [];

    // Get the surah we're memorizing in this session
    const sessionSurah = getCurrentSurah(sessionPage);
    if (!sessionSurah) return [];

    // Hide only ayahs belonging to the session surah
    return pageInfo.ayahs
      .filter((a: { sura_no: number }) => a.sura_no === sessionSurah)
      .map((a: { aya_no: number }) => a.aya_no);
  };

  const handleReadyToGrade = () => {
    setShowGrading(true);
  };

  const handleGrade = async (grade: 0 | 1 | 2 | 3 | 4 | 5) => {
    if (!session) return;

    const currentPage = getCurrentPage();
    if (!currentPage) return;

    // Calculate time spent (in minutes)
    const timeSpent = reviewStartTime
      ? Math.round((Date.now() - reviewStartTime) / 1000 / 60)
      : 1;

    // Get current progress
    let progress = memorizationPlanService.getProgress(planId, currentPage);
    if (!progress) {
      progress = memorizationPlanService.initializePageProgress(planId, currentPage);
    }

    // Update progress with grade
    const updatedProgress = spacedRepetitionService.updateProgress(progress, grade, timeSpent);
    memorizationPlanService.updateProgress(planId, currentPage, updatedProgress);

    // Update session
    const updatedCompletedReviews = {
      ...session.completedReviews,
      [currentPage]: {
        grade,
        timeSpent,
        recordingId: currentRecordingId || undefined,
      },
    };

    memorizationPlanService.updateSession(planId, session.id, {
      completedReviews: updatedCompletedReviews,
    });

    // Reset recording state
    setCurrentRecordingId(null);
    setShowRecorder(false);

    // Move to next
    if (currentIndex < getTotalItems() - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowGrading(false);
      setReviewStartTime(Date.now());
      setMemorizationAyahsHidden(true); // Reset to hidden for next item

      // Set view page to next session page
      const nextPage = getPageAtIndex(currentIndex + 1);
      if (nextPage) {
        setViewPage(nextPage);
      }
    } else {
      // Session complete
      completeSession();
    }
  };

  const handleRecordingComplete = (recording: Recording) => {
    setCurrentRecordingId(recording.id);
  };

  const completeSession = () => {
    if (!session) return;

    const duration = Math.round((Date.now() - sessionStartTime) / 1000 / 60);
    memorizationPlanService.completeSession(planId, session.id, duration);

    router.push(`/memorization?planId=${planId}`);
  };

  const getCurrentPage = (): number | null => {
    return viewPage;
  };

  const getPageAtIndex = (index: number): number | null => {
    if (!session) return null;

    const allPages = [...session.reviewQueue, ...session.newMaterial];
    return allPages[index] || null;
  };

  const getTotalItems = (): number => {
    if (!session) return 0;
    return session.reviewQueue.length + session.newMaterial.length;
  };

  const isNewMaterial = (): boolean => {
    if (!session) return false;
    return currentIndex >= session.reviewQueue.length;
  };

  const getIntervalPreview = () => {
    if (!session) return {};

    const currentPage = getCurrentPage();
    if (!currentPage) return {};

    let progress = memorizationPlanService.getProgress(planId, currentPage);
    if (!progress) {
      progress = spacedRepetitionService.initializeProgress(currentPage);
    }

    return spacedRepetitionService.getIntervalPreview(progress);
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl" style={{ color: 'var(--dim)', ...uiFont }}>Loading session...</div>
      </div>
    );
  }

  const currentPage = getCurrentPage();
  if (!currentPage) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">&#127881;</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)', ...uiFont }}>
            Session Complete!
          </h2>
          <button
            onClick={() => router.push(`/memorization?planId=${planId}`)}
            className="mt-4 px-6 py-3 text-white rounded-lg"
            style={{ background: 'var(--gold)', ...uiFont }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const intervals = getIntervalPreview();

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="p-4" style={{ background: 'var(--bar-bg)', borderBottom: '1px solid var(--divider)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                {isNewMaterial() ? 'New Material' : 'Review'} &bull; {currentIndex + 1} of {getTotalItems()}
              </div>
              <div className="text-lg font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                Page {currentPage}
              </div>
              {(() => {
                const surahNum = getCurrentSurah(currentPage);
                if (surahNum) {
                  const surahInfo = quranDataService.getSurahInfo(surahNum);
                  if (surahInfo) {
                    return (
                      <div className="text-xs mt-1" style={{ color: 'var(--gold)', ...uiFont }}>
                        Focusing on: {surahInfo.englishName} (Surah {surahNum})
                      </div>
                    );
                  }
                }
                return null;
              })()}
            </div>

            <button
              onClick={() => {
                if (confirm('Are you sure you want to exit? Your progress will be saved.')) {
                  router.push(`/memorization?planId=${planId}`);
                }
              }}
              className="px-4 py-2 rounded"
              style={{ color: 'var(--dim)', ...uiFont }}
            >
              Exit
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="max-w-6xl mx-auto mt-4">
          <div className="w-full rounded-full h-2" style={{ background: 'var(--divider)' }}>
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{ background: 'var(--gold)', width: `${((currentIndex + 1) / getTotalItems()) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div className="flex-1 overflow-y-auto">
        <QuranPageViewer
          pageNumber={currentPage}
          hiddenAyahs={currentPage ? getHiddenAyahsForPage(currentPage) : []}
          onPageChange={(newPage) => setViewPage(newPage)}
        />

        {/* Audio Player */}
        {(() => {
          const sessionPage = getPageAtIndex(currentIndex);
          if (!sessionPage) return null;
          const surahNum = getCurrentSurah(sessionPage);
          if (!surahNum) return null;
          return <AudioPlayer surahNumber={surahNum} />;
        })()}
      </div>

      {/* Action Panel */}
      <div className="p-4" style={{ background: 'var(--bar-bg)', borderTop: '1px solid var(--divider)' }}>
        <div className="max-w-6xl mx-auto">
          {!showGrading ? (
            <div className="space-y-3">
              {/* Recorder Toggle */}
              {showRecorder && (
                <div className="mb-4 p-4 rounded-lg" style={{ background: 'var(--surface)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                      Record Your Recitation
                    </h3>
                    <button
                      onClick={() => setShowRecorder(false)}
                      style={{ color: 'var(--dim)' }}
                    >
                      ✕
                    </button>
                  </div>
                  <VoiceRecorder
                    pageNumber={currentPage}
                    onRecordingComplete={handleRecordingComplete}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setMemorizationAyahsHidden(!memorizationAyahsHidden)}
                  className="py-3 rounded-lg transition-colors"
                  style={{ background: 'var(--surface)', color: 'var(--ink)', ...uiFont }}
                >
                  {memorizationAyahsHidden ? 'Show' : 'Hide'} Ayahs
                </button>

                <button
                  onClick={() => setShowRecorder(!showRecorder)}
                  className="py-3 rounded-lg transition-colors"
                  style={{
                    background: showRecorder ? '#A0522D' : 'var(--surface)',
                    color: showRecorder ? '#fff' : 'var(--ink)',
                    ...uiFont,
                  }}
                >
                  {showRecorder ? 'Close' : 'Record'}
                </button>

                <button
                  onClick={handleReadyToGrade}
                  className="py-3 text-white rounded-lg transition-colors font-medium"
                  style={{ background: 'var(--gold)', ...uiFont }}
                >
                  Grade →
                </button>
              </div>

              <p className="text-sm text-center" style={{ color: 'var(--dim)', ...uiFont }}>
                {isNewMaterial()
                  ? 'Practice this new page, then grade yourself'
                  : currentRecordingId
                  ? 'Recording saved! Ready to grade'
                  : 'Recite from memory, optionally record, then grade'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-center" style={{ color: 'var(--ink)', ...uiFont }}>
                How well did you remember?
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => handleGrade(1)}
                  className="py-4 px-3 text-white rounded-lg transition-colors"
                  style={{ background: '#A0522D', ...uiFont }}
                >
                  <div className="font-bold text-lg">Again</div>
                  <div className="text-xs mt-1">Couldn&apos;t recall</div>
                  <div className="text-xs mt-2 opacity-75">Next: {intervals.again || 1}d</div>
                </button>

                <button
                  onClick={() => handleGrade(3)}
                  className="py-4 px-3 text-white rounded-lg transition-colors"
                  style={{ background: '#C49A3C', ...uiFont }}
                >
                  <div className="font-bold text-lg">Hard</div>
                  <div className="text-xs mt-1">With difficulty</div>
                  <div className="text-xs mt-2 opacity-75">Next: {intervals.hard || 1}d</div>
                </button>

                <button
                  onClick={() => handleGrade(4)}
                  className="py-4 px-3 text-white rounded-lg transition-colors"
                  style={{ background: 'var(--gold)', ...uiFont }}
                >
                  <div className="font-bold text-lg">Good</div>
                  <div className="text-xs mt-1">Some effort</div>
                  <div className="text-xs mt-2 opacity-75">Next: {intervals.good || 6}d</div>
                </button>

                <button
                  onClick={() => handleGrade(5)}
                  className="py-4 px-3 text-white rounded-lg transition-colors"
                  style={{ background: '#6B8E4E', ...uiFont }}
                >
                  <div className="font-bold text-lg">Easy</div>
                  <div className="text-xs mt-1">Perfect recall</div>
                  <div className="text-xs mt-2 opacity-75">Next: {intervals.easy || 15}d</div>
                </button>
              </div>

              <button
                onClick={() => setShowGrading(false)}
                className="w-full py-2 rounded transition-colors"
                style={{ color: 'var(--dim)', ...uiFont }}
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
