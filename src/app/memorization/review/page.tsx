'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { ReviewSession } from '@/components/ReviewSession';
import { useSearchParams } from 'next/navigation';

const uiFont = { fontFamily: "var(--font-garamond), Georgia, serif" };

function ReviewPageContent() {
  const searchParams = useSearchParams();
  const [planId, setPlanId] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get('planId');
    setPlanId(id);
  }, [searchParams]);

  if (!planId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl" style={{ color: 'var(--dim)', ...uiFont }}>
          Loading...
        </div>
      </div>
    );
  }

  return <ReviewSession planId={planId} />;
}

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl" style={{ color: 'var(--dim)', ...uiFont }}>
          Loading...
        </div>
      </div>
    }>
      <ReviewPageContent />
    </Suspense>
  );
}
