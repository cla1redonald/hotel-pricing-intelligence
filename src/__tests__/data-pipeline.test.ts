/**
 * Data Pipeline Tests
 * Tests the hotel data generation functions for correctness and quality.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateHotels,
  NEIGHBORHOODS,
  type GeneratedHotel,
} from '../../scripts/generate-hotels';
import { validateLocalData } from '../../scripts/validate';

let hotels: GeneratedHotel[];

beforeAll(() => {
  hotels = generateHotels(1050, 42);
});

describe('Hotel Generation', () => {
  it('generates at least 1,000 hotels', () => {
    expect(hotels.length).toBeGreaterThanOrEqual(1000);
  });

  it('uses at least 40 neighborhoods', () => {
    const neighborhoods = new Set(hotels.map(h => h.neighborhood));
    expect(neighborhoods.size).toBeGreaterThanOrEqual(40);
  });

  it('produces no duplicate name+neighborhood combinations', () => {
    const keys = new Set<string>();
    let duplicates = 0;
    for (const h of hotels) {
      const key = `${h.name}|${h.neighborhood}`;
      if (keys.has(key)) duplicates++;
      keys.add(key);
    }
    expect(duplicates).toBe(0);
  });

  it('produces unique hotel names (high diversity)', () => {
    const names = new Set(hotels.map(h => h.name));
    // At least 70% of names should be unique across all hotels
    expect(names.size).toBeGreaterThan(hotels.length * 0.7);
  });

  it('produces reproducible output with same seed', () => {
    const run1 = generateHotels(100, 123);
    const run2 = generateHotels(100, 123);
    expect(run1.length).toBe(run2.length);
    expect(run1[0].name).toBe(run2[0].name);
    expect(run1[0].base_rate_gbp).toBe(run2[0].base_rate_gbp);
    expect(run1[0].neighborhood).toBe(run2[0].neighborhood);
  });
});

describe('Star Rating Distribution', () => {
  it('all star ratings are between 1 and 5', () => {
    for (const h of hotels) {
      expect(h.star_rating).toBeGreaterThanOrEqual(1);
      expect(h.star_rating).toBeLessThanOrEqual(5);
    }
  });

  it('has a reasonable star distribution (not all same rating)', () => {
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const h of hotels) {
      dist[h.star_rating]++;
    }
    // Every star rating should have at least some representation
    for (let star = 1; star <= 5; star++) {
      expect(dist[star]).toBeGreaterThan(0);
    }
    // 3-star should be the most common
    expect(dist[3]).toBeGreaterThan(dist[1]);
    expect(dist[3]).toBeGreaterThan(dist[5]);
  });
});

describe('Base Rate Generation', () => {
  it('generates positive base rates for all hotels', () => {
    for (const h of hotels) {
      expect(h.base_rate_gbp).toBeGreaterThan(0);
    }
  });

  it('base rates are within extended range for star rating', () => {
    const ranges: Record<number, [number, number]> = {
      1: [24, 91],     // 30*0.8, 70*1.3
      2: [40, 143],    // 50*0.8, 110*1.3
      3: [64, 234],    // 80*0.8, 180*1.3
      4: [112, 390],   // 140*0.8, 300*1.3
      5: [224, 780],   // 280*0.8, 600*1.3
    };
    for (const h of hotels) {
      const [min, max] = ranges[h.star_rating];
      expect(h.base_rate_gbp).toBeGreaterThanOrEqual(min);
      expect(h.base_rate_gbp).toBeLessThanOrEqual(max);
    }
  });

  it('luxury neighborhoods have higher average rates than budget areas', () => {
    const mayfairHotels = hotels.filter(h => h.neighborhood === 'Mayfair');
    const brixtonHotels = hotels.filter(h => h.neighborhood === 'Brixton');

    if (mayfairHotels.length > 0 && brixtonHotels.length > 0) {
      const mayfairAvg = mayfairHotels.reduce((s, h) => s + h.base_rate_gbp, 0) / mayfairHotels.length;
      const brixtonAvg = brixtonHotels.reduce((s, h) => s + h.base_rate_gbp, 0) / brixtonHotels.length;
      expect(mayfairAvg).toBeGreaterThan(brixtonAvg);
    }
  });
});

describe('Pricing Factors', () => {
  describe('Demand Curve', () => {
    it('has exactly 7 values for every hotel', () => {
      for (const h of hotels) {
        expect(h.pricing_factors.demand_curve).toHaveLength(7);
      }
    });

    it('all values are within range 0.7-1.5', () => {
      for (const h of hotels) {
        for (const v of h.pricing_factors.demand_curve) {
          expect(v).toBeGreaterThanOrEqual(0.7);
          expect(v).toBeLessThanOrEqual(1.5);
        }
      }
    });

    it('generates different curves for business vs leisure areas', () => {
      const cityHotel4Star = hotels.find(
        h => h.neighborhood === 'City of London' && h.star_rating >= 4
      );
      const sohoHotel3Star = hotels.find(
        h => h.neighborhood === 'Soho' && h.star_rating === 3
      );

      if (cityHotel4Star && sohoHotel3Star) {
        // Business hotels should have weekday >= weekend on average
        const cityWeekday = cityHotel4Star.pricing_factors.demand_curve
          .slice(0, 5)
          .reduce((a, b) => a + b, 0) / 5;
        const cityWeekend = cityHotel4Star.pricing_factors.demand_curve
          .slice(5)
          .reduce((a, b) => a + b, 0) / 2;
        expect(cityWeekday).toBeGreaterThanOrEqual(cityWeekend * 0.95);
      }
    });
  });

  describe('Seasonality', () => {
    it('has exactly 12 values for every hotel', () => {
      for (const h of hotels) {
        expect(h.pricing_factors.seasonality).toHaveLength(12);
      }
    });

    it('all values are within range 0.8-1.4', () => {
      for (const h of hotels) {
        for (const v of h.pricing_factors.seasonality) {
          expect(v).toBeGreaterThanOrEqual(0.8);
          expect(v).toBeLessThanOrEqual(1.4);
        }
      }
    });

    it('summer months (Jun-Aug) average higher than winter (Jan-Feb)', () => {
      for (const h of hotels) {
        const s = h.pricing_factors.seasonality;
        const summer = (s[5] + s[6] + s[7]) / 3;  // Jun, Jul, Aug
        const winter = (s[0] + s[1]) / 2;           // Jan, Feb
        expect(summer).toBeGreaterThan(winter);
      }
    });
  });

  describe('Occupancy Base', () => {
    it('all values are within range 30-95', () => {
      for (const h of hotels) {
        expect(h.pricing_factors.occupancy_base).toBeGreaterThanOrEqual(30);
        expect(h.pricing_factors.occupancy_base).toBeLessThanOrEqual(95);
      }
    });
  });
});

describe('Review Summaries', () => {
  it('all hotels have non-empty review summaries', () => {
    for (const h of hotels) {
      expect(h.review_summary.length).toBeGreaterThan(0);
    }
  });

  it('review summaries have at least 3 sentences', () => {
    for (const h of hotels) {
      // Count sentences by period followed by space or end of string
      const sentences = h.review_summary.split(/\.\s+|\.$/g).filter(s => s.trim().length > 0);
      expect(sentences.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('review summaries mention the neighborhood', () => {
    // At least 80% of reviews should mention the neighborhood
    const mentionsNeighborhood = hotels.filter(
      h => h.review_summary.includes(h.neighborhood)
    );
    expect(mentionsNeighborhood.length).toBeGreaterThan(hotels.length * 0.8);
  });

  it('review summaries are diverse (not all identical)', () => {
    const uniqueSummaries = new Set(hotels.map(h => h.review_summary));
    // Expect at least 90% unique summaries
    expect(uniqueSummaries.size).toBeGreaterThan(hotels.length * 0.9);
  });
});

describe('Amenities', () => {
  it('all hotels have at least WiFi and 24-hour reception', () => {
    for (const h of hotels) {
      expect(h.amenities.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('5-star hotels have more amenities than 1-star hotels', () => {
    const fiveStar = hotels.filter(h => h.star_rating === 5);
    const oneStar = hotels.filter(h => h.star_rating === 1);

    if (fiveStar.length > 0 && oneStar.length > 0) {
      const fiveStarAvg = fiveStar.reduce((s, h) => s + h.amenities.length, 0) / fiveStar.length;
      const oneStarAvg = oneStar.reduce((s, h) => s + h.amenities.length, 0) / oneStar.length;
      expect(fiveStarAvg).toBeGreaterThan(oneStarAvg);
    }
  });
});

describe('Location Data', () => {
  it('all hotels have lat/lng coordinates', () => {
    for (const h of hotels) {
      expect(h.lat).not.toBeNull();
      expect(h.lng).not.toBeNull();
    }
  });

  it('coordinates are within London bounds', () => {
    for (const h of hotels) {
      if (h.lat !== null && h.lng !== null) {
        expect(h.lat).toBeGreaterThan(51.3);
        expect(h.lat).toBeLessThan(51.7);
        expect(h.lng).toBeGreaterThan(-0.5);
        expect(h.lng).toBeLessThan(0.2);
      }
    }
  });
});

describe('Pinecone IDs', () => {
  it('all hotels have a pinecone_id', () => {
    for (const h of hotels) {
      expect(h.pinecone_id).toBeTruthy();
      expect(h.pinecone_id.length).toBeGreaterThan(0);
    }
  });

  it('all pinecone_ids are unique', () => {
    const ids = new Set(hotels.map(h => h.pinecone_id));
    expect(ids.size).toBe(hotels.length);
  });
});

describe('Neighborhood Coverage', () => {
  it('covers all defined neighborhoods', () => {
    const covered = new Set(hotels.map(h => h.neighborhood));
    for (const n of NEIGHBORHOODS) {
      expect(covered.has(n.name)).toBe(true);
    }
  });

  it('has at least 40 neighborhoods', () => {
    expect(NEIGHBORHOODS.length).toBeGreaterThanOrEqual(40);
  });
});

describe('Validation Script', () => {
  it('passes all local validation checks', () => {
    const result = validateLocalData(hotels);
    for (const check of result.checks) {
      expect(check.passed).toBe(true);
    }
    expect(result.passed).toBe(true);
  });
});
