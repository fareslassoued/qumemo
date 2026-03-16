'use client';

import React, { useState, useEffect } from 'react';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { reviewQueueService } from '@/services/reviewQueueService';
import { quranDataService } from '@/services/quranDataService';
import { MemorizationPlan, MemorizationStats } from '@/types/memorization';
import { useRouter } from 'next/navigation';
import { getNextSurahToMemorize } from '@/utils/surahDetection';

const uiFont = { fontFamily: "var(--font-garamond), Georgia, serif" };

interface MemorizationDashboardProps {
  plan: MemorizationPlan;
}

export function MemorizationDashboard({ plan }: MemorizationDashboardProps) {
  const router = useRouter();
  const [stats, setStats] = useState<MemorizationStats | null>(null);
  const [todaySummary, setTodaySummary] = useState<{
    reviewsTotal: number;
    reviewsOverdue: number;
    reviewsCritical: number;
    newMaterial: number[];
    hasSession: boolean;
    nextSessionDate: Date | null;
  } | null>(null);

  const loadData = () => {
    const planStats = memorizationPlanService.getStatistics(plan.id);
    const summary = reviewQueueService.getTodaySummary(plan.id);
    setStats(planStats);
    setTodaySummary(summary);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);

  const handleStartSession = () => {
    router.push(`/memorization/review?planId=${plan.id}`);
  };

  const handleViewStats = () => {
    router.push(`/memorization/stats?planId=${plan.id}`);
  };

  if (!stats || !todaySummary) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl" style={{ color: 'var(--dim)', ...uiFont }}>Loading...</div>
      </div>
    );
  }

  const hasWork = todaySummary.reviewsTotal > 0 || todaySummary.newMaterial.length > 0;

  // Get current surah info
  const getCurrentSurahInfo = (): {
    number: number;
    name: string;
    nameArabic: string;
    englishName: string;
    englishNameTranslation: string;
    revelationType: 'Meccan' | 'Medinan';
    numberOfAyahs: number;
    totalPages: number;
    completedPages: number;
    progress: number;
  } | null => {
    const allProgress = memorizationPlanService.getAllProgress(plan.id);

    // Use shared utility function
    const nextSurah = getNextSurahToMemorize(plan.id, plan.direction);
    if (!nextSurah) return null;

    const surahInfo = quranDataService.getSurahInfo(nextSurah);
    if (!surahInfo) return null;

    const surahPages = quranDataService.getSurahPages(nextSurah);
    const completedPages = allProgress.filter(p =>
      surahPages.includes(p.pageNumber) && p.status === 'mastered'
    ).length;

    return {
      ...surahInfo,
      totalPages: surahPages.length,
      completedPages,
      progress: Math.round((completedPages / surahPages.length) * 100),
    };
  };

  const currentSurahInfo = getCurrentSurahInfo();

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div
          className="rounded-lg p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--ink)', ...uiFont }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h1>
              <p className="mt-1" style={{ color: 'var(--dim)', ...uiFont }}>{plan.name}</p>
            </div>
            {plan.currentStreak > 0 && (
              <div className="text-right">
                <div className="text-3xl sm:text-4xl" style={{ color: 'var(--gold)' }}>&#9733;</div>
                <div className="text-sm font-medium" style={{ color: 'var(--dim)', ...uiFont }}>
                  {plan.currentStreak} day streak
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#6B8E4E' }}>
                {stats.masteredPages}
              </div>
              <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>Mastered</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
                {stats.reviewPages}
              </div>
              <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>In Review</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#C49A3C' }}>
                {stats.learningPages}
              </div>
              <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>Learning</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: 'var(--dim)' }}>
                {Math.round(plan.completionPercentage)}%
              </div>
              <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>Complete</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="w-full rounded-full h-3" style={{ background: 'var(--divider)' }}>
              <div
                className="h-3 rounded-full transition-all duration-500"
                style={{ background: 'var(--gold)', width: `${plan.completionPercentage}%` }}
              />
            </div>
            <p className="text-xs mt-2 text-center" style={{ color: 'var(--dim)', ...uiFont }}>
              {stats.masteredPages} of {stats.totalPages} pages mastered
            </p>
          </div>
        </div>

        {/* Current Surah Progress */}
        {currentSurahInfo && (
          <div
            className="rounded-lg p-6"
            style={{ background: 'var(--surface)', borderLeft: '3px solid var(--gold)', border: '1px solid var(--divider)', borderLeftWidth: '3px', borderLeftColor: 'var(--gold)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--gold)', ...uiFont }}>
                  Current Surah {plan.direction === 'backward' && '(Memorizing from beginning →)'}
                </div>
                <h2 className="text-2xl font-bold mt-1" style={{ color: 'var(--ink)', ...uiFont }}>
                  {currentSurahInfo.number}. {currentSurahInfo.englishName}
                </h2>
                <div className="text-lg mt-1" style={{ color: 'var(--dim)' }}>
                  {currentSurahInfo.nameArabic}
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold" style={{ color: 'var(--gold)' }}>
                  {currentSurahInfo.progress}%
                </div>
                <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>
                  Complete
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4 text-center">
              <div>
                <div className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                  {currentSurahInfo.numberOfAyahs}
                </div>
                <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>Ayahs</div>
              </div>
              <div>
                <div className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                  {currentSurahInfo.completedPages}/{currentSurahInfo.totalPages}
                </div>
                <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>Pages</div>
              </div>
              <div>
                <div className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                  {currentSurahInfo.revelationType}
                </div>
                <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>Type</div>
              </div>
            </div>

            {plan.direction === 'backward' && (
              <div className="mt-3 text-xs text-center rounded-lg py-2" style={{ background: 'var(--gold-glow)', color: 'var(--ink)', ...uiFont }}>
                Each surah is memorized from its beginning, even though your plan moves backward through the Quran
              </div>
            )}

            <div className="mt-4">
              <div className="w-full rounded-full h-2" style={{ background: 'var(--divider)' }}>
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{ background: 'var(--gold)', width: `${currentSurahInfo.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Today's Session */}
        <div
          className="rounded-lg p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--ink)', ...uiFont }}>
            Today&apos;s Session
          </h2>

          {hasWork ? (
            <div className="space-y-4">
              {/* Reviews */}
              {todaySummary.reviewsTotal > 0 && (
                <div className="rounded-lg p-4" style={{ background: 'var(--gold-glow)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                          Reviews Due: {todaySummary.reviewsTotal} page{todaySummary.reviewsTotal !== 1 ? 's' : ''}
                        </div>
                        {todaySummary.reviewsOverdue > 0 && (
                          <div className="text-sm" style={{ color: '#A0522D', ...uiFont }}>
                            {todaySummary.reviewsOverdue} overdue
                          </div>
                        )}
                        {todaySummary.reviewsCritical > 0 && (
                          <div className="text-sm" style={{ color: '#C49A3C', ...uiFont }}>
                            {todaySummary.reviewsCritical} critical
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* New Material */}
              {todaySummary.newMaterial.length > 0 && (() => {
                // Use the same logic as getCurrentSurahInfo to find the correct next surah
                const surahNum = currentSurahInfo?.number || null;
                const surahInfo = surahNum ? quranDataService.getSurahInfo(surahNum) : null;

                return (
                  <div className="rounded-lg p-4" style={{ background: 'var(--gold-glow)' }}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                          New Material Ready
                        </div>
                        {surahInfo && (
                          <div className="text-sm" style={{ color: 'var(--gold)', ...uiFont }}>
                            {surahInfo.englishName} ({surahInfo.nameArabic})
                          </div>
                        )}
                        <div className="text-xs mt-1" style={{ color: 'var(--dim)', ...uiFont }}>
                          Page {todaySummary.newMaterial.join(', ')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Start Button */}
              <button
                onClick={handleStartSession}
                className="w-full py-4 text-white font-semibold rounded-lg transition-all"
                style={{ background: 'var(--gold)', ...uiFont }}
              >
                {todaySummary.hasSession ? 'Continue Session →' : 'Start Session →'}
              </button>

              {todaySummary.hasSession && (
                <div className="text-center space-y-2">
                  <p className="text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                    You have an active session from earlier today
                  </p>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => {
                        if (confirm('Mark current session as complete? This will count it as finished.')) {
                          const session = memorizationPlanService.getTodaySession(plan.id);
                          if (session) {
                            memorizationPlanService.completeSession(plan.id, session.id, 0);
                            loadData();
                          }
                        }
                      }}
                      className="text-sm px-3 py-1 rounded"
                      style={{ background: 'var(--gold-glow)', color: '#6B8E4E', ...uiFont }}
                    >
                      Mark Done
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Start a fresh session? This will mark your current session as skipped and create a new one with the latest review queue.')) {
                          // Mark current session as skipped
                          const session = memorizationPlanService.getTodaySession(plan.id);
                          if (session) {
                            memorizationPlanService.updateSession(plan.id, session.id, {
                              skipped: true,
                              completed: true,
                              completedAt: new Date()
                            });
                          }

                          // Force create new session
                          const reviewQueue = reviewQueueService.generateTodayQueue(plan.id);
                          const newMaterial = reviewQueueService.getNextNewMaterial(plan.id);
                          memorizationPlanService.createSession(
                            plan.id,
                            reviewQueue.map(r => r.pageNumber),
                            newMaterial
                          );

                          // Reload and start new session
                          loadData();
                          setTimeout(() => handleStartSession(), 100);
                        }
                      }}
                      className="text-sm px-3 py-1 rounded"
                      style={{ background: 'var(--gold-glow)', color: 'var(--gold)', ...uiFont }}
                    >
                      Start Fresh Session
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">&#127881;</div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)', ...uiFont }}>
                All Caught Up!
              </h3>
              <p style={{ color: 'var(--dim)', ...uiFont }}>
                No reviews due today. Great work on staying consistent!
              </p>
              {todaySummary.nextSessionDate && (
                <div className="mt-4 p-3 rounded-lg inline-block" style={{ background: 'var(--gold-glow)' }}>
                  <div className="text-sm" style={{ color: 'var(--gold)', ...uiFont }}>
                    Next Session Due
                  </div>
                  <div className="text-lg font-semibold mt-1" style={{ color: 'var(--ink)', ...uiFont }}>
                    {todaySummary.nextSessionDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--dim)', ...uiFont }}>
                    {Math.ceil((todaySummary.nextSessionDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} day{Math.ceil((todaySummary.nextSessionDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) !== 1 ? 's' : ''} from now
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Statistics Overview */}
        <div
          className="rounded-lg p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: 'var(--ink)', ...uiFont }}>
              Statistics
            </h2>
            <button
              onClick={handleViewStats}
              className="text-sm hover:underline"
              style={{ color: 'var(--gold)', ...uiFont }}
            >
              View Details →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg p-4" style={{ background: 'var(--gold-glow)' }}>
              <div className="text-sm mb-1" style={{ color: 'var(--dim)', ...uiFont }}>
                Retention Rate
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {Math.round(stats.averageRetentionRate)}%
              </div>
            </div>

            <div className="rounded-lg p-4" style={{ background: 'var(--gold-glow)' }}>
              <div className="text-sm mb-1" style={{ color: 'var(--dim)', ...uiFont }}>
                Study Time
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {Math.round(stats.totalStudyTime)} min
              </div>
            </div>

            <div className="rounded-lg p-4" style={{ background: 'var(--gold-glow)' }}>
              <div className="text-sm mb-1" style={{ color: 'var(--dim)', ...uiFont }}>
                Longest Streak
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {stats.longestStreak} days
              </div>
            </div>

            <div className="rounded-lg p-4" style={{ background: 'var(--gold-glow)' }}>
              <div className="text-sm mb-1" style={{ color: 'var(--dim)', ...uiFont }}>
                Avg Session
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {Math.round(stats.averageSessionDuration)} min
              </div>
            </div>
          </div>

          {stats.projectedCompletionDate && (
            <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--gold-glow)', border: '1px solid var(--gold)' }}>
              <div className="text-sm" style={{ color: 'var(--gold)', ...uiFont }}>
                Projected Completion
              </div>
              <div className="text-lg font-semibold mt-1" style={{ color: 'var(--ink)', ...uiFont }}>
                {stats.projectedCompletionDate.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
          )}
        </div>

        {/* Plan Settings */}
        <div
          className="rounded-lg p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--ink)', ...uiFont }}>
            Plan Settings
          </h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Direction:</span>
              <span className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                {plan.direction === 'forward' ? 'Beginning → End' : 'End → Beginning'}
              </span>
            </div>

            <div className="flex justify-between">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Daily Goal:</span>
              <span className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                {plan.dailyGoal.type === 'full-page' && 'Full Page'}
                {plan.dailyGoal.type === 'half-page' && 'Half Page'}
                {plan.dailyGoal.type === 'quarter-page' && 'Quarter Page'}
                {plan.dailyGoal.type === 'custom-lines' && `${plan.dailyGoal.linesPerDay} Lines`}
              </span>
            </div>

            <div className="flex justify-between">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Study Time:</span>
              <span className="font-medium capitalize" style={{ color: 'var(--ink)', ...uiFont }}>
                {plan.studyTime}
              </span>
            </div>

            <div className="flex justify-between">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Started:</span>
              <span className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                {plan.startDate.toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid var(--divider)' }}>
            {plan.pausedAt ? (
              <button
                onClick={() => {
                  memorizationPlanService.resumePlan(plan.id);
                  window.location.reload();
                }}
                className="w-full py-2 text-white rounded transition-colors"
                style={{ background: '#6B8E4E', ...uiFont }}
              >
                Resume Plan
              </button>
            ) : (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to pause this plan?')) {
                    memorizationPlanService.pausePlan(plan.id);
                    window.location.reload();
                  }
                }}
                className="w-full py-2 rounded transition-colors"
                style={{ color: 'var(--gold)', ...uiFont }}
              >
                Pause Plan
              </button>
            )}

            <button
              onClick={() => {
                if (confirm('Reset ALL progress? This cannot be undone!\n\nThis will:\n- Delete all your review history\n- Reset all page progress to new\n- Clear all statistics\n- Keep your plan settings')) {
                  memorizationPlanService.resetProgress(plan.id);
                  window.location.reload();
                }
              }}
              className="w-full py-2 rounded transition-colors"
              style={{ color: '#A0522D', ...uiFont }}
            >
              Reset All Progress
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
