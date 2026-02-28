'use client';

import type { DealScore } from '@/types';

interface DealBadgeProps {
  dealScore: DealScore | null;
}

const styleMap = {
  'Great Deal': {
    bg: 'var(--discount-bg)',
    color: 'var(--discount)',
  },
  'Fair Price': {
    bg: 'var(--neutral-bg)',
    color: 'var(--neutral-pricing)',
  },
  Overpriced: {
    bg: 'var(--premium-bg)',
    color: 'var(--premium)',
  },
} as const;

export function DealBadge({ dealScore }: DealBadgeProps) {
  if (!dealScore) return null;

  const style = styleMap[dealScore.label];
  const suffix =
    dealScore.label === 'Great Deal'
      ? ` · Save £${Math.round(dealScore.savingsGbp)}`
      : dealScore.label === 'Overpriced'
        ? ` · £${Math.round(dealScore.savingsGbp)} over`
        : '';

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: style.bg, color: style.color }}
      aria-label={`${dealScore.label}${suffix}`}
    >
      {dealScore.label}{suffix}
    </span>
  );
}
