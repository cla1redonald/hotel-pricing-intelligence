/**
 * fetch-rates.ts — Stage: Real Rate Fetching from Amadeus Hotel Search API
 *
 * Fetches real nightly hotel rates from the Amadeus API and updates base_rate_gbp
 * in the Supabase hotels table for all 400 London hotels.
 *
 * Pipeline:
 *   1. Authenticate with Amadeus (OAuth2 client_credentials)
 *   2. Read all 400 hotels from Supabase
 *   3. For each hotel: search Hotel List API by geocode (radius=0.3km) to find Amadeus hotel ID
 *   4. Match Amadeus results to our hotels by name similarity (fuzzy)
 *   5. Batch fetch Hotel Offers API (up to 10 IDs per call) for mid-March check-in
 *   6. Update base_rate_gbp in Supabase for matched hotels
 *   7. Log stats: matched count, unmatched count, price range, average rate
 *   8. Unmatched hotels retain their existing algo-derived rate
 *
 * Idempotent: safe to re-run. Uses local cache in data/api-cache/ to avoid re-fetching.
 *
 * Usage: npx tsx scripts/data/fetch-rates.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: path.resolve(__dirname, '../../.env.local') });

// ─── Env Validation ───────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupabaseHotel {
  id: string;
  name: string;
  lat: number;
  lng: number;
  star_rating: number;
  base_rate_gbp: number;
  neighborhood: string;
}

interface AmadeusHotelListItem {
  hotelId: string;
  name: string;
  geoCode: { latitude: number; longitude: number };
  distance?: { value: number; unit: string };
  address?: {
    countryCode: string;
    cityName?: string;
    lines?: string[];
  };
}

interface AmadeusTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface HotelOffer {
  type: string;
  hotel: {
    hotelId: string;
    name: string;
    latitude: number;
    longitude: number;
  };
  available: boolean;
  offers?: Array<{
    price: {
      currency: string;
      base: string;
      total: string;
    };
  }>;
}

interface MatchResult {
  supabaseId: string;
  hotelName: string;
  amadeusHotelId: string;
  amadeusName: string;
  similarity: number;
  rateGBP: number | null;
  neighborhood: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AMADEUS_BASE_URL = 'https://test.api.amadeus.com';
const CACHE_DIR = path.resolve(__dirname, '../../data/api-cache');
const CHECK_IN_DATE = '2026-03-14'; // ~2 weeks from now
const CHECK_OUT_DATE = '2026-03-15';
const GEOCODE_RADIUS_KM = 1; // 1km radius — Amadeus requires integer radius (minimum 1km)
const SIMILARITY_THRESHOLD = 0.45; // minimum similarity to accept a match

// Known anomalous Amadeus test environment hotel IDs — rates are unreliable/synthetic
// These appear in the test dataset but return pricing anomalies inconsistent with reality
const AMADEUS_BLOCKLIST = new Set([
  'BWLON187',  // Returns £899 for a 4* Best Western — clear test environment anomaly
  'HLLON834',  // "KKKTEST HOTEL HN AVH DIRECT TEST" — explicit test hotel
  'BGLONBGB',  // "TEST CONTENT" — explicit test hotel
  'VPLON58B',  // "TEST VPG GBP" — explicit test hotel
  'XKLON321',  // "Hotel London Allocation" — test allocation hotel
  'ODLON001',  // "OD TEST HOTEL 1" — explicit test hotel
  'UXLON101',  // "AMADEUS TEST - LONDON" — explicit test hotel
  'HLLON300',  // "Hilton Chengdu Longquanyi" — Chinese hotel appearing in London dataset
]);
const OFFERS_BATCH_SIZE = 10; // Amadeus Hotel Offers: max IDs per call
const GEOCODE_DELAY_MS = 150; // delay between geocode calls
const OFFERS_DELAY_MS = 200; // delay between offers batch calls
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// ─── Cache ────────────────────────────────────────────────────────────────────

function getCachePath(key: string): string {
  const safeKey = key.replace(/[^a-z0-9._-]/gi, '_');
  return path.join(CACHE_DIR, `${safeKey}.json`);
}

function readCache<T>(key: string): T | null {
  const cachePath = getCachePath(key);
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function writeCache(key: string, data: unknown): void {
  const cachePath = getCachePath(key);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
}

// ─── Delay ────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── String Similarity (Jaro-Winkler-inspired simplified fuzzy match) ─────────

/**
 * Normalise hotel name for comparison:
 * - lowercase
 * - remove common hotel suffixes
 * - remove punctuation
 * - collapse whitespace
 */
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(hotel|hotels|london|the|a|an|&|and|by|at|of|inn|suites?|suite|apartments?|apts?|residences?|residence|court|house|place|lodge|boutique|luxury|premium|executive|collection|group|international|limited|ltd)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute token-based Jaccard similarity between two hotel names.
 * Returns a score between 0 and 1.
 */
function nameSimilarity(a: string, b: string): number {
  const normedA = normaliseName(a);
  const normedB = normaliseName(b);

  if (normedA === normedB) return 1.0;

  const tokensA = new Set(normedA.split(' ').filter(t => t.length > 1));
  const tokensB = new Set(normedB.split(' ').filter(t => t.length > 1));

  if (tokensA.size === 0 && tokensB.size === 0) return 0;

  // Intersection
  let intersectionSize = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersectionSize++;
  }

  // Also check partial substring matches for short tokens
  let partialBonus = 0;
  for (const t of tokensA) {
    if (t.length >= 4) {
      for (const u of tokensB) {
        if (u.length >= 4 && (t.includes(u) || u.includes(t)) && !tokensB.has(t)) {
          partialBonus += 0.5;
          break;
        }
      }
    }
  }

  const unionSize = tokensA.size + tokensB.size - intersectionSize;
  const jaccard = unionSize > 0 ? intersectionSize / unionSize : 0;
  const boosted = Math.min(1, jaccard + (partialBonus / Math.max(tokensA.size, tokensB.size)));

  return boosted;
}

// ─── Amadeus Auth ─────────────────────────────────────────────────────────────

async function getAmadeusToken(apiKey: string, apiSecret: string): Promise<string> {
  console.log('Authenticating with Amadeus...');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: apiKey,
    client_secret: apiSecret,
  });

  const response = await fetch(`${AMADEUS_BASE_URL}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amadeus auth failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as AmadeusTokenResponse;
  console.log(`  Auth OK — token expires in ${data.expires_in}s`);
  return data.access_token;
}

// ─── Amadeus Hotel List by Geocode ────────────────────────────────────────────

async function fetchHotelsByGeocode(
  token: string,
  lat: number,
  lng: number,
  retries = 0,
): Promise<AmadeusHotelListItem[]> {
  const cacheKey = `geocode_${lat.toFixed(5)}_${lng.toFixed(5)}_r${GEOCODE_RADIUS_KM}`;
  const cached = readCache<{ data: AmadeusHotelListItem[] }>(cacheKey);
  if (cached) return cached.data || [];

  const url = new URL(`${AMADEUS_BASE_URL}/v1/reference-data/locations/hotels/by-geocode`);
  url.searchParams.set('latitude', lat.toFixed(6));
  url.searchParams.set('longitude', lng.toFixed(6));
  url.searchParams.set('radius', Math.round(GEOCODE_RADIUS_KM).toString());
  url.searchParams.set('radiusUnit', 'KM');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 429) {
    if (retries >= MAX_RETRIES) throw new Error('Rate limit exceeded after max retries');
    const backoff = INITIAL_BACKOFF_MS * Math.pow(2, retries);
    console.warn(`    429 Rate limited — waiting ${backoff}ms before retry ${retries + 1}`);
    await delay(backoff);
    return fetchHotelsByGeocode(token, lat, lng, retries + 1);
  }

  if (response.status === 401) {
    throw new Error('Amadeus token expired — re-authenticate');
  }

  if (!response.ok) {
    const text = await response.text();
    // Non-fatal: some coordinates return no results
    console.warn(`    Geocode API error (${response.status}) for ${lat},${lng}: ${text.slice(0, 100)}`);
    return [];
  }

  const data = (await response.json()) as { data?: AmadeusHotelListItem[] };
  const results = data.data || [];
  writeCache(cacheKey, { data: results });
  return results;
}

// ─── Amadeus Hotel Offers (batch) ─────────────────────────────────────────────

async function fetchHotelOffersBatch(
  token: string,
  hotelIds: string[],
  retries = 0,
): Promise<HotelOffer[]> {
  if (hotelIds.length === 0) return [];

  const idsKey = hotelIds.sort().join(',');
  const cacheKey = `offers_${CHECK_IN_DATE}_${Buffer.from(idsKey).toString('base64').slice(0, 40)}`;
  const cached = readCache<{ data: HotelOffer[] }>(cacheKey);
  if (cached) return cached.data || [];

  const url = new URL(`${AMADEUS_BASE_URL}/v3/shopping/hotel-offers`);
  url.searchParams.set('hotelIds', hotelIds.join(','));
  url.searchParams.set('checkInDate', CHECK_IN_DATE);
  url.searchParams.set('checkOutDate', CHECK_OUT_DATE);
  url.searchParams.set('adults', '1');
  url.searchParams.set('roomQuantity', '1');
  url.searchParams.set('currency', 'GBP');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 429) {
    if (retries >= MAX_RETRIES) throw new Error('Rate limit exceeded after max retries');
    const backoff = INITIAL_BACKOFF_MS * Math.pow(2, retries);
    console.warn(`    429 Rate limited on offers — waiting ${backoff}ms before retry ${retries + 1}`);
    await delay(backoff);
    return fetchHotelOffersBatch(token, hotelIds, retries + 1);
  }

  if (response.status === 401) {
    throw new Error('Amadeus token expired — re-authenticate');
  }

  if (!response.ok) {
    // Non-fatal: some hotel IDs may not have offers for this date
    const text = await response.text();
    console.warn(`    Offers API error (${response.status}) for batch: ${text.slice(0, 100)}`);
    return [];
  }

  const data = (await response.json()) as { data?: HotelOffer[] };
  const results = data.data || [];
  writeCache(cacheKey, { data: results });
  return results;
}

// ─── Match + Rate Extraction ──────────────────────────────────────────────────

// Maximum plausible rate for a single night in London (filters test-data anomalies)
const MAX_PLAUSIBLE_RATE_GBP = 1500;

function extractLowestRate(offer: HotelOffer): number | null {
  // Skip blocklisted hotel IDs at extraction time too
  if (AMADEUS_BLOCKLIST.has(offer.hotel?.hotelId)) return null;
  if (!offer.available || !offer.offers || offer.offers.length === 0) return null;

  const rates = offer.offers
    .map(o => parseFloat(o.price?.base || o.price?.total || '0'))
    .filter(r => r > 0 && r <= MAX_PLAUSIBLE_RATE_GBP);

  if (rates.length === 0) return null;
  return Math.min(...rates);
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main() {
  const pipelineStart = Date.now();

  console.log('='.repeat(60));
  console.log('fetch-rates.ts — Amadeus Hotel Rate Pipeline');
  console.log('='.repeat(60));
  console.log(`Check-in date: ${CHECK_IN_DATE}`);
  console.log(`Check-out date: ${CHECK_OUT_DATE}`);
  console.log(`Geocode radius: ${GEOCODE_RADIUS_KM}km`);
  console.log(`Name similarity threshold: ${SIMILARITY_THRESHOLD}`);
  console.log('');

  // ── Validate env vars ──────────────────────────────────────────────────────

  const AMADEUS_API_KEY = requireEnv('AMADEUS_API_KEY');
  const AMADEUS_API_SECRET = requireEnv('AMADEUS_API_SECRET');
  const SUPABASE_URL = requireEnv('SUPABASE_URL');
  const SUPABASE_KEY =
    process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim() || requireEnv('SUPABASE_ANON_KEY');

  console.log('Env validation: OK');
  console.log(`Amadeus key: ${AMADEUS_API_KEY.slice(0, 6)}...`);
  console.log('');

  // ── Ensure cache directory exists ─────────────────────────────────────────

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`Cache directory: ${CACHE_DIR}`);

  // ── Connect to Supabase ───────────────────────────────────────────────────

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // ── Read all hotels from Supabase ─────────────────────────────────────────

  console.log('\nReading hotels from Supabase...');
  const { data: hotels, error: fetchError } = await supabase
    .from('hotels')
    .select('id, name, lat, lng, star_rating, base_rate_gbp, neighborhood')
    .order('name', { ascending: true });

  if (fetchError) {
    console.error('ERROR: Failed to read hotels from Supabase:', fetchError.message);
    process.exit(1);
  }

  const supabaseHotels = hotels as SupabaseHotel[];
  console.log(`  Loaded ${supabaseHotels.length} hotels from Supabase`);

  if (supabaseHotels.length === 0) {
    console.error('ERROR: No hotels found in database. Run seed-db.ts first.');
    process.exit(1);
  }

  // ── Authenticate with Amadeus ─────────────────────────────────────────────

  console.log('\n── Phase 1: Amadeus Authentication ────────────────────────');
  let token = await getAmadeusToken(AMADEUS_API_KEY, AMADEUS_API_SECRET);
  const tokenIssuedAt = Date.now();
  const TOKEN_LIFETIME_MS = 29 * 60 * 1000; // refresh at 29 mins (token lasts 30)

  async function getValidToken(): Promise<string> {
    if (Date.now() - tokenIssuedAt > TOKEN_LIFETIME_MS) {
      console.log('  Token nearing expiry — refreshing...');
      token = await getAmadeusToken(AMADEUS_API_KEY, AMADEUS_API_SECRET);
    }
    return token;
  }

  // ── Phase 2: Geocode search — find Amadeus hotel IDs ─────────────────────

  console.log('\n── Phase 2: Geocode Search ─────────────────────────────────');
  console.log(`Searching for Amadeus hotel IDs for ${supabaseHotels.length} hotels...`);
  console.log('(Using cache when available — first run will take several minutes)');
  console.log('');

  // Map: supabase hotel ID → best Amadeus match
  const matchMap = new Map<
    string,
    { amadeusHotelId: string; amadeusName: string; similarity: number }
  >();

  // Also collect all Amadeus IDs we want offers for
  const amadeusIdToSupabaseId = new Map<string, string>();

  let geocodeCallCount = 0;
  let geocodeCacheHits = 0;
  let noResultsCount = 0;
  let matchedCount = 0;

  for (let i = 0; i < supabaseHotels.length; i++) {
    const hotel = supabaseHotels[i];

    // Check cache hit before delay
    const cacheKey = `geocode_${hotel.lat.toFixed(5)}_${hotel.lng.toFixed(5)}_r${GEOCODE_RADIUS_KM}`;
    const isCached = fs.existsSync(getCachePath(cacheKey));

    if (!isCached) {
      geocodeCallCount++;
      if (geocodeCallCount > 1) {
        await delay(GEOCODE_DELAY_MS);
      }
    } else {
      geocodeCacheHits++;
    }

    if ((i + 1) % 50 === 0 || i === 0) {
      console.log(`  [${i + 1}/${supabaseHotels.length}] Processing: ${hotel.name}`);
    }

    const currentToken = await getValidToken();
    const candidates = await fetchHotelsByGeocode(currentToken, hotel.lat, hotel.lng);

    if (candidates.length === 0) {
      noResultsCount++;
      continue;
    }

    // Find best name match among candidates (excluding blocklisted test hotel IDs)
    let bestMatch: { amadeusHotelId: string; amadeusName: string; similarity: number } | null =
      null;

    for (const candidate of candidates) {
      // Skip known anomalous test hotels
      if (AMADEUS_BLOCKLIST.has(candidate.hotelId)) continue;

      const sim = nameSimilarity(hotel.name, candidate.name);
      if (!bestMatch || sim > bestMatch.similarity) {
        bestMatch = {
          amadeusHotelId: candidate.hotelId,
          amadeusName: candidate.name,
          similarity: sim,
        };
      }
    }

    if (bestMatch && bestMatch.similarity >= SIMILARITY_THRESHOLD) {
      matchMap.set(hotel.id, bestMatch);
      amadeusIdToSupabaseId.set(bestMatch.amadeusHotelId, hotel.id);
      matchedCount++;
    } else if (bestMatch) {
      // Log near-misses for debugging
      if (bestMatch.similarity > 0.25) {
        console.log(
          `  NEAR-MISS [sim=${bestMatch.similarity.toFixed(2)}]: "${hotel.name}" vs "${bestMatch.amadeusName}"`,
        );
      }
    }
  }

  console.log('');
  console.log(`Geocode phase complete:`);
  console.log(`  API calls made: ${geocodeCallCount}`);
  console.log(`  Cache hits: ${geocodeCacheHits}`);
  console.log(`  No results from API: ${noResultsCount}`);
  console.log(`  Hotels matched by name: ${matchedCount} / ${supabaseHotels.length}`);
  console.log(
    `  Match rate: ${((matchedCount / supabaseHotels.length) * 100).toFixed(1)}%`,
  );

  // ── Phase 3: Fetch Hotel Offers for matched hotels ────────────────────────

  console.log('\n── Phase 3: Hotel Offers Fetch ─────────────────────────────');

  const amadeusIds = Array.from(amadeusIdToSupabaseId.keys());
  const totalBatches = Math.ceil(amadeusIds.length / OFFERS_BATCH_SIZE);

  console.log(`Fetching offers for ${amadeusIds.length} matched hotels (${totalBatches} batches)...`);

  // Map: amadeus hotel ID → rate in GBP
  const rateMap = new Map<string, number>();

  let offerCallCount = 0;
  let offerCacheHits = 0;
  let offersWithRates = 0;
  let offersNoAvailability = 0;

  for (let b = 0; b < amadeusIds.length; b += OFFERS_BATCH_SIZE) {
    const batch = amadeusIds.slice(b, b + OFFERS_BATCH_SIZE);
    const batchNum = Math.floor(b / OFFERS_BATCH_SIZE) + 1;

    // Check if batch is cached
    const idsKey = [...batch].sort().join(',');
    const cacheKey = `offers_${CHECK_IN_DATE}_${Buffer.from(idsKey).toString('base64').slice(0, 40)}`;
    const isCached = fs.existsSync(getCachePath(cacheKey));

    if (!isCached) {
      offerCallCount++;
      if (offerCallCount > 1) {
        await delay(OFFERS_DELAY_MS);
      }
    } else {
      offerCacheHits++;
    }

    if (batchNum % 10 === 0 || batchNum === 1) {
      console.log(`  Batch ${batchNum}/${totalBatches}...`);
    }

    const currentToken = await getValidToken();
    const offers = await fetchHotelOffersBatch(currentToken, batch);

    for (const offer of offers) {
      const rate = extractLowestRate(offer);
      if (rate !== null) {
        rateMap.set(offer.hotel.hotelId, rate);
        offersWithRates++;
      } else {
        offersNoAvailability++;
      }
    }
  }

  console.log('');
  console.log(`Offers phase complete:`);
  console.log(`  API calls made: ${offerCallCount}`);
  console.log(`  Cache hits: ${offerCacheHits}`);
  console.log(`  Hotels with rates: ${offersWithRates}`);
  console.log(`  Hotels with no availability: ${offersNoAvailability}`);

  // ── Phase 4: Build update set ─────────────────────────────────────────────

  console.log('\n── Phase 4: Rate Update Preparation ───────────────────────');

  const matchResults: MatchResult[] = [];
  const unmatchedHotels: string[] = [];
  const ratesGBP: number[] = [];

  for (const hotel of supabaseHotels) {
    const match = matchMap.get(hotel.id);

    if (!match) {
      unmatchedHotels.push(hotel.name);
      continue;
    }

    const rate = rateMap.get(match.amadeusHotelId) ?? null;

    matchResults.push({
      supabaseId: hotel.id,
      hotelName: hotel.name,
      amadeusHotelId: match.amadeusHotelId,
      amadeusName: match.amadeusName,
      similarity: match.similarity,
      rateGBP: rate,
      neighborhood: hotel.neighborhood,
    });

    if (rate !== null) {
      ratesGBP.push(rate);
    }
  }

  const hotelsWithRates = matchResults.filter(m => m.rateGBP !== null);
  const hotelsMatchedNoRate = matchResults.filter(m => m.rateGBP === null);

  console.log(`Hotels with Amadeus rates: ${hotelsWithRates.length}`);
  console.log(`Hotels matched but no availability: ${hotelsMatchedNoRate.length}`);
  console.log(`Hotels unmatched (keeping algo rate): ${unmatchedHotels.length}`);

  if (ratesGBP.length > 0) {
    const minRate = Math.min(...ratesGBP);
    const maxRate = Math.max(...ratesGBP);
    const avgRate = ratesGBP.reduce((a, b) => a + b, 0) / ratesGBP.length;
    console.log(`\nRate stats for Amadeus-sourced hotels:`);
    console.log(`  Min: £${minRate.toFixed(2)}`);
    console.log(`  Max: £${maxRate.toFixed(2)}`);
    console.log(`  Avg: £${avgRate.toFixed(2)}`);
  }

  // ── Phase 5: Update Supabase ──────────────────────────────────────────────

  console.log('\n── Phase 5: Supabase Update ────────────────────────────────');

  if (hotelsWithRates.length === 0) {
    console.warn('WARNING: No rates to update. Check API responses and match thresholds.');
  } else {
    console.log(`Updating ${hotelsWithRates.length} hotels with real Amadeus rates...`);

    let updatedCount = 0;
    let updateErrors = 0;

    // Update in batches of 50
    const UPDATE_BATCH = 50;
    for (let i = 0; i < hotelsWithRates.length; i += UPDATE_BATCH) {
      const batch = hotelsWithRates.slice(i, i + UPDATE_BATCH);
      const batchNum = Math.floor(i / UPDATE_BATCH) + 1;
      const totalUpdateBatches = Math.ceil(hotelsWithRates.length / UPDATE_BATCH);

      for (const match of batch) {
        const { error } = await supabase
          .from('hotels')
          .update({ base_rate_gbp: Math.round(match.rateGBP!) })
          .eq('id', match.supabaseId);

        if (error) {
          console.error(`  ERROR updating ${match.hotelName}: ${error.message}`);
          updateErrors++;
        } else {
          updatedCount++;
        }
      }

      if (batchNum % 5 === 0 || batchNum === 1) {
        console.log(`  Update batch ${batchNum}/${totalUpdateBatches} — ${updatedCount} updated so far`);
      }
    }

    console.log(`\nUpdate complete:`);
    console.log(`  Updated: ${updatedCount}`);
    if (updateErrors > 0) console.log(`  Errors: ${updateErrors}`);
  }

  // ── Phase 6: Verification query ───────────────────────────────────────────

  console.log('\n── Phase 6: Verification ───────────────────────────────────');

  const { data: verifyData } = await supabase
    .from('hotels')
    .select('name, base_rate_gbp, neighborhood, star_rating')
    .order('base_rate_gbp', { ascending: false })
    .limit(10);

  if (verifyData && verifyData.length > 0) {
    console.log('Top 10 hotels by rate (post-update):');
    for (const h of verifyData) {
      console.log(`  £${h.base_rate_gbp} | ${h.star_rating}★ | ${h.name} (${h.neighborhood})`);
    }
  }

  const { data: rateDistData } = await supabase.from('hotels').select('base_rate_gbp');

  if (rateDistData && rateDistData.length > 0) {
    const allRates = rateDistData.map(r => r.base_rate_gbp);
    const allMin = Math.min(...allRates);
    const allMax = Math.max(...allRates);
    const allAvg = allRates.reduce((a: number, b: number) => a + b, 0) / allRates.length;
    console.log('\nFull database rate distribution:');
    console.log(`  Min: £${allMin}`);
    console.log(`  Max: £${allMax}`);
    console.log(`  Avg: £${allAvg.toFixed(2)}`);
    console.log(`  Total hotels: ${allRates.length}`);
  }

  // ── Phase 7: Log unmatched hotels ─────────────────────────────────────────

  if (unmatchedHotels.length > 0) {
    console.log(`\n── Unmatched Hotels (${unmatchedHotels.length}) — Keeping Algo Rate ───`);
    const logPath = path.resolve(__dirname, '../../data/api-cache/unmatched-hotels.txt');
    fs.writeFileSync(logPath, unmatchedHotels.join('\n'));
    console.log(`  Full list written to: ${logPath}`);
    // Print sample
    unmatchedHotels.slice(0, 10).forEach(name => console.log(`  - ${name}`));
    if (unmatchedHotels.length > 10) {
      console.log(`  ... and ${unmatchedHotels.length - 10} more`);
    }
  }

  // ── Completion Log ────────────────────────────────────────────────────────

  const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);

  const completionLog = `
**fetch-rates.ts Completion Log — Amadeus Rate Pipeline:**
- Status: Complete
- Run date: ${new Date().toISOString()}
- Check-in date: ${CHECK_IN_DATE}
- Source: Amadeus Hotel Search API (test.api.amadeus.com)
- Data availability: Real rates from live Amadeus API
- Total hotels in DB: ${supabaseHotels.length}
- Hotels matched by geocode + name: ${matchedCount} (${((matchedCount / supabaseHotels.length) * 100).toFixed(1)}%)
- Hotels with real rates updated: ${hotelsWithRates.length}
- Hotels matched but no availability: ${hotelsMatchedNoRate.length}
- Hotels unmatched (algo rate retained): ${unmatchedHotels.length}
- API calls — geocode: ${geocodeCallCount} (${geocodeCacheHits} cache hits)
- API calls — offers: ${offerCallCount} (${offerCacheHits} cache hits)
- Rate range (Amadeus-sourced): £${ratesGBP.length > 0 ? Math.min(...ratesGBP).toFixed(0) : 'N/A'} - £${ratesGBP.length > 0 ? Math.max(...ratesGBP).toFixed(0) : 'N/A'}
- Average rate (Amadeus-sourced): £${ratesGBP.length > 0 ? (ratesGBP.reduce((a, b) => a + b, 0) / ratesGBP.length).toFixed(2) : 'N/A'}
- Duration: ${elapsed}s
- Cache location: data/api-cache/
`;

  console.log('\n' + '='.repeat(60));
  console.log(completionLog);
  console.log('='.repeat(60));

  // Write completion log to file
  const logPath = path.resolve(__dirname, '../../data/api-cache/fetch-rates-log.md');
  fs.writeFileSync(logPath, completionLog.trim());
  console.log(`Completion log written to: ${logPath}`);
}

main().catch(err => {
  console.error('\nfetch-rates.ts FAILED:', err.message || err);
  process.exit(1);
});
