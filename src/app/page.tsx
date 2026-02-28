'use client';

import { useState, useEffect } from 'react';
import { SearchBox } from '@/components/SearchBox';
import { DatePicker } from '@/components/DatePicker';
import { SearchResults } from '@/components/SearchResults';
import { SkeletonCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { TabNav } from '@/components/TabNav';
import { UrlAnalyzer } from '@/components/UrlAnalyzer';
import { AnalysisCard } from '@/components/AnalysisCard';
import { warmPinecone } from '@/lib/warm-pinecone';
import type { SearchResult, UrlAnalysisResponse, UrlAnalysisMatched, UrlAnalysisDisambiguation } from '@/types';

// 10-second timeout for search and analysis requests
const SEARCH_TIMEOUT_MS = 10_000;

type ActiveTab = 'search' | 'url-analyzer';

export default function Home() {
  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');

  // --- Search tab state ---
  const [query, setQuery] = useState('');
  const [checkInDate, setCheckInDate] = useState<Date>(() => new Date());
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // --- URL analyzer tab state ---
  const [urlAnalysisResult, setUrlAnalysisResult] = useState<UrlAnalysisResponse | null>(null);
  const [isUrlAnalyzing, setIsUrlAnalyzing] = useState(false);
  const [urlAnalysisError, setUrlAnalysisError] = useState<string | null>(null);
  const [hasUrlAnalyzed, setHasUrlAnalyzed] = useState(false);
  const [lastAnalyzeParams, setLastAnalyzeParams] = useState<{
    hotelName: string;
    listedPrice: number;
    currency: 'GBP' | 'USD' | 'EUR';
    checkInDate: Date;
    source: string;
  } | null>(null);

  // Fire-and-forget Pinecone warming ping on mount.
  // Does not await or block rendering in any way.
  useEffect(() => {
    void warmPinecone();
  }, []);

  // --- Search functions ---

  async function performSearch(searchQuery: string) {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    setIsSearchLoading(true);
    setSearchError(null);
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
          (errorData as { error?: string }).error ?? `Search failed (${response.status})`
        );
      }

      const data = await response.json();
      setResults((data as { results?: SearchResult[] }).results ?? []);
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
      setSearchError(message);
      setResults([]);
    } finally {
      clearTimeout(timeoutId);
      setIsSearchLoading(false);
    }
  }

  function handleSearch() {
    performSearch(query);
  }

  function handleSuggestionClick(suggestion: string) {
    setQuery(suggestion);
    performSearch(suggestion);
  }

  function handleSearchRetry() {
    handleSearch();
  }

  // --- URL analysis functions ---

  async function performUrlAnalysis(params: {
    hotelName: string;
    listedPrice: number;
    currency: 'GBP' | 'USD' | 'EUR';
    checkInDate: Date;
    source: string;
  }) {
    setIsUrlAnalyzing(true);
    setUrlAnalysisError(null);
    setHasUrlAnalyzed(true);
    setLastAnalyzeParams(params);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    try {
      const response = await fetch('/api/url-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotelName: params.hotelName,
          listedPrice: params.listedPrice,
          currency: params.currency,
          checkInDate: params.checkInDate.toISOString(),
          source: params.source,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as { error?: string }).error ?? `Analysis failed (${response.status})`
        );
      }

      const data = await response.json() as UrlAnalysisResponse;
      setUrlAnalysisResult(data);
    } catch (err) {
      let message: string;
      if (err instanceof Error && err.name === 'AbortError') {
        message = 'Analysis timed out. Please try again.';
      } else {
        message =
          err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.';
      }
      setUrlAnalysisError(message);
      setUrlAnalysisResult(null);
    } finally {
      clearTimeout(timeoutId);
      setIsUrlAnalyzing(false);
    }
  }

  function handleUrlAnalyzeRetry() {
    if (lastAnalyzeParams) {
      performUrlAnalysis(lastAnalyzeParams);
    }
  }

  function handleSearchFallback(hotelName: string) {
    setQuery(hotelName);
    setActiveTab('search');
    performSearch(hotelName);
  }

  // --- Search tab display logic ---
  const showSearchEmpty = hasSearched && !isSearchLoading && !searchError && results.length === 0;
  const showSearchResults = hasSearched && !isSearchLoading && !searchError && results.length > 0;
  const showSearchError = hasSearched && !isSearchLoading && searchError !== null;

  // --- URL tab display logic ---
  const isMatched = urlAnalysisResult?.matched === true;
  const isNotMatched =
    urlAnalysisResult !== null &&
    urlAnalysisResult.matched === false &&
    !('disambiguation' in urlAnalysisResult);
  const isDisambiguation =
    urlAnalysisResult !== null &&
    urlAnalysisResult.matched === false &&
    'disambiguation' in urlAnalysisResult;

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      {/* Hero section */}
      <header className="bg-[var(--navy-950)] py-8 md:py-10 lg:py-12">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6 lg:px-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[var(--text-inverse)]">
              Hotel Pricing Intelligence
            </h1>
            <p className="mt-2 text-base text-[var(--navy-600)]">
              AI-powered dynamic pricing and competitive analysis for London hotels
            </p>
          </div>

          {/* Tab navigation */}
          <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Tab content */}
          <div className="mt-6 flex flex-col items-center gap-3">
            {activeTab === 'search' && (
              <>
                <SearchBox
                  query={query}
                  onQueryChange={setQuery}
                  onSearch={handleSearch}
                  isLoading={isSearchLoading}
                />
                {/* Date picker — left-aligned under search box */}
                <div className="w-full max-w-[720px]">
                  <DatePicker date={checkInDate} onDateChange={setCheckInDate} />
                </div>
              </>
            )}

            {activeTab === 'url-analyzer' && (
              <div className="w-full max-w-[720px]">
                <UrlAnalyzer
                  isLoading={isUrlAnalyzing}
                  onAnalyze={performUrlAnalysis}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Results section */}
      <section className="mx-auto max-w-[1200px] px-4 md:px-6 lg:px-8 py-10">

        {/* --- Search tab results --- */}
        {activeTab === 'search' && (
          <>
            {isSearchLoading && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}

            {showSearchError && (
              <ErrorState
                message={searchError ?? 'Something went wrong. Please try again.'}
                onRetry={handleSearchRetry}
              />
            )}

            {showSearchEmpty && (
              <EmptyState onSuggestionClick={handleSuggestionClick} />
            )}

            {showSearchResults && (
              <SearchResults results={results} checkInDate={checkInDate} />
            )}

            {!hasSearched && !isSearchLoading && (
              <div className="text-center py-16">
                <p className="text-sm text-[var(--text-muted)]">
                  Search for London hotels above to get started.
                </p>
              </div>
            )}
          </>
        )}

        {/* --- URL analyzer tab results --- */}
        {activeTab === 'url-analyzer' && (
          <>
            {isUrlAnalyzing && (
              <div className="grid grid-cols-1 gap-6 max-w-[720px] mx-auto">
                {Array.from({ length: 2 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}

            {hasUrlAnalyzed && !isUrlAnalyzing && urlAnalysisError !== null && (
              <ErrorState
                message={urlAnalysisError}
                onRetry={handleUrlAnalyzeRetry}
              />
            )}

            {hasUrlAnalyzed && !isUrlAnalyzing && !urlAnalysisError && isMatched && (
              <AnalysisCard
                result={urlAnalysisResult as UrlAnalysisMatched}
                checkInDate={lastAnalyzeParams?.checkInDate ?? new Date()}
                onSearchFallback={handleSearchFallback}
              />
            )}

            {hasUrlAnalyzed && !isUrlAnalyzing && !urlAnalysisError && isNotMatched && (
              <div
                className="max-w-[720px] mx-auto rounded-xl p-6 border border-[var(--bg-muted)]"
                style={{ backgroundColor: 'var(--bg-card)' }}
              >
                <p
                  className="text-base font-semibold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Hotel not found in our catalog
                </p>
                <p
                  className="text-sm mb-4"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  We don&apos;t have{' '}
                  <span className="font-medium">
                    {(urlAnalysisResult as { extractedName: string }).extractedName}
                  </span>{' '}
                  in our catalog of 1,000+ London hotels.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    handleSearchFallback(
                      (urlAnalysisResult as { extractedName: string }).extractedName
                    )
                  }
                  className="text-sm font-medium px-4 py-2 rounded-md transition-colors"
                  style={{
                    backgroundColor: 'var(--gold-500)',
                    color: 'var(--text-primary)',
                  }}
                >
                  Search similar hotels
                </button>
              </div>
            )}

            {hasUrlAnalyzed && !isUrlAnalyzing && !urlAnalysisError && isDisambiguation && (
              <div
                className="max-w-[720px] mx-auto rounded-xl p-6 border border-[var(--bg-muted)]"
                style={{ backgroundColor: 'var(--bg-card)' }}
              >
                <p
                  className="text-base font-semibold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Multiple matches found
                </p>
                <p
                  className="text-sm mb-4"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  We found several hotels matching{' '}
                  <span className="font-medium">
                    {(urlAnalysisResult as UrlAnalysisDisambiguation).extractedName}
                  </span>
                  . Select the one you&apos;re looking at:
                </p>
                <div className="flex flex-col gap-3">
                  {(urlAnalysisResult as UrlAnalysisDisambiguation).disambiguation.map(
                    ({ hotel, confidence }) => (
                      <button
                        key={hotel.id}
                        type="button"
                        onClick={() => {
                          if (lastAnalyzeParams) {
                            performUrlAnalysis({
                              ...lastAnalyzeParams,
                              hotelName: hotel.name,
                            });
                          }
                        }}
                        className="flex items-start justify-between gap-3 text-left rounded-lg p-3 transition-colors"
                        style={{
                          border: '1px solid var(--bg-muted)',
                          backgroundColor: 'var(--bg-muted)',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor =
                            'var(--gold-500)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor =
                            'var(--bg-muted)';
                        }}
                      >
                        <div>
                          <p
                            className="text-sm font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {hotel.name}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {hotel.neighborhood} · {hotel.star_rating}★
                          </p>
                        </div>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            color: 'var(--text-muted)',
                            backgroundColor: 'var(--bg-card)',
                          }}
                        >
                          {Math.round(confidence * 100)}% match
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            {!hasUrlAnalyzed && !isUrlAnalyzing && (
              <div className="text-center py-16">
                <p className="text-sm text-[var(--text-muted)]">
                  Paste a hotel URL above to check whether the listed price is a good deal.
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
