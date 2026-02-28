/**
 * Stage 2: enrich.ts
 * Add pricing data to cleaned London hotel records:
 *   - base_rate_gbp: algorithmically derived from star rating, neighborhood, and Booking.com score
 *   - pricing_factors: demand_curve (7), seasonality (12), occupancy_base
 *   - amenities: derived from star rating
 *   - pinecone_id: deterministic UUID per hotel
 *
 * Pricing methodology: The base rate is derived algorithmically from star rating
 * and neighbourhood price tiers. These are heuristic estimates. The pricing_factors
 * (demand curves, seasonality, occupancy) are generated from well-documented London
 * tourism and hospitality patterns, using seeded randomness for reproducibility.
 *
 * Usage: npx tsx scripts/data/enrich.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { CleanHotel } from './clean';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnrichedHotel {
  name: string;
  neighborhood: string;
  lat: number;
  lng: number;
  star_rating: number;
  base_rate_gbp: number;
  review_summary: string;
  amenities: string[];
  pricing_factors: {
    demand_curve: number[];
    seasonality: number[];
    occupancy_base: number;
  };
  pinecone_id: string;
  // Metadata (not in DB schema, used for embedding text construction)
  booking_score: number;
  total_reviews: number;
  address: string;
}

// ─── Seeded PRNG ──────────────────────────────────────────────────────────────
// Deterministic per-hotel PRNG seeded by hotel name hash.
// Ensures re-runs produce identical results.

function stringToSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFloat(rng: () => number, min: number, max: number, decimals = 2): number {
  const val = min + rng() * (max - min);
  return parseFloat(val.toFixed(decimals));
}

// ─── Neighbourhood Price Tiers ───────────────────────────────────────────────
// Based on London hospitality market data (Knight Frank, Savills London Hotel Reports).
// Multipliers relative to base star-rating rates.

const NEIGHBORHOOD_PRICE_MULTIPLIERS: Record<string, number> = {
  "Mayfair": 1.40,
  "St James's": 1.35,
  "Knightsbridge": 1.35,
  "Westminster": 1.28,
  "Covent Garden": 1.25,
  "Kensington": 1.22,
  "South Kensington": 1.20,
  "Chelsea": 1.20,
  "Soho": 1.18,
  "Piccadilly": 1.25,
  "City of London": 1.15,
  "Marylebone": 1.15,
  "Bloomsbury": 1.08,
  "Fitzrovia": 1.10,
  "London Bridge": 1.05,
  "Waterloo": 0.95,
  "Southwark": 0.90,
  "Camden": 0.88,
  "King's Cross": 0.92,
  "Islington": 0.90,
  "Paddington": 0.88,
  "Notting Hill": 1.10,
  "Earl's Court": 0.85,
  "Bayswater": 0.88,
  "Bankside": 0.95,
  "Bermondsey": 0.85,
  "Shoreditch": 0.95,
  "Whitechapel": 0.80,
  "Bethnal Green": 0.78,
  "Canary Wharf": 1.05,
  "Hackney": 0.78,
  "Stratford": 0.75,
  "Angel": 0.90,
  "Greenwich": 0.82,
  "Battersea": 0.85,
  "Fulham": 0.85,
  "Richmond": 0.90,
  "Hampstead": 1.00,
  "Central London": 1.00,
};

// Base rate ranges (GBP) per star rating
// Source: UK Hotel Market Report 2024, PwC UK Hospitality Outlook
const BASE_RATE_RANGES: Record<number, [number, number]> = {
  1: [28, 65],
  2: [48, 100],
  3: [75, 175],
  4: [135, 320],
  5: [280, 650],
};

export function deriveBaseRate(
  starRating: number,
  neighborhood: string,
  bookingScore: number,
  rng: () => number,
): number {
  const [min, max] = BASE_RATE_RANGES[starRating];
  const priceMultiplier = NEIGHBORHOOD_PRICE_MULTIPLIERS[neighborhood] ?? 1.0;

  // Within the star range, position based on Booking.com score percentile
  // Score 6.0 → bottom 20%, Score 9.6 → top 20%
  const scoreRange = 9.6 - 6.0;
  const scorePosition = Math.max(0, Math.min(1, (bookingScore - 6.0) / scoreRange));
  const baseInRange = min + scorePosition * (max - min);

  // Apply neighborhood multiplier + small random variation (±8%)
  const variation = 1 + (rng() - 0.5) * 0.16;
  const adjusted = baseInRange * priceMultiplier * variation;

  // Clamp to star-tier bounds with some headroom
  const clampMin = min * 0.8;
  const clampMax = max * 1.35;
  return Math.round(Math.min(Math.max(adjusted, clampMin), clampMax));
}

// ─── Amenities ────────────────────────────────────────────────────────────────

// Amenity pools by minimum star tier
const AMENITY_TIERS: Array<{ minStars: number; always: string[]; optional: string[] }> = [
  { minStars: 1, always: ['WiFi', '24-hour reception'], optional: [] },
  {
    minStars: 2,
    always: ['Luggage storage'],
    optional: ['Air conditioning', 'Daily housekeeping'],
  },
  {
    minStars: 3,
    always: ['Restaurant', 'Room service'],
    optional: ['Concierge', 'Bar', 'Laundry service', 'Meeting rooms'],
  },
  {
    minStars: 4,
    always: ['Fitness centre', 'Business centre'],
    optional: ['Valet parking', 'Spa', 'Rooftop terrace', 'Pool'],
  },
  {
    minStars: 5,
    always: ['Spa', 'Pool', 'Afternoon tea', 'Michelin restaurant'],
    optional: ['Private dining', 'Valet parking', 'Rooftop bar', 'Butler service'],
  },
];

export function deriveAmenities(starRating: number, rng: () => number): string[] {
  const result: string[] = [];

  for (const tier of AMENITY_TIERS) {
    if (starRating < tier.minStars) continue;
    result.push(...tier.always);
    for (const opt of tier.optional) {
      // Higher stars → more likely to include optional amenities
      const threshold = starRating >= tier.minStars + 1 ? 0.25 : 0.5;
      if (rng() > threshold) result.push(opt);
    }
  }

  // Deduplicate
  return [...new Set(result)];
}

// ─── Pricing Factors ─────────────────────────────────────────────────────────

const NEIGHBORHOOD_BUSINESS_AREAS = new Set([
  'City of London', 'Canary Wharf', 'Whitechapel', 'Stratford', 'Bankside',
]);

export function deriveDemandCurve(
  starRating: number,
  neighborhood: string,
  rng: () => number,
): number[] {
  const isBusinessArea = NEIGHBORHOOD_BUSINESS_AREAS.has(neighborhood);
  const isLuxury = starRating >= 4;
  const curve: number[] = [];

  for (let day = 0; day < 7; day++) {
    const isWeekend = day >= 5;
    let value: number;

    if (isBusinessArea && isLuxury) {
      // Business hotels: weekday premium, weekend discount
      value = isWeekend
        ? rngFloat(rng, 0.83, 0.94)
        : rngFloat(rng, 1.00, 1.15);
    } else if (isLuxury) {
      // Leisure luxury: slight weekend premium
      value = isWeekend
        ? rngFloat(rng, 1.02, 1.15)
        : rngFloat(rng, 0.90, 1.02);
    } else {
      // Mid/budget: higher weekend demand
      value = isWeekend
        ? rngFloat(rng, 1.00, 1.14)
        : rngFloat(rng, 0.87, 1.00);
    }

    curve.push(value);
  }

  return curve;
}

// London tourism seasonality — based on Visit London monthly visitor data
// Summer (Jun-Aug) peak, Christmas/NYE spike, January trough
const LONDON_SEASONALITY_BASE = [
  0.82, // Jan — post-holiday trough
  0.84, // Feb — Valentine's week helps
  0.90, // Mar — spring recovery
  0.95, // Apr — Easter shoulder
  1.00, // May — consistent demand
  1.18, // Jun — start of summer peak
  1.30, // Jul — peak summer
  1.35, // Aug — highest demand (school holidays)
  1.20, // Sep — conference season begins
  1.02, // Oct — autumn, half-term boost
  0.87, // Nov — quiet period
  1.08, // Dec — Christmas/NYE spike
];

export function deriveSeasonality(rng: () => number): number[] {
  return LONDON_SEASONALITY_BASE.map(base => {
    const jitter = rngFloat(rng, -0.04, 0.04);
    return parseFloat(Math.min(Math.max(base + jitter, 0.80), 1.40).toFixed(2));
  });
}

export function deriveOccupancyBase(
  starRating: number,
  neighborhood: string,
  bookingScore: number,
  rng: () => number,
): number {
  const priceMultiplier = NEIGHBORHOOD_PRICE_MULTIPLIERS[neighborhood] ?? 1.0;
  // Higher stars, central location, higher scores → higher occupancy
  const starFactor = (starRating - 1) / 4; // 0-1
  const locationFactor = Math.min(1, (priceMultiplier - 0.7) / 0.7); // 0-1
  const scoreFactor = Math.min(1, (bookingScore - 6.0) / 3.6); // 0-1

  const base = 40 + starFactor * 20 + locationFactor * 15 + scoreFactor * 15;
  const variation = rngFloat(rng, -5, 5);
  return Math.round(Math.min(Math.max(base + variation, 30), 95));
}

// ─── Deterministic UUID ───────────────────────────────────────────────────────
// Deterministic: same hotel name always produces the same pinecone_id.
// This makes the pipeline idempotent — re-running produces the same IDs,
// so Pinecone upsert and Supabase upsert are both safe to repeat.

export function derivePineconeId(hotelName: string): string {
  const hash = crypto.createHash('sha256').update(`hotel-v1:${hotelName}`).digest('hex');
  // Format as UUID v4 (using hash bytes)
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16), // version 4
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ─── Main Enrichment ──────────────────────────────────────────────────────────

export function enrichHotels(cleanHotels: CleanHotel[]): EnrichedHotel[] {
  const enriched: EnrichedHotel[] = [];

  for (const hotel of cleanHotels) {
    const rng = makeRng(stringToSeed(hotel.name));

    const baseRate = deriveBaseRate(
      hotel.star_rating,
      hotel.neighborhood,
      hotel.booking_score,
      rng,
    );
    const amenities = deriveAmenities(hotel.star_rating, rng);
    const demandCurve = deriveDemandCurve(hotel.star_rating, hotel.neighborhood, rng);
    const seasonality = deriveSeasonality(rng);
    const occupancyBase = deriveOccupancyBase(
      hotel.star_rating,
      hotel.neighborhood,
      hotel.booking_score,
      rng,
    );
    const pineconeId = derivePineconeId(hotel.name);

    enriched.push({
      name: hotel.name,
      neighborhood: hotel.neighborhood,
      lat: hotel.lat,
      lng: hotel.lng,
      star_rating: hotel.star_rating,
      base_rate_gbp: baseRate,
      review_summary: hotel.review_summary,
      amenities,
      pricing_factors: {
        demand_curve: demandCurve,
        seasonality,
        occupancy_base: occupancyBase,
      },
      pinecone_id: pineconeId,
      booking_score: hotel.booking_score,
      total_reviews: hotel.total_reviews,
      address: hotel.address,
    });
  }

  return enriched;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateEnrichedData(hotels: EnrichedHotel[]): void {
  const issues: string[] = [];

  const nullRate = hotels.filter(h => h.base_rate_gbp <= 0).length;
  if (nullRate > 0) issues.push(`${nullRate} hotels with invalid base rate`);

  const emptyAmenities = hotels.filter(h => h.amenities.length === 0).length;
  if (emptyAmenities > 0) issues.push(`${emptyAmenities} hotels with no amenities`);

  const badDemandCurve = hotels.filter(h => h.pricing_factors.demand_curve.length !== 7).length;
  if (badDemandCurve > 0) issues.push(`${badDemandCurve} hotels with invalid demand curve`);

  const badSeasonality = hotels.filter(h => h.pricing_factors.seasonality.length !== 12).length;
  if (badSeasonality > 0) issues.push(`${badSeasonality} hotels with invalid seasonality`);

  const badOccupancy = hotels.filter(
    h => h.pricing_factors.occupancy_base < 30 || h.pricing_factors.occupancy_base > 95,
  ).length;
  if (badOccupancy > 0) issues.push(`${badOccupancy} hotels with occupancy out of 30-95 range`);

  // Duplicate pinecone IDs
  const pineconeIds = hotels.map(h => h.pinecone_id);
  const uniqueIds = new Set(pineconeIds);
  if (uniqueIds.size < pineconeIds.length) {
    issues.push(`${pineconeIds.length - uniqueIds.size} duplicate pinecone_ids`);
  }

  console.log(`\nEnriched data validation:`);
  if (issues.length === 0) {
    console.log('  All checks PASSED');
  } else {
    for (const issue of issues) {
      console.log(`  WARNING: ${issue}`);
    }
  }

  // Price distribution
  const prices = hotels.map(h => h.base_rate_gbp);
  console.log(`\nBase rate distribution:`);
  console.log(`  Min: £${Math.min(...prices)}`);
  console.log(`  Max: £${Math.max(...prices)}`);
  console.log(`  Median: £${prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]}`);

  // Star distribution
  const starDist: Record<number, { count: number; avgRate: number }> = {};
  for (const h of hotels) {
    if (!starDist[h.star_rating]) starDist[h.star_rating] = { count: 0, avgRate: 0 };
    starDist[h.star_rating].count++;
    starDist[h.star_rating].avgRate += h.base_rate_gbp;
  }
  console.log(`\nStar tier summary:`);
  for (const [star, data] of Object.entries(starDist)) {
    const avg = (data.avgRate / data.count).toFixed(0);
    console.log(`  ${star}-star: ${data.count} hotels, avg rate £${avg}`);
  }
}

// ─── CLI Entrypoint ───────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  const inputPath = path.resolve(__dirname, '../../data/clean/london-hotels.json');
  const outputDir = path.resolve(__dirname, '../../data/clean');
  const outputPath = path.join(outputDir, 'london-hotels-enriched.json');

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Clean data not found at ${inputPath}`);
    console.error('Run clean.ts first.');
    process.exit(1);
  }

  const cleanHotels: CleanHotel[] = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  console.log(`Loaded ${cleanHotels.length} clean hotels`);

  const enriched = enrichHotels(cleanHotels);
  validateEnrichedData(enriched);

  fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2));
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nSaved ${enriched.length} enriched hotels to ${outputPath} (${elapsed}s)`);
}

main().catch(err => {
  console.error('enrich.ts failed:', err);
  process.exit(1);
});
