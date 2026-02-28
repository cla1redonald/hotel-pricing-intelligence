'use client';

import React from 'react';
import type { DealScore } from '@/types';

interface DealScoreGaugeProps {
  dealScore: DealScore | null;
  modelPrice: number;
  listedPriceGbp: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getMarkerPosition(listedPriceGbp: number, modelPrice: number): number {
  if (modelPrice === 0) return 50;
  const ratio = ((listedPriceGbp - modelPrice) / modelPrice) * 100;
  return clamp(50 + ratio, 0, 100);
}

const LABEL_TOKENS: Record<DealScore['label'], string> = {
  'Great Deal': 'var(--discount)',
  'Fair Price': 'var(--neutral-pricing)',
  'Overpriced': 'var(--premium)',
};

export function DealScoreGauge({ dealScore, modelPrice, listedPriceGbp }: DealScoreGaugeProps) {
  if (!dealScore) {
    return (
      <div className="p-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        Price analysis unavailable
      </div>
    );
  }

  const markerLeft = getMarkerPosition(listedPriceGbp, modelPrice);
  const labelColor = LABEL_TOKENS[dealScore.label];

  return (
    <div className="space-y-3">
      {/* Label and percentage */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold" style={{ color: labelColor }}>{dealScore.label}</span>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {dealScore.percentageDiff}% {dealScore.direction === 'saving' ? 'below' : 'above'} model
        </span>
      </div>

      {/* Savings or overpaying amount */}
      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {dealScore.direction === 'saving' ? (
          <span>Save £{dealScore.savingsGbp} vs fair value</span>
        ) : (
          <span>Paying £{dealScore.savingsGbp} over fair value</span>
        )}
      </div>

      {/* Gauge track */}
      <div
        className="relative h-3 rounded-full overflow-visible"
        style={{ background: 'linear-gradient(to right, var(--discount), var(--neutral-pricing), var(--premium))' }}
      >
        {/* Marker */}
        <div
          className="absolute top-1/2 w-4 h-4 rounded-full bg-white shadow-md transform -translate-y-1/2 -translate-x-1/2"
          style={{ left: `${markerLeft}%`, border: '2px solid var(--text-primary)' }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
        <span>Best</span>
        <span>Fair</span>
        <span>Most Expensive</span>
      </div>
    </div>
  );
}
