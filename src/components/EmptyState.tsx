'use client';

import { SearchX } from 'lucide-react';

interface EmptyStateProps {
  onSuggestionClick: (query: string) => void;
}

const suggestions = [
  'Romantic weekend in Covent Garden',
  'Quiet boutique near Hyde Park',
  'Family hotel with pool',
];

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <SearchX
        size={48}
        className="text-[var(--text-muted)] mb-4"
        aria-hidden="true"
      />
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
        No hotels found for your search.
      </h3>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Try a broader search like:
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSuggestionClick(suggestion)}
            className="rounded-full border border-[var(--navy-800)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--gold-500)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--gold-500)] focus-visible:outline-offset-2"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
