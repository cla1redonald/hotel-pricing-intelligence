/**
 * Stage 1: clean.ts
 * Extract, clean, and deduplicate London hotels from the 515k Hotel Reviews dataset.
 *
 * Source: Kaggle — 515K Hotel Reviews Data in Europe
 *   https://www.kaggle.com/datasets/jiashenliu/515k-hotel-reviews-data-in-europe
 *   License: CC BY 4.0
 *
 * Output: data/clean/london-hotels.json
 *
 * Usage: npx tsx scripts/data/clean.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawHotelRecord {
  Hotel_Address: string;
  Additional_Number_of_Scoring: string;
  Review_Date: string;
  Average_Score: string;
  Hotel_Name: string;
  Reviewer_Nationality: string;
  Negative_Review: string;
  Review_Total_Negative_Word_Counts: string;
  Total_Number_of_Reviews: string;
  Positive_Review: string;
  Review_Total_Positive_Word_Counts: string;
  Reviewer_Score: string;
  Tags: string;
  days_since_review: string;
  lat: string;
  lng: string;
}

export interface CleanHotel {
  name: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  // Average score on 0-10 scale (Booking.com) — normalised to 1-5 star equivalent
  booking_score: number;
  star_rating: number;
  total_reviews: number;
  review_summary: string;
  raw_positive_reviews: string[];
  raw_negative_reviews: string[];
}

// ─── Neighborhood Mapping ────────────────────────────────────────────────────
// Maps London borough/area keywords (from address text) to canonical neighborhood names.
// Coordinate-based fallback used when keyword matching fails.

const BOROUGH_TO_NEIGHBORHOOD: Record<string, string> = {
  // Kensington and Chelsea
  'kensington and chelsea': "Kensington",
  'kensington': "Kensington",
  'chelsea': "Chelsea",
  "earl's court": "Earl's Court",
  'earls court': "Earl's Court",
  'knightsbridge': "Knightsbridge",
  'notting hill': "Notting Hill",
  'south kensington': "South Kensington",

  // Westminster
  'westminster borough': "Westminster",
  'westminster': "Westminster",
  'mayfair': "Mayfair",
  'soho': "Soho",
  'covent garden': "Covent Garden",
  'piccadilly': "Piccadilly",
  "st james's": "St James's",
  'paddington': "Paddington",
  'bayswater': "Bayswater",

  // Camden
  'camden': "Camden",
  'bloomsbury': "Bloomsbury",
  "king's cross": "King's Cross",
  'kings cross': "King's Cross",
  'fitzrovia': "Fitzrovia",
  'marylebone': "Marylebone",
  'hampstead': "Hampstead",

  // City of London
  'city of london': "City of London",
  'barbican': "Barbican",
  'bank': "Bank",

  // Islington
  'islington': "Islington",
  'angel': "Angel",

  // Southwark / South Bank
  'southwark': "Southwark",
  'london bridge': "London Bridge",
  'bermondsey': "Bermondsey",
  'bankside': "Bankside",

  // Lambeth
  'lambeth': "Waterloo",
  'waterloo': "Waterloo",

  // Tower Hamlets
  'tower hamlets': "Whitechapel",
  'whitechapel': "Whitechapel",
  'shoreditch': "Shoreditch",
  'bethnal green': "Bethnal Green",

  // Hackney
  'hackney': "Hackney",

  // Newham / East
  'newham': "Stratford",
  'stratford': "Stratford",
  'canary wharf': "Canary Wharf",
  'docklands': "Canary Wharf",

  // Greenwich
  'greenwich': "Greenwich",

  // Others
  'battersea': "Battersea",
  'fulham': "Fulham",
  'wandsworth': "Battersea",
  'richmond': "Richmond",
  'wimbledon': "Richmond",
  'ealing': "Paddington",
  'hammersmith': "Fulham",
  'brent': "Paddington",
  'wembley': "Paddington",
};

// Coordinate bounding boxes for fallback neighborhood assignment
const COORD_NEIGHBORHOODS: Array<{
  name: string;
  minLat: number; maxLat: number;
  minLng: number; maxLng: number;
}> = [
  { name: "Mayfair", minLat: 51.504, maxLat: 51.515, minLng: -0.155, maxLng: -0.138 },
  { name: "Soho", minLat: 51.509, maxLat: 51.519, minLng: -0.140, maxLng: -0.128 },
  { name: "Covent Garden", minLat: 51.508, maxLat: 51.516, minLng: -0.130, maxLng: -0.117 },
  { name: "Bloomsbury", minLat: 51.518, maxLat: 51.528, minLng: -0.135, maxLng: -0.118 },
  { name: "Westminster", minLat: 51.493, maxLat: 51.505, minLng: -0.145, maxLng: -0.120 },
  { name: "Kensington", minLat: 51.493, maxLat: 51.505, minLng: -0.200, maxLng: -0.175 },
  { name: "South Kensington", minLat: 51.488, maxLat: 51.498, minLng: -0.185, maxLng: -0.165 },
  { name: "Chelsea", minLat: 51.480, maxLat: 51.492, minLng: -0.185, maxLng: -0.155 },
  { name: "Knightsbridge", minLat: 51.497, maxLat: 51.508, minLng: -0.175, maxLng: -0.152 },
  { name: "Paddington", minLat: 51.510, maxLat: 51.524, minLng: -0.190, maxLng: -0.165 },
  { name: "Notting Hill", minLat: 51.504, maxLat: 51.515, minLng: -0.210, maxLng: -0.185 },
  { name: "Earl's Court", minLat: 51.485, maxLat: 51.498, minLng: -0.205, maxLng: -0.180 },
  { name: "Marylebone", minLat: 51.518, maxLat: 51.528, minLng: -0.165, maxLng: -0.144 },
  { name: "Camden", minLat: 51.530, maxLat: 51.550, minLng: -0.155, maxLng: -0.130 },
  { name: "King's Cross", minLat: 51.528, maxLat: 51.540, minLng: -0.135, maxLng: -0.112 },
  { name: "Islington", minLat: 51.530, maxLat: 51.548, minLng: -0.115, maxLng: -0.090 },
  { name: "Shoreditch", minLat: 51.520, maxLat: 51.535, minLng: -0.090, maxLng: -0.068 },
  { name: "City of London", minLat: 51.508, maxLat: 51.522, minLng: -0.105, maxLng: -0.078 },
  { name: "Southwark", minLat: 51.498, maxLat: 51.510, minLng: -0.112, maxLng: -0.088 },
  { name: "London Bridge", minLat: 51.500, maxLat: 51.512, minLng: -0.095, maxLng: -0.075 },
  { name: "Waterloo", minLat: 51.498, maxLat: 51.510, minLng: -0.125, maxLng: -0.105 },
  { name: "Whitechapel", minLat: 51.510, maxLat: 51.524, minLng: -0.070, maxLng: -0.045 },
  { name: "Canary Wharf", minLat: 51.498, maxLat: 51.514, minLng: -0.040, maxLng: -0.008 },
  { name: "Greenwich", minLat: 51.465, maxLat: 51.490, minLng: -0.020, maxLng: 0.015 },
  { name: "Stratford", minLat: 51.535, maxLat: 51.555, minLng: -0.020, maxLng: 0.010 },
  { name: "Battersea", minLat: 51.468, maxLat: 51.485, minLng: -0.175, maxLng: -0.135 },
  { name: "Fulham", minLat: 51.466, maxLat: 51.482, minLng: -0.220, maxLng: -0.185 },
  { name: "Richmond", minLat: 51.445, maxLat: 51.475, minLng: -0.330, maxLng: -0.280 },
];

function inferNeighborhoodFromAddress(address: string): string {
  const lower = address.toLowerCase();

  // Check explicit keyword mappings first (longest match wins)
  const keys = Object.keys(BOROUGH_TO_NEIGHBORHOOD).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key)) {
      return BOROUGH_TO_NEIGHBORHOOD[key];
    }
  }

  return '';
}

function inferNeighborhoodFromCoords(lat: number, lng: number): string {
  for (const box of COORD_NEIGHBORHOODS) {
    if (lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng) {
      return box.name;
    }
  }
  // Default fallback — still in London
  return 'Central London';
}

// ─── Star Rating Derivation ───────────────────────────────────────────────────
// Booking.com uses 0-10 average score; map to 1-5 stars
// <7.0 → 2★, 7.0-7.9 → 3★, 8.0-8.9 → 4★, 9.0+ → 5★
// Note: there are no truly 1-star hotels in this dataset (they'd have been removed from Booking.com)

export function bookingScoreToStars(score: number): number {
  if (score >= 9.0) return 5;
  if (score >= 8.0) return 4;
  if (score >= 7.0) return 3;
  if (score >= 6.0) return 2;
  return 1;
}

// ─── Review Cleaning ─────────────────────────────────────────────────────────

function cleanReviewText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function isUsefulReview(text: string): boolean {
  if (!text || text.length < 20) return false;
  const lower = text.toLowerCase();
  // Skip placeholder text
  if (lower === 'no positive' || lower === 'no negative') return false;
  if (lower === 'nothing' || lower === 'n/a' || lower === 'none') return false;
  return true;
}

// Build review summary from top reviews (max ~800 chars)
function buildReviewSummary(
  positiveReviews: string[],
  negativeReviews: string[],
  hotelName: string,
  neighborhood: string,
  score: number,
): string {
  const MAX_CHARS = 800;

  // Pick the best positive reviews (longest substantive ones)
  const goodPos = positiveReviews
    .filter(isUsefulReview)
    .map(cleanReviewText)
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);

  // Pick a couple negative reviews for balance (shortest/mildest)
  const goodNeg = negativeReviews
    .filter(isUsefulReview)
    .map(cleanReviewText)
    .sort((a, b) => a.length - b.length)
    .slice(0, 3);

  const parts: string[] = [];
  let totalChars = 0;

  // Prepend a context sentence
  const starLabel = bookingScoreToStars(score);
  const context = `${hotelName} is a ${starLabel}-star hotel in ${neighborhood}, London with an average guest score of ${score}/10 on Booking.com.`;
  parts.push(context);
  totalChars += context.length;

  // Add positive reviews
  for (const review of goodPos) {
    if (totalChars + review.length + 1 > MAX_CHARS) break;
    parts.push(review);
    totalChars += review.length + 1;
  }

  // Add one balanced negative if space allows
  if (goodNeg.length > 0) {
    const neg = goodNeg[0];
    if (totalChars + neg.length + 1 <= MAX_CHARS) {
      parts.push(`On the downside: ${neg}`);
    }
  }

  return parts.join(' ');
}

// ─── Address Normalization ────────────────────────────────────────────────────

function extractPostcode(address: string): string {
  const match = address.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}/i);
  return match ? match[0].toUpperCase() : '';
}

// ─── Main Processing ──────────────────────────────────────────────────────────

export function processLondonHotels(csvPath: string): CleanHotel[] {
  console.log(`\nReading CSV: ${csvPath}`);
  const raw = fs.readFileSync(csvPath, 'utf-8');

  console.log('Parsing CSV...');
  const records: RawHotelRecord[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Total rows in dataset: ${records.length.toLocaleString()}`);

  // Filter to London (United Kingdom)
  const londonRows = records.filter(r => r.Hotel_Address.includes('United Kingdom'));
  console.log(`London rows: ${londonRows.length.toLocaleString()}`);

  // Group by hotel name
  const hotelMap = new Map<string, {
    address: string;
    lat: number;
    lng: number;
    avgScore: number;
    totalReviews: number;
    positiveReviews: string[];
    negativeReviews: string[];
  }>();

  for (const row of londonRows) {
    const name = row.Hotel_Name.trim();
    if (!name) continue;

    const lat = parseFloat(row.lat);
    const lng = parseFloat(row.lng);
    const score = parseFloat(row.Average_Score);
    const totalReviews = parseInt(row.Total_Number_of_Reviews, 10);

    if (!hotelMap.has(name)) {
      hotelMap.set(name, {
        address: row.Hotel_Address.trim(),
        lat: isNaN(lat) ? 0 : lat,
        lng: isNaN(lng) ? 0 : lng,
        avgScore: isNaN(score) ? 7.5 : score,
        totalReviews: isNaN(totalReviews) ? 0 : totalReviews,
        positiveReviews: [],
        negativeReviews: [],
      });
    }

    const hotel = hotelMap.get(name)!;

    // Collect reviews
    if (row.Positive_Review && row.Positive_Review.trim() !== 'No Positive') {
      hotel.positiveReviews.push(row.Positive_Review.trim());
    }
    if (row.Negative_Review && row.Negative_Review.trim() !== 'No Negative') {
      hotel.negativeReviews.push(row.Negative_Review.trim());
    }
  }

  console.log(`Unique London hotel names: ${hotelMap.size}`);

  // Build clean hotel records
  const hotels: CleanHotel[] = [];
  let missingCoords = 0;
  let neighborhoodFromAddress = 0;
  let neighborhoodFromCoords = 0;
  let neighborhoodFallback = 0;

  for (const [name, data] of hotelMap.entries()) {
    // Skip hotels with no coordinates
    if (data.lat === 0 && data.lng === 0) {
      missingCoords++;
      continue;
    }

    // Determine neighborhood
    let neighborhood = inferNeighborhoodFromAddress(data.address);
    if (neighborhood) {
      neighborhoodFromAddress++;
    } else {
      neighborhood = inferNeighborhoodFromCoords(data.lat, data.lng);
      if (neighborhood === 'Central London') {
        neighborhoodFallback++;
      } else {
        neighborhoodFromCoords++;
      }
    }

    const reviewSummary = buildReviewSummary(
      data.positiveReviews,
      data.negativeReviews,
      name,
      neighborhood,
      data.avgScore,
    );

    hotels.push({
      name,
      address: data.address,
      neighborhood,
      lat: data.lat,
      lng: data.lng,
      booking_score: data.avgScore,
      star_rating: bookingScoreToStars(data.avgScore),
      total_reviews: data.totalReviews,
      review_summary: reviewSummary,
      raw_positive_reviews: data.positiveReviews.slice(0, 10),
      raw_negative_reviews: data.negativeReviews.slice(0, 5),
    });
  }

  console.log(`\nProcessing stats:`);
  console.log(`  Skipped (no coordinates): ${missingCoords}`);
  console.log(`  Neighborhood from address keywords: ${neighborhoodFromAddress}`);
  console.log(`  Neighborhood from coordinates: ${neighborhoodFromCoords}`);
  console.log(`  Neighborhood fallback (Central London): ${neighborhoodFallback}`);
  console.log(`  Final hotel count: ${hotels.length}`);

  return hotels;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateCleanData(hotels: CleanHotel[]): void {
  const issues: string[] = [];

  const nullName = hotels.filter(h => !h.name).length;
  if (nullName > 0) issues.push(`${nullName} hotels with null name`);

  const nullNeighborhood = hotels.filter(h => !h.neighborhood).length;
  if (nullNeighborhood > 0) issues.push(`${nullNeighborhood} hotels with null neighborhood`);

  const nullCoords = hotels.filter(h => h.lat === 0 || h.lng === 0).length;
  if (nullCoords > 0) issues.push(`${nullCoords} hotels with zero coordinates`);

  const nullReview = hotels.filter(h => !h.review_summary || h.review_summary.length < 50).length;
  if (nullReview > 0) issues.push(`${nullReview} hotels with short/null review summary`);

  // Duplicate check
  const names = hotels.map(h => h.name);
  const uniqueNames = new Set(names);
  if (uniqueNames.size < names.length) {
    issues.push(`${names.length - uniqueNames.size} duplicate hotel names`);
  }

  // Score range check
  const badScore = hotels.filter(h => h.booking_score < 0 || h.booking_score > 10).length;
  if (badScore > 0) issues.push(`${badScore} hotels with out-of-range scores`);

  // Coordinate bounds (rough London bounding box: lat 51.28-51.70, lng -0.55-0.30)
  const outOfBounds = hotels.filter(
    h => h.lat < 51.28 || h.lat > 51.70 || h.lng < -0.55 || h.lng > 0.30,
  ).length;
  if (outOfBounds > 0) issues.push(`${outOfBounds} hotels outside London bounding box`);

  console.log(`\nValidation:`);
  if (issues.length === 0) {
    console.log('  All checks PASSED');
  } else {
    for (const issue of issues) {
      console.log(`  WARNING: ${issue}`);
    }
  }

  // Print distributions
  const starDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const h of hotels) {
    starDist[h.star_rating] = (starDist[h.star_rating] || 0) + 1;
  }
  console.log(`\nStar rating distribution (derived from Booking.com score):`);
  for (const [star, count] of Object.entries(starDist)) {
    const pct = ((count / hotels.length) * 100).toFixed(1);
    console.log(`  ${star}-star: ${count} (${pct}%)`);
  }

  const neighborhoodDist: Record<string, number> = {};
  for (const h of hotels) {
    neighborhoodDist[h.neighborhood] = (neighborhoodDist[h.neighborhood] || 0) + 1;
  }
  console.log(`\nNeighborhood distribution (${Object.keys(neighborhoodDist).length} unique):`);
  const sortedNeighborhoods = Object.entries(neighborhoodDist).sort((a, b) => b[1] - a[1]);
  for (const [neighborhood, count] of sortedNeighborhoods.slice(0, 15)) {
    console.log(`  ${neighborhood}: ${count}`);
  }
  if (sortedNeighborhoods.length > 15) {
    console.log(`  ... and ${sortedNeighborhoods.length - 15} more`);
  }

  console.log(`\nBooking score range: ${Math.min(...hotels.map(h => h.booking_score)).toFixed(1)} - ${Math.max(...hotels.map(h => h.booking_score)).toFixed(1)}`);
  console.log(`Review summary length range: ${Math.min(...hotels.map(h => h.review_summary.length))} - ${Math.max(...hotels.map(h => h.review_summary.length))} chars`);
}

// ─── CLI Entrypoint ───────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  const csvPath = path.resolve(__dirname, '../../data/raw/515k-hotel-reviews/Hotel_Reviews.csv');
  const outputDir = path.resolve(__dirname, '../../data/clean');
  const outputPath = path.join(outputDir, 'london-hotels.json');

  if (!fs.existsSync(csvPath)) {
    console.error(`ERROR: CSV not found at ${csvPath}`);
    console.error('Run: download.ts first (or ensure data/raw/515k-hotel-reviews/Hotel_Reviews.csv exists)');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const hotels = processLondonHotels(csvPath);
  validateCleanData(hotels);

  fs.writeFileSync(outputPath, JSON.stringify(hotels, null, 2));
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nSaved ${hotels.length} hotels to ${outputPath} (${elapsed}s)`);
}

main().catch(err => {
  console.error('clean.ts failed:', err);
  process.exit(1);
});
