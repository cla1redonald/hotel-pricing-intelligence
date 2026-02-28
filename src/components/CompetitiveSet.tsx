'use client';

import { useEffect, useRef, useState } from 'react';
import type { CompetitiveHotel } from '@/types';
import { formatPrice } from '@/lib/format';

interface CompetitiveSetProps {
  pineconeId: string;
  checkInDate: Date;
  onCompetitorsLoaded?: (competitors: Array<{ name: string; price: number }>) => void;
}

function formatDelta(delta: number): string {
  const rounded = Math.round(Math.abs(delta));
  if (delta > 0) {
    return `+£${rounded}`;
  }
  // Use true minus sign (U+2212) for negative deltas
  return `\u2212£${rounded}`;
}

function DeltaBadge({ delta }: { delta: number }) {
  const isPositive = delta > 0;
  const isNeutral = Math.abs(delta) < 1;

  if (isNeutral) {
    return (
      <span
        className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
        style={{
          color: 'var(--neutral-pricing)',
          backgroundColor: 'var(--neutral-bg)',
        }}
      >
        ={formatPrice(0)}
      </span>
    );
  }

  if (isPositive) {
    return (
      <span
        className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
        style={{
          color: 'var(--premium)',
          backgroundColor: 'var(--premium-bg)',
        }}
      >
        {formatDelta(delta)}
      </span>
    );
  }

  return (
    <span
      className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
      style={{
        color: 'var(--discount)',
        backgroundColor: 'var(--discount-bg)',
      }}
    >
      {formatDelta(delta)}
    </span>
  );
}

function CompetitorCard({ competitor }: { competitor: CompetitiveHotel }) {
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
        <DeltaBadge delta={competitor.priceDelta} />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex-1 h-16 rounded-lg skeleton-shimmer"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function CompetitiveSet({
  pineconeId,
  checkInDate,
  onCompetitorsLoaded,
}: CompetitiveSetProps) {
  const [competitors, setCompetitors] = useState<CompetitiveHotel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const callbackRef = useRef(onCompetitorsLoaded);
  callbackRef.current = onCompetitorsLoaded;

  useEffect(() => {
    let cancelled = false;

    async function fetchCompetitors() {
      setIsLoading(true);
      setHasError(false);

      try {
        const response = await fetch('/api/competitive-set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pineconeId,
            checkInDate: checkInDate.toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error(`Competitive set request failed: ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;

        const loaded: CompetitiveHotel[] = data.competitors ?? [];
        setCompetitors(loaded);

        if (callbackRef.current) {
          callbackRef.current(
            loaded.map((c) => ({ name: c.hotel.name, price: c.dynamicPrice }))
          );
        }
      } catch (err) {
        if (cancelled) return;
        console.error('CompetitiveSet fetch error:', err instanceof Error ? err.message : String(err));
        setHasError(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchCompetitors();

    return () => {
      cancelled = true;
    };
  }, [pineconeId, checkInDate]);

  // Graceful degradation: hide entirely on error
  if (hasError) return null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <p
          className="text-sm font-semibold"
          style={{ color: 'var(--text-secondary)' }}
        >
          Similar Hotels
        </p>
        <LoadingSkeleton />
      </div>
    );
  }

  if (competitors.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-sm font-semibold"
        style={{ color: 'var(--text-secondary)' }}
      >
        Similar Hotels
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        {competitors.map((competitor) => (
          <CompetitorCard key={competitor.hotel.id} competitor={competitor} />
        ))}
      </div>
    </div>
  );
}
