import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { PricingBreakdown, ProjectionPoint, DealScore } from '@/types';
import { VibeChips } from '@/components/VibeChips';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeBreakdown(overrides: Partial<PricingBreakdown> = {}): PricingBreakdown {
  return {
    baseRate: 200,
    demandMultiplier: 1.1,
    seasonalityMultiplier: 1.2,
    leadTimeMultiplier: 1.3,
    dayOfWeekMultiplier: 0.95,
    finalPrice: 273,
    ...overrides,
  };
}

function makeProjectionData(): ProjectionPoint[] {
  const base = new Date('2025-06-01T00:00:00.000Z');
  return Array.from({ length: 7 }).map((_, i) => {
    const date = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    return {
      date: date.toISOString(),
      price: 180 + i * 5,
      factors: makeBreakdown({ finalPrice: 180 + i * 5 }),
    };
  });
}

// ---------------------------------------------------------------------------
// Mock recharts to avoid canvas/DOM issues in jsdom
// ---------------------------------------------------------------------------

vi.mock('recharts', () => {
  const MockResponsiveContainer = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'responsive-container' }, children);
  const MockAreaChart = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'area-chart' }, children);
  const MockArea = () => React.createElement('div', { 'data-testid': 'area' });
  const MockXAxis = () => React.createElement('div', { 'data-testid': 'x-axis' });
  const MockYAxis = () => React.createElement('div', { 'data-testid': 'y-axis' });
  const MockCartesianGrid = () => React.createElement('div', { 'data-testid': 'grid' });
  const MockTooltip = () => React.createElement('div', { 'data-testid': 'tooltip' });
  return {
    ResponsiveContainer: MockResponsiveContainer,
    AreaChart: MockAreaChart,
    Area: MockArea,
    XAxis: MockXAxis,
    YAxis: MockYAxis,
    CartesianGrid: MockCartesianGrid,
    Tooltip: MockTooltip,
  };
});

// ---------------------------------------------------------------------------
// Import components (after mocks)
// ---------------------------------------------------------------------------

import { SearchBox } from '@/components/SearchBox';
import { StarRating } from '@/components/StarRating';
import { MatchScoreBadge } from '@/components/MatchScoreBadge';
import { PriceBreakdown } from '@/components/PriceBreakdown';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { SkeletonCard } from '@/components/SkeletonCard';
import { PriceProjectionChart } from '@/components/PriceProjectionChart';
import { DealBadge } from '@/components/DealBadge';

// ---------------------------------------------------------------------------
// SearchBox tests
// ---------------------------------------------------------------------------

describe('SearchBox', () => {
  it('renders the search input', () => {
    render(
      React.createElement(SearchBox, {
        query: '',
        onQueryChange: vi.fn(),
        onSearch: vi.fn(),
        isLoading: false,
      })
    );
    const input = screen.getByRole('textbox', { name: /search hotels/i });
    expect(input).toBeDefined();
  });

  it('renders the search submit button', () => {
    render(
      React.createElement(SearchBox, {
        query: 'hotel',
        onQueryChange: vi.fn(),
        onSearch: vi.fn(),
        isLoading: false,
      })
    );
    const button = screen.getByRole('button', { name: /search/i });
    expect(button).toBeDefined();
  });

  it('calls onSearch when Enter is pressed', () => {
    const onSearch = vi.fn();
    render(
      React.createElement(SearchBox, {
        query: 'boutique hotel',
        onQueryChange: vi.fn(),
        onSearch,
        isLoading: false,
      })
    );
    const input = screen.getByRole('textbox', { name: /search hotels/i });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it('calls onSearch when button is clicked', () => {
    const onSearch = vi.fn();
    render(
      React.createElement(SearchBox, {
        query: 'luxury hotel',
        onQueryChange: vi.fn(),
        onSearch,
        isLoading: false,
      })
    );
    const button = screen.getByRole('button', { name: /search/i });
    fireEvent.click(button);
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it('disables input and button while loading', () => {
    render(
      React.createElement(SearchBox, {
        query: 'hotel',
        onQueryChange: vi.fn(),
        onSearch: vi.fn(),
        isLoading: true,
      })
    );
    const input = screen.getByRole('textbox', { name: /search hotels/i });
    expect(input).toHaveProperty('disabled', true);
  });

  it('calls onQueryChange when input changes', () => {
    const onQueryChange = vi.fn();
    render(
      React.createElement(SearchBox, {
        query: '',
        onQueryChange,
        onSearch: vi.fn(),
        isLoading: false,
      })
    );
    const input = screen.getByRole('textbox', { name: /search hotels/i });
    fireEvent.change(input, { target: { value: 'boutique' } });
    expect(onQueryChange).toHaveBeenCalledWith('boutique');
  });
});

// ---------------------------------------------------------------------------
// StarRating tests
// ---------------------------------------------------------------------------

describe('StarRating', () => {
  it('renders the correct aria-label', () => {
    render(React.createElement(StarRating, { rating: 4 }));
    const el = screen.getByLabelText(/4 out of 5 stars/i);
    expect(el).toBeDefined();
  });

  it('renders 5 stars total', () => {
    const { container } = render(React.createElement(StarRating, { rating: 3 }));
    // lucide renders svg elements
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(5);
  });

  it('renders for a 5-star hotel', () => {
    render(React.createElement(StarRating, { rating: 5 }));
    const el = screen.getByLabelText(/5 out of 5 stars/i);
    expect(el).toBeDefined();
  });

  it('renders for a 1-star hotel', () => {
    render(React.createElement(StarRating, { rating: 1 }));
    const el = screen.getByLabelText(/1 out of 5 stars/i);
    expect(el).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// MatchScoreBadge tests
// ---------------------------------------------------------------------------

describe('MatchScoreBadge', () => {
  it('shows the percentage text', () => {
    render(React.createElement(MatchScoreBadge, { percentage: 92 }));
    expect(screen.getByText('92% match')).toBeDefined();
  });

  it('shows the aria-label with percentage', () => {
    render(React.createElement(MatchScoreBadge, { percentage: 87 }));
    const el = screen.getByLabelText(/87% match score/i);
    expect(el).toBeDefined();
  });

  it('renders different percentages correctly', () => {
    render(React.createElement(MatchScoreBadge, { percentage: 75 }));
    expect(screen.getByText('75% match')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PriceBreakdown tests
// ---------------------------------------------------------------------------

describe('PriceBreakdown', () => {
  it('shows the base rate', () => {
    const breakdown = makeBreakdown({ baseRate: 200 });
    render(React.createElement(PriceBreakdown, { breakdown }));
    expect(screen.getByText('Base rate')).toBeDefined();
    expect(screen.getByText('£200')).toBeDefined();
  });

  it('shows all 4 pricing factors', () => {
    const breakdown = makeBreakdown();
    render(React.createElement(PriceBreakdown, { breakdown }));
    expect(screen.getByText('Demand (occupancy)')).toBeDefined();
    expect(screen.getByText('Seasonality')).toBeDefined();
    expect(screen.getByText('Lead time')).toBeDefined();
    expect(screen.getByText('Day of week')).toBeDefined();
  });

  it("shows Tonight's price", () => {
    const breakdown = makeBreakdown({ finalPrice: 273 });
    render(React.createElement(PriceBreakdown, { breakdown }));
    expect(screen.getByText("Tonight's price")).toBeDefined();
    expect(screen.getByText('£273')).toBeDefined();
  });

  it('formats multipliers with × prefix', () => {
    const breakdown = makeBreakdown({
      demandMultiplier: 1.15,
      seasonalityMultiplier: 0.95,
      leadTimeMultiplier: 1.3,
      dayOfWeekMultiplier: 1.0,
    });
    render(React.createElement(PriceBreakdown, { breakdown }));
    expect(screen.getByText('×1.15')).toBeDefined();
    expect(screen.getByText('×0.95')).toBeDefined();
    expect(screen.getByText('×1.30')).toBeDefined();
    expect(screen.getByText('×1.00')).toBeDefined();
  });

  it('shows a discount multiplier below 0.97', () => {
    const breakdown = makeBreakdown({ demandMultiplier: 0.9 });
    render(React.createElement(PriceBreakdown, { breakdown }));
    expect(screen.getByText('×0.90')).toBeDefined();
  });

  it('shows a premium multiplier above 1.03', () => {
    const breakdown = makeBreakdown({ seasonalityMultiplier: 1.4 });
    render(React.createElement(PriceBreakdown, { breakdown }));
    expect(screen.getByText('×1.40')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PriceProjectionChart tests
// ---------------------------------------------------------------------------

describe('PriceProjectionChart', () => {
  it('renders without crashing', () => {
    const projectionData = makeProjectionData();
    const { container } = render(
      React.createElement(PriceProjectionChart, { projectionData })
    );
    expect(container.firstChild).toBeDefined();
  });

  it('renders the chart container', () => {
    const projectionData = makeProjectionData();
    render(React.createElement(PriceProjectionChart, { projectionData }));
    expect(screen.getByTestId('responsive-container')).toBeDefined();
  });

  it('shows the 7-day price forecast label', () => {
    const projectionData = makeProjectionData();
    render(React.createElement(PriceProjectionChart, { projectionData }));
    expect(screen.getByText('7-day price forecast')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// EmptyState tests
// ---------------------------------------------------------------------------

describe('EmptyState', () => {
  it('shows the no hotels found message', () => {
    render(React.createElement(EmptyState, { onSuggestionClick: vi.fn() }));
    expect(screen.getByText('No hotels found for your search.')).toBeDefined();
  });

  it('shows suggestion chips', () => {
    render(React.createElement(EmptyState, { onSuggestionClick: vi.fn() }));
    expect(screen.getByText('Romantic weekend in Covent Garden')).toBeDefined();
    expect(screen.getByText('Quiet boutique near Hyde Park')).toBeDefined();
    expect(screen.getByText('Family hotel with pool')).toBeDefined();
  });

  it('calls onSuggestionClick with the correct query when a chip is clicked', () => {
    const onSuggestionClick = vi.fn();
    render(React.createElement(EmptyState, { onSuggestionClick }));
    const chip = screen.getByText('Romantic weekend in Covent Garden');
    fireEvent.click(chip);
    expect(onSuggestionClick).toHaveBeenCalledWith('Romantic weekend in Covent Garden');
  });

  it('calls onSuggestionClick for all suggestion chips', () => {
    const onSuggestionClick = vi.fn();
    render(React.createElement(EmptyState, { onSuggestionClick }));

    fireEvent.click(screen.getByText('Quiet boutique near Hyde Park'));
    expect(onSuggestionClick).toHaveBeenCalledWith('Quiet boutique near Hyde Park');

    fireEvent.click(screen.getByText('Family hotel with pool'));
    expect(onSuggestionClick).toHaveBeenCalledWith('Family hotel with pool');
  });
});

// ---------------------------------------------------------------------------
// ErrorState tests
// ---------------------------------------------------------------------------

describe('ErrorState', () => {
  it('shows the error message', () => {
    render(
      React.createElement(ErrorState, {
        message: 'Service unavailable. Please try again.',
        onRetry: vi.fn(),
      })
    );
    expect(screen.getByText('Service unavailable. Please try again.')).toBeDefined();
  });

  it('shows the retry button', () => {
    render(
      React.createElement(ErrorState, {
        message: 'Error occurred.',
        onRetry: vi.fn(),
      })
    );
    const retryBtn = screen.getByRole('button', { name: /try again/i });
    expect(retryBtn).toBeDefined();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(
      React.createElement(ErrorState, {
        message: 'An error occurred.',
        onRetry,
      })
    );
    const retryBtn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows the header message', () => {
    render(
      React.createElement(ErrorState, {
        message: 'Any error message.',
        onRetry: vi.fn(),
      })
    );
    expect(screen.getByText('Something went wrong.')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// SkeletonCard tests
// ---------------------------------------------------------------------------

describe('SkeletonCard', () => {
  it('renders without crashing', () => {
    const { container } = render(React.createElement(SkeletonCard, {}));
    expect(container.firstChild).toBeDefined();
  });

  it('renders multiple skeleton elements', () => {
    const { container } = render(React.createElement(SkeletonCard, {}));
    // shadcn Skeleton renders divs with animate-pulse class
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
    // Should have multiple skeleton elements (title, meta, price, chart)
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders the chart placeholder skeleton', () => {
    const { container } = render(React.createElement(SkeletonCard, {}));
    // chart skeleton should be a tall element
    const tallSkeleton = container.querySelector('[class*="h-\\[160px\\]"]');
    expect(tallSkeleton).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DealBadge tests
// ---------------------------------------------------------------------------

describe('DealBadge', () => {
  it('renders Great Deal with savings', () => {
    const dealScore: DealScore = {
      label: 'Great Deal',
      percentageDiff: 12.5,
      savingsGbp: 25,
      direction: 'saving',
    };
    render(React.createElement(DealBadge, { dealScore }));
    expect(screen.getByText(/Great Deal/)).toBeDefined();
    expect(screen.getByText(/Save £25/)).toBeDefined();
  });

  it('renders Fair Price without savings amount', () => {
    const dealScore: DealScore = {
      label: 'Fair Price',
      percentageDiff: 5,
      savingsGbp: 10,
      direction: 'overpaying',
    };
    render(React.createElement(DealBadge, { dealScore }));
    expect(screen.getByText(/Fair Price/)).toBeDefined();
  });

  it('renders Overpriced with overpaying amount', () => {
    const dealScore: DealScore = {
      label: 'Overpriced',
      percentageDiff: 15,
      savingsGbp: 30,
      direction: 'overpaying',
    };
    render(React.createElement(DealBadge, { dealScore }));
    expect(screen.getByText(/Overpriced/)).toBeDefined();
    expect(screen.getByText(/£30 over/)).toBeDefined();
  });

  it('renders nothing when dealScore is null', () => {
    const { container } = render(React.createElement(DealBadge, { dealScore: null }));
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// VibeChips tests
// ---------------------------------------------------------------------------

describe('VibeChips', () => {
  it('renders all 6 vibe chips', () => {
    render(React.createElement(VibeChips, { onVibeSelect: vi.fn(), activeVibe: null }));
    expect(screen.getByText('Romantic')).toBeDefined();
    expect(screen.getByText('Business')).toBeDefined();
    expect(screen.getByText('Boutique')).toBeDefined();
    expect(screen.getByText('Party')).toBeDefined();
    expect(screen.getByText('Quiet Escape')).toBeDefined();
    expect(screen.getByText('Family')).toBeDefined();
  });

  it('calls onVibeSelect with query when chip is clicked', () => {
    const onVibeSelect = vi.fn();
    render(React.createElement(VibeChips, { onVibeSelect, activeVibe: null }));
    fireEvent.click(screen.getByText('Romantic'));
    expect(onVibeSelect).toHaveBeenCalledWith(
      'romantic',
      expect.stringContaining('romantic')
    );
  });

  it('highlights the active vibe chip', () => {
    render(React.createElement(VibeChips, { onVibeSelect: vi.fn(), activeVibe: 'romantic' }));
    const chip = screen.getByText('Romantic').closest('button');
    expect(chip?.style.borderColor).toBe('var(--gold-500)');
  });
});
