'use client';

import React, { useState } from 'react';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { quranDataService } from '@/services/quranDataService';
import { MemorizationPlan } from '@/types/memorization';

const uiFont = { fontFamily: "var(--font-garamond), Georgia, serif" };

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
    alreadyMemorizedSurahs: [] as number[],
    hasExistingProgress: false,
    progressType: 'pages' as 'pages' | 'surahs',
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
    let pagesToMark = [...planData.alreadyMemorized];

    // If user selected surahs, convert them to pages
    if (planData.progressType === 'surahs' && planData.alreadyMemorizedSurahs.length > 0) {
      const surahPages = quranDataService.getSurahsPages(planData.alreadyMemorizedSurahs);
      pagesToMark = [...new Set([...pagesToMark, ...surahPages])];
    }

    if (pagesToMark.length > 0) {
      memorizationPlanService.markPagesAsMastered(plan.id, pagesToMark);
    }

    onComplete(plan);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--parchment)', border: '1px solid var(--divider)' }}
      >
        {/* Header */}
        <div className="p-6" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold" style={{ color: 'var(--ink)', ...uiFont }}>
              Setup Your Memorization Plan
            </h2>
            {onCancel && (
              <button
                onClick={onCancel}
                style={{ color: 'var(--dim)' }}
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-4">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className="flex-1 h-2 rounded-full"
                style={{ background: s <= step ? 'var(--gold)' : 'var(--divider)' }}
              />
            ))}
          </div>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)', ...uiFont }}>
            Step {step} of 4
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                Choose Your Direction
              </h3>
              <p style={{ color: 'var(--dim)', ...uiFont }}>
                Which direction would you like to memorize?
              </p>

              <div className="space-y-4">
                <label
                  className="flex items-center p-4 rounded-lg cursor-pointer transition-colors"
                  style={{
                    border: planData.direction === 'forward' ? '2px solid var(--gold)' : '2px solid var(--divider)',
                    background: planData.direction === 'forward' ? 'var(--gold-glow)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="direction"
                    value="forward"
                    checked={planData.direction === 'forward'}
                    onChange={(e) => setPlanData({ ...planData, direction: e.target.value as 'forward' })}
                    className="w-5 h-5"
                    style={{ accentColor: 'var(--gold)' }}
                  />
                  <div className="ml-4 flex-1">
                    <div className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                      From Beginning (Al-Fatiha → An-Nas)
                    </div>
                    <div className="text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                      Traditional approach, starting with Surah Al-Fatiha
                    </div>
                  </div>
                </label>

                <label
                  className="flex items-center p-4 rounded-lg cursor-pointer transition-colors"
                  style={{
                    border: planData.direction === 'backward' ? '2px solid var(--gold)' : '2px solid var(--divider)',
                    background: planData.direction === 'backward' ? 'var(--gold-glow)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="direction"
                    value="backward"
                    checked={planData.direction === 'backward'}
                    onChange={(e) => setPlanData({ ...planData, direction: e.target.value as 'backward' })}
                    className="w-5 h-5"
                    style={{ accentColor: 'var(--gold)' }}
                  />
                  <div className="ml-4 flex-1">
                    <div className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                      From End (An-Nas → Al-Fatiha) — Recommended
                    </div>
                    <div className="text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                      Easier short surahs first (Juz 30), builds confidence
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                Set Your Daily Goal
              </h3>
              <p style={{ color: 'var(--dim)', ...uiFont }}>
                How much do you want to memorize each day?
              </p>

              <div className="space-y-4">
                {[
                  { value: 'quarter-page', label: 'Quarter Page (~3-4 lines)', desc: 'Gradual and steady, ~4-5 years to complete' },
                  { value: 'half-page', label: 'Half Page (~7-8 lines) — Recommended', desc: 'Balanced pace, ~2-3 years to complete' },
                  { value: 'full-page', label: 'Full Page (~15 lines)', desc: 'Ambitious, ~1.5-2 years to complete' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center p-4 rounded-lg cursor-pointer transition-colors"
                    style={{
                      border: planData.dailyGoalType === option.value ? '2px solid var(--gold)' : '2px solid var(--divider)',
                      background: planData.dailyGoalType === option.value ? 'var(--gold-glow)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="goal"
                      value={option.value}
                      checked={planData.dailyGoalType === option.value}
                      onChange={(e) => setPlanData({ ...planData, dailyGoalType: e.target.value as 'quarter-page' | 'half-page' | 'full-page' })}
                      className="w-5 h-5"
                      style={{ accentColor: 'var(--gold)' }}
                    />
                    <div className="ml-4 flex-1">
                      <div className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                        {option.label}
                      </div>
                      <div className="text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                        {option.desc}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                Current Progress
              </h3>
              <p style={{ color: 'var(--dim)', ...uiFont }}>
                Have you already memorized anything?
              </p>

              <div className="space-y-4">
                <label
                  className="flex items-start p-4 rounded-lg cursor-pointer transition-colors"
                  style={{
                    border: !planData.hasExistingProgress ? '2px solid var(--gold)' : '2px solid var(--divider)',
                    background: !planData.hasExistingProgress ? 'var(--gold-glow)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="progress"
                    checked={!planData.hasExistingProgress}
                    onChange={() => setPlanData({ ...planData, hasExistingProgress: false, alreadyMemorized: [], alreadyMemorizedSurahs: [] })}
                    className="w-5 h-5 mt-1"
                    style={{ accentColor: 'var(--gold)' }}
                  />
                  <div className="ml-4">
                    <div className="font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                      Starting Fresh
                    </div>
                    <div className="text-sm" style={{ color: 'var(--dim)', ...uiFont }}>
                      I haven&apos;t memorized anything yet, or I want to review everything
                    </div>
                  </div>
                </label>

                <label
                  className="flex items-start p-4 rounded-lg cursor-pointer transition-colors"
                  style={{
                    border: planData.hasExistingProgress ? '2px solid var(--gold)' : '2px solid var(--divider)',
                    background: planData.hasExistingProgress ? 'var(--gold-glow)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="progress"
                    checked={planData.hasExistingProgress}
                    onChange={() => setPlanData({ ...planData, hasExistingProgress: true })}
                    className="w-5 h-5 mt-1"
                    style={{ accentColor: 'var(--gold)' }}
                  />
                  <div className="ml-4 flex-1">
                    <div className="font-medium mb-2" style={{ color: 'var(--ink)', ...uiFont }}>
                      Skip Already Memorized
                    </div>
                    <div className="text-sm mb-3" style={{ color: 'var(--dim)', ...uiFont }}>
                      Mark what you&apos;ve already fully mastered
                    </div>

                    {planData.hasExistingProgress && (
                      <div className="mt-4 space-y-3">
                        {/* Toggle between Pages and Surahs */}
                        <div className="flex gap-2 rounded-lg p-1" style={{ background: 'var(--surface)' }}>
                          <button
                            type="button"
                            onClick={() => setPlanData({ ...planData, progressType: 'surahs' })}
                            className="flex-1 py-2 px-3 rounded transition-colors"
                            style={{
                              background: planData.progressType === 'surahs' ? 'var(--parchment)' : 'transparent',
                              color: 'var(--ink)',
                              fontWeight: planData.progressType === 'surahs' ? 500 : 400,
                              ...uiFont,
                            }}
                          >
                            By Surah
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlanData({ ...planData, progressType: 'pages' })}
                            className="flex-1 py-2 px-3 rounded transition-colors"
                            style={{
                              background: planData.progressType === 'pages' ? 'var(--parchment)' : 'transparent',
                              color: 'var(--ink)',
                              fontWeight: planData.progressType === 'pages' ? 500 : 400,
                              ...uiFont,
                            }}
                          >
                            By Page
                          </button>
                        </div>

                        {/* Surah Selection */}
                        {planData.progressType === 'surahs' && (
                          <div className="p-3 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}>
                            <div className="text-sm font-medium mb-2" style={{ color: 'var(--ink)', ...uiFont }}>
                              Select memorized surahs:
                            </div>
                            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                              {quranDataService.getAllSurahs().map((surah) => (
                                <button
                                  key={surah.number}
                                  type="button"
                                  onClick={() => {
                                    setPlanData({
                                      ...planData,
                                      alreadyMemorizedSurahs: planData.alreadyMemorizedSurahs.includes(surah.number)
                                        ? planData.alreadyMemorizedSurahs.filter(s => s !== surah.number)
                                        : [...planData.alreadyMemorizedSurahs, surah.number]
                                    });
                                  }}
                                  className="px-2 py-2 text-xs rounded transition-colors text-left"
                                  style={{
                                    background: planData.alreadyMemorizedSurahs.includes(surah.number) ? '#6B8E4E' : 'var(--divider)',
                                    color: planData.alreadyMemorizedSurahs.includes(surah.number) ? '#fff' : 'var(--ink)',
                                    ...uiFont,
                                  }}
                                >
                                  <div className="font-medium">{surah.number}. {surah.englishName}</div>
                                  <div className="text-[10px] opacity-75">{surah.numberOfAyahs} ayahs</div>
                                </button>
                              ))}
                            </div>
                            <div className="text-xs mt-2" style={{ color: 'var(--dim)', ...uiFont }}>
                              {planData.alreadyMemorizedSurahs.length} surah{planData.alreadyMemorizedSurahs.length !== 1 ? 's' : ''} selected
                            </div>
                          </div>
                        )}

                        {/* Page Selection */}
                        {planData.progressType === 'pages' && (
                          <div className="p-3 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}>
                            <div className="text-sm font-medium mb-2" style={{ color: 'var(--ink)', ...uiFont }}>
                              Select memorized pages:
                            </div>
                            <div className="grid grid-cols-5 gap-1 max-h-48 overflow-y-auto">
                              {Array.from({ length: 604 }, (_, i) => i + 1).map((page) => (
                                <button
                                  key={page}
                                  type="button"
                                  onClick={() => {
                                    setPlanData({
                                      ...planData,
                                      alreadyMemorized: planData.alreadyMemorized.includes(page)
                                        ? planData.alreadyMemorized.filter(p => p !== page)
                                        : [...planData.alreadyMemorized, page]
                                    });
                                  }}
                                  className="px-2 py-1 text-xs rounded transition-colors"
                                  style={{
                                    background: planData.alreadyMemorized.includes(page) ? '#6B8E4E' : 'var(--divider)',
                                    color: planData.alreadyMemorized.includes(page) ? '#fff' : 'var(--ink)',
                                    ...uiFont,
                                  }}
                                >
                                  {page}
                                </button>
                              ))}
                            </div>
                            <div className="text-xs mt-2" style={{ color: 'var(--dim)', ...uiFont }}>
                              {planData.alreadyMemorized.length} page{planData.alreadyMemorized.length !== 1 ? 's' : ''} selected
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                Study Schedule
              </h3>
              <p style={{ color: 'var(--dim)', ...uiFont }}>
                When do you prefer to study? (Optional)
              </p>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)', ...uiFont }}>
                    Preferred Study Time
                  </span>
                  <select
                    value={planData.studyTime}
                    onChange={(e) => setPlanData({ ...planData, studyTime: e.target.value as 'morning' | 'afternoon' | 'evening' | 'night' | 'flexible' })}
                    className="mt-1 block w-full px-3 py-2 rounded-md"
                    style={{ background: 'var(--surface)', border: '1px solid var(--divider)', color: 'var(--ink)', ...uiFont }}
                  >
                    <option value="flexible">Flexible</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                    <option value="night">Night</option>
                  </select>
                </label>

                <div className="p-4 rounded-lg" style={{ background: 'var(--gold-glow)' }}>
                  <p className="text-sm" style={{ color: 'var(--ink)', ...uiFont }}>
                    Tip: Consistency is more important than the time of day. Choose when you&apos;re most alert and can study without interruptions.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 flex justify-between" style={{ borderTop: '1px solid var(--divider)' }}>
          {step > 1 ? (
            <button
              onClick={handleBack}
              className="px-6 py-2 rounded transition-colors"
              style={{ background: 'var(--surface)', color: 'var(--ink)', ...uiFont }}
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              onClick={handleNext}
              className="px-6 py-2 text-white rounded transition-colors"
              style={{ background: 'var(--gold)', ...uiFont }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="px-6 py-2 text-white rounded transition-colors font-medium"
              style={{ background: 'var(--gold)', ...uiFont }}
            >
              Start Memorizing!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
