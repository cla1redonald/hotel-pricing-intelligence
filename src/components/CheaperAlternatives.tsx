'use client';

import React from 'react';
import type { CompetitiveHotel } from '@/types';
import { formatPrice } from '@/lib/format';

interface CheaperAlternativesProps {
  competitors: CompetitiveHotel[];
  listedPriceGbp: number;
  dealLabel: 'Great Deal' | 'Fair Price' | 'Overpriced';
}

function formatDelta(delta: number): string {
  const rounded = Math.round(Math.abs(delta));
  if (delta > 0) return `+£${rounded}`;
  return `\u2212£${rounded}`;
}

function DeltaBadge({ delta }: { delta: number }) {
  const isPositive = delta > 0;
  const isNeutral = Math.abs(delta) < 1;

  if (isNeutral) {
    return (
      <span
        className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
        style={{ color: 'var(--neutral-pricing)', backgroundColor: 'var(--neutral-bg)' }}
      >
        ={formatPrice(0)}
      </span>
    );
  }

  if (isPositive) {
    return (
      <span
        className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
        style={{ color: 'var(--premium)', backgroundColor: 'var(--premium-bg)' }}
      >
        {formatDelta(delta)}
      </span>
    );
  }

  return (
    <span
      className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
      style={{ color: 'var(--discount)', backgroundColor: 'var(--discount-bg)' }}
    >
      {formatDelta(delta)}
    </span>
  );
}

function AlternativeCard({
  competitor,
  listedPriceGbp,
}: {
  competitor: CompetitiveHotel;
  listedPriceGbp: number;
}) {
  // Delta is relative to the listed price (not model price) in url-analysis context
  const delta = competitor.dynamicPrice - listedPriceGbp;

  return (
    <div
      className="flex-1 min-w-0 rounded-lg p-3 flex flex-col gap-1"
      style={{ backgroundColor: 'var(--bg-muted)' }}
    >
      <p
        className="text-sm font-medium truncate"
        style={{ color: 'var(--text-primary)' }}
        title={competitor.hotel.name}
      >
        {competitor.hotel.name}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {formatPrice(competitor.dynamicPrice)}
        </span>
        <DeltaBadge delta={delta} />
      </div>
    </div>
  );
}

export function CheaperAlternatives({
  competitors,
  listedPriceGbp,
  dealLabel,
}: CheaperAlternativesProps) {
  if (competitors.length === 0) return null;

  // Filter logic per spec section 4
  let displayedCompetitors: CompetitiveHotel[];
  if (dealLabel === 'Overpriced') {
    const cheaper = competitors.filter((c) => c.dynamicPrice < listedPriceGbp);
    // If fewer than 3 cheaper options, show all competitors as fallback
    displayedCompetitors = cheaper.length >= 3 ? cheaper : competitors;
  } else {
    // 'Great Deal' or 'Fair Price': show all competitors
    displayedCompetitors = competitors;
  }

  const sectionHeader = dealLabel === 'Overpriced' ? 'Cheaper Alternatives' : 'Similar Hotels';

  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-sm font-semibold"
        style={{ color: 'var(--text-secondary)' }}
      >
        {sectionHeader}
      </p>
      {/* Mobile: vertical stack; desktop: horizontal row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {displayedCompetitors.map((competitor) => (
          <AlternativeCard
            key={competitor.hotel.id}
            competitor={competitor}
            listedPriceGbp={listedPriceGbp}
          />
        ))}
      </div>
    </div>
  );
}
