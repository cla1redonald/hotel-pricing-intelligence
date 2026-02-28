'use client';

import React from 'react';
import { format } from 'date-fns';
import { formatWithOriginal } from '@/lib/currency';
import type { Currency } from '@/lib/currency';

interface PriceComparisonProps {
  listedPrice: number;
  listedPriceGbp: number;
  currency: 'GBP' | 'USD' | 'EUR';
  modelPrice: number;
  source?: string;
  checkInDate: Date;
}

function formatSourceLabel(source: string | undefined): string {
  if (!source || source === 'generic' || source === 'unknown') return 'on OTA';
  if (source === 'booking') return 'on Booking.com';
  if (source === 'expedia') return 'on Expedia';
  if (source === 'hotels') return 'on Hotels.com';
  // Capitalize first letter for any other source
  return `on ${source.charAt(0).toUpperCase()}${source.slice(1)}`;
}

export function PriceComparison({
  listedPrice,
  listedPriceGbp,
  currency,
  modelPrice,
  source,
  checkInDate,
}: PriceComparisonProps) {
  const isNonGbp = currency !== 'GBP';
  const sourceLabel = formatSourceLabel(source);
  const checkInLabel = `for ${format(checkInDate, 'EEE, MMM d')}`;

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Listed price panel */}
      <div
        className="flex-1 rounded-lg p-4 flex flex-col gap-1"
        style={{ border: '1px solid var(--bg-muted)', backgroundColor: 'var(--bg-card)' }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          Listed Price
        </span>
        <span
          className="text-2xl font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {isNonGbp
            ? formatWithOriginal(listedPrice, currency as Currency)
            : `£${Math.round(listedPriceGbp)}`}
        </span>
        <span
          className="text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          {sourceLabel}
        </span>
        {isNonGbp && (
          <span
            className="text-xs mt-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Converted at approximate rate. Actual rate may vary.
          </span>
        )}
      </div>

      {/* Model price panel */}
      <div
        className="flex-1 rounded-lg p-4 flex flex-col gap-1"
        style={{ border: '1px solid var(--bg-muted)', backgroundColor: 'var(--bg-muted)' }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          Our Model Price
        </span>
        <span
          className="text-2xl font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          £{Math.round(modelPrice)}
        </span>
        <span
          className="text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          {checkInLabel}
        </span>
      </div>
    </div>
  );
}
