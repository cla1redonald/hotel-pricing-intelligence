'use client';

import type { PricingBreakdown } from '@/types';
import { formatPrice } from '@/lib/format';

interface PriceBreakdownProps {
  breakdown: PricingBreakdown;
}

function formatMultiplier(value: number): string {
  return `×${value.toFixed(2)}`;
}

type MultiplierColor = 'discount' | 'premium' | 'neutral';

function getMultiplierColor(value: number): MultiplierColor {
  if (value < 0.97) return 'discount';
  if (value > 1.03) return 'premium';
  return 'neutral';
}

function MultiplierBadge({ value }: { value: number }) {
  const color = getMultiplierColor(value);

  const colorStyles: Record<MultiplierColor, { text: string; dot: string }> = {
    discount: {
      text: 'text-[var(--discount)]',
      dot: 'bg-[var(--discount)]',
    },
    premium: {
      text: 'text-[var(--premium)]',
      dot: 'bg-[var(--premium)]',
    },
    neutral: {
      text: 'text-[var(--neutral-pricing)]',
      dot: 'bg-[var(--neutral-pricing)]',
    },
  };

  const styles = colorStyles[color];

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${styles.dot}`}
        aria-hidden="true"
      />
      <span className={`text-sm font-semibold ${styles.text}`}>
        {formatMultiplier(value)}
      </span>
    </div>
  );
}

const factors = [
  { key: 'demandMultiplier', label: 'Demand (occupancy)' },
  { key: 'seasonalityMultiplier', label: 'Seasonality' },
  { key: 'leadTimeMultiplier', label: 'Lead time' },
  { key: 'dayOfWeekMultiplier', label: 'Day of week' },
] as const;

export function PriceBreakdown({ breakdown }: PriceBreakdownProps) {
  return (
    <div className="rounded-lg p-4 space-y-2" style={{ backgroundColor: 'var(--bg-muted)' }}>
      {/* Base rate */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          Base rate
        </span>
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {formatPrice(breakdown.baseRate)}
        </span>
      </div>

      {/* Factor rows */}
      {factors.map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {label}
          </span>
          <MultiplierBadge value={breakdown[key]} />
        </div>
      ))}

      {/* Separator */}
      <div className="border-t border-[var(--navy-800)] pt-2 mt-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            Tonight&apos;s price
          </span>
          <span className="text-lg font-semibold text-[var(--text-primary)]">
            {formatPrice(breakdown.finalPrice)}
          </span>
        </div>
      </div>
    </div>
  );
}
