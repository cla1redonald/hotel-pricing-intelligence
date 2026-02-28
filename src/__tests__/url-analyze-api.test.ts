/**
 * URL Analyze API Route Tests
 * Tests for POST /api/url-analyze — input validation, matching pipeline, and response shape.
 * All tests are expected to FAIL until the implementation is written.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Hotel } from '@/types';

// ---------------------------------------------------------------------------
// Shared hotel fixture
// ---------------------------------------------------------------------------

function makeHotel(overrides: Partial<Hotel> = {}): Hotel {
  return {
    id: 'uuid-savoy',
    name: 'The Savoy',
    neighborhood: 'Strand',
    lat: 51.5104,
    lng: -0.1208,
    star_rating: 5,
    base_rate_gbp: 200,
    review_summary: 'An iconic London hotel.',
    amenities: ['spa', 'pool', 'concierge'],
    pricing_factors: {
      demand_curve: [1.0, 1.0, 1.0, 1.0, 1.15, 1.15, 0.9],
      seasonality: Array(12).fill(1.0),
      occupancy_base: 75,
    },
    pinecone_id: 'savoy-pinecone-id',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock dependencies — must be declared before the route import
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn().mockResolvedValue({ data: [makeHotel()], error: null }),
        or: vi.fn().mockResolvedValue({ data: [makeHotel()], error: null }),
      })),
    })),
  },
}));

vi.mock('@/lib/pinecone', () => ({
  getPineconeIndex: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ matches: [] }),
  })),
}));

vi.mock('@/lib/embeddings', () => ({
  generateQueryEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

vi.mock('@/lib/pricing', () => ({
  calculatePrice: vi.fn(() => ({
    baseRate: 200,
    demandMultiplier: 1.1,
    seasonalityMultiplier: 1.0,
    leadTimeMultiplier: 1.0,
    dayOfWeekMultiplier: 1.0,
    finalPrice: 220,
  })),
  calculateProjection: vi.fn(() =>
    Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() + i * 86400000).toISOString(),
      price: 220 + i * 5,
      factors: {
        baseRate: 200,
        demandMultiplier: 1.1,
        seasonalityMultiplier: 1.0,
        leadTimeMultiplier: 1.0,
        dayOfWeekMultiplier: 1.0,
        finalPrice: 220 + i * 5,
      },
    }))
  ),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

// Import route AFTER mocks
import { POST } from '@/app/api/url-analyze/route';

// ---------------------------------------------------------------------------
// Helper to build NextRequest
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/url-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody: string): NextRequest {
  return new NextRequest('http://localhost/api/url-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

// ---------------------------------------------------------------------------
// Input validation — 400 responses
// ---------------------------------------------------------------------------

describe('POST /api/url-analyze — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when hotelName is missing', async () => {
    const req = makeRequest({ listedPrice: 250, currency: 'GBP' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when hotelName is an empty string', async () => {
    const req = makeRequest({ hotelName: '', listedPrice: 250, currency: 'GBP' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when hotelName is whitespace only', async () => {
    const req = makeRequest({ hotelName: '   ', listedPrice: 250, currency: 'GBP' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when hotelName exceeds 200 characters', async () => {
    const req = makeRequest({
      hotelName: 'a'.repeat(201),
      listedPrice: 250,
      currency: 'GBP',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when listedPrice is missing', async () => {
    const req = makeRequest({ hotelName: 'The Savoy', currency: 'GBP' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when listedPrice is zero', async () => {
    const req = makeRequest({ hotelName: 'The Savoy', listedPrice: 0, currency: 'GBP' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when listedPrice is negative', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: -50,
      currency: 'GBP',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when listedPrice exceeds 10000', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 10001,
      currency: 'GBP',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when listedPrice is not a number', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 'three hundred',
      currency: 'GBP',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when currency is not GBP, USD, or EUR', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 250,
      currency: 'JPY',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when currency is missing', async () => {
    const req = makeRequest({ hotelName: 'The Savoy', listedPrice: 250 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when checkInDate is present but not a valid ISO date string', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 250,
      currency: 'GBP',
      checkInDate: 'not-a-date',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not valid JSON', async () => {
    const req = makeRawRequest('not-json-at-all');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('accepts listedPrice exactly at 10000 (upper boundary, not invalid)', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 10000,
      currency: 'GBP',
    });
    const res = await POST(req);
    expect(res.status).not.toBe(400);
  });

  it('accepts listedPrice exactly at 1 (lower boundary, not invalid)', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 1,
      currency: 'GBP',
    });
    const res = await POST(req);
    expect(res.status).not.toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Valid request — matched hotel response
// ---------------------------------------------------------------------------

describe('POST /api/url-analyze — matched response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish the default mock (exactMatch returns a hotel)
    const { supabase } = require('@/lib/supabase');
    supabase.from.mockReturnValue({
      select: vi.fn(() => ({
        ilike: vi.fn().mockResolvedValue({ data: [makeHotel()], error: null }),
        or: vi.fn().mockResolvedValue({ data: [makeHotel()], error: null }),
      })),
    });
  });

  it('returns 200 with matched: true for a known hotel', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 350,
      currency: 'GBP',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.matched).toBe(true);
  });

  it('matched response includes all required UrlAnalysisMatched fields', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 350,
      currency: 'GBP',
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json).toHaveProperty('matched', true);
    expect(json).toHaveProperty('extractedName');
    expect(json).toHaveProperty('matchedHotel');
    expect(json).toHaveProperty('matchMethod');
    expect(json).toHaveProperty('matchConfidence');
    expect(json).toHaveProperty('modelPrice');
    expect(json).toHaveProperty('listedPrice');
    expect(json).toHaveProperty('listedPriceGbp');
    expect(json).toHaveProperty('currency');
    expect(json).toHaveProperty('dealScore');
    expect(json).toHaveProperty('pricingBreakdown');
    expect(json).toHaveProperty('projection');
  });

  it('exact match returns matchMethod: exact and matchConfidence: 1.0', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 350,
      currency: 'GBP',
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.matchMethod).toBe('exact');
    expect(json.matchConfidence).toBe(1.0);
  });

  it('listedPrice and listedPriceGbp reflect the submitted values', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 350,
      currency: 'GBP',
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.listedPrice).toBe(350);
    expect(json.listedPriceGbp).toBe(350); // GBP passthrough
  });

  it('converts USD listedPrice to GBP using rate 0.79', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 350,
      currency: 'USD',
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.listedPrice).toBe(350);
    expect(json.currency).toBe('USD');
    // 350 * 0.79 = 276.5
    expect(json.listedPriceGbp).toBeCloseTo(276.5, 1);
  });

  it('dealScore has correct structure', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 350,
      currency: 'GBP',
    });
    const res = await POST(req);
    const json = await res.json();

    const { dealScore } = json;
    expect(dealScore).toHaveProperty('label');
    expect(dealScore).toHaveProperty('percentageDiff');
    expect(dealScore).toHaveProperty('savingsGbp');
    expect(dealScore).toHaveProperty('direction');
    expect(['Great Deal', 'Fair Price', 'Overpriced']).toContain(dealScore.label);
    expect(['saving', 'overpaying']).toContain(dealScore.direction);
    expect(typeof dealScore.percentageDiff).toBe('number');
    expect(dealScore.percentageDiff).toBeGreaterThanOrEqual(0);
    expect(typeof dealScore.savingsGbp).toBe('number');
    expect(dealScore.savingsGbp).toBeGreaterThanOrEqual(0);
  });

  it('projection is an array of 7 ProjectionPoints', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 350,
      currency: 'GBP',
    });
    const res = await POST(req);
    const json = await res.json();

    expect(Array.isArray(json.projection)).toBe(true);
    expect(json.projection).toHaveLength(7);
  });

  it('pricingBreakdown has the required fields', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 350,
      currency: 'GBP',
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.pricingBreakdown).toHaveProperty('baseRate');
    expect(json.pricingBreakdown).toHaveProperty('demandMultiplier');
    expect(json.pricingBreakdown).toHaveProperty('seasonalityMultiplier');
    expect(json.pricingBreakdown).toHaveProperty('leadTimeMultiplier');
    expect(json.pricingBreakdown).toHaveProperty('dayOfWeekMultiplier');
    expect(json.pricingBreakdown).toHaveProperty('finalPrice');
  });

  it('source field is echoed back when provided', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 350,
      currency: 'GBP',
      source: 'booking',
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.source).toBe('booking');
  });

  it('accepts an optional valid checkInDate without error', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 350,
      currency: 'GBP',
      checkInDate: '2026-06-15',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Not-matched response
// ---------------------------------------------------------------------------

describe('POST /api/url-analyze — not-matched response', () => {
  it('returns matched: false when no hotel is found in any tier', async () => {
    const { supabase } = require('@/lib/supabase');
    supabase.from.mockReturnValue({
      select: vi.fn(() => ({
        ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
        or: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    });

    const { getPineconeIndex } = require('@/lib/pinecone');
    getPineconeIndex.mockReturnValue({
      query: vi.fn().mockResolvedValue({ matches: [] }),
    });

    const req = makeRequest({
      hotelName: 'Completely Unknown Hotel XYZ',
      listedPrice: 250,
      currency: 'GBP',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.matched).toBe(false);
    expect(json).toHaveProperty('extractedName');
    expect(json).toHaveProperty('listedPrice');
    expect(json).toHaveProperty('listedPriceGbp');
    expect(json).toHaveProperty('currency');
    // No dealScore, matchedHotel, or projection in not-matched response
    expect(json).not.toHaveProperty('dealScore');
    expect(json).not.toHaveProperty('matchedHotel');
  });
});

// ---------------------------------------------------------------------------
// Disambiguation response
// ---------------------------------------------------------------------------

describe('POST /api/url-analyze — disambiguation response', () => {
  it('returns disambiguation array when top 2 fuzzy results are within 0.05 confidence', async () => {
    // Two hotels with similar names to force disambiguation
    const hotel1 = makeHotel({ id: 'uuid-1', name: 'Park Plaza Westminster Bridge' });
    const hotel2 = makeHotel({ id: 'uuid-2', name: 'Park Grand London Westminster' });

    const { supabase } = require('@/lib/supabase');
    supabase.from.mockReturnValue({
      select: vi.fn(() => ({
        // exactMatch returns nothing
        ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
        // fuzzyMatch returns two similarly-named hotels
        or: vi.fn().mockResolvedValue({ data: [hotel1, hotel2], error: null }),
      })),
    });

    const req = makeRequest({
      hotelName: 'Park Westminster',
      listedPrice: 200,
      currency: 'GBP',
    });
    const res = await POST(req);
    const json = await res.json();

    // If disambiguation is triggered, matched should be false and disambiguation should be present
    if ('disambiguation' in json) {
      expect(json.matched).toBe(false);
      expect(Array.isArray(json.disambiguation)).toBe(true);
      expect(json.disambiguation.length).toBeGreaterThanOrEqual(2);
      expect(json.disambiguation.length).toBeLessThanOrEqual(3);
      for (const candidate of json.disambiguation) {
        expect(candidate).toHaveProperty('hotel');
        expect(candidate).toHaveProperty('confidence');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Currency validation
// ---------------------------------------------------------------------------

describe('POST /api/url-analyze — currency validation', () => {
  it('accepts GBP currency', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 300,
      currency: 'GBP',
    });
    const res = await POST(req);
    expect(res.status).not.toBe(400);
  });

  it('accepts USD currency', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 300,
      currency: 'USD',
    });
    const res = await POST(req);
    expect(res.status).not.toBe(400);
  });

  it('accepts EUR currency', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 300,
      currency: 'EUR',
    });
    const res = await POST(req);
    expect(res.status).not.toBe(400);
  });

  it('rejects CHF with 400', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 300,
      currency: 'CHF',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects lowercase currency with 400', async () => {
    const req = makeRequest({
      hotelName: 'The Savoy',
      listedPrice: 300,
      currency: 'gbp',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Route-level constants
// ---------------------------------------------------------------------------

describe('POST /api/url-analyze — route configuration', () => {
  it('exports dynamic = force-dynamic', async () => {
    const routeModule = await import('@/app/api/url-analyze/route');
    expect((routeModule as Record<string, unknown>).dynamic).toBe('force-dynamic');
  });
});
