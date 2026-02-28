/**
 * URL Parser Tests
 * Tests for src/lib/url-parser.ts — pure client-side URL parsing.
 * All tests are expected to FAIL until the implementation is written.
 */

import { describe, it, expect } from 'vitest';
import { parseHotelUrl } from '@/lib/url-parser';
import type { ParsedUrl } from '@/types';

// ---------------------------------------------------------------------------
// Booking.com URLs
// ---------------------------------------------------------------------------

describe('parseHotelUrl — Booking.com', () => {
  it('extracts hotel name from a standard Booking.com GB URL', () => {
    const result: ParsedUrl = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html'
    );
    expect(result.hotelName).toBe('The Savoy');
    expect(result.source).toBe('booking');
    expect(result.originalUrl).toBe(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html'
    );
  });

  it('strips the .en-gb locale suffix from Booking.com hotel slug', () => {
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/gb/claridges.en-gb.html'
    );
    expect(result.hotelName).toBe('Claridges');
  });

  it('converts hyphens to spaces and title-cases the hotel name', () => {
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/gb/strand-palace-hotel.en-gb.html'
    );
    expect(result.hotelName).toBe('Strand Palace Hotel');
  });

  it('handles a multi-word hotel name with many hyphens', () => {
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/gb/park-plaza-westminster-bridge.en-gb.html'
    );
    expect(result.hotelName).toBe('Park Plaza Westminster Bridge');
  });

  it('extracts checkin date from Booking.com URL query param', () => {
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html?checkin=2026-03-01&checkout=2026-03-05'
    );
    expect(result.hotelName).toBe('The Savoy');
    expect(result.checkInDate).toBe('2026-03-01');
  });

  it('populates checkInDate only when checkin param is a valid ISO date', () => {
    const validResult = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html?checkin=2026-06-15'
    );
    expect(validResult.checkInDate).toBe('2026-06-15');
  });

  it('ignores checkin param that does not match YYYY-MM-DD format', () => {
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html?checkin=15-06-2026'
    );
    expect(result.checkInDate).toBeUndefined();
  });

  it('ignores checkin param with invalid date value', () => {
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html?checkin=not-a-date'
    );
    expect(result.checkInDate).toBeUndefined();
  });

  it('still extracts hotel name when URL has no query params', () => {
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html'
    );
    expect(result.checkInDate).toBeUndefined();
    expect(result.hotelName).toBe('The Savoy');
  });

  it('handles a non-GB Booking.com URL (sets source to booking, still extracts name)', () => {
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/fr/le-meurice.fr.html'
    );
    expect(result.source).toBe('booking');
    expect(result.hotelName).toBe('Le Meurice');
    expect(result.originalUrl).toBe(
      'https://www.booking.com/hotel/fr/le-meurice.fr.html'
    );
  });

  it('handles Booking.com URL without locale suffix in slug', () => {
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-ritz-london.html'
    );
    expect(result.hotelName).toBe('The Ritz London');
    expect(result.source).toBe('booking');
  });
});

// ---------------------------------------------------------------------------
// Hotels.com URLs
// ---------------------------------------------------------------------------

describe('parseHotelUrl — Hotels.com', () => {
  it('extracts hotel name from a Hotels.com URL with numeric hotel ID', () => {
    const result: ParsedUrl = parseHotelUrl(
      'https://www.hotels.com/ho12345/strand-palace-hotel/'
    );
    expect(result.hotelName).toBe('Strand Palace Hotel');
    expect(result.source).toBe('hotels');
  });

  it('converts hyphens to spaces and title-cases Hotels.com hotel name', () => {
    const result = parseHotelUrl(
      'https://www.hotels.com/ho98765/the-ned-london/'
    );
    expect(result.hotelName).toBe('The Ned London');
    expect(result.source).toBe('hotels');
  });

  it('preserves the original URL in Hotels.com result', () => {
    const url = 'https://www.hotels.com/ho12345/claridges-hotel/';
    const result = parseHotelUrl(url);
    expect(result.originalUrl).toBe(url);
  });

  it('handles Hotels.com URL with query params appended', () => {
    const result = parseHotelUrl(
      'https://www.hotels.com/ho12345/the-savoy/?pos=HCOM_UK&locale=en_GB'
    );
    expect(result.hotelName).toBe('The Savoy');
    expect(result.source).toBe('hotels');
  });
});

// ---------------------------------------------------------------------------
// Expedia URLs
// ---------------------------------------------------------------------------

describe('parseHotelUrl — Expedia', () => {
  it('extracts hotel name from an Expedia Hotel-Information URL', () => {
    const result: ParsedUrl = parseHotelUrl(
      'https://www.expedia.com/London-Hotels-The-Savoy.h12345.Hotel-Information'
    );
    expect(result.hotelName).toBe('The Savoy');
    expect(result.source).toBe('expedia');
  });

  it('handles Expedia URL with Hotels (plural) in path', () => {
    const result = parseHotelUrl(
      'https://www.expedia.com/London-Hotels-Strand-Palace.h67890.Hotel-Information'
    );
    expect(result.hotelName).toBe('Strand Palace');
    expect(result.source).toBe('expedia');
  });

  it('preserves the original URL in Expedia result', () => {
    const url =
      'https://www.expedia.com/London-Hotels-The-Savoy.h12345.Hotel-Information';
    const result = parseHotelUrl(url);
    expect(result.originalUrl).toBe(url);
  });

  it('converts hyphens to spaces and title-cases Expedia hotel name', () => {
    const result = parseHotelUrl(
      'https://www.expedia.com/London-Hotels-Park-Plaza-Westminster.h99999.Hotel-Information'
    );
    expect(result.hotelName).toBe('Park Plaza Westminster');
    expect(result.source).toBe('expedia');
  });
});

// ---------------------------------------------------------------------------
// Generic URLs
// ---------------------------------------------------------------------------

describe('parseHotelUrl — generic fallback', () => {
  it('extracts the longest meaningful path segment from an unknown hotel site', () => {
    const result: ParsedUrl = parseHotelUrl(
      'https://www.somehotelsite.com/hotels/the-langham-london'
    );
    expect(result.source).toBe('generic');
    // Should pick "the-langham-london" and title-case it
    expect(result.hotelName).toBe('The Langham London');
  });

  it('ignores path segments shorter than 4 characters in generic mode', () => {
    const result = parseHotelUrl('https://example.com/en/gb/claridges-hotel');
    expect(result.source).toBe('generic');
    // Should pick the longest meaningful segment
    expect(result.hotelName).toBeTruthy();
    expect(result.hotelName!.length).toBeGreaterThan(3);
  });

  it('sets source to generic for unrecognised OTA domains', () => {
    const result = parseHotelUrl(
      'https://www.tripadvisor.com/Hotel_Review-g186338-d1234567-Reviews-The_Savoy-London.html'
    );
    expect(result.source).toBe('generic');
    expect(result.originalUrl).toContain('tripadvisor.com');
  });
});

// ---------------------------------------------------------------------------
// Invalid / empty URLs
// ---------------------------------------------------------------------------

describe('parseHotelUrl — invalid and empty inputs', () => {
  it('returns hotelName: null for an invalid URL string', () => {
    const result: ParsedUrl = parseHotelUrl('not-a-url');
    expect(result.hotelName).toBeNull();
    expect(result.source).toBe('unknown');
    expect(result.originalUrl).toBe('not-a-url');
  });

  it('returns hotelName: null for an empty string', () => {
    const result = parseHotelUrl('');
    expect(result.hotelName).toBeNull();
    expect(result.source).toBe('unknown');
    expect(result.originalUrl).toBe('');
  });

  it('returns hotelName: null for a plain domain with no meaningful path', () => {
    const result = parseHotelUrl('https://www.booking.com/');
    expect(result.hotelName).toBeNull();
    expect(result.source).toBe('booking');
  });

  it('does not throw for malformed URLs — wraps in try/catch', () => {
    expect(() => parseHotelUrl('://bad url here!')).not.toThrow();
    const result = parseHotelUrl('://bad url here!');
    expect(result.hotelName).toBeNull();
    expect(result.source).toBe('unknown');
  });

  it('returns hotelName: null for a URL with only a root path', () => {
    const result = parseHotelUrl('https://www.hotels.com/');
    expect(result.hotelName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkInDate extraction edge cases
// ---------------------------------------------------------------------------

describe('parseHotelUrl — checkInDate extraction', () => {
  it('extracts checkInDate from a future date', () => {
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html?checkin=2027-12-25'
    );
    expect(result.checkInDate).toBe('2027-12-25');
  });

  it('does not set checkInDate for Hotels.com or Expedia URLs (only Booking.com)', () => {
    const hotelsResult = parseHotelUrl(
      'https://www.hotels.com/ho12345/strand-palace-hotel/?checkin=2026-06-01'
    );
    // Hotels.com does not have checkin in the same format — checkInDate should not be set
    // (implementation may vary, but the spec only specifies Booking.com extraction)
    expect(hotelsResult.checkInDate).toBeUndefined();

    const expediaResult = parseHotelUrl(
      'https://www.expedia.com/London-Hotels-The-Savoy.h12345.Hotel-Information?checkin=2026-06-01'
    );
    expect(expediaResult.checkInDate).toBeUndefined();
  });

  it('validates checkInDate passes YYYY-MM-DD regex before setting', () => {
    // Valid
    const valid = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html?checkin=2026-03-15'
    );
    expect(valid.checkInDate).toBe('2026-03-15');

    // Invalid — month 13 passes regex but is semantically wrong; spec only requires regex check
    const result = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html?checkin=2026-13-01'
    );
    // Regex /^\d{4}-\d{2}-\d{2}$/ would match this; behaviour depends on implementation
    // The key is that non-matching patterns are excluded
    const badPattern = parseHotelUrl(
      'https://www.booking.com/hotel/gb/the-savoy.en-gb.html?checkin=March-15'
    );
    expect(badPattern.checkInDate).toBeUndefined();
  });
});
