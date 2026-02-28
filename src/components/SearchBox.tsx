'use client';

import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

interface SearchBoxProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  isLoading: boolean;
}

export function SearchBox({
  query,
  onQueryChange,
  onSearch,
  isLoading,
}: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !isLoading) {
      onSearch();
    }
  }

  return (
    <div className="w-full max-w-[720px] mx-auto">
      <div
        className="flex items-center h-12 md:h-14 rounded-lg border-2 border-[var(--navy-800)] bg-[var(--bg-input)] focus-within:border-[var(--gold-500)] focus-within:shadow-search transition-all duration-150"
      >
        {/* Search icon */}
        <div className="pl-4 pr-2 flex items-center flex-shrink-0">
          <Search
            size={20}
            className="text-[var(--text-muted)]"
            aria-hidden="true"
          />
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search for a hotel... e.g. quiet boutique near Covent Garden"
          disabled={isLoading}
          className="flex-1 bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-base outline-none disabled:cursor-not-allowed disabled:opacity-60 min-w-0 h-full"
          aria-label="Search hotels"
        />

        {/* Submit button */}
        <div className="pr-1.5 flex-shrink-0">
          <button
            onClick={onSearch}
            disabled={isLoading || !query.trim()}
            className="flex items-center justify-center h-9 md:h-10 rounded-lg bg-[var(--gold-500)] text-[var(--navy-950)] font-semibold text-sm px-4 hover:bg-[var(--gold-400)] active:bg-[var(--gold-600)] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--gold-500)] focus-visible:outline-offset-2"
            aria-label="Search"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>
    </div>
  );
}
