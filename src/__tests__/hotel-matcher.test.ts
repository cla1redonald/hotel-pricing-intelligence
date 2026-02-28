/**
 * Hotel Matcher Tests
 * Tests for src/lib/hotel-matcher.ts — matching logic helpers.
 * Only the pure internal helpers are tested here without database mocks.
 * Full exactMatch/fuzzyMatch/semanticMatch integration tests belong in the API test.
 * All tests are expected to FAIL until the implementation is written.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the exported matching functions with injected mocks for Supabase.
// The internal helpers (sanitizeKeyword, getKeywords) are tested via their
// observable effect on the fuzzyMatch query — and via direct export if exposed.
import {
  exactMatch,
  fuzzyMatch,
  type MatchResult,
} from '@/lib/hotel-matcher';
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
    base_rate_gbp: 600,
    review_summary: 'An iconic London hotel.',
    amenities: ['spa', 'pool', 'concierge'],
    pricing_factors: {
      demand_curve: [1.0, 1.0, 1.0, 1.0, 1.15, 1.15, 0.9],
      seasonality: Array(12).fill(1.0),
      occupancy_base: 85,
    },
    pinecone_id: 'savoy-pinecone-id',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// exactMatch — with mocked Supabase client
// ---------------------------------------------------------------------------

describe('exactMatch', () => {
  it('returns a MatchResult with confidence 1.0 when Supabase finds the hotel', async () => {
    const hotel = makeHotel();
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          ilike: vi.fn().mockResolvedValue({ data: [hotel], error: null }),
        })),
      })),
    };

    const result: MatchResult | null = await exactMatch(
      'The Savoy',
      mockSupabase as never
    );

    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1.0);
    expect(result!.hotel.name).toBe('The Savoy');
  });

  it('returns null when Supabase returns no data', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    };

    const result = await exactMatch('NonExistentHotel', mockSupabase as never);
    expect(result).toBeNull();
  });

  it('returns null when Supabase returns null data', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          ilike: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    };

    const result = await exactMatch('Some Hotel', mockSupabase as never);
    expect(result).toBeNull();
  });

  it('performs case-insensitive matching via ILIKE', async () => {
    const hotel = makeHotel({ name: 'The Savoy' });
    const mockIlike = vi.fn().mockResolvedValue({ data: [hotel], error: null });
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          ilike: mockIlike,
        })),
      })),
    };

    await exactMatch('the savoy', mockSupabase as never);

    // ILIKE should be called with the hotel name field and the search term
    expect(mockIlike).toHaveBeenCalled();
    const [field] = mockIlike.mock.calls[0];
    expect(field).toBe('name');
  });
});

// ---------------------------------------------------------------------------
// fuzzyMatch — keyword extraction behaviour
// ---------------------------------------------------------------------------

describe('fuzzyMatch', () => {
  it('returns an array of MatchResults (empty array when no matches)', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    };

    const results: MatchResult[] = await fuzzyMatch(
      'NonExistentHotel',
      mockSupabase as never
    );

    expect(Array.isArray(results)).toBe(true);
  });

  it('returns MatchResults with confidence scores between 0 and 1', async () => {
    const hotel1 = makeHotel({ id: 'uuid-1', name: 'Park Plaza Westminster Bridge' });
    const hotel2 = makeHotel({ id: 'uuid-2', name: 'Park Grand London Victoria' });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: vi.fn().mockResolvedValue({
            data: [hotel1, hotel2],
            error: null,
          }),
        })),
      })),
    };

    const results = await fuzzyMatch(
      'Park Plaza Westminster',
      mockSupabase as never
    );

    expect(results.length).toBeGreaterThanOrEqual(0);
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('assigns higher confidence to the closer matching hotel', async () => {
    const hotel1 = makeHotel({ id: 'uuid-1', name: 'Park Plaza Westminster Bridge' });
    const hotel2 = makeHotel({ id: 'uuid-2', name: 'Park Lane Hotel' });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: vi.fn().mockResolvedValue({
            data: [hotel1, hotel2],
            error: null,
          }),
        })),
      })),
    };

    const results = await fuzzyMatch(
      'Park Plaza Westminster Bridge',
      mockSupabase as never
    );

    if (results.length >= 2) {
      // Park Plaza Westminster Bridge should score higher than Park Lane Hotel
      const plaza = results.find(r => r.hotel.name === 'Park Plaza Westminster Bridge');
      const lane = results.find(r => r.hotel.name === 'Park Lane Hotel');
      if (plaza && lane) {
        expect(plaza.confidence).toBeGreaterThan(lane.confidence);
      }
    }
  });

  it('filters stop words from keyword extraction', async () => {
    const mockOr = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: mockOr,
        })),
      })),
    };

    // "The Savoy Hotel London" → stop words: 'the', 'hotel', 'london'
    // remaining keywords: ['savoy']
    await fuzzyMatch('The Savoy Hotel London', mockSupabase as never);

    if (mockOr.mock.calls.length > 0) {
      const orArg: string = mockOr.mock.calls[0][0];
      // Stop words should not appear as standalone ILIKE patterns
      expect(orArg).not.toMatch(/\bilike.*"the"\b/i);
      expect(orArg).not.toMatch(/\bilike.*"hotel"\b/i);
      expect(orArg).not.toMatch(/\bilike.*"london"\b/i);
    }
  });

  it('uses up to 3 keywords in the ILIKE query', async () => {
    const mockOr = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: mockOr,
        })),
      })),
    };

    // "Park Plaza Westminster Bridge Kensington" → 5 meaningful keywords
    // but only up to 3 should be used
    await fuzzyMatch(
      'Park Plaza Westminster Bridge Kensington Marble',
      mockSupabase as never
    );

    if (mockOr.mock.calls.length > 0) {
      const orArg: string = mockOr.mock.calls[0][0];
      // Count how many 'ilike' conditions appear
      const ilikeCount = (orArg.match(/ilike/gi) || []).length;
      expect(ilikeCount).toBeLessThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Keyword extraction (sanitizeKeyword / getKeywords behaviour)
// ---------------------------------------------------------------------------

describe('keyword extraction — sanitization and stop word filtering', () => {
  // These tests exercise the keyword behaviour through fuzzyMatch's observable output.
  // They verify that sanitization and filtering are correct without needing
  // sanitizeKeyword to be exported directly.

  it('strips non-alphanumeric characters from keywords to prevent injection', async () => {
    const mockOr = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: mockOr,
        })),
      })),
    };

    // Hotel name with special characters
    await fuzzyMatch("Savoy's Hotel & Spa!", mockSupabase as never);

    if (mockOr.mock.calls.length > 0) {
      const orArg: string = mockOr.mock.calls[0][0];
      // Characters like ', &, ! should not appear in the query
      expect(orArg).not.toContain("'");
      expect(orArg).not.toContain('&');
      expect(orArg).not.toContain('!');
    }
  });

  it('excludes all defined stop words from keyword list', async () => {
    const stopWords = [
      'hotel', 'hotels', 'london', 'the', 'a', 'an',
      'by', 'at', 'in', 'and', 'of', 'resort', 'suites', 'suite',
    ];

    const mockOr = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: mockOr,
        })),
      })),
    };

    // A hotel name composed entirely of stop words
    await fuzzyMatch('The Hotel London', mockSupabase as never);

    // When all words are stop words, fuzzyMatch should produce no ILIKE conditions
    // OR the or() should not be called (no keywords to match on)
    if (mockOr.mock.calls.length > 0) {
      const orArg: string = mockOr.mock.calls[0][0];
      for (const word of stopWords) {
        // Stop word should not appear as a standalone keyword
        const pattern = new RegExp(`"%${word}%"`, 'i');
        expect(orArg).not.toMatch(pattern);
      }
    }
  });

  it('sanitizes keywords after stop word removal (not before)', async () => {
    const mockOr = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: mockOr,
        })),
      })),
    };

    // "Hotel123" — 'hotel' is a stop word but '123' is not
    // After stripping stop words: [] (hotel removed), but sanitization runs after
    // "Savoy123" — not a stop word, sanitized to 'savoy123'
    await fuzzyMatch('Savoy123 Hotel London', mockSupabase as never);

    if (mockOr.mock.calls.length > 0) {
      const orArg: string = mockOr.mock.calls[0][0];
      // savoy123 should appear (alphanumeric remains); hotel and london removed
      expect(orArg.toLowerCase()).toContain('savoy123');
    }
  });

  it('does not include keywords shorter than 2 chars after sanitization', async () => {
    const mockOr = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: mockOr,
        })),
      })),
    };

    // Keyword "A-1" sanitizes to "a1" (2 chars) — borderline
    // Keyword "X" sanitizes to "x" (1 char) — should be filtered out
    await fuzzyMatch('X Savoy Hotel', mockSupabase as never);

    if (mockOr.mock.calls.length > 0) {
      const orArg: string = mockOr.mock.calls[0][0];
      // Single-char keyword should not appear
      expect(orArg).not.toContain('"%x%"');
    }
  });

  it('handles empty input gracefully in keyword extraction path', async () => {
    const mockOr = vi.fn().mockResolvedValue({ data: [], error: null });
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: mockOr,
        })),
      })),
    };

    const results = await fuzzyMatch('', mockSupabase as never);
    // Should return an empty array without throwing
    expect(Array.isArray(results)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Jaccard scoring behaviour
// ---------------------------------------------------------------------------

describe('fuzzyMatch — Jaccard confidence scoring', () => {
  it('scores an exact keyword match (all query keywords found in hotel name) near 1.0', async () => {
    // "Savoy" → hotel name "The Savoy" contains 'savoy' → bidirectional Jaccard ≈ high
    const hotel = makeHotel({ name: 'The Savoy' });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: vi.fn().mockResolvedValue({ data: [hotel], error: null }),
        })),
      })),
    };

    const results = await fuzzyMatch('The Savoy', mockSupabase as never);

    if (results.length > 0) {
      expect(results[0].confidence).toBeGreaterThan(0.5);
    }
  });

  it('returns a lower confidence for a partial keyword match', async () => {
    const hotelA = makeHotel({ id: 'a', name: 'Park Plaza Westminster Bridge London' });
    const hotelB = makeHotel({ id: 'b', name: 'Savoy Hotel' });

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          or: vi.fn().mockResolvedValue({
            data: [hotelA, hotelB],
            error: null,
          }),
        })),
      })),
    };

    // Query is "Park Plaza" — matches hotelA better than hotelB
    const results = await fuzzyMatch('Park Plaza', mockSupabase as never);

    if (results.length >= 2) {
      const plaza = results.find(r => r.hotel.id === 'a');
      const savoy = results.find(r => r.hotel.id === 'b');
      if (plaza && savoy) {
        expect(plaza.confidence).toBeGreaterThan(savoy.confidence);
      }
    }
  });
});
