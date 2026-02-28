'use client';

import { useEffect, useState, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import type { PricingBreakdown } from '@/types';

interface InsightContext {
  mode: 'search' | 'url-analysis';
  listedPrice?: number;
  currency?: string;
  source?: string;
  dealLabel?: string;
  percentageDiff?: number;
}

interface ClaudeInsightProps {
  hotelName: string;
  neighborhood: string;
  dynamicPrice: number;
  pricingBreakdown: PricingBreakdown;
  competitors: Array<{ name: string; price: number }>;
  context?: InsightContext;
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <div
        className="skeleton-shimmer rounded"
        style={{ height: '14px', width: '100%' }}
      />
      <div
        className="skeleton-shimmer rounded"
        style={{ height: '14px', width: '60%' }}
      />
    </div>
  );
}

export function ClaudeInsight({
  hotelName,
  neighborhood,
  dynamicPrice,
  pricingBreakdown,
  competitors,
  context,
}: ClaudeInsightProps) {
  const [insightText, setInsightText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Only fetch when we have competitors
    if (competitors.length === 0) return;

    // Prevent re-fetching if already fetched
    if (hasFetched) return;

    let cancelled = false;

    async function fetchInsight() {
      setIsLoading(true);
      setHasError(false);
      setInsightText('');
      setHasFetched(true);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch('/api/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hotelName,
            neighborhood,
            dynamicPrice,
            pricingBreakdown,
            competitors,
            ...(context !== undefined ? { context } : {}),
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Insight request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelled) {
            reader.cancel();
            break;
          }

          const rawChunk = decoder.decode(value, { stream: true });
          // Parse SSE lines
          const lines = rawChunk.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const dataStr = trimmed.slice('data: '.length);
            if (dataStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataStr) as { text?: string };
              if (parsed.text) {
                accumulated += parsed.text;
                if (!cancelled) {
                  setInsightText(accumulated);
                }
              }
            } catch {
              // Skip malformed SSE data
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        // Don't show errors for abort (user navigated away)
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('ClaudeInsight fetch error:', err instanceof Error ? err.message : String(err));
        setHasError(true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchInsight();

    return () => {
      cancelled = true;
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitors.length]);

  // Graceful degradation: hide on error
  if (hasError) return null;

  // Don't render at all until competitors are ready
  if (competitors.length === 0) return null;

  return (
    <div
      className="pl-3"
      style={{ borderLeft: '2px solid var(--gold-300)' }}
      aria-live="polite"
    >
      <div
        className="flex items-center gap-1.5 mb-1.5"
      >
        <Sparkles
          size={12}
          aria-hidden="true"
          style={{ color: 'var(--text-muted)' }}
        />
        <span
          className="text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          AI Insight
        </span>
      </div>

      {isLoading && !insightText && <LoadingSkeleton />}

      {insightText && (
        <p
          className="text-sm font-normal"
          style={{ color: 'var(--text-secondary)' }}
        >
          {insightText}
        </p>
      )}
    </div>
  );
}
