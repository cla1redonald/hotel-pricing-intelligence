'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--bg-muted)] bg-[var(--bg-card)] shadow-card p-5 flex flex-col gap-4">
      {/* Header row: hotel name + stars */}
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-6 w-[40%]" />
        <Skeleton className="h-4 w-20 flex-shrink-0" />
      </div>

      {/* Meta row: neighborhood + badge */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-[60%]" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>

      {/* Price block */}
      <div className="flex items-end gap-2">
        <Skeleton className="h-8 w-[30%]" />
        <Skeleton className="h-3 w-14 mb-1" />
      </div>

      {/* Expand trigger */}
      <Skeleton className="h-4 w-32" />

      {/* Chart placeholder */}
      <Skeleton className="h-[160px] w-full" />
    </div>
  );
}
