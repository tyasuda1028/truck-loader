'use client';

import { Suspense } from 'react';
import LoadingPlanInner from './LoadingPlanInner';

export default function LoadingPlanPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[calc(100vh-56px)] text-slate-400 text-sm">
        読み込み中...
      </div>
    }>
      <LoadingPlanInner />
    </Suspense>
  );
}
