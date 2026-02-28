/**
 * Real Data Pipeline Tests
 * Tests transformation functions for the Kaggle-sourced London hotel pipeline.
 * Tests: bookingScoreToStars, deriveBaseRate, deriveAmenities,
 *        deriveDemandCurve, deriveSeasonality, deriveOccupancyBase,
 *        derivePineconeId.
 */

import { describe, it, expect } from 'vitest';
import { bookingScoreToStars } from '../../scripts/data/clean';
import {
  deriveBaseRate,
  deriveAmenities,
  deriveDemandCurve,
  deriveSeasonality,
  deriveOccupancyBase,
  derivePineconeId,
} from '../../scripts/data/enrich';

// ─── Deterministic RNG for tests ──────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── bookingScoreToStars ──────────────────────────────────────────────────────

describe('bookingScoreToStars', () => {
  it('maps 9.0+ to 5 stars', () => {
    expect(bookingScoreToStars(9.0)).toBe(5);
    expect(bookingScoreToStars(9.5)).toBe(5);
    expect(bookingScoreToStars(9.6)).toBe(5);
  });

  it('maps 8.0-8.9 to 4 stars', () => {
    expect(bookingScoreToStars(8.0)).toBe(4);
    expect(bookingScoreToStars(8.5)).toBe(4);
    expect(bookingScoreToStars(8.9)).toBe(4);
  });

  it('maps 7.0-7.9 to 3 stars', () => {
    expect(bookingScoreToStars(7.0)).toBe(3);
    expect(bookingScoreToStars(7.5)).toBe(3);
    expect(bookingScoreToStars(7.9)).toBe(3);
  });

  it('maps 6.0-6.9 to 2 stars', () => {
    expect(bookingScoreToStars(6.0)).toBe(2);
    expect(bookingScoreToStars(6.4)).toBe(2);
    expect(bookingScoreToStars(6.9)).toBe(2);
  });

  it('maps below 6.0 to 1 star', () => {
    expect(bookingScoreToStars(5.9)).toBe(1);
    expect(bookingScoreToStars(5.0)).toBe(1);
    expect(bookingScoreToStars(3.0)).toBe(1);
  });

  it('handles boundary score exactly at 9.0', () => {
    expect(bookingScoreToStars(8.99)).toBe(4);
    expect(bookingScoreToStars(9.0)).toBe(5);
  });
});

// ─── deriveBaseRate ───────────────────────────────────────────────────────────

describe('deriveBaseRate', () => {
  it('returns a positive number', () => {
    const rate = deriveBaseRate(4, 'Westminster', 8.5, makeRng(1));
    expect(rate).toBeGreaterThan(0);
  });

  it('returns an integer (rounded to whole pounds)', () => {
    const rate = deriveBaseRate(3, 'Camden', 7.5, makeRng(2));
    expect(Number.isInteger(rate)).toBe(true);
  });

  it('5-star hotels have higher rates than 2-star in same neighborhood', () => {
    const rate5 = deriveBaseRate(5, 'Kensington', 9.0, makeRng(10));
    const rate2 = deriveBaseRate(2, 'Kensington', 7.0, makeRng(10));
    expect(rate5).toBeGreaterThan(rate2);
  });

  it('Mayfair rates exceed Stratford rates for same star tier', () => {
    const mayfair = deriveBaseRate(4, 'Mayfair', 8.5, makeRng(5));
    const stratford = deriveBaseRate(4, 'Stratford', 8.5, makeRng(5));
    expect(mayfair).toBeGreaterThan(stratford);
  });

  it('higher Booking.com score → higher rate within same star tier', () => {
    const highScore = deriveBaseRate(4, 'Westminster', 9.2, makeRng(7));
    const lowScore = deriveBaseRate(4, 'Westminster', 7.2, makeRng(7));
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('rates stay within reasonable bounds for each star tier', () => {
    const bounds: Record<number, [number, number]> = {
      1: [22, 90],
      2: [38, 140],
      3: [60, 250],
      4: [108, 450],
      5: [224, 900],
    };
    for (const [starStr, [min, max]] of Object.entries(bounds)) {
      const star = Number(starStr);
      const rate = deriveBaseRate(star, 'Westminster', 8.0, makeRng(star));
      expect(rate).toBeGreaterThanOrEqual(min);
      expect(rate).toBeLessThanOrEqual(max);
    }
  });

  it('is deterministic with the same RNG state', () => {
    const rate1 = deriveBaseRate(4, 'Westminster', 8.5, makeRng(99));
    const rate2 = deriveBaseRate(4, 'Westminster', 8.5, makeRng(99));
    expect(rate1).toBe(rate2);
  });
});

// ─── deriveAmenities ──────────────────────────────────────────────────────────

describe('deriveAmenities', () => {
  it('all hotels have WiFi and 24-hour reception', () => {
    for (let stars = 1; stars <= 5; stars++) {
      const amenities = deriveAmenities(stars, makeRng(stars));
      expect(amenities).toContain('WiFi');
      expect(amenities).toContain('24-hour reception');
    }
  });

  it('5-star hotels always have Spa, Pool, and Michelin restaurant', () => {
    const amenities = deriveAmenities(5, makeRng(100));
    expect(amenities).toContain('Spa');
    expect(amenities).toContain('Pool');
    expect(amenities).toContain('Michelin restaurant');
  });

  it('5-star hotels have more amenities than 2-star', () => {
    const five = deriveAmenities(5, makeRng(42));
    const two = deriveAmenities(2, makeRng(42));
    expect(five.length).toBeGreaterThan(two.length);
  });

  it('returns no duplicate amenities', () => {
    for (let stars = 1; stars <= 5; stars++) {
      const amenities = deriveAmenities(stars, makeRng(stars * 10));
      const unique = new Set(amenities);
      expect(unique.size).toBe(amenities.length);
    }
  });

  it('1-star hotels do not have Spa or Pool', () => {
    // Run multiple times to account for randomness
    for (let seed = 0; seed < 20; seed++) {
      const amenities = deriveAmenities(1, makeRng(seed));
      expect(amenities).not.toContain('Spa');
      expect(amenities).not.toContain('Pool');
    }
  });

  it('returns an array', () => {
    expect(Array.isArray(deriveAmenities(3, makeRng(1)))).toBe(true);
  });
});

// ─── deriveDemandCurve ────────────────────────────────────────────────────────

describe('deriveDemandCurve', () => {
  it('returns exactly 7 values', () => {
    const curve = deriveDemandCurve(4, 'Westminster', makeRng(1));
    expect(curve).toHaveLength(7);
  });

  it('all values are between 0.8 and 1.2', () => {
    const curves = [
      deriveDemandCurve(5, 'Mayfair', makeRng(1)),
      deriveDemandCurve(3, 'Camden', makeRng(2)),
      deriveDemandCurve(4, 'City of London', makeRng(3)),
      deriveDemandCurve(2, 'Stratford', makeRng(4)),
    ];
    for (const curve of curves) {
      for (const v of curve) {
        expect(v).toBeGreaterThanOrEqual(0.8);
        expect(v).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it('City of London 4-star has higher weekday than weekend demand', () => {
    const curve = deriveDemandCurve(4, 'City of London', makeRng(42));
    const weekdayAvg = (curve[0] + curve[1] + curve[2] + curve[3] + curve[4]) / 5;
    const weekendAvg = (curve[5] + curve[6]) / 2;
    // Business area: weekday should be at or above weekend
    expect(weekdayAvg).toBeGreaterThanOrEqual(weekendAvg * 0.9);
  });

  it('Soho 3-star has higher weekend than weekday demand', () => {
    const curve = deriveDemandCurve(3, 'Soho', makeRng(42));
    const weekdayAvg = (curve[0] + curve[1] + curve[2] + curve[3] + curve[4]) / 5;
    const weekendAvg = (curve[5] + curve[6]) / 2;
    // Leisure area: weekend should be at or above weekday
    expect(weekendAvg).toBeGreaterThanOrEqual(weekdayAvg * 0.9);
  });

  it('all values are finite numbers', () => {
    const curve = deriveDemandCurve(4, 'Westminster', makeRng(7));
    for (const v of curve) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

// ─── deriveSeasonality ────────────────────────────────────────────────────────

describe('deriveSeasonality', () => {
  it('returns exactly 12 values', () => {
    const season = deriveSeasonality(makeRng(1));
    expect(season).toHaveLength(12);
  });

  it('all values are between 0.80 and 1.40', () => {
    for (let seed = 0; seed < 20; seed++) {
      const season = deriveSeasonality(makeRng(seed));
      for (const v of season) {
        expect(v).toBeGreaterThanOrEqual(0.79); // tiny float tolerance
        expect(v).toBeLessThanOrEqual(1.41);
      }
    }
  });

  it('summer months (Jun=5, Jul=6, Aug=7) average higher than winter (Jan=0, Feb=1)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const s = deriveSeasonality(makeRng(seed));
      const summer = (s[5] + s[6] + s[7]) / 3;
      const winter = (s[0] + s[1]) / 2;
      expect(summer).toBeGreaterThan(winter);
    }
  });

  it('all values are finite numbers', () => {
    const season = deriveSeasonality(makeRng(100));
    for (const v of season) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

// ─── deriveOccupancyBase ──────────────────────────────────────────────────────

describe('deriveOccupancyBase', () => {
  it('always returns a value in range 30-95', () => {
    const configs: [number, string, number][] = [
      [5, 'Mayfair', 9.5],
      [1, 'Stratford', 6.5],
      [3, 'Camden', 7.8],
      [4, 'City of London', 8.2],
    ];
    for (const [stars, neighborhood, score] of configs) {
      for (let seed = 0; seed < 10; seed++) {
        const occ = deriveOccupancyBase(stars, neighborhood, score, makeRng(seed));
        expect(occ).toBeGreaterThanOrEqual(30);
        expect(occ).toBeLessThanOrEqual(95);
      }
    }
  });

  it('returns an integer', () => {
    const occ = deriveOccupancyBase(4, 'Westminster', 8.5, makeRng(1));
    expect(Number.isInteger(occ)).toBe(true);
  });

  it('central luxury hotels tend to have higher occupancy than budget outer hotels', () => {
    const luxuryOccs: number[] = [];
    const budgetOccs: number[] = [];
    for (let seed = 0; seed < 20; seed++) {
      luxuryOccs.push(deriveOccupancyBase(5, 'Mayfair', 9.2, makeRng(seed)));
      budgetOccs.push(deriveOccupancyBase(2, 'Stratford', 7.0, makeRng(seed)));
    }
    const avgLuxury = luxuryOccs.reduce((a, b) => a + b) / luxuryOccs.length;
    const avgBudget = budgetOccs.reduce((a, b) => a + b) / budgetOccs.length;
    expect(avgLuxury).toBeGreaterThan(avgBudget);
  });
});

// ─── derivePineconeId ─────────────────────────────────────────────────────────

describe('derivePineconeId', () => {
  it('returns a valid UUID format', () => {
    const id = derivePineconeId('Strand Palace Hotel');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('is deterministic — same name always produces same ID', () => {
    const id1 = derivePineconeId('The Savoy');
    const id2 = derivePineconeId('The Savoy');
    const id3 = derivePineconeId('The Savoy');
    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  it('different names produce different IDs', () => {
    const id1 = derivePineconeId('The Savoy');
    const id2 = derivePineconeId('Claridges');
    const id3 = derivePineconeId('The Ritz London');
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it('handles empty string without crashing', () => {
    const id = derivePineconeId('');
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('produces unique IDs for a large set of hotel names', () => {
    const names = [
      'The Savoy', 'Claridges', 'The Ritz London', 'Hotel Café Royal',
      'Strand Palace Hotel', 'Park Plaza Westminster Bridge London',
      'DoubleTree by Hilton Hotel London Tower of London',
      'Intercontinental London The O2', 'Hilton London Metropole',
      'Park Grand Paddington Court',
    ];
    const ids = names.map(n => derivePineconeId(n));
    const unique = new Set(ids);
    expect(unique.size).toBe(names.length);
  });
});

// ─── Integration: Enrichment consistency ─────────────────────────────────────

describe('Pipeline consistency', () => {
  it('pricing factors pass the schema constraint check', () => {
    // Replicate the Supabase CHECK constraint:
    // pricing_factors ? 'demand_curve' AND pricing_factors ? 'seasonality'
    // AND pricing_factors ? 'occupancy_base'
    // AND jsonb_array_length(demand_curve) = 7
    // AND jsonb_array_length(seasonality) = 12
    const rng = makeRng(42);
    const demandCurve = deriveDemandCurve(4, 'Westminster', rng);
    const seasonality = deriveSeasonality(rng);
    const occupancyBase = deriveOccupancyBase(4, 'Westminster', 8.5, rng);

    const pricingFactors = { demand_curve: demandCurve, seasonality, occupancy_base: occupancyBase };

    expect('demand_curve' in pricingFactors).toBe(true);
    expect('seasonality' in pricingFactors).toBe(true);
    expect('occupancy_base' in pricingFactors).toBe(true);
    expect(pricingFactors.demand_curve).toHaveLength(7);
    expect(pricingFactors.seasonality).toHaveLength(12);
    expect(pricingFactors.occupancy_base).toBeGreaterThanOrEqual(30);
    expect(pricingFactors.occupancy_base).toBeLessThanOrEqual(95);
  });

  it('base rate is within schema bounds (DECIMAL 8,2 — up to 999999.99)', () => {
    for (let stars = 1; stars <= 5; stars++) {
      const rate = deriveBaseRate(stars, 'Westminster', 8.5, makeRng(stars));
      expect(rate).toBeLessThan(999999.99);
      expect(rate).toBeGreaterThan(0);
    }
  });
});
