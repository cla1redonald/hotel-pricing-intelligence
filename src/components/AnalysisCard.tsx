'use client';

import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { StarRating } from '@/components/StarRating';
import { DealScoreGauge } from '@/components/DealScoreGauge';
import { PriceComparison } from '@/components/PriceComparison';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { PriceProjectionChart } from '@/components/PriceProjectionChart';
import { CompetitiveSet } from '@/components/CompetitiveSet';
import { CheaperAlternatives } from '@/components/CheaperAlternatives';
import { ClaudeInsight } from '@/components/ClaudeInsight';
import type { UrlAnalysisMatched, CompetitiveHotel } from '@/types';

interface AnalysisCardProps {
  result: UrlAnalysisMatched;
  checkInDate: Date;
  onSearchFallback?: (query: string) => void;
}

function MatchConfidenceBadge({
  matchMethod,
  matchConfidence,
}: {
  matchMethod: 'exact' | 'fuzzy' | 'semantic';
  matchConfidence: number;
}) {
  const pct = Math.round(matchConfidence * 100);
  const label = `Matched via ${matchMethod} search, ${pct}% confidence`;
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={{
        color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-muted)',
      }}
      title={label}
      aria-label={label}
    >
      {pct}% match
    </span>
  );
}

export function AnalysisCard({ result, checkInDate, onSearchFallback }: AnalysisCardProps) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [competitors, setCompetitors] = useState<Array<{ name: string; price: number }>>([]);
  const [competitorsFull, setCompetitorsFull] = useState<CompetitiveHotel[]>([]);

  const handleCompetitorsLoaded = useCallback(
    (loaded: Array<{ name: string; price: number }>) => {
      setCompetitors(loaded);
    },
    []
  );

  const { matchedHotel: hotel, dealScore, pricingBreakdown, projection } = result;

  return (
    <Card
      className="max-w-[720px] mx-auto p-5 border border-[var(--bg-muted)] rounded-xl bg-[var(--bg-card)] shadow-card flex flex-col gap-6"
    >
      {/* 1. Deal score gauge */}
      <DealScoreGauge
        dealScore={dealScore}
        modelPrice={result.modelPrice}
        listedPriceGbp={result.listedPriceGbp}
      />

      {/* 2. Hotel identity row */}
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h2
            className="text-xl font-semibold leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {hotel.name}
          </h2>
          <div className="flex-shrink-0 pt-0.5">
            <StarRating rating={hotel.star_rating} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            {hotel.neighborhood}
          </span>
          {result.matchConfidence < 0.9 && (
            <MatchConfidenceBadge
              matchMethod={result.matchMethod}
              matchConfidence={result.matchConfidence}
            />
          )}
        </div>
        {result.matchConfidence >= 0.9 && (
          <span
            className="sr-only"
            aria-label={`Matched via ${result.matchMethod} search, ${Math.round(result.matchConfidence * 100)}% confidence`}
          />
        )}
      </div>

      {/* 3. Price comparison */}
      <PriceComparison
        listedPrice={result.listedPrice}
        listedPriceGbp={result.listedPriceGbp}
        currency={result.currency}
        modelPrice={result.modelPrice}
        source={result.source}
        checkInDate={checkInDate}
      />

      {/* 4. Claude insight with url-analysis context */}
      <ClaudeInsight
        hotelName={hotel.name}
        neighborhood={hotel.neighborhood}
        dynamicPrice={result.modelPrice}
        pricingBreakdown={pricingBreakdown}
        competitors={competitors}
        context={{
          mode: 'url-analysis',
          listedPrice: result.listedPriceGbp,
          currency: result.currency,
          source: result.source,
          dealLabel: dealScore.label,
          percentageDiff: dealScore.percentageDiff,
        }}
      />

      {/* 5. Price breakdown (expandable) */}
      <Collapsible open={isBreakdownOpen} onOpenChange={setIsBreakdownOpen}>
        <CollapsibleTrigger asChild>
          <button
            className="flex items-center gap-1.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--gold-500)] focus-visible:outline-offset-2 rounded"
            style={{ color: 'var(--text-secondary)' }}
            aria-expanded={isBreakdownOpen}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            }}
          >
            {isBreakdownOpen ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
            {isBreakdownOpen ? 'Hide price breakdown' : 'View price breakdown'}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <PriceBreakdown breakdown={pricingBreakdown} />
        </CollapsibleContent>
      </Collapsible>

      {/* 6. 7-day price projection chart */}
      <PriceProjectionChart projectionData={projection} />

      {/* 7. Competitive set (loads async) + cheaper alternatives */}
      <CompetitiveSet
        pineconeId={hotel.pinecone_id}
        checkInDate={checkInDate}
        onCompetitorsLoaded={handleCompetitorsLoaded}
        onFullCompetitorsLoaded={setCompetitorsFull}
      />

      {competitorsFull.length > 0 && (
        <CheaperAlternatives
          competitors={competitorsFull}
          listedPriceGbp={result.listedPriceGbp}
          dealLabel={dealScore.label}
        />
      )}

      {/* Search fallback CTA */}
      {onSearchFallback && (
        <div className="pt-2 border-t border-[var(--bg-muted)]">
          <button
            type="button"
            onClick={() => onSearchFallback(hotel.name)}
            className="text-sm underline transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
            }}
          >
            Search similar hotels
          </button>
        </div>
      )}
    </Card>
  );
}
