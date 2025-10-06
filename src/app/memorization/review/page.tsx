'use client';

import React, { useEffect, useState } from 'react';
import { ReviewSession } from '@/components/ReviewSession';
import { useSearchParams } from 'next/navigation';

export default function ReviewPage() {
  const searchParams = useSearchParams();
  const [planId, setPlanId] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get('planId');
    setPlanId(id);
  }, [searchParams]);

  if (!planId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600 dark:text-gray-400">
          Loading...
        </div>
      </div>
    );
  }

  return <ReviewSession planId={planId} />;
}
