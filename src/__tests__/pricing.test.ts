import { describe, it, expect } from 'vitest';
import {
  calculateDemandMultiplier,
  calculateSeasonalityMultiplier,
  calculateLeadTimeMultiplier,
  calculateDayOfWeekMultiplier,
  calculatePrice,
  calculateProjection,
  getListedPrice,
} from '@/lib/pricing';
import type { Hotel } from '@/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal but valid Hotel fixture. */
function makeHotel(overrides: Partial<Hotel> = {}): Hotel {
  return {
    id: 'test-uuid-001',
    name: 'Test Hotel',
    neighborhood: 'Shoreditch',
    lat: 51.523,
    lng: -0.0755,
    star_rating: 4,
    base_rate_gbp: 200,
    review_summary: 'A great hotel.',
    amenities: ['wifi', 'gym'],
    pricing_factors: {
      demand_curve: [1.0, 1.0, 1.0, 1.0, 1.15, 1.15, 0.9], // Mon-Sun
      seasonality: [0.85, 0.85, 0.9, 1.0, 1.1, 1.2, 1.3, 1.35, 1.2, 1.1, 0.95, 0.9],
      occupancy_base: 62.5,
    },
    pinecone_id: 'hotel-001',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateDemandMultiplier
// ---------------------------------------------------------------------------

describe('calculateDemandMultiplier', () => {
  it('returns 0.7 at 30% occupancy (lower bound)', () => {
    expect(calculateDemandMultiplier(30)).toBeCloseTo(0.7, 6);
  });

  it('returns 1.5 at 95% occupancy (upper bound)', () => {
    expect(calculateDemandMultiplier(95)).toBeCloseTo(1.5, 6);
  });

  it('returns 1.1 at 62.5% occupancy (midpoint)', () => {
    // midpoint: 0.7 + (62.5 - 30) * 0.8 / 65 = 0.7 + 32.5 * 0.8 / 65 = 0.7 + 0.4 = 1.1
    expect(calculateDemandMultiplier(62.5)).toBeCloseTo(1.1, 6);
  });

  it('clamps below 30% to 0.7', () => {
    expect(calculateDemandMultiplier(0)).toBe(0.7);
    expect(calculateDemandMultiplier(10)).toBe(0.7);
    expect(calculateDemandMultiplier(29)).toBeLessThanOrEqual(0.7);
  });

  it('clamps above 95% to 1.5', () => {
    expect(calculateDemandMultiplier(100)).toBe(1.5);
    expect(calculateDemandMultiplier(99)).toBe(1.5);
    expect(calculateDemandMultiplier(96)).toBe(1.5);
  });

  it('produces a monotonically increasing result between 30 and 95', () => {
    const values = [30, 40, 50, 60, 70, 80, 90, 95].map(calculateDemandMultiplier);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// calculateSeasonalityMultiplier
// ---------------------------------------------------------------------------

describe('calculateSeasonalityMultiplier', () => {
  const seasonality = [
    0.85, // Jan 0
    0.85, // Feb 1
    0.90, // Mar 2
    1.00, // Apr 3
    1.10, // May 4
    1.20, // Jun 5
    1.30, // Jul 6
    1.35, // Aug 7
    1.20, // Sep 8
    1.10, // Oct 9
    0.95, // Nov 10
    0.90, // Dec 11
  ];

  it('returns correct value for January (index 0)', () => {
    const date = new Date('2024-01-15T12:00:00Z');
    expect(calculateSeasonalityMultiplier(seasonality, date)).toBeCloseTo(0.85, 6);
  });

  it('returns correct value for August (index 7)', () => {
    const date = new Date('2024-08-15T12:00:00Z');
    expect(calculateSeasonalityMultiplier(seasonality, date)).toBeCloseTo(1.35, 6);
  });

  it('returns correct value for December (index 11)', () => {
    const date = new Date('2024-12-25T12:00:00Z');
    expect(calculateSeasonalityMultiplier(seasonality, date)).toBeCloseTo(0.90, 6);
  });

  it('clamps values above 1.4 to 1.4', () => {
    const highSeasonality = Array(12).fill(1.8);
    const date = new Date('2024-06-01T12:00:00Z');
    expect(calculateSeasonalityMultiplier(highSeasonality, date)).toBe(1.4);
  });

  it('clamps values below 0.8 to 0.8', () => {
    const lowSeasonality = Array(12).fill(0.5);
    const date = new Date('2024-01-01T12:00:00Z');
    expect(calculateSeasonalityMultiplier(lowSeasonality, date)).toBe(0.8);
  });

  it('reads the correct month index for each month', () => {
    const byMonth = Array.from({ length: 12 }, (_, i) => 0.8 + i * 0.04);
    for (let m = 0; m < 12; m++) {
      const date = new Date(2024, m, 15); // Local date for month m
      // Use dates where local month equals UTC month (mid-month)
      const result = calculateSeasonalityMultiplier(byMonth, date);
      expect(result).toBeCloseTo(byMonth[m], 5);
    }
  });
});

// ---------------------------------------------------------------------------
// calculateLeadTimeMultiplier
// ---------------------------------------------------------------------------

describe('calculateLeadTimeMultiplier', () => {
  const base = new Date('2024-06-01T12:00:00Z');

  it('returns 1.3 for same-day check-in (0 days)', () => {
    const checkIn = new Date('2024-06-01T12:00:00Z');
    expect(calculateLeadTimeMultiplier(checkIn, base)).toBeCloseTo(1.3, 6);
  });

  it('returns 0.9 for check-in 30+ days away', () => {
    const checkIn30 = new Date('2024-07-01T12:00:00Z'); // exactly 30 days
    expect(calculateLeadTimeMultiplier(checkIn30, base)).toBeCloseTo(0.9, 5);

    const checkIn60 = new Date('2024-07-31T12:00:00Z'); // 60 days
    expect(calculateLeadTimeMultiplier(checkIn60, base)).toBe(0.9);
  });

  it('returns ~1.1 for 15-day lead time (midpoint)', () => {
    // 1.3 - (15/30) * 0.4 = 1.3 - 0.2 = 1.1
    const checkIn15 = new Date('2024-06-16T12:00:00Z');
    expect(calculateLeadTimeMultiplier(checkIn15, base)).toBeCloseTo(1.1, 5);
  });

  it('clamps past dates (negative days) to 1.3', () => {
    const pastDate = new Date('2024-05-01T12:00:00Z'); // 31 days in the past
    expect(calculateLeadTimeMultiplier(pastDate, base)).toBeCloseTo(1.3, 6);
  });

  it('defaults now to current date when omitted', () => {
    // The result should be deterministic in shape — just verify it is within [0.9, 1.3]
    const farFuture = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const result = calculateLeadTimeMultiplier(farFuture);
    expect(result).toBe(0.9);
  });

  it('interpolates linearly between 0 and 30 days', () => {
    const days = [0, 5, 10, 15, 20, 25, 30];
    const results = days.map(d => {
      const checkIn = new Date(base.getTime() + d * 24 * 60 * 60 * 1000);
      return calculateLeadTimeMultiplier(checkIn, base);
    });
    // Each step should decrease the multiplier
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeLessThanOrEqual(results[i - 1]);
    }
    // Endpoints
    expect(results[0]).toBeCloseTo(1.3, 5);
    expect(results[results.length - 1]).toBeCloseTo(0.9, 5);
  });
});

// ---------------------------------------------------------------------------
// calculateDayOfWeekMultiplier
// ---------------------------------------------------------------------------

describe('calculateDayOfWeekMultiplier', () => {
  // demand_curve is Mon-Sun indexed [0..6]
  // We use a distinctive value per slot so we can verify correct lookup
  const demandCurve = [
    1.00, // Mon (index 0)
    1.05, // Tue (index 1)
    1.02, // Wed (index 2)
    1.08, // Thu (index 3)
    1.15, // Fri (index 4)
    1.12, // Sat (index 5)
    0.90, // Sun (index 6)
  ];

  // 2024-01-01 = Monday
  const monday    = new Date('2024-01-01T12:00:00Z');
  const tuesday   = new Date('2024-01-02T12:00:00Z');
  const wednesday = new Date('2024-01-03T12:00:00Z');
  const thursday  = new Date('2024-01-04T12:00:00Z');
  const friday    = new Date('2024-01-05T12:00:00Z');
  const saturday  = new Date('2024-01-06T12:00:00Z');
  const sunday    = new Date('2024-01-07T12:00:00Z');

  it('maps Monday (JS day 1) → demand_curve[0]', () => {
    expect(calculateDayOfWeekMultiplier(demandCurve, monday)).toBeCloseTo(1.00, 6);
  });

  it('maps Tuesday (JS day 2) → demand_curve[1]', () => {
    expect(calculateDayOfWeekMultiplier(demandCurve, tuesday)).toBeCloseTo(1.05, 6);
  });

  it('maps Wednesday (JS day 3) → demand_curve[2]', () => {
    expect(calculateDayOfWeekMultiplier(demandCurve, wednesday)).toBeCloseTo(1.02, 6);
  });

  it('maps Thursday (JS day 4) → demand_curve[3]', () => {
    expect(calculateDayOfWeekMultiplier(demandCurve, thursday)).toBeCloseTo(1.08, 6);
  });

  it('maps Friday (JS day 5) → demand_curve[4]', () => {
    expect(calculateDayOfWeekMultiplier(demandCurve, friday)).toBeCloseTo(1.15, 6);
  });

  it('maps Saturday (JS day 6) → demand_curve[5]', () => {
    expect(calculateDayOfWeekMultiplier(demandCurve, saturday)).toBeCloseTo(1.12, 6);
  });

  it('maps Sunday (JS day 0) → demand_curve[6]', () => {
    expect(calculateDayOfWeekMultiplier(demandCurve, sunday)).toBeCloseTo(0.90, 6);
  });

  it('clamps values above 1.15 to 1.15', () => {
    const highCurve = Array(7).fill(1.5);
    expect(calculateDayOfWeekMultiplier(highCurve, monday)).toBe(1.15);
  });

  it('clamps values below 0.85 to 0.85', () => {
    const lowCurve = Array(7).fill(0.5);
    expect(calculateDayOfWeekMultiplier(lowCurve, monday)).toBe(0.85);
  });
});

// ---------------------------------------------------------------------------
// calculatePrice
// ---------------------------------------------------------------------------

describe('calculatePrice', () => {
  it('returns a complete PricingBreakdown with all fields', () => {
    const hotel = makeHotel();
    const checkIn = new Date('2024-07-15T12:00:00Z'); // Monday in July
    const now = new Date('2024-07-01T12:00:00Z');     // 14 days before

    const result = calculatePrice(hotel, checkIn, now);

    expect(result).toHaveProperty('baseRate');
    expect(result).toHaveProperty('demandMultiplier');
    expect(result).toHaveProperty('seasonalityMultiplier');
    expect(result).toHaveProperty('leadTimeMultiplier');
    expect(result).toHaveProperty('dayOfWeekMultiplier');
    expect(result).toHaveProperty('finalPrice');
  });

  it('baseRate equals hotel.base_rate_gbp', () => {
    const hotel = makeHotel({ base_rate_gbp: 250 });
    const checkIn = new Date('2024-06-10T12:00:00Z');
    const now = new Date('2024-06-01T12:00:00Z');
    const result = calculatePrice(hotel, checkIn, now);
    expect(result.baseRate).toBe(250);
  });

  it('finalPrice equals product of all components rounded to 2dp', () => {
    const hotel = makeHotel();
    const checkIn = new Date('2024-08-05T12:00:00Z'); // Monday in August
    const now = new Date('2024-07-01T12:00:00Z');     // 35 days before

    const result = calculatePrice(hotel, checkIn, now);
    const expected =
      result.baseRate *
      result.demandMultiplier *
      result.seasonalityMultiplier *
      result.leadTimeMultiplier *
      result.dayOfWeekMultiplier;

    expect(result.finalPrice).toBeCloseTo(expected, 2);
  });

  it('all multipliers are within their defined ranges', () => {
    const hotel = makeHotel();
    const checkIn = new Date('2024-12-20T12:00:00Z');
    const now = new Date('2024-12-15T12:00:00Z');
    const result = calculatePrice(hotel, checkIn, now);

    expect(result.demandMultiplier).toBeGreaterThanOrEqual(0.7);
    expect(result.demandMultiplier).toBeLessThanOrEqual(1.5);

    expect(result.seasonalityMultiplier).toBeGreaterThanOrEqual(0.8);
    expect(result.seasonalityMultiplier).toBeLessThanOrEqual(1.4);

    expect(result.leadTimeMultiplier).toBeGreaterThanOrEqual(0.9);
    expect(result.leadTimeMultiplier).toBeLessThanOrEqual(1.3);

    expect(result.dayOfWeekMultiplier).toBeGreaterThanOrEqual(0.85);
    expect(result.dayOfWeekMultiplier).toBeLessThanOrEqual(1.15);
  });

  it('produces a known deterministic result for specific inputs', () => {
    // Monday 2024-08-05, now = 2024-07-05 (31 days away → leadTime=0.9)
    // occupancy_base=62.5 → demand=1.1
    // August seasonality[7]=1.35 → clamp to 1.35 (within [0.8,1.4])
    // Monday demand_curve[0]=1.0 → dayOfWeek=1.0
    // leadTime: 31 days → clamped to 0.9
    // finalPrice = 200 * 1.1 * 1.35 * 0.9 * 1.0 = 267.3
    const hotel = makeHotel({ base_rate_gbp: 200 });
    const checkIn = new Date('2024-08-05T12:00:00Z');
    const now = new Date('2024-07-05T12:00:00Z');

    const result = calculatePrice(hotel, checkIn, now);

    expect(result.demandMultiplier).toBeCloseTo(1.1, 5);
    expect(result.seasonalityMultiplier).toBeCloseTo(1.35, 5);
    expect(result.leadTimeMultiplier).toBe(0.9);
    expect(result.dayOfWeekMultiplier).toBeCloseTo(1.0, 5);
    expect(result.finalPrice).toBeCloseTo(267.3, 1);
  });

  it('handles same-day check-in (leadTime = 1.3)', () => {
    const hotel = makeHotel();
    const checkIn = new Date('2024-06-03T12:00:00Z'); // Monday in June
    const now = new Date('2024-06-03T12:00:00Z');
    const result = calculatePrice(hotel, checkIn, now);
    expect(result.leadTimeMultiplier).toBeCloseTo(1.3, 6);
  });

  it('handles 60-day lead time (leadTime = 0.9)', () => {
    const hotel = makeHotel();
    const checkIn = new Date('2024-09-01T12:00:00Z');
    const now = new Date('2024-07-03T12:00:00Z'); // 60 days before
    const result = calculatePrice(hotel, checkIn, now);
    expect(result.leadTimeMultiplier).toBe(0.9);
  });

  it('handles minimum occupancy (30%) → demandMultiplier = 0.7', () => {
    const hotel = makeHotel({
      pricing_factors: {
        demand_curve: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        seasonality: Array(12).fill(1.0),
        occupancy_base: 30,
      },
    });
    const checkIn = new Date('2024-06-10T12:00:00Z');
    const now = new Date('2024-06-01T12:00:00Z');
    const result = calculatePrice(hotel, checkIn, now);
    expect(result.demandMultiplier).toBeCloseTo(0.7, 6);
  });

  it('handles maximum occupancy (95%) → demandMultiplier = 1.5', () => {
    const hotel = makeHotel({
      pricing_factors: {
        demand_curve: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        seasonality: Array(12).fill(1.0),
        occupancy_base: 95,
      },
    });
    const checkIn = new Date('2024-06-10T12:00:00Z');
    const now = new Date('2024-06-01T12:00:00Z');
    const result = calculatePrice(hotel, checkIn, now);
    expect(result.demandMultiplier).toBeCloseTo(1.5, 6);
  });

  it('finalPrice is rounded to exactly 2 decimal places', () => {
    const hotel = makeHotel();
    const checkIn = new Date('2024-03-13T12:00:00Z');
    const now = new Date('2024-03-01T12:00:00Z');
    const result = calculatePrice(hotel, checkIn, now);
    const decimalPart = result.finalPrice.toString().split('.')[1] ?? '';
    expect(decimalPart.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// calculateProjection
// ---------------------------------------------------------------------------

describe('calculateProjection', () => {
  const hotel = makeHotel();
  const checkIn = new Date('2024-06-03T12:00:00Z'); // Monday in June
  const now = new Date('2024-05-20T12:00:00Z');     // 14 days before

  it('returns exactly 7 ProjectionPoints', () => {
    const projection = calculateProjection(hotel, checkIn, now);
    expect(projection).toHaveLength(7);
  });

  it('first date equals check-in date (ISO string)', () => {
    const projection = calculateProjection(hotel, checkIn, now);
    expect(projection[0].date).toBe(checkIn.toISOString());
  });

  it('dates are consecutive days (86400s apart)', () => {
    const projection = calculateProjection(hotel, checkIn, now);
    const msPerDay = 24 * 60 * 60 * 1000;
    for (let i = 1; i < projection.length; i++) {
      const prev = new Date(projection[i - 1].date).getTime();
      const curr = new Date(projection[i].date).getTime();
      expect(curr - prev).toBe(msPerDay);
    }
  });

  it('each point exposes a valid PricingBreakdown in .factors', () => {
    const projection = calculateProjection(hotel, checkIn, now);
    for (const point of projection) {
      expect(point).toHaveProperty('date');
      expect(point).toHaveProperty('price');
      expect(point).toHaveProperty('factors');
      expect(point.factors).toHaveProperty('baseRate');
      expect(point.factors).toHaveProperty('demandMultiplier');
      expect(point.factors).toHaveProperty('seasonalityMultiplier');
      expect(point.factors).toHaveProperty('leadTimeMultiplier');
      expect(point.factors).toHaveProperty('dayOfWeekMultiplier');
      expect(point.factors).toHaveProperty('finalPrice');
    }
  });

  it('.price matches .factors.finalPrice for every point', () => {
    const projection = calculateProjection(hotel, checkIn, now);
    for (const point of projection) {
      expect(point.price).toBe(point.factors.finalPrice);
    }
  });

  it('prices vary across the 7 days (not all identical)', () => {
    const projection = calculateProjection(hotel, checkIn, now);
    const prices = projection.map(p => p.price);
    const unique = new Set(prices);
    // At least 2 distinct prices — day-of-week changes guarantee variation
    expect(unique.size).toBeGreaterThan(1);
  });

  it('is deterministic: same inputs produce identical output', () => {
    const a = calculateProjection(hotel, checkIn, now);
    const b = calculateProjection(hotel, checkIn, now);
    expect(a).toEqual(b);
  });

  it('produces different projections for different hotels', () => {
    const hotelA = makeHotel({ pinecone_id: 'hotel-A', base_rate_gbp: 150 });
    const hotelB = makeHotel({ pinecone_id: 'hotel-B', base_rate_gbp: 300 });
    const a = calculateProjection(hotelA, checkIn, now);
    const b = calculateProjection(hotelB, checkIn, now);
    expect(a[0].price).not.toBe(b[0].price);
  });

  it('all factor multipliers in each point stay within valid ranges', () => {
    const projection = calculateProjection(hotel, checkIn, now);
    for (const point of projection) {
      const f = point.factors;
      expect(f.demandMultiplier).toBeGreaterThanOrEqual(0.7);
      expect(f.demandMultiplier).toBeLessThanOrEqual(1.5);
      expect(f.seasonalityMultiplier).toBeGreaterThanOrEqual(0.8);
      expect(f.seasonalityMultiplier).toBeLessThanOrEqual(1.4);
      expect(f.leadTimeMultiplier).toBeGreaterThanOrEqual(0.9);
      expect(f.leadTimeMultiplier).toBeLessThanOrEqual(1.3);
      expect(f.dayOfWeekMultiplier).toBeGreaterThanOrEqual(0.85);
      expect(f.dayOfWeekMultiplier).toBeLessThanOrEqual(1.15);
    }
  });

  it('handles same-day check-in projection', () => {
    const sameDay = new Date('2024-06-03T12:00:00Z');
    const projection = calculateProjection(hotel, sameDay, sameDay);
    expect(projection).toHaveLength(7);
    expect(projection[0].factors.leadTimeMultiplier).toBeCloseTo(1.3, 6);
  });

  it('occupancy drift stays within [30, 95] across all days', () => {
    const extremeHotel = makeHotel({
      pricing_factors: {
        demand_curve: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        seasonality: Array(12).fill(1.0),
        occupancy_base: 30,
      },
    });
    const projection = calculateProjection(extremeHotel, checkIn, now);
    for (const point of projection) {
      expect(point.factors.demandMultiplier).toBeGreaterThanOrEqual(0.7);
      expect(point.factors.demandMultiplier).toBeLessThanOrEqual(1.5);
    }
  });
});

// ---------------------------------------------------------------------------
// getListedPrice
// ---------------------------------------------------------------------------

describe('getListedPrice', () => {
  const mockHotel: Hotel = {
    id: 'test-1',
    name: 'Test Hotel',
    neighborhood: 'Mayfair',
    lat: null,
    lng: null,
    star_rating: 4,
    base_rate_gbp: 200,
    review_summary: 'A lovely hotel',
    amenities: ['wifi', 'gym'],
    pricing_factors: {
      demand_curve: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
      seasonality: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
      occupancy_base: 60,
    },
    pinecone_id: 'hotel-test-1',
    created_at: '2024-01-01T00:00:00Z',
  };

  it('returns a number greater than zero', () => {
    const checkIn = new Date('2025-06-15');
    const listed = getListedPrice(mockHotel, checkIn);
    expect(listed).toBeGreaterThan(0);
  });

  it('is deterministic — same inputs produce same output', () => {
    const checkIn = new Date('2025-06-15');
    const a = getListedPrice(mockHotel, checkIn);
    const b = getListedPrice(mockHotel, checkIn);
    expect(a).toBe(b);
  });

  it('varies by hotel pinecone_id', () => {
    const checkIn = new Date('2025-06-15');
    const hotelA = { ...mockHotel, pinecone_id: 'hotel-aaa' };
    const hotelB = { ...mockHotel, pinecone_id: 'hotel-bbb' };
    const priceA = getListedPrice(hotelA, checkIn);
    const priceB = getListedPrice(hotelB, checkIn);
    expect(priceA).not.toBe(priceB);
  });

  it('stays within -15% to +20% of model price', () => {
    const checkIn = new Date('2025-06-15');
    const now = new Date('2025-06-01');
    for (let i = 0; i < 50; i++) {
      const h = { ...mockHotel, pinecone_id: `hotel-bounds-${i}` };
      const listed = getListedPrice(h, checkIn, now);
      const { finalPrice } = calculatePrice(h, checkIn, now);
      const ratio = listed / finalPrice;
      expect(ratio).toBeGreaterThanOrEqual(0.85);
      expect(ratio).toBeLessThanOrEqual(1.20);
    }
  });
});
