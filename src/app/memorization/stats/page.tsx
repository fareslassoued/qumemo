'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { MemorizationStats } from '@/types/memorization';

export default function StatsPage() {
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
        <div className="text-xl text-gray-600 dark:text-gray-400">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
              📊 Statistics & Progress
            </h1>
            <button
              onClick={() => router.push(`/memorization?planId=${planId}`)}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-center">
            <div className="text-4xl font-bold text-green-600 dark:text-green-400">
              {stats.masteredPages}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Pages Mastered
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-center">
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">
              {stats.reviewPages}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              In Review
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-center">
            <div className="text-4xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.learningPages}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Learning
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-center">
            <div className="text-4xl font-bold text-gray-600 dark:text-gray-400">
              {stats.newPages}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Not Started
            </div>
          </div>
        </div>

        {/* Detailed Stats */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-6">
            Performance Metrics
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Retention Rate</span>
              <span className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                {Math.round(stats.averageRetentionRate)}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Total Study Time</span>
              <span className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                {Math.round(stats.totalStudyTime)} min
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Average Session</span>
              <span className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                {Math.round(stats.averageSessionDuration)} min
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Current Streak</span>
              <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {stats.currentStreak} 🔥
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Longest Streak</span>
              <span className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                {stats.longestStreak} days
              </span>
            </div>
          </div>
        </div>

        {/* Projection */}
        {stats.projectedCompletionDate && (
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg shadow-md p-6 text-white">
            <h2 className="text-xl font-bold mb-2">
              🎯 Projected Completion
            </h2>
            <p className="text-3xl font-bold">
              {stats.projectedCompletionDate.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            <p className="text-sm mt-2 opacity-90">
              Based on your current pace and daily goal
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
