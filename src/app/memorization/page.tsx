'use client';

import React, { useState, useEffect } from 'react';
import { SetupWizard } from '@/components/SetupWizard';
import { MemorizationDashboard } from '@/components/MemorizationDashboard';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { MemorizationPlan } from '@/types/memorization';
import Link from 'next/link';

const uiFont = { fontFamily: "var(--font-garamond), Georgia, serif" };

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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl" style={{ color: 'var(--dim)', ...uiFont }}>Loading...</div>
      </div>
    );
  }

  if (showWizard || !activePlan) {
    return (
      <div className="min-h-screen">
        <div className="p-4">
          <Link
            href="/"
            className="inline-flex items-center hover:underline"
            style={{ color: 'var(--gold)', ...uiFont }}
          >
            ← Back to Reader
          </Link>
        </div>
        <SetupWizard onComplete={handlePlanComplete} />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div
        className="p-4"
        style={{ background: 'var(--bar-bg)', borderBottom: '1px solid var(--divider)' }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="hover:underline"
            style={{ color: 'var(--gold)', ...uiFont }}
          >
            ← Back to Reader
          </Link>
          <h1
            className="text-lg font-semibold"
            style={{ color: 'var(--ink)', ...uiFont }}
          >
            Memorization Hub
          </h1>
          <div className="w-24" /> {/* Spacer for centering */}
        </div>
      </div>

      <MemorizationDashboard plan={activePlan} />
    </div>
  );
}
