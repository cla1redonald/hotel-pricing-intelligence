/**
 * Search API Tests
 * Tests for POST /api/search — input validation, response shape, and external service mocking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---

// Mock OpenAI embedding helper to return a deterministic 1536-dim vector
vi.mock('@/lib/embeddings', () => ({
  generateQueryEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

// Mock Pinecone index with fake scored results
vi.mock('@/lib/pinecone', () => ({
  getPineconeIndex: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({
      matches: [
        { id: 'pinecone-hotel-1', score: 0.95 },
        { id: 'pinecone-hotel-2', score: 0.82 },
      ],
    }),
  })),
}));

// Mock Supabase client to return fake hotel records
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'uuid-1',
              name: 'The Grand Kensington',
              neighborhood: 'Kensington',
              lat: 51.4994,
              lng: -0.1779,
              star_rating: 4,
              base_rate_gbp: 220.0,
              review_summary: 'An elegant hotel. Wonderful staff. Highly recommended.',
              amenities: ['WiFi', 'Gym', 'Restaurant'],
              pricing_factors: {
                demand_curve: [1.0, 1.1, 1.1, 1.1, 1.0, 0.9, 0.85],
                seasonality: [0.85, 0.87, 0.92, 1.0, 1.1, 1.2, 1.3, 1.3, 1.1, 1.0, 0.9, 0.88],
                occupancy_base: 75,
              },
              pinecone_id: 'pinecone-hotel-1',
              created_at: '2024-01-01T00:00:00Z',
            },
            {
              id: 'uuid-2',
              name: 'City Boutique Hotel',
              neighborhood: 'Shoreditch',
              lat: 51.5228,
              lng: -0.0796,
              star_rating: 3,
              base_rate_gbp: 130.0,
              review_summary: 'Trendy location. Modern rooms. Good value.',
              amenities: ['WiFi', '24-hour reception'],
              pricing_factors: {
                demand_curve: [1.1, 1.1, 1.0, 1.0, 0.95, 1.05, 1.05],
                seasonality: [0.8, 0.82, 0.9, 0.98, 1.1, 1.2, 1.3, 1.3, 1.1, 1.0, 0.88, 0.82],
                occupancy_base: 60,
              },
              pinecone_id: 'pinecone-hotel-2',
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
          error: null,
        }),
      })),
    })),
  },
}));

// --- Import route handler AFTER mocks are set up ---
import { POST } from '@/app/api/search/route';

// --- Helper to build a NextRequest ---
function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// --- Helper to make a request with an unparseable body ---
function makeRawRequest(rawBody: string): NextRequest {
  return new NextRequest('http://localhost/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/search — input validation', () => {
  it('returns 400 when query is empty string', async () => {
    const req = makeRequest({ query: '' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when query is whitespace only', async () => {
    const req = makeRequest({ query: '   ' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when query exceeds 500 characters', async () => {
    const longQuery = 'a'.repeat(501);
    const req = makeRequest({ query: longQuery });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when body is missing the query field', async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when body is not valid JSON', async () => {
    const req = makeRawRequest('not-json');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 when query is null', async () => {
    const req = makeRequest({ query: null });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('accepts a query exactly 500 characters long', async () => {
    const exactQuery = 'a'.repeat(500);
    const req = makeRequest({ query: exactQuery });
    const res = await POST(req);
    // Should NOT return 400 for exactly 500 chars
    expect(res.status).not.toBe(400);
  });
});

describe('POST /api/search — successful response shape', () => {
  it('returns 200 with results array and meta for a valid query', async () => {
    const req = makeRequest({ query: 'luxury hotel near Hyde Park' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty('results');
    expect(json).toHaveProperty('meta');
    expect(Array.isArray(json.results)).toBe(true);
  });

  it('meta contains query, totalResults, and searchTimeMs', async () => {
    const req = makeRequest({ query: 'boutique hotel Shoreditch' });
    const res = await POST(req);
    const json = await res.json();

    expect(json.meta).toHaveProperty('query', 'boutique hotel Shoreditch');
    expect(json.meta).toHaveProperty('totalResults');
    expect(typeof json.meta.totalResults).toBe('number');
    expect(json.meta).toHaveProperty('searchTimeMs');
    expect(typeof json.meta.searchTimeMs).toBe('number');
    expect(json.meta.searchTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('each result has hotel, matchScore, and matchPercentage fields', async () => {
    const req = makeRequest({ query: 'family hotel with pool' });
    const res = await POST(req);
    const json = await res.json();

    expect(json.results.length).toBeGreaterThan(0);
    for (const result of json.results) {
      expect(result).toHaveProperty('hotel');
      expect(result).toHaveProperty('matchScore');
      expect(result).toHaveProperty('matchPercentage');
    }
  });

  it('matchScore is a number between 0 and 1', async () => {
    const req = makeRequest({ query: 'cozy bed and breakfast' });
    const res = await POST(req);
    const json = await res.json();

    for (const result of json.results) {
      expect(typeof result.matchScore).toBe('number');
      expect(result.matchScore).toBeGreaterThanOrEqual(0);
      expect(result.matchScore).toBeLessThanOrEqual(1);
    }
  });

  it('matchPercentage equals Math.round(matchScore * 100)', async () => {
    const req = makeRequest({ query: 'business hotel City of London' });
    const res = await POST(req);
    const json = await res.json();

    for (const result of json.results) {
      expect(result.matchPercentage).toBe(Math.round(result.matchScore * 100));
    }
  });

  it('results are sorted by matchScore descending', async () => {
    const req = makeRequest({ query: 'pet-friendly hotel Notting Hill' });
    const res = await POST(req);
    const json = await res.json();

    for (let i = 1; i < json.results.length; i++) {
      expect(json.results[i - 1].matchScore).toBeGreaterThanOrEqual(
        json.results[i].matchScore
      );
    }
  });

  it('totalResults matches the number of items in the results array', async () => {
    const req = makeRequest({ query: 'romantic hotel Westminster' });
    const res = await POST(req);
    const json = await res.json();

    expect(json.meta.totalResults).toBe(json.results.length);
  });

  it('each hotel has the required Hotel interface fields', async () => {
    const req = makeRequest({ query: 'budget hotel near Heathrow' });
    const res = await POST(req);
    const json = await res.json();

    expect(json.results.length).toBeGreaterThan(0);
    for (const result of json.results) {
      const { hotel } = result;
      expect(hotel).toHaveProperty('id');
      expect(hotel).toHaveProperty('name');
      expect(hotel).toHaveProperty('neighborhood');
      expect(hotel).toHaveProperty('star_rating');
      expect(hotel).toHaveProperty('base_rate_gbp');
      expect(hotel).toHaveProperty('review_summary');
      expect(hotel).toHaveProperty('amenities');
      expect(hotel).toHaveProperty('pricing_factors');
      expect(hotel).toHaveProperty('pinecone_id');
      expect(Array.isArray(hotel.amenities)).toBe(true);
      expect(typeof hotel.pricing_factors).toBe('object');
    }
  });

  it('accepts optional checkInDate field without error', async () => {
    const req = makeRequest({ query: 'hotel near Tate Modern', checkInDate: '2026-06-15' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/search — edge cases', () => {
  it('returns empty results when Pinecone returns no matches', async () => {
    const { getPineconeIndex } = await import('@/lib/pinecone');
    vi.mocked(getPineconeIndex).mockReturnValueOnce({
      query: vi.fn().mockResolvedValue({ matches: [] }),
    } as never);

    const req = makeRequest({ query: 'extremely obscure query with no results' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([]);
    expect(json.meta.totalResults).toBe(0);
  });

  it('skips Pinecone results whose IDs are not found in Supabase', async () => {
    const { getPineconeIndex } = await import('@/lib/pinecone');
    vi.mocked(getPineconeIndex).mockReturnValueOnce({
      query: vi.fn().mockResolvedValue({
        matches: [
          { id: 'pinecone-hotel-1', score: 0.95 },
          { id: 'orphaned-id-not-in-supabase', score: 0.75 },
        ],
      }),
    } as never);

    const req = makeRequest({ query: 'hotel in Chelsea' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    // Only the hotel that exists in Supabase should appear
    const ids = json.results.map((r: { hotel: { pinecone_id: string } }) => r.hotel.pinecone_id);
    expect(ids).not.toContain('orphaned-id-not-in-supabase');
    expect(ids).toContain('pinecone-hotel-1');
  });

  it('returns 500 when the embedding service throws', async () => {
    const { generateQueryEmbedding } = await import('@/lib/embeddings');
    vi.mocked(generateQueryEmbedding).mockRejectedValueOnce(new Error('OpenAI rate limit'));

    const req = makeRequest({ query: 'hotel near Oxford Street' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 500 when Pinecone query throws', async () => {
    const { getPineconeIndex } = await import('@/lib/pinecone');
    vi.mocked(getPineconeIndex).mockReturnValueOnce({
      query: vi.fn().mockRejectedValueOnce(new Error('Pinecone connection failed')),
    } as never);

    const req = makeRequest({ query: 'hotel with rooftop bar' });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });
});
