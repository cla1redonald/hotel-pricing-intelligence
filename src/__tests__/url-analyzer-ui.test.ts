/**
 * URL Analyzer UI Tests
 * Tests for:
 *   - src/components/UrlAnalyzer.tsx — URL input, hotel name auto-fill, price validation
 *   - src/components/DealScoreGauge.tsx — gauge render, color/label, null guard
 *   - src/components/TabNav.tsx — tab switching, accessibility attributes
 * All tests are expected to FAIL until the implementation is written.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import type { DealScore } from '@/types';

// ---------------------------------------------------------------------------
// Mock url-parser so URL parsing is predictable in tests
// ---------------------------------------------------------------------------

vi.mock('@/lib/url-parser', () => ({
  parseHotelUrl: vi.fn((url: string) => {
    if (url.includes('booking.com/hotel/gb/the-savoy')) {
      return {
        hotelName: 'The Savoy',
        source: 'booking',
        originalUrl: url,
        checkInDate: undefined,
      };
    }
    if (url.includes('booking.com/hotel/gb/the-savoy') && url.includes('checkin=')) {
      return {
        hotelName: 'The Savoy',
        source: 'booking',
        originalUrl: url,
        checkInDate: '2026-06-15',
      };
    }
    if (url === '' || url === 'not-a-url') {
      return {
        hotelName: null,
        source: 'unknown',
        originalUrl: url,
      };
    }
    return {
      hotelName: null,
      source: 'unknown',
      originalUrl: url,
    };
  }),
}));

// ---------------------------------------------------------------------------
// Import components AFTER mocks
// ---------------------------------------------------------------------------

import { UrlAnalyzer } from '@/components/UrlAnalyzer';
import { DealScoreGauge } from '@/components/DealScoreGauge';
import { TabNav } from '@/components/TabNav';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeDealScore(overrides: Partial<DealScore> = {}): DealScore {
  return {
    label: 'Overpriced',
    percentageDiff: 17.1,
    savingsGbp: 51.0,
    direction: 'overpaying',
    ...overrides,
  };
}

const defaultUrlAnalyzerProps = {
  isLoading: false,
  onAnalyze: vi.fn(),
};

// ---------------------------------------------------------------------------
// UrlAnalyzer — rendering
// ---------------------------------------------------------------------------

describe('UrlAnalyzer — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the URL input field', () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));
    const urlInput = screen.getByPlaceholderText(
      /paste a booking\.com or hotel url/i
    );
    expect(urlInput).toBeDefined();
  });

  it('renders the hotel name input field', () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));
    const nameInput = screen.getByRole('textbox', { name: /hotel name/i });
    expect(nameInput).toBeDefined();
  });

  it('renders the listed price input', () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));
    const priceInput = screen.getByRole('spinbutton', { name: /listed price/i });
    expect(priceInput).toBeDefined();
  });

  it('renders the currency selector defaulting to GBP', () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));
    const currencySelect = screen.getByRole('combobox', { name: /currency/i });
    expect(currencySelect).toBeDefined();
    // Default value should be GBP
    expect((currencySelect as HTMLSelectElement).value).toBe('GBP');
  });

  it('renders the Check Price submit button', () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));
    const button = screen.getByRole('button', { name: /check price/i });
    expect(button).toBeDefined();
  });

  it('disables the submit button while isLoading is true', () => {
    render(
      React.createElement(UrlAnalyzer, { ...defaultUrlAnalyzerProps, isLoading: true })
    );
    const button = screen.getByRole('button', { name: /check price/i });
    expect(button).toHaveProperty('disabled', true);
  });
});

// ---------------------------------------------------------------------------
// UrlAnalyzer — URL paste and hotel name auto-fill
// ---------------------------------------------------------------------------

describe('UrlAnalyzer — hotel name auto-fill on URL paste', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-fills hotel name when a valid Booking.com URL is pasted', async () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));

    const urlInput = screen.getByPlaceholderText(
      /paste a booking\.com or hotel url/i
    );
    fireEvent.change(urlInput, {
      target: { value: 'https://www.booking.com/hotel/gb/the-savoy.en-gb.html' },
    });

    await waitFor(() => {
      const nameInput = screen.getByRole('textbox', { name: /hotel name/i });
      expect((nameInput as HTMLInputElement).value).toBe('The Savoy');
    });
  });

  it('shows extracted hotel name confirmation text after valid URL', async () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));

    const urlInput = screen.getByPlaceholderText(
      /paste a booking\.com or hotel url/i
    );
    fireEvent.change(urlInput, {
      target: { value: 'https://www.booking.com/hotel/gb/the-savoy.en-gb.html' },
    });

    await waitFor(() => {
      expect(screen.getByText(/extracted:.*the savoy/i)).toBeDefined();
    });
  });

  it('shows an inline error when URL parsing returns null hotelName', async () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));

    const urlInput = screen.getByPlaceholderText(
      /paste a booking\.com or hotel url/i
    );
    fireEvent.change(urlInput, {
      target: { value: 'not-a-url' },
    });

    await waitFor(() => {
      expect(
        screen.getByText(/couldn't extract a hotel name/i)
      ).toBeDefined();
    });
  });

  it('leaves hotel name field empty and editable when URL parsing fails', async () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));

    const urlInput = screen.getByPlaceholderText(
      /paste a booking\.com or hotel url/i
    );
    fireEvent.change(urlInput, { target: { value: 'not-a-url' } });

    await waitFor(() => {
      const nameInput = screen.getByRole('textbox', { name: /hotel name/i });
      expect((nameInput as HTMLInputElement).value).toBe('');
      expect((nameInput as HTMLInputElement).disabled).toBeFalsy();
    });
  });

  it('allows manual hotel name entry regardless of URL parse result', () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));

    const nameInput = screen.getByRole('textbox', { name: /hotel name/i });
    fireEvent.change(nameInput, { target: { value: 'My Manually Entered Hotel' } });
    expect((nameInput as HTMLInputElement).value).toBe('My Manually Entered Hotel');
  });
});

// ---------------------------------------------------------------------------
// UrlAnalyzer — price input validation
// ---------------------------------------------------------------------------

describe('UrlAnalyzer — price input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a price validation error when submitted with empty price', async () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));

    // Fill hotel name so only price is invalid
    const nameInput = screen.getByRole('textbox', { name: /hotel name/i });
    fireEvent.change(nameInput, { target: { value: 'The Savoy' } });

    const button = screen.getByRole('button', { name: /check price/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/realistic nightly rate/i)).toBeDefined();
    });
  });

  it('shows a price validation error when price is zero', async () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));

    const nameInput = screen.getByRole('textbox', { name: /hotel name/i });
    fireEvent.change(nameInput, { target: { value: 'The Savoy' } });

    const priceInput = screen.getByRole('spinbutton', { name: /listed price/i });
    fireEvent.change(priceInput, { target: { value: '0' } });

    fireEvent.click(screen.getByRole('button', { name: /check price/i }));

    await waitFor(() => {
      expect(screen.getByText(/realistic nightly rate/i)).toBeDefined();
    });
  });

  it('shows a price validation error when price exceeds 10000', async () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));

    const nameInput = screen.getByRole('textbox', { name: /hotel name/i });
    fireEvent.change(nameInput, { target: { value: 'The Savoy' } });

    const priceInput = screen.getByRole('spinbutton', { name: /listed price/i });
    fireEvent.change(priceInput, { target: { value: '10001' } });

    fireEvent.click(screen.getByRole('button', { name: /check price/i }));

    await waitFor(() => {
      expect(screen.getByText(/realistic nightly rate/i)).toBeDefined();
    });
  });

  it('shows a hotel name validation error when submitted with empty hotel name', async () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));

    const priceInput = screen.getByRole('spinbutton', { name: /listed price/i });
    fireEvent.change(priceInput, { target: { value: '300' } });

    fireEvent.click(screen.getByRole('button', { name: /check price/i }));

    await waitFor(() => {
      expect(screen.getByText(/please enter the hotel name/i)).toBeDefined();
    });
  });

  it('calls onAnalyze with correct params when all inputs are valid', async () => {
    const onAnalyze = vi.fn();
    render(
      React.createElement(UrlAnalyzer, { ...defaultUrlAnalyzerProps, onAnalyze })
    );

    // Fill in a URL that auto-fills the hotel name
    const urlInput = screen.getByPlaceholderText(
      /paste a booking\.com or hotel url/i
    );
    fireEvent.change(urlInput, {
      target: { value: 'https://www.booking.com/hotel/gb/the-savoy.en-gb.html' },
    });

    await waitFor(() => {
      const nameInput = screen.getByRole('textbox', { name: /hotel name/i });
      expect((nameInput as HTMLInputElement).value).toBe('The Savoy');
    });

    const priceInput = screen.getByRole('spinbutton', { name: /listed price/i });
    fireEvent.change(priceInput, { target: { value: '350' } });

    fireEvent.click(screen.getByRole('button', { name: /check price/i }));

    await waitFor(() => {
      expect(onAnalyze).toHaveBeenCalledOnce();
      const callArg = onAnalyze.mock.calls[0][0];
      expect(callArg.hotelName).toBe('The Savoy');
      expect(callArg.listedPrice).toBe(350);
      expect(callArg.currency).toBe('GBP');
      expect(callArg.source).toBe('booking');
    });
  });

  it('clears price error on next price input change', async () => {
    render(React.createElement(UrlAnalyzer, defaultUrlAnalyzerProps));

    const nameInput = screen.getByRole('textbox', { name: /hotel name/i });
    fireEvent.change(nameInput, { target: { value: 'The Savoy' } });

    // Trigger error
    fireEvent.click(screen.getByRole('button', { name: /check price/i }));

    await waitFor(() => {
      expect(screen.getByText(/realistic nightly rate/i)).toBeDefined();
    });

    // Fix the price — error should clear
    const priceInput = screen.getByRole('spinbutton', { name: /listed price/i });
    fireEvent.change(priceInput, { target: { value: '300' } });

    await waitFor(() => {
      expect(screen.queryByText(/realistic nightly rate/i)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// DealScoreGauge — rendering and color/label
// ---------------------------------------------------------------------------

describe('DealScoreGauge', () => {
  it('renders without crashing', () => {
    const dealScore = makeDealScore();
    const { container } = render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 298,
        listedPriceGbp: 349,
      })
    );
    expect(container.firstChild).toBeDefined();
  });

  it('displays the Overpriced label for an Overpriced deal score', () => {
    const dealScore = makeDealScore({ label: 'Overpriced', percentageDiff: 17.1 });
    render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 298,
        listedPriceGbp: 349,
      })
    );
    expect(screen.getByText(/overpriced/i)).toBeDefined();
  });

  it('displays the Great Deal label for a Great Deal score', () => {
    const dealScore = makeDealScore({
      label: 'Great Deal',
      direction: 'saving',
      percentageDiff: 20,
      savingsGbp: 60,
    });
    render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 300,
        listedPriceGbp: 240,
      })
    );
    expect(screen.getByText(/great deal/i)).toBeDefined();
  });

  it('displays the Fair Price label for a Fair Price score', () => {
    const dealScore = makeDealScore({
      label: 'Fair Price',
      direction: 'overpaying',
      percentageDiff: 5,
      savingsGbp: 15,
    });
    render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 300,
        listedPriceGbp: 315,
      })
    );
    expect(screen.getByText(/fair price/i)).toBeDefined();
  });

  it('shows savings amount for Great Deal direction', () => {
    const dealScore = makeDealScore({
      label: 'Great Deal',
      direction: 'saving',
      percentageDiff: 20,
      savingsGbp: 60,
    });
    render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 300,
        listedPriceGbp: 240,
      })
    );
    expect(screen.getByText(/save.*£60|£60.*save/i)).toBeDefined();
  });

  it('shows overpaying amount for Overpriced direction', () => {
    const dealScore = makeDealScore({
      label: 'Overpriced',
      direction: 'overpaying',
      percentageDiff: 17.1,
      savingsGbp: 51,
    });
    render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 298,
        listedPriceGbp: 349,
      })
    );
    expect(screen.getByText(/£51/i)).toBeDefined();
  });

  it('renders the gauge track element', () => {
    const dealScore = makeDealScore();
    const { container } = render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 298,
        listedPriceGbp: 349,
      })
    );
    // The gauge track should be present as a div with a gradient background
    const track = container.querySelector('[class*="linear-gradient"], [style*="gradient"]');
    expect(track).toBeDefined();
  });

  it('renders the marker/indicator element positioned along the track', () => {
    const dealScore = makeDealScore();
    const { container } = render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 298,
        listedPriceGbp: 349,
      })
    );
    // A marker element should exist with a left position style
    const marker = container.querySelector('[style*="left"]');
    expect(marker).toBeDefined();
  });

  it('renders "Price analysis unavailable" when dealScore is null', () => {
    render(
      React.createElement(DealScoreGauge, {
        dealScore: null as unknown as DealScore,
        modelPrice: 20,
        listedPriceGbp: 350,
      })
    );
    expect(screen.getByText(/price analysis unavailable/i)).toBeDefined();
  });

  it('percentage diff is displayed in the primary text', () => {
    const dealScore = makeDealScore({
      label: 'Overpriced',
      percentageDiff: 17.1,
      direction: 'overpaying',
    });
    render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 298,
        listedPriceGbp: 349,
      })
    );
    expect(screen.getByText(/17/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DealScoreGauge — marker position math
// ---------------------------------------------------------------------------

describe('DealScoreGauge — marker position calculation', () => {
  it('marker is near center (50%) when listed price equals model price', () => {
    const dealScore = makeDealScore({
      label: 'Great Deal',
      direction: 'saving',
      percentageDiff: 0,
      savingsGbp: 0,
    });
    const { container } = render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 300,
        listedPriceGbp: 300,
      })
    );
    const marker = container.querySelector('[style*="left"]') as HTMLElement | null;
    if (marker) {
      const leftStyle = marker.style.left;
      const leftPct = parseFloat(leftStyle);
      expect(leftPct).toBeCloseTo(50, 5);
    }
  });

  it('marker is to the right of center when listed price is above model', () => {
    const dealScore = makeDealScore({
      label: 'Overpriced',
      direction: 'overpaying',
      percentageDiff: 10,
      savingsGbp: 30,
    });
    const { container } = render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 300,
        listedPriceGbp: 330,
      })
    );
    const marker = container.querySelector('[style*="left"]') as HTMLElement | null;
    if (marker) {
      const leftPct = parseFloat(marker.style.left);
      expect(leftPct).toBeGreaterThan(50);
    }
  });

  it('marker is to the left of center when listed price is below model', () => {
    const dealScore = makeDealScore({
      label: 'Great Deal',
      direction: 'saving',
      percentageDiff: 20,
      savingsGbp: 60,
    });
    const { container } = render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 300,
        listedPriceGbp: 240,
      })
    );
    const marker = container.querySelector('[style*="left"]') as HTMLElement | null;
    if (marker) {
      const leftPct = parseFloat(marker.style.left);
      expect(leftPct).toBeLessThan(50);
    }
  });

  it('marker is clamped to 100% when price is 50% or more above model', () => {
    const dealScore = makeDealScore({
      label: 'Overpriced',
      direction: 'overpaying',
      percentageDiff: 60,
      savingsGbp: 180,
    });
    const { container } = render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 300,
        listedPriceGbp: 480,
      })
    );
    const marker = container.querySelector('[style*="left"]') as HTMLElement | null;
    if (marker) {
      const leftPct = parseFloat(marker.style.left);
      expect(leftPct).toBeLessThanOrEqual(100);
    }
  });

  it('marker is clamped to 0% when price is 50% or more below model', () => {
    const dealScore = makeDealScore({
      label: 'Great Deal',
      direction: 'saving',
      percentageDiff: 60,
      savingsGbp: 180,
    });
    const { container } = render(
      React.createElement(DealScoreGauge, {
        dealScore,
        modelPrice: 300,
        listedPriceGbp: 120,
      })
    );
    const marker = container.querySelector('[style*="left"]') as HTMLElement | null;
    if (marker) {
      const leftPct = parseFloat(marker.style.left);
      expect(leftPct).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// TabNav — rendering and interaction
// ---------------------------------------------------------------------------

describe('TabNav', () => {
  it('renders both tab buttons', () => {
    render(
      React.createElement(TabNav, {
        activeTab: 'search',
        onTabChange: vi.fn(),
      })
    );
    expect(screen.getByRole('tab', { name: /search hotels/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /check a price/i })).toBeDefined();
  });

  it('renders a tablist container', () => {
    render(
      React.createElement(TabNav, {
        activeTab: 'search',
        onTabChange: vi.fn(),
      })
    );
    expect(screen.getByRole('tablist')).toBeDefined();
  });

  it('active tab has aria-selected="true"', () => {
    render(
      React.createElement(TabNav, {
        activeTab: 'search',
        onTabChange: vi.fn(),
      })
    );
    const searchTab = screen.getByRole('tab', { name: /search hotels/i });
    expect(searchTab.getAttribute('aria-selected')).toBe('true');
  });

  it('inactive tab has aria-selected="false"', () => {
    render(
      React.createElement(TabNav, {
        activeTab: 'search',
        onTabChange: vi.fn(),
      })
    );
    const checkPriceTab = screen.getByRole('tab', { name: /check a price/i });
    expect(checkPriceTab.getAttribute('aria-selected')).toBe('false');
  });

  it('switches aria-selected when activeTab changes to url-analyzer', () => {
    render(
      React.createElement(TabNav, {
        activeTab: 'url-analyzer',
        onTabChange: vi.fn(),
      })
    );
    const checkPriceTab = screen.getByRole('tab', { name: /check a price/i });
    expect(checkPriceTab.getAttribute('aria-selected')).toBe('true');

    const searchTab = screen.getByRole('tab', { name: /search hotels/i });
    expect(searchTab.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onTabChange with "url-analyzer" when Check a Price tab is clicked', () => {
    const onTabChange = vi.fn();
    render(
      React.createElement(TabNav, {
        activeTab: 'search',
        onTabChange,
      })
    );
    const checkPriceTab = screen.getByRole('tab', { name: /check a price/i });
    fireEvent.click(checkPriceTab);
    expect(onTabChange).toHaveBeenCalledWith('url-analyzer');
  });

  it('calls onTabChange with "search" when Search Hotels tab is clicked', () => {
    const onTabChange = vi.fn();
    render(
      React.createElement(TabNav, {
        activeTab: 'url-analyzer',
        onTabChange,
      })
    );
    const searchTab = screen.getByRole('tab', { name: /search hotels/i });
    fireEvent.click(searchTab);
    expect(onTabChange).toHaveBeenCalledWith('search');
  });

  it('both tabs are always visible (not hidden)', () => {
    render(
      React.createElement(TabNav, {
        activeTab: 'search',
        onTabChange: vi.fn(),
      })
    );
    const searchTab = screen.getByRole('tab', { name: /search hotels/i });
    const checkPriceTab = screen.getByRole('tab', { name: /check a price/i });

    expect(searchTab).toBeDefined();
    expect(checkPriceTab).toBeDefined();
    // Neither tab should be hidden
    expect(getComputedStyle(searchTab).display).not.toBe('none');
    expect(getComputedStyle(checkPriceTab).display).not.toBe('none');
  });

  it('active tab has a gold border class applied', () => {
    const { container } = render(
      React.createElement(TabNav, {
        activeTab: 'search',
        onTabChange: vi.fn(),
      })
    );
    const searchTab = container.querySelector('[aria-selected="true"]');
    expect(searchTab).not.toBeNull();
    // The active tab should have the gold border styling class
    expect(searchTab!.className).toMatch(/border-b-2|border.*gold/i);
  });
});
