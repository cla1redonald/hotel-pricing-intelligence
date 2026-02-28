import type { Hotel, PricingBreakdown, ProjectionPoint } from '@/types';

/**
 * Simple seeded PRNG — deterministic hash of a string → [0, 1)
 */
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // coerce to 32-bit int
  }
  return Math.abs(hash % 1000) / 1000;
}

/**
 * Clamp a number to [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Individual factor calculators (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Linear interpolation: 30% occupancy → 0.7, 95% occupancy → 1.5.
 * Clamped to [0.7, 1.5].
 */
export function calculateDemandMultiplier(occupancyBase: number): number {
  const raw = 0.7 + (occupancyBase - 30) * (1.5 - 0.7) / (95 - 30);
  return clamp(raw, 0.7, 1.5);
}

/**
 * Monthly seasonality from the hotel's seasonality array (Jan=index 0, Dec=index 11).
 * Clamped to [0.8, 1.4].
 */
export function calculateSeasonalityMultiplier(
  seasonality: number[],
  date: Date,
): number {
  const monthIndex = date.getMonth(); // 0-11
  const raw = seasonality[monthIndex] ?? 1.0;
  return clamp(raw, 0.8, 1.4);
}

/**
 * Lead time from `now` to `checkInDate`.
 * - 30+ days ahead → 0.9 (early-booking discount)
 * - Same-day (0 days) → 1.3 (last-minute premium)
 * - Linear interpolation between: 1.3 - (daysUntil / 30) * (1.3 - 0.9)
 * - Past dates treated as same-day (daysUntil = 0).
 * Clamped to [0.9, 1.3].
 */
export function calculateLeadTimeMultiplier(
  checkInDate: Date,
  now: Date = new Date(),
): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const rawDays = (checkInDate.getTime() - now.getTime()) / msPerDay;
  const daysUntil = Math.max(0, rawDays);
  const raw = 1.3 - (daysUntil / 30) * (1.3 - 0.9);
  return clamp(raw, 0.9, 1.3);
}

/**
 * Day-of-week multiplier from the hotel's demand_curve (indexed Mon=0 … Sun=6).
 * JavaScript's `Date.getDay()` returns Sun=0 … Sat=6, so we convert:
 *   JS Sunday (0)  → demand_curve index 6
 *   JS Monday (1)  → demand_curve index 0
 *   …
 *   JS Saturday (6)→ demand_curve index 5
 * Clamped to [0.85, 1.15].
 */
export function calculateDayOfWeekMultiplier(
  demandCurve: number[],
  date: Date,
): number {
  const jsDay = date.getDay(); // 0=Sun, 1=Mon, … 6=Sat
  // Convert JS day to Mon-based index: (jsDay + 6) % 7
  // Sun(0) → (0+6)%7 = 6, Mon(1) → 0, Tue(2) → 1, … Sat(6) → 5
  const adjustedIndex = (jsDay + 6) % 7;
  const raw = demandCurve[adjustedIndex] ?? 1.0;
  return clamp(raw, 0.85, 1.15);
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------

/**
 * Calculate a full pricing breakdown for a hotel on a specific check-in date.
 * `now` defaults to the current date; inject for deterministic tests.
 */
export function calculatePrice(
  hotel: Hotel,
  checkInDate: Date,
  now: Date = new Date(),
): PricingBreakdown {
  const { pricing_factors, base_rate_gbp } = hotel;

  const demandMultiplier = calculateDemandMultiplier(
    pricing_factors.occupancy_base,
  );
  const seasonalityMultiplier = calculateSeasonalityMultiplier(
    pricing_factors.seasonality,
    checkInDate,
  );
  const leadTimeMultiplier = calculateLeadTimeMultiplier(checkInDate, now);
  const dayOfWeekMultiplier = calculateDayOfWeekMultiplier(
    pricing_factors.demand_curve,
    checkInDate,
  );

  const rawFinalPrice =
    base_rate_gbp *
    demandMultiplier *
    seasonalityMultiplier *
    leadTimeMultiplier *
    dayOfWeekMultiplier;

  const finalPrice = Math.round(rawFinalPrice * 100) / 100;

  return {
    baseRate: base_rate_gbp,
    demandMultiplier,
    seasonalityMultiplier,
    leadTimeMultiplier,
    dayOfWeekMultiplier,
    finalPrice,
  };
}

/**
 * Generate a 7-day price projection starting from `checkInDate`.
 * Each day applies a seeded ±2% occupancy drift so projections are
 * deterministic per hotel + date combination.
 */
export function calculateProjection(
  hotel: Hotel,
  checkInDate: Date,
  now: Date = new Date(),
): ProjectionPoint[] {
  const points: ProjectionPoint[] = [];
  const msPerDay = 1000 * 60 * 60 * 24;

  let currentOccupancy = hotel.pricing_factors.occupancy_base;

  for (let i = 0; i < 7; i++) {
    const date = new Date(checkInDate.getTime() + i * msPerDay);

    // Apply demand drift for days after the first
    if (i > 0) {
      const dateStr = date.toISOString().split('T')[0];
      const seed = `${hotel.pinecone_id}:${dateStr}`;
      const rand = seededRandom(seed); // [0, 1)
      // Map [0, 1) to [-2%, +2%]
      const drift = (rand - 0.5) * 4; // [-2, +2]
      currentOccupancy = clamp(currentOccupancy + drift, 30, 95);
    }

    // Build a transient hotel copy with drifted occupancy
    const driftedHotel: Hotel = {
      ...hotel,
      pricing_factors: {
        ...hotel.pricing_factors,
        occupancy_base: currentOccupancy,
      },
    };

    const factors = calculatePrice(driftedHotel, date, now);

    points.push({
      date: date.toISOString(),
      price: factors.finalPrice,
      factors,
    });
  }

  return points;
}

/**
 * Generate a synthetic "market listed price" for a hotel on a given date.
 * Uses a seeded variance per hotel so some hotels are deals, some overpriced.
 * Variance range: -15% to +20% of the model price.
 */
export function getListedPrice(
  hotel: Hotel,
  checkInDate: Date,
  now: Date = new Date(),
): number {
  const { finalPrice } = calculatePrice(hotel, checkInDate, now);
  const variance = seededRandom(`listed:${hotel.pinecone_id}`);
  // Map [0, 1) to [-0.15, +0.20]
  const multiplier = 1 + (variance * 0.35 - 0.15);
  return Math.round(multiplier * finalPrice * 100) / 100;
}
