'use client';

import React, { useState } from 'react';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { bilQuranService } from '@/services/bilQuranService';
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
    direction: 'backward' as 'forward' | 'backward',
    startPage: 1,
    endPage: 604,
    alreadyMemorized: [] as number[],
    alreadyMemorizedSurahs: [] as number[],
    hasExistingProgress: false,
    progressType: 'surahs' as 'pages' | 'surahs',
    studyTime: 'flexible' as 'morning' | 'afternoon' | 'evening' | 'night' | 'flexible',
    reminderEnabled: false,
  });

  const handleNext = () => setStep(step + 1);
  const handleBack = () => setStep(step - 1);

  const handleComplete = () => {
    const plan = memorizationPlanService.createPlan({
      name: planData.name,
      active: true,
      dailyGoal: { type: 'half-page' },
      direction: planData.direction,
      startPage: planData.startPage,
      endPage: planData.endPage,
      currentPage: planData.direction === 'forward' ? planData.startPage : planData.endPage,
      studyTime: planData.studyTime,
      reminderEnabled: planData.reminderEnabled,
      startDate: new Date().toISOString(),
    });

    // Mark already memorized pages
    let pagesToMark = [...planData.alreadyMemorized];

    if (planData.progressType === 'surahs' && planData.alreadyMemorizedSurahs.length > 0) {
      const surahPages = quranDataService.getSurahsPages(planData.alreadyMemorizedSurahs);
      pagesToMark = [...new Set([...pagesToMark, ...surahPages])];
    }

    if (pagesToMark.length > 0) {
      bilQuranService.markPagesAsMemorized(plan.id, pagesToMark);
    }

    onComplete(plan);
  };

  const totalSteps = 3;

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
              <button onClick={onCancel} style={{ color: 'var(--dim)' }}>✕</button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className="flex-1 h-2 rounded-full"
                style={{ background: i + 1 <= step ? 'var(--gold)' : 'var(--divider)' }}
              />
            ))}
          </div>
          <p className="text-sm mt-2" style={{ color: 'var(--dim)', ...uiFont }}>
            Step {step} of {totalSteps}
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold" style={{ color: 'var(--ink)', ...uiFont }}>
                Choose Your Direction
              </h3>

              <div className="p-4 rounded-lg" style={{ background: 'var(--gold-glow)' }}>
                <p className="text-sm" style={{ color: 'var(--ink)', ...uiFont }}>
                  This plan uses the <strong>بالقرآن نحيا</strong> method: half a page per day with a structured
                  ritual (Listen 2x, Read 15x, Recite 3x error-free) and rotating review.
                </p>
              </div>

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
                      ~20 months at half-page/day
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
                      ~27 months, easier short surahs first (Juz 30)
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
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
                      I haven&apos;t memorized anything yet
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
                      These pages will enter your review rotation immediately
                    </div>

                    {planData.hasExistingProgress && (
                      <div className="mt-4 space-y-3">
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

          {step === 3 && (
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
                    <option value="morning">Morning (After Fajr)</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                    <option value="night">Night</option>
                  </select>
                </label>

                <div className="p-4 rounded-lg" style={{ background: 'var(--gold-glow)' }}>
                  <p className="text-sm" style={{ color: 'var(--ink)', ...uiFont }}>
                    The method works best with <strong>consistency</strong> — same time each day.
                    After Fajr is traditionally recommended for Quran memorization.
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

          {step < totalSteps ? (
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
