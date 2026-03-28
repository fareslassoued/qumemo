'use client';

import React, { useState, useEffect } from 'react';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { bilQuranService } from '@/services/bilQuranService';
import { sessionService } from '@/services/sessionService';
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
    reviewChunk: { chunkId: string; surahNumber: number; pages: number[] } | null;
    newMaterial: { pageNumber: number } | null;
    hasActiveSession: boolean;
  } | null>(null);

  // Current page's ritual progress (for showing dots)
  const [currentRitual, setCurrentRitual] = useState<{
    listenCount: number;
    readCount: number;
    reciteCount: number;
  } | null>(null);

  const loadData = () => {
    const planStats = bilQuranService.getStatistics(plan.id);
    const summary = sessionService.getTodaySummary(plan.id);
    setStats(planStats);
    setTodaySummary(summary);

    // Load ritual progress for today's new material
    if (summary.newMaterial) {
      const progress = bilQuranService.getProgress(plan.id, summary.newMaterial.pageNumber);
      if (progress && progress.status === 'in-ritual') {
        setCurrentRitual({
          listenCount: progress.ritual.listenCount,
          readCount: progress.ritual.readCount,
          reciteCount: progress.ritual.reciteCount,
        });
      }
    }
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

  const hasWork = todaySummary.reviewChunk !== null || todaySummary.newMaterial !== null;

  // Get current surah info
  const getCurrentSurahInfo = () => {
    const allProgress = bilQuranService.getAllProgress(plan.id);
    const nextSurah = getNextSurahToMemorize(plan.id, plan.direction);
    if (!nextSurah) return null;

    const surahInfo = quranDataService.getSurahInfo(nextSurah);
    if (!surahInfo) return null;

    const surahPages = quranDataService.getSurahPages(nextSurah);
    const completedPages = allProgress.filter(p =>
      surahPages.includes(p.pageNumber) && p.status === 'memorized'
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
            {stats.currentStreak > 0 && (
              <div className="text-right">
                <div className="text-3xl sm:text-4xl" style={{ color: 'var(--gold)' }}>&#9733;</div>
                <div className="text-sm font-medium" style={{ color: 'var(--dim)', ...uiFont }}>
                  {stats.currentStreak} day streak
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#6B8E4E' }}>
                {stats.memorizedPages}
              </div>
              <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>Memorized</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
                {stats.inRitualPages}
              </div>
              <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>In Ritual</div>
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
              {stats.memorizedPages} of {stats.totalPages} pages memorized
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
                  Current Surah
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
                <div className="text-xs" style={{ color: 'var(--dim)', ...uiFont }}>Complete</div>
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
              {/* Review Chunk */}
              {todaySummary.reviewChunk && (() => {
                const surahInfo = quranDataService.getSurahInfo(todaySummary.reviewChunk.surahNumber);
                return (
                  <div className="rounded-lg p-4" style={{ background: 'var(--gold-glow)' }}>
                    <div className="font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                      Review: {surahInfo?.englishName || `Surah ${todaySummary.reviewChunk.surahNumber}`}
                    </div>
                    <div className="text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                      {todaySummary.reviewChunk.pages.length} page{todaySummary.reviewChunk.pages.length !== 1 ? 's' : ''} — Page{todaySummary.reviewChunk.pages.length > 1 ? 's' : ''} {todaySummary.reviewChunk.pages.join(', ')}
                    </div>
                  </div>
                );
              })()}

              {/* New Material */}
              {todaySummary.newMaterial && (() => {
                const surahNum = currentSurahInfo?.number || null;
                const surahInfo = surahNum ? quranDataService.getSurahInfo(surahNum) : null;

                return (
                  <div className="rounded-lg p-4" style={{ background: 'var(--gold-glow)' }}>
                    <div className="font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                      New: Page {todaySummary.newMaterial.pageNumber}
                    </div>
                    {surahInfo && (
                      <div className="text-sm" style={{ color: 'var(--gold)', ...uiFont }}>
                        {surahInfo.englishName} ({surahInfo.nameArabic})
                      </div>
                    )}

                    {/* Ritual progress dots */}
                    {currentRitual && (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-12" style={{ color: 'var(--dim)', ...uiFont }}>Listen</span>
                          <div className="flex gap-1">
                            {Array.from({ length: 2 }).map((_, i) => (
                              <div key={i} className="w-2.5 h-2.5 rounded-full" style={{
                                background: i < currentRitual.listenCount ? 'var(--gold)' : 'var(--divider)',
                              }} />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-12" style={{ color: 'var(--dim)', ...uiFont }}>Read</span>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 15 }).map((_, i) => (
                              <div key={i} className="w-2 h-2 rounded-full" style={{
                                background: i < currentRitual.readCount ? 'var(--gold)' : 'var(--divider)',
                              }} />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-12" style={{ color: 'var(--dim)', ...uiFont }}>Recite</span>
                          <div className="flex gap-1">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} className="w-2.5 h-2.5 rounded-full" style={{
                                background: i < currentRitual.reciteCount ? '#6B8E4E' : 'var(--divider)',
                              }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Start Button */}
              <button
                onClick={handleStartSession}
                className="w-full py-4 text-white font-semibold rounded-lg transition-all"
                style={{ background: 'var(--gold)', ...uiFont }}
              >
                {todaySummary.hasActiveSession ? 'Continue Session →' : 'Start Session →'}
              </button>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">&#127881;</div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--ink)', ...uiFont }}>
                All Caught Up!
              </h3>
              <p style={{ color: 'var(--dim)', ...uiFont }}>
                No new material or reviews for today. Come back tomorrow!
              </p>
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
                Review Cycle
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {stats.rotationCycleLength} days
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
                Current Streak
              </div>
              <div className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
                {stats.currentStreak} days
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
              <span style={{ color: 'var(--dim)', ...uiFont }}>Method:</span>
              <span className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                بالقرآن نحيا
              </span>
            </div>

            <div className="flex justify-between">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Direction:</span>
              <span className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                {plan.direction === 'forward' ? 'Beginning → End' : 'End → Beginning'}
              </span>
            </div>

            <div className="flex justify-between">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Daily Goal:</span>
              <span className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                Half Page
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
                {new Date(plan.startDate).toLocaleDateString()}
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
                if (confirm('Reset ALL progress? This cannot be undone!\n\nThis will:\n- Delete all your review history\n- Reset all page progress\n- Clear review rotation\n- Keep your plan settings')) {
                  memorizationPlanService.resetProgress(plan.id);
                  bilQuranService.deleteRotation(plan.id);
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
