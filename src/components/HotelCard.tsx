'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { StarRating } from '@/components/StarRating';
import { DealBadge } from '@/components/DealBadge';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { PriceProjectionChart } from '@/components/PriceProjectionChart';
import { CompetitiveSet } from '@/components/CompetitiveSet';
import { ClaudeInsight } from '@/components/ClaudeInsight';
import { calculatePrice, calculateProjection, getListedPrice } from '@/lib/pricing';
import { calculateDealScore } from '@/lib/deal-score';
import type { SearchResult } from '@/types';
import { formatPrice } from '@/lib/format';

interface HotelCardProps {
  result: SearchResult;
  checkInDate: Date;
}

export function HotelCard({ result, checkInDate }: HotelCardProps) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [competitors, setCompetitors] = useState<Array<{ name: string; price: number }>>([]);

  const handleCompetitorsLoaded = useCallback(
    (loaded: Array<{ name: string; price: number }>) => {
      setCompetitors(loaded);
    },
    []
  );

  const { hotel } = result;
  const breakdown = calculatePrice(hotel, checkInDate);
  const projectionData = calculateProjection(hotel, checkInDate);
  const listedPrice = getListedPrice(hotel, checkInDate);
  const dealScore = calculateDealScore(listedPrice, breakdown.finalPrice);

  return (
    <Card
      className="p-5 border border-[var(--bg-muted)] rounded-xl bg-[var(--bg-card)] shadow-card hover:shadow-card-hover transition-shadow duration-150 flex flex-col gap-4"
    >
      {/* Header row: hotel name + star rating */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold text-[var(--text-primary)] leading-tight">
          {hotel.name}
        </h2>
        <div className="flex-shrink-0 pt-0.5">
          <StarRating rating={hotel.star_rating} />
        </div>
      </div>

      {/* Meta row: neighborhood + match score */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {hotel.neighborhood}
        </span>
        <DealBadge dealScore={dealScore} />
      </div>

      {/* Price section */}
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold text-[var(--text-primary)]">
          {formatPrice(breakdown.finalPrice)}
        </span>
        <span className="text-xs text-[var(--text-muted)] pb-0.5">per night</span>
      </div>

      {/* Price breakdown collapsible */}
      <Collapsible open={isBreakdownOpen} onOpenChange={setIsBreakdownOpen}>
        <CollapsibleTrigger asChild>
          <button
            className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--gold-500)] focus-visible:outline-offset-2 rounded"
            aria-expanded={isBreakdownOpen}
          >
            {isBreakdownOpen ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
            {isBreakdownOpen ? 'Hide price breakdown' : 'Why this price?'}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <PriceBreakdown breakdown={breakdown} />
        </CollapsibleContent>
      </Collapsible>

      {/* Price projection chart — always visible */}
      <PriceProjectionChart projectionData={projectionData} />

      {/* Competitive set — loads async after card renders */}
      <CompetitiveSet
        pineconeId={hotel.pinecone_id}
        checkInDate={checkInDate}
        onCompetitorsLoaded={handleCompetitorsLoaded}
      />

      {/* Claude insight — streams in after competitive set loads */}
      <ClaudeInsight
        hotelName={hotel.name}
        neighborhood={hotel.neighborhood}
        dynamicPrice={breakdown.finalPrice}
        pricingBreakdown={breakdown}
        competitors={competitors}
      />
    </Card>
  );
}
