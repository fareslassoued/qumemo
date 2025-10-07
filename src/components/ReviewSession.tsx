'use client';

import React, { useState, useEffect } from 'react';
import { QuranPageViewer } from './QuranPageViewer';
import { VoiceRecorder } from './VoiceRecorder';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { reviewQueueService } from '@/services/reviewQueueService';
import { spacedRepetitionService } from '@/services/spacedRepetitionService';
import { StudySession, Recording } from '@/types/memorization';
import { useRouter } from 'next/navigation';

interface ReviewSessionProps {
  planId: string;
}

export function ReviewSession({ planId }: ReviewSessionProps) {
  const router = useRouter();
  const [session, setSession] = useState<StudySession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showGrading, setShowGrading] = useState(false);
  const [hiddenAyahs, setHiddenAyahs] = useState<number[]>([]);
  const [sessionStartTime] = useState(Date.now());
  const [reviewStartTime, setReviewStartTime] = useState<number | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);

  useEffect(() => {
    loadSession();
  }, [planId]);

  const loadSession = () => {
    const todaySession = reviewQueueService.getOrCreateTodaySession(planId);
    setSession(todaySession);

    // Auto-hide all ayahs for first page
    if (todaySession.reviewQueue.length > 0) {
      const firstPage = todaySession.reviewQueue[0];
      hideAllAyahsOnPage(firstPage);
      setReviewStartTime(Date.now());
    }
  };

  const hideAllAyahsOnPage = (pageNumber: number) => {
    const pageInfo = require('@/services/quranDataService').quranDataService.getPageInfo(pageNumber);
    if (pageInfo) {
      setHiddenAyahs(pageInfo.ayahs.map((a: { aya_no: number }) => a.aya_no));
    }
  };

  const handleRevealAyahs = () => {
    setHiddenAyahs([]);
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

      // Auto-hide ayahs for next page
      const nextPage = getPageAtIndex(currentIndex + 1);
      if (nextPage) {
        hideAllAyahsOnPage(nextPage);
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
    return getPageAtIndex(currentIndex);
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
        <div className="text-xl text-gray-600 dark:text-gray-400">Loading session...</div>
      </div>
    );
  }

  const currentPage = getCurrentPage();
  if (!currentPage) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
            Session Complete!
          </h2>
          <button
            onClick={() => router.push(`/memorization?planId=${planId}`)}
            className="mt-4 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
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
      <div className="bg-white dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {isNewMaterial() ? '✨ New Material' : '⏰ Review'} • {currentIndex + 1} of {getTotalItems()}
            </div>
            <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Page {currentPage}
            </div>
          </div>

          <button
            onClick={() => {
              if (confirm('Are you sure you want to exit? Your progress will be saved.')) {
                router.push(`/memorization?planId=${planId}`);
              }
            }}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            Exit
          </button>
        </div>

        {/* Progress Bar */}
        <div className="max-w-6xl mx-auto mt-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / getTotalItems()) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div className="flex-1 overflow-hidden">
        <QuranPageViewer
          pageNumber={currentPage}
          memorizationMode={true}
          hiddenAyahs={hiddenAyahs}
          onAyahClick={(ayah) => {
            // Toggle ayah visibility
            setHiddenAyahs(prev =>
              prev.includes(ayah.aya_no)
                ? prev.filter(n => n !== ayah.aya_no)
                : [...prev, ayah.aya_no]
            );
          }}
        />
      </div>

      {/* Action Panel */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 p-4">
        <div className="max-w-6xl mx-auto">
          {!showGrading ? (
            <div className="space-y-3">
              {/* Recorder Toggle */}
              {showRecorder && (
                <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-800 dark:text-gray-200">
                      Record Your Recitation
                    </h3>
                    <button
                      onClick={() => setShowRecorder(false)}
                      className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={handleRevealAyahs}
                  className="py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  👁️ Reveal
                </button>

                <button
                  onClick={() => {
                    hideAllAyahsOnPage(currentPage);
                  }}
                  className="py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  🙈 Hide All
                </button>

                <button
                  onClick={() => setShowRecorder(!showRecorder)}
                  className={`py-3 rounded-lg transition-colors ${
                    showRecorder
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  🎤 {showRecorder ? 'Close' : 'Record'}
                </button>

                <button
                  onClick={handleReadyToGrade}
                  className="py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  Grade →
                </button>
              </div>

              <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                {isNewMaterial()
                  ? 'Practice this new page, then grade yourself'
                  : currentRecordingId
                  ? '✅ Recording saved! Ready to grade'
                  : 'Recite from memory, optionally record, then grade'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-center text-gray-800 dark:text-gray-200">
                How well did you remember?
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => handleGrade(1)}
                  className="py-4 px-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <div className="font-bold text-lg">Again</div>
                  <div className="text-xs mt-1">Couldn&apos;t recall</div>
                  <div className="text-xs mt-2 opacity-75">Next: {intervals.again || 1}d</div>
                </button>

                <button
                  onClick={() => handleGrade(3)}
                  className="py-4 px-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  <div className="font-bold text-lg">Hard</div>
                  <div className="text-xs mt-1">With difficulty</div>
                  <div className="text-xs mt-2 opacity-75">Next: {intervals.hard || 1}d</div>
                </button>

                <button
                  onClick={() => handleGrade(4)}
                  className="py-4 px-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <div className="font-bold text-lg">Good</div>
                  <div className="text-xs mt-1">Some effort</div>
                  <div className="text-xs mt-2 opacity-75">Next: {intervals.good || 6}d</div>
                </button>

                <button
                  onClick={() => handleGrade(5)}
                  className="py-4 px-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  <div className="font-bold text-lg">Easy</div>
                  <div className="text-xs mt-1">Perfect recall</div>
                  <div className="text-xs mt-2 opacity-75">Next: {intervals.easy || 15}d</div>
                </button>
              </div>

              <button
                onClick={() => setShowGrading(false)}
                className="w-full py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
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
