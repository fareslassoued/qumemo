'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { MemorizationStats } from '@/types/memorization';

const uiFont = { fontFamily: "var(--font-garamond), Georgia, serif" };

function StatsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [planId, setPlanId] = useState<string | null>(null);
  const [stats, setStats] = useState<MemorizationStats | null>(null);

  useEffect(() => {
    const id = searchParams.get('planId');
    setPlanId(id);

    if (id) {
      const planStats = memorizationPlanService.getStatistics(id);
      setStats(planStats);
    }
  }, [searchParams]);

  if (!planId || !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl" style={{ color: 'var(--dim)', ...uiFont }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div
          className="rounded-lg p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)', ...uiFont }}>
              Statistics & Progress
            </h1>
            <button
              onClick={() => router.push(`/memorization?planId=${planId}`)}
              className="hover:underline"
              style={{ color: 'var(--gold)', ...uiFont }}
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div
            className="rounded-lg p-6 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
          >
            <div className="text-4xl font-bold" style={{ color: '#6B8E4E' }}>
              {stats.masteredPages}
            </div>
            <div className="text-sm mt-2" style={{ color: 'var(--dim)', ...uiFont }}>
              Pages Mastered
            </div>
          </div>

          <div
            className="rounded-lg p-6 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
          >
            <div className="text-4xl font-bold" style={{ color: 'var(--gold)' }}>
              {stats.reviewPages}
            </div>
            <div className="text-sm mt-2" style={{ color: 'var(--dim)', ...uiFont }}>
              In Review
            </div>
          </div>

          <div
            className="rounded-lg p-6 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
          >
            <div className="text-4xl font-bold" style={{ color: '#C49A3C' }}>
              {stats.learningPages}
            </div>
            <div className="text-sm mt-2" style={{ color: 'var(--dim)', ...uiFont }}>
              Learning
            </div>
          </div>

          <div
            className="rounded-lg p-6 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
          >
            <div className="text-4xl font-bold" style={{ color: 'var(--dim)' }}>
              {stats.newPages}
            </div>
            <div className="text-sm mt-2" style={{ color: 'var(--dim)', ...uiFont }}>
              Not Started
            </div>
          </div>
        </div>

        {/* Detailed Stats */}
        <div
          className="rounded-lg p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--ink)', ...uiFont }}>
            Performance Metrics
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Retention Rate</span>
              <span className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {Math.round(stats.averageRetentionRate)}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Total Study Time</span>
              <span className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {Math.round(stats.totalStudyTime)} min
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Average Session</span>
              <span className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {Math.round(stats.averageSessionDuration)} min
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Current Streak</span>
              <span className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
                {stats.currentStreak} days
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--dim)', ...uiFont }}>Longest Streak</span>
              <span className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {stats.longestStreak} days
              </span>
            </div>
          </div>
        </div>

        {/* Projection */}
        {stats.projectedCompletionDate && (
          <div
            className="rounded-lg p-6"
            style={{ background: 'var(--gold-glow)', border: '1px solid var(--gold)' }}
          >
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)', ...uiFont }}>
              Projected Completion
            </h2>
            <p className="text-3xl font-bold" style={{ color: 'var(--gold)' }}>
              {stats.projectedCompletionDate.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            <p className="text-sm mt-2" style={{ color: 'var(--dim)', ...uiFont }}>
              Based on your current pace and daily goal
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl" style={{ color: 'var(--dim)', ...uiFont }}>
          Loading...
        </div>
      </div>
    }>
      <StatsPageContent />
    </Suspense>
  );
}
