'use client';

interface MatchScoreBadgeProps {
  percentage: number;
}

export function MatchScoreBadge({ percentage }: MatchScoreBadgeProps) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-gold-600"
      style={{ backgroundColor: 'rgba(201, 168, 76, 0.1)' }}
      aria-label={`${percentage}% match score`}
    >
      {percentage}% match
    </span>
  );
}
