'use client';

import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number;
}

export function StarRating({ rating }: StarRatingProps) {
  const filledCount = Math.min(Math.max(Math.round(rating), 0), 5);
  const emptyCount = 5 - filledCount;

  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: filledCount }).map((_, i) => (
        <Star
          key={`filled-${i}`}
          size={16}
          className="text-gold-500 fill-gold-500"
          aria-hidden="true"
        />
      ))}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <Star
          key={`empty-${i}`}
          size={16}
          className="text-muted-foreground"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
