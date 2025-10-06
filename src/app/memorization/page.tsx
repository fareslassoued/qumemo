'use client';

import React, { useState, useEffect } from 'react';
import { SetupWizard } from '@/components/SetupWizard';
import { MemorizationDashboard } from '@/components/MemorizationDashboard';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { MemorizationPlan } from '@/types/memorization';
import Link from 'next/link';

export default function MemorizationPage() {
  const [activePlan, setActivePlan] = useState<MemorizationPlan | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivePlan();
  }, []);

  const loadActivePlan = () => {
    const plan = memorizationPlanService.getActivePlan();
    setActivePlan(plan);
    setShowWizard(!plan);
    setLoading(false);
  };

  const handlePlanComplete = (plan: MemorizationPlan) => {
    setActivePlan(plan);
    setShowWizard(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-xl text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (showWizard || !activePlan) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="p-4">
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline"
          >
            ← Back to Reader
          </Link>
        </div>
        <SetupWizard onComplete={handlePlanComplete} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            ← Back to Reader
          </Link>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Memorization Hub
          </h1>
          <div className="w-24" /> {/* Spacer for centering */}
        </div>
      </div>

      <MemorizationDashboard plan={activePlan} />
    </div>
  );
}
