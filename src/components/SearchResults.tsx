'use client';

import { HotelCard } from '@/components/HotelCard';
import type { SearchResult } from '@/types';

interface SearchResultsProps {
  results: SearchResult[];
  checkInDate: Date;
}

export function SearchResults({ results, checkInDate }: SearchResultsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {results.map((result) => (
        <HotelCard
          key={result.hotel.id}
          result={result}
          checkInDate={checkInDate}
        />
      ))}
    </div>
  );
}
