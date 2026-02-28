'use client';

import { useState, useEffect } from 'react';
import { SearchBox } from '@/components/SearchBox';
import { DatePicker } from '@/components/DatePicker';
import { SearchResults } from '@/components/SearchResults';
import { SkeletonCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { warmPinecone } from '@/lib/warm-pinecone';
import type { SearchResult } from '@/types';

// 10-second timeout for search requests
const SEARCH_TIMEOUT_MS = 10_000;

export default function Home() {
  const [query, setQuery] = useState('');
  const [checkInDate, setCheckInDate] = useState<Date>(() => new Date());
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Fire-and-forget Pinecone warming ping on mount.
  // Does not await or block rendering in any way.
  useEffect(() => {
    void warmPinecone();
  }, []);

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          checkInDate: checkInDate.toISOString(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ?? `Search failed (${response.status})`
        );
      }

      const data = await response.json();
      setResults(data.results ?? []);
    } catch (err) {
      let message: string;
      if (err instanceof Error && err.name === 'AbortError') {
        message = 'Search timed out. Please try again.';
      } else {
        message =
          err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.';
      }
      setError(message);
      setResults([]);
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }

  function handleSuggestionClick(suggestion: string) {
    setQuery(suggestion);
    // Trigger search after state update by using the suggestion value directly
    const trimmed = suggestion.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: trimmed,
        checkInDate: checkInDate.toISOString(),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error ?? `Search failed (${response.status})`
          );
        }
        return response.json();
      })
      .then((data) => {
        setResults(data.results ?? []);
      })
      .catch((err) => {
        let message: string;
        if (err instanceof Error && err.name === 'AbortError') {
          message = 'Search timed out. Please try again.';
        } else {
          message =
            err instanceof Error
              ? err.message
              : 'Something went wrong. Please try again.';
        }
        setError(message);
        setResults([]);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setIsLoading(false);
      });
  }

  function handleRetry() {
    handleSearch();
  }

  const showEmpty = hasSearched && !isLoading && !error && results.length === 0;
  const showResults = hasSearched && !isLoading && !error && results.length > 0;
  const showError = hasSearched && !isLoading && error !== null;

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      {/* Hero section */}
      <header className="bg-[var(--navy-950)] py-8 md:py-10 lg:py-12">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[var(--text-inverse)]">
              Hotel Pricing Intelligence
            </h1>
            <p className="mt-2 text-base text-[var(--navy-600)]">
              AI-powered dynamic pricing and competitive analysis for London hotels
            </p>
          </div>

          {/* Search box — centered */}
          <div className="flex flex-col items-center gap-3">
            <SearchBox
              query={query}
              onQueryChange={setQuery}
              onSearch={handleSearch}
              isLoading={isLoading}
            />
            {/* Date picker — left-aligned under search box */}
            <div className="w-full max-w-[720px]">
              <DatePicker date={checkInDate} onDateChange={setCheckInDate} />
            </div>
          </div>
        </div>
      </header>

      {/* Results section */}
      <section className="mx-auto max-w-[1200px] px-4 md:px-6 lg:px-8 py-10">
        {isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {showError && (
          <ErrorState
            message={error ?? 'Something went wrong. Please try again.'}
            onRetry={handleRetry}
          />
        )}

        {showEmpty && (
          <EmptyState onSuggestionClick={handleSuggestionClick} />
        )}

        {showResults && (
          <SearchResults results={results} checkInDate={checkInDate} />
        )}

        {!hasSearched && !isLoading && (
          <div className="text-center py-16">
            <p className="text-sm text-[var(--text-muted)]">
              Search for London hotels above to get started.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
