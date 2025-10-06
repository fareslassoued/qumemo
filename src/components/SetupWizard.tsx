'use client';

import React, { useState } from 'react';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { MemorizationPlan } from '@/types/memorization';

interface SetupWizardProps {
  onComplete: (plan: MemorizationPlan) => void;
  onCancel?: () => void;
}

export function SetupWizard({ onComplete, onCancel }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [planData, setPlanData] = useState({
    name: 'My Quran Memorization Plan',
    direction: 'forward' as 'forward' | 'backward',
    dailyGoalType: 'half-page' as 'full-page' | 'half-page' | 'quarter-page' | 'custom-lines',
    customLines: 7,
    startPage: 1,
    endPage: 604,
    alreadyMemorized: [] as number[],
    studyTime: 'flexible' as 'morning' | 'afternoon' | 'evening' | 'night' | 'flexible',
    reminderEnabled: false,
  });

  const handleNext = () => setStep(step + 1);
  const handleBack = () => setStep(step - 1);

  const handleComplete = () => {
    // Create the plan
    const plan = memorizationPlanService.createPlan({
      name: planData.name,
      active: true,
      dailyGoal: {
        type: planData.dailyGoalType,
        linesPerDay: planData.dailyGoalType === 'custom-lines' ? planData.customLines : undefined,
      },
      direction: planData.direction,
      startPage: planData.startPage,
      endPage: planData.endPage,
      currentPage: planData.direction === 'forward' ? planData.startPage : planData.endPage,
      studyTime: planData.studyTime,
      reminderEnabled: planData.reminderEnabled,
      startDate: new Date(),
    });

    // Mark already memorized pages if any
    if (planData.alreadyMemorized.length > 0) {
      memorizationPlanService.markPagesAsMastered(plan.id, planData.alreadyMemorized);
    }

    onComplete(plan);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
              Setup Your Memorization Plan
            </h2>
            {onCancel && (
              <button
                onClick={onCancel}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-4">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`flex-1 h-2 rounded-full ${
                  s <= step ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Step {step} of 4
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                Choose Your Direction
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Which direction would you like to memorize?
              </p>

              <div className="space-y-4">
                <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <input
                    type="radio"
                    name="direction"
                    value="forward"
                    checked={planData.direction === 'forward'}
                    onChange={(e) => setPlanData({ ...planData, direction: e.target.value as 'forward' })}
                    className="w-5 h-5"
                  />
                  <div className="ml-4 flex-1">
                    <div className="font-medium text-gray-800 dark:text-gray-200">
                      From Beginning (Al-Fatiha → An-Nas)
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Traditional approach, starting with Surah Al-Fatiha
                    </div>
                  </div>
                </label>

                <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-blue-500">
                  <input
                    type="radio"
                    name="direction"
                    value="backward"
                    checked={planData.direction === 'backward'}
                    onChange={(e) => setPlanData({ ...planData, direction: e.target.value as 'backward' })}
                    className="w-5 h-5"
                  />
                  <div className="ml-4 flex-1">
                    <div className="font-medium text-gray-800 dark:text-gray-200">
                      From End (An-Nas → Al-Fatiha) ⭐ Recommended
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Easier short surahs first (Juz 30), builds confidence
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                Set Your Daily Goal
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                How much do you want to memorize each day?
              </p>

              <div className="space-y-4">
                <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <input
                    type="radio"
                    name="goal"
                    value="quarter-page"
                    checked={planData.dailyGoalType === 'quarter-page'}
                    onChange={(e) => setPlanData({ ...planData, dailyGoalType: e.target.value as 'quarter-page' })}
                    className="w-5 h-5"
                  />
                  <div className="ml-4 flex-1">
                    <div className="font-medium text-gray-800 dark:text-gray-200">
                      Quarter Page (~3-4 lines)
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Gradual and steady, ~4-5 years to complete
                    </div>
                  </div>
                </label>

                <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-blue-500">
                  <input
                    type="radio"
                    name="goal"
                    value="half-page"
                    checked={planData.dailyGoalType === 'half-page'}
                    onChange={(e) => setPlanData({ ...planData, dailyGoalType: e.target.value as 'half-page' })}
                    className="w-5 h-5"
                  />
                  <div className="ml-4 flex-1">
                    <div className="font-medium text-gray-800 dark:text-gray-200">
                      Half Page (~7-8 lines) ⭐ Recommended
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Balanced pace, ~2-3 years to complete
                    </div>
                  </div>
                </label>

                <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <input
                    type="radio"
                    name="goal"
                    value="full-page"
                    checked={planData.dailyGoalType === 'full-page'}
                    onChange={(e) => setPlanData({ ...planData, dailyGoalType: e.target.value as 'full-page' })}
                    className="w-5 h-5"
                  />
                  <div className="ml-4 flex-1">
                    <div className="font-medium text-gray-800 dark:text-gray-200">
                      Full Page (~15 lines)
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Ambitious, ~1.5-2 years to complete
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                Current Progress
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Have you already memorized any pages?
              </p>

              <div className="space-y-4">
                <button
                  onClick={() => setPlanData({ ...planData, alreadyMemorized: [] })}
                  className="w-full p-4 border-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="font-medium text-gray-800 dark:text-gray-200">
                    Starting Fresh
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    I haven&apos;t memorized anything yet
                  </div>
                </button>

                <div className="p-4 border-2 rounded-lg">
                  <div className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                    Already Memorized Some
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    You can mark pages after setup from the progress page
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Note: For now, starting fresh. You can update this later.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                Study Schedule
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                When do you prefer to study? (Optional)
              </p>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Preferred Study Time
                  </span>
                  <select
                    value={planData.studyTime}
                    onChange={(e) => setPlanData({ ...planData, studyTime: e.target.value as 'morning' | 'afternoon' | 'evening' | 'night' | 'flexible' })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  >
                    <option value="flexible">Flexible</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                    <option value="night">Night</option>
                  </select>
                </label>

                <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    💡 Tip: Consistency is more important than the time of day. Choose when you&apos;re most alert and can study without interruptions.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          {step > 1 ? (
            <button
              onClick={handleBack}
              className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-medium"
            >
              Start Memorizing! 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
