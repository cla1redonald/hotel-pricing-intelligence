/**
 * Competitive Set + Insight API Tests
 * Tests for POST /api/competitive-set and POST /api/insight
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const result = { ...obj };
  delete result[key];
  return result;
}

// ---------------------------------------------------------------------------
// Shared fake hotel data
// ---------------------------------------------------------------------------

const FAKE_HOTEL_SOURCE = {
  id: 'uuid-source',
  name: 'The Mayfair Grand',
  neighborhood: 'Mayfair',
  lat: 51.5097,
  lng: -0.1459,
  star_rating: 5,
  base_rate_gbp: 300.0,
  review_summary: 'Opulent rooms. Exceptional service.',
  amenities: ['WiFi', 'Spa', 'Pool'],
  pricing_factors: {
    demand_curve: [1.0, 1.1, 1.1, 1.05, 1.0, 0.9, 0.85],
    seasonality: [0.85, 0.87, 0.92, 1.0, 1.1, 1.2, 1.3, 1.3, 1.1, 1.0, 0.9, 0.88],
    occupancy_base: 80,
  },
  pinecone_id: 'pinecone-source',
  created_at: '2024-01-01T00:00:00Z',
};

const FAKE_HOTEL_COMP_1 = {
  id: 'uuid-comp-1',
  name: 'The Belgravia',
  neighborhood: 'Belgravia',
  lat: 51.4975,
  lng: -0.1527,
  star_rating: 4,
  base_rate_gbp: 250.0,
  review_summary: 'Elegant and refined.',
  amenities: ['WiFi', 'Restaurant'],
  pricing_factors: {
    demand_curve: [1.0, 1.0, 1.05, 1.05, 1.0, 0.95, 0.9],
    seasonality: [0.85, 0.88, 0.92, 1.0, 1.1, 1.2, 1.3, 1.3, 1.1, 1.0, 0.9, 0.88],
    occupancy_base: 70,
  },
  pinecone_id: 'pinecone-comp-1',
  created_at: '2024-01-01T00:00:00Z',
};

const FAKE_HOTEL_COMP_2 = {
  id: 'uuid-comp-2',
  name: 'Park Lane Suites',
  neighborhood: 'Mayfair',
  lat: 51.5061,
  lng: -0.1516,
  star_rating: 4,
  base_rate_gbp: 280.0,
  review_summary: 'Perfect location.',
  amenities: ['WiFi', 'Gym'],
  pricing_factors: {
    demand_curve: [1.0, 1.1, 1.1, 1.0, 0.95, 0.9, 0.88],
    seasonality: [0.88, 0.9, 0.95, 1.0, 1.1, 1.2, 1.3, 1.3, 1.1, 1.0, 0.9, 0.88],
    occupancy_base: 75,
  },
  pinecone_id: 'pinecone-comp-2',
  created_at: '2024-01-01T00:00:00Z',
};

const FAKE_HOTEL_COMP_3 = {
  id: 'uuid-comp-3',
  name: 'Knightsbridge Manor',
  neighborhood: 'Knightsbridge',
  lat: 51.5021,
  lng: -0.163,
  star_rating: 5,
  base_rate_gbp: 320.0,
  review_summary: 'Luxurious stay.',
  amenities: ['WiFi', 'Spa', 'Concierge'],
  pricing_factors: {
    demand_curve: [1.05, 1.1, 1.1, 1.1, 1.0, 0.95, 0.9],
    seasonality: [0.85, 0.87, 0.92, 1.0, 1.1, 1.2, 1.3, 1.3, 1.1, 1.0, 0.9, 0.88],
    occupancy_base: 85,
  },
  pinecone_id: 'pinecone-comp-3',
  created_at: '2024-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Mock: Pinecone
// ---------------------------------------------------------------------------

vi.mock('@/lib/pinecone', () => ({
  getPineconeIndex: vi.fn(() => ({
    fetch: vi.fn().mockResolvedValue({
      records: {
        'pinecone-source': {
          id: 'pinecone-source',
          values: new Array(1536).fill(0.1),
          metadata: { name: 'The Mayfair Grand', neighborhood: 'Mayfair' },
        },
      },
    }),
    query: vi.fn().mockResolvedValue({
      matches: [
        { id: 'pinecone-source', score: 1.0 },  // self — should be filtered out
        { id: 'pinecone-comp-1', score: 0.93 },
        { id: 'pinecone-comp-2', score: 0.89 },
        { id: 'pinecone-comp-3', score: 0.85 },
      ],
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock: Supabase
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase', () => {
  const competitorData = [FAKE_HOTEL_COMP_1, FAKE_HOTEL_COMP_2, FAKE_HOTEL_COMP_3];
  const sourceData = [FAKE_HOTEL_SOURCE];

  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({ data: competitorData, error: null }),
          eq: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: sourceData, error: null }),
          })),
        })),
      })),
    },
  };
});

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks
// ---------------------------------------------------------------------------
import { POST } from '@/app/api/competitive-set/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompSetRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/competitive-set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody: string, url: string): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

// ---------------------------------------------------------------------------
// Tests: POST /api/competitive-set
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/competitive-set — input validation', () => {
  it('returns 400 when pineconeId is missing', async () => {
    const req = makeCompSetRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
    expect(json.error).toMatch(/pineconeId/i);
  });

  it('returns 400 when pineconeId is empty string', async () => {
    const req = makeCompSetRequest({ pineconeId: '' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when body is not valid JSON', async () => {
    const req = makeRawRequest('not-json', 'http://localhost/api/competitive-set');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when pineconeId is null', async () => {
    const req = makeCompSetRequest({ pineconeId: null });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });
});

describe('POST /api/competitive-set — successful response shape', () => {
  it('returns 200 with competitors array for a valid pineconeId', async () => {
    const req = makeCompSetRequest({ pineconeId: 'pinecone-source' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('competitors');
    expect(Array.isArray(json.competitors)).toBe(true);
  });

  it('filters out the source hotel from competitors', async () => {
    const req = makeCompSetRequest({ pineconeId: 'pinecone-source' });
    const res = await POST(req);
    const json = await res.json();
    const ids = json.competitors.map(
      (c: { hotel: { pinecone_id: string } }) => c.hotel.pinecone_id
    );
    expect(ids).not.toContain('pinecone-source');
  });

  it('each competitor has hotel, matchScore, dynamicPrice, and priceDelta', async () => {
    const req = makeCompSetRequest({ pineconeId: 'pinecone-source' });
    const res = await POST(req);
    const json = await res.json();

    for (const competitor of json.competitors) {
      expect(competitor).toHaveProperty('hotel');
      expect(competitor).toHaveProperty('matchScore');
      expect(competitor).toHaveProperty('dynamicPrice');
      expect(competitor).toHaveProperty('priceDelta');
    }
  });

  it('dynamicPrice is a positive number', async () => {
    const req = makeCompSetRequest({ pineconeId: 'pinecone-source' });
    const res = await POST(req);
    const json = await res.json();

    for (const competitor of json.competitors) {
      expect(typeof competitor.dynamicPrice).toBe('number');
      expect(competitor.dynamicPrice).toBeGreaterThan(0);
    }
  });

  it('priceDelta is dynamicPrice minus sourcePrice (a number)', async () => {
    const req = makeCompSetRequest({ pineconeId: 'pinecone-source' });
    const res = await POST(req);
    const json = await res.json();

    for (const competitor of json.competitors) {
      expect(typeof competitor.priceDelta).toBe('number');
    }
  });

  it('accepts optional checkInDate field', async () => {
    const req = makeCompSetRequest({
      pineconeId: 'pinecone-source',
      checkInDate: '2026-06-15',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/competitive-set — service errors', () => {
  it('returns 404 when source hotel vector is not found in Pinecone', async () => {
    const { getPineconeIndex } = await import('@/lib/pinecone');
    vi.mocked(getPineconeIndex).mockReturnValueOnce({
      fetch: vi.fn().mockResolvedValue({ records: {} }),
      query: vi.fn(),
    } as never);

    const req = makeCompSetRequest({ pineconeId: 'nonexistent-hotel' });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 500 when Pinecone fetch throws', async () => {
    const { getPineconeIndex } = await import('@/lib/pinecone');
    vi.mocked(getPineconeIndex).mockReturnValueOnce({
      fetch: vi.fn().mockRejectedValueOnce(new Error('Pinecone unavailable')),
      query: vi.fn(),
    } as never);

    const req = makeCompSetRequest({ pineconeId: 'pinecone-source' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/insight
// ---------------------------------------------------------------------------

describe('POST /api/insight — input validation', () => {
  async function importInsightPost() {
    // Each test needs a fresh import; we use a dynamic import to get the handler
    const mod = await import('@/app/api/insight/route');
    return mod.POST;
  }

  function makeInsightRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const validInsightBody = {
    hotelName: 'The Mayfair Grand',
    neighborhood: 'Mayfair',
    dynamicPrice: 412,
    pricingBreakdown: {
      baseRate: 300,
      demandMultiplier: 1.3,
      seasonalityMultiplier: 1.1,
      leadTimeMultiplier: 1.05,
      dayOfWeekMultiplier: 1.0,
      finalPrice: 412,
    },
    competitors: [
      { name: 'The Belgravia', price: 340 },
      { name: 'Park Lane Suites', price: 390 },
    ],
  };

  it('returns 400 when hotelName is missing', async () => {
    const POST = await importInsightPost();
    const body = omit(validInsightBody, 'hotelName');
    const req = makeInsightRequest(body);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when neighborhood is missing', async () => {
    const POST = await importInsightPost();
    const body = omit(validInsightBody, 'neighborhood');
    const req = makeInsightRequest(body);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when dynamicPrice is missing', async () => {
    const POST = await importInsightPost();
    const body = omit(validInsightBody, 'dynamicPrice');
    const req = makeInsightRequest(body);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when pricingBreakdown is missing', async () => {
    const POST = await importInsightPost();
    const body = omit(validInsightBody, 'pricingBreakdown');
    const req = makeInsightRequest(body);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when competitors is missing', async () => {
    const POST = await importInsightPost();
    const body = omit(validInsightBody, 'competitors');
    const req = makeInsightRequest(body);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is invalid JSON', async () => {
    const POST = await importInsightPost();
    const req = makeRawRequest('not-json', 'http://localhost/api/insight');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns a streaming response for a valid request', async () => {
    // Mock the Anthropic SDK to return a controlled async iterator
    vi.doMock('@anthropic-ai/sdk', () => {
      const fakeStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Book now' },
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: ' — great value.' },
          };
        },
      };

      return {
        default: vi.fn().mockImplementation(() => ({
          messages: {
            stream: vi.fn().mockReturnValue(fakeStream),
          },
        })),
      };
    });

    const POST = await importInsightPost();
    const req = makeInsightRequest(validInsightBody);
    const res = await POST(req);

    // Should return a streaming response
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(res.body).not.toBeNull();
  });
});
