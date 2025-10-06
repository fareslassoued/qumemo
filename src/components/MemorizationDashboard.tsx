'use client';

import React, { useState, useEffect } from 'react';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { reviewQueueService } from '@/services/reviewQueueService';
import { MemorizationPlan, MemorizationStats } from '@/types/memorization';
import { useRouter } from 'next/navigation';

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
  } | null>(null);

  useEffect(() => {
    loadData();
  }, [plan.id]);

  const loadData = () => {
    const planStats = memorizationPlanService.getStatistics(plan.id);
    const summary = reviewQueueService.getTodaySummary(plan.id);
    setStats(planStats);
    setTodaySummary(summary);
  };

  const handleStartSession = () => {
    router.push(`/memorization/review?planId=${plan.id}`);
  };

  const handleViewStats = () => {
    router.push(`/memorization/stats?planId=${plan.id}`);
  };

  if (!stats || !todaySummary) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const hasWork = todaySummary.reviewsTotal > 0 || todaySummary.newMaterial.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">{plan.name}</p>
            </div>
            {plan.currentStreak > 0 && (
              <div className="text-right">
                <div className="text-3xl sm:text-4xl">🔥</div>
                <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {plan.currentStreak} day streak
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {stats.masteredPages}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Mastered</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats.reviewPages}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">In Review</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {stats.learningPages}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Learning</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                {Math.round(plan.completionPercentage)}%
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Complete</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${plan.completionPercentage}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 text-center">
              {stats.masteredPages} of {stats.totalPages} pages mastered
            </p>
          </div>
        </div>

        {/* Today's Session */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">
            📚 Today&apos;s Session
          </h2>

          {hasWork ? (
            <div className="space-y-4">
              {/* Reviews */}
              {todaySummary.reviewsTotal > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">⏰</span>
                      <div>
                        <div className="font-semibold text-blue-900 dark:text-blue-100">
                          Reviews Due: {todaySummary.reviewsTotal} page{todaySummary.reviewsTotal !== 1 ? 's' : ''}
                        </div>
                        {todaySummary.reviewsOverdue > 0 && (
                          <div className="text-sm text-red-700 dark:text-red-300">
                            ⚠️ {todaySummary.reviewsOverdue} overdue
                          </div>
                        )}
                        {todaySummary.reviewsCritical > 0 && (
                          <div className="text-sm text-orange-700 dark:text-orange-300">
                            🔴 {todaySummary.reviewsCritical} critical
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* New Material */}
              {todaySummary.newMaterial.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">✨</span>
                    <div>
                      <div className="font-semibold text-green-900 dark:text-green-100">
                        New Material Ready
                      </div>
                      <div className="text-sm text-green-700 dark:text-green-300">
                        Page {todaySummary.newMaterial.join(', ')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Start Button */}
              <button
                onClick={handleStartSession}
                className="w-full py-4 bg-gradient-to-r from-blue-500 to-green-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-green-600 transition-all transform hover:scale-105 shadow-lg"
              >
                Start Session →
              </button>

              {todaySummary.hasSession && (
                <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                  Continue your session from earlier today
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                All Caught Up!
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                No reviews due today. Great work on staying consistent!
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
                Come back tomorrow for your next session
              </p>
            </div>
          )}
        </div>

        {/* Statistics Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
              📊 Statistics
            </h2>
            <button
              onClick={handleViewStats}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              View Details →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Retention Rate
              </div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                {Math.round(stats.averageRetentionRate)}%
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Study Time
              </div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                {Math.round(stats.totalStudyTime)} min
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Longest Streak
              </div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                {stats.longestStreak} days
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Avg Session
              </div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                {Math.round(stats.averageSessionDuration)} min
              </div>
            </div>
          </div>

          {stats.projectedCompletionDate && (
            <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900 rounded-lg">
              <div className="text-sm text-purple-700 dark:text-purple-300">
                📅 Projected Completion
              </div>
              <div className="text-lg font-semibold text-purple-900 dark:text-purple-100 mt-1">
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
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">
            ⚙️ Plan Settings
          </h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Direction:</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {plan.direction === 'forward' ? 'Beginning → End' : 'End → Beginning'}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Daily Goal:</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {plan.dailyGoal.type === 'full-page' && 'Full Page'}
                {plan.dailyGoal.type === 'half-page' && 'Half Page'}
                {plan.dailyGoal.type === 'quarter-page' && 'Quarter Page'}
                {plan.dailyGoal.type === 'custom-lines' && `${plan.dailyGoal.linesPerDay} Lines`}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Study Time:</span>
              <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">
                {plan.studyTime}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Started:</span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {plan.startDate.toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                if (confirm('Are you sure you want to pause this plan?')) {
                  memorizationPlanService.pausePlan(plan.id);
                  window.location.reload();
                }
              }}
              className="w-full py-2 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900 rounded transition-colors"
            >
              Pause Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
