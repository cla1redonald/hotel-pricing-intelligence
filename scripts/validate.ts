/**
 * Validation Script
 * Checks data quality across generated hotels, Pinecone, and Supabase.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import { createClient } from '@supabase/supabase-js';
import type { GeneratedHotel } from './generate-hotels';

config({ path: path.resolve(__dirname, '..', '.env.local') });

interface ValidationResult {
  passed: boolean;
  checks: { name: string; passed: boolean; message: string }[];
}

export function validateLocalData(hotels: GeneratedHotel[]): ValidationResult {
  const checks: ValidationResult['checks'] = [];

  // 1. Count check
  checks.push({
    name: 'Hotel count >= 1000',
    passed: hotels.length >= 1000,
    message: `${hotels.length} hotels generated`,
  });

  // 2. No duplicate name+neighborhood
  const keys = new Set<string>();
  let duplicates = 0;
  for (const h of hotels) {
    const key = `${h.name}|${h.neighborhood}`;
    if (keys.has(key)) duplicates++;
    keys.add(key);
  }
  checks.push({
    name: 'No duplicate name+neighborhood',
    passed: duplicates === 0,
    message: duplicates === 0 ? 'No duplicates found' : `${duplicates} duplicates found`,
  });

  // 3. Valid star ratings
  const invalidStars = hotels.filter(h => h.star_rating < 1 || h.star_rating > 5);
  checks.push({
    name: 'All star ratings 1-5',
    passed: invalidStars.length === 0,
    message: invalidStars.length === 0 ? 'All valid' : `${invalidStars.length} invalid`,
  });

  // 4. Positive base rates
  const invalidRates = hotels.filter(h => h.base_rate_gbp <= 0);
  checks.push({
    name: 'All base rates positive',
    passed: invalidRates.length === 0,
    message: invalidRates.length === 0 ? 'All positive' : `${invalidRates.length} non-positive`,
  });

  // 5. Non-empty neighborhoods
  const emptyNeighborhoods = hotels.filter(h => !h.neighborhood || h.neighborhood.trim() === '');
  checks.push({
    name: 'All neighborhoods non-empty',
    passed: emptyNeighborhoods.length === 0,
    message: emptyNeighborhoods.length === 0 ? 'All valid' : `${emptyNeighborhoods.length} empty`,
  });

  // 6. Demand curves have 7 values in range
  const invalidDemand = hotels.filter(h => {
    const dc = h.pricing_factors.demand_curve;
    return dc.length !== 7 || dc.some(v => v < 0.7 || v > 1.5);
  });
  checks.push({
    name: 'Demand curves: 7 values, range 0.7-1.5',
    passed: invalidDemand.length === 0,
    message: invalidDemand.length === 0 ? 'All valid' : `${invalidDemand.length} invalid`,
  });

  // 7. Seasonality has 12 values in range
  const invalidSeason = hotels.filter(h => {
    const s = h.pricing_factors.seasonality;
    return s.length !== 12 || s.some(v => v < 0.8 || v > 1.4);
  });
  checks.push({
    name: 'Seasonality: 12 values, range 0.8-1.4',
    passed: invalidSeason.length === 0,
    message: invalidSeason.length === 0 ? 'All valid' : `${invalidSeason.length} invalid`,
  });

  // 8. Occupancy base in range
  const invalidOccupancy = hotels.filter(h => {
    return h.pricing_factors.occupancy_base < 30 || h.pricing_factors.occupancy_base > 95;
  });
  checks.push({
    name: 'Occupancy base: range 30-95',
    passed: invalidOccupancy.length === 0,
    message: invalidOccupancy.length === 0 ? 'All valid' : `${invalidOccupancy.length} invalid`,
  });

  // 9. Spot-check 20 random hotels
  const spotCheck = hotels.filter((_, i) => i % Math.floor(hotels.length / 20) === 0).slice(0, 20);
  const spotCheckIssues: string[] = [];
  for (const h of spotCheck) {
    if (!h.name || h.name.length < 3) spotCheckIssues.push(`${h.name}: name too short`);
    if (!h.review_summary || h.review_summary.length < 50) spotCheckIssues.push(`${h.name}: review too short`);
    if (h.amenities.length < 2) spotCheckIssues.push(`${h.name}: too few amenities`);
    if (!h.pinecone_id) spotCheckIssues.push(`${h.name}: missing pinecone_id`);
  }
  checks.push({
    name: 'Spot-check 20 hotels for data quality',
    passed: spotCheckIssues.length === 0,
    message: spotCheckIssues.length === 0
      ? '20 hotels passed quality checks'
      : `Issues: ${spotCheckIssues.join('; ')}`,
  });

  return {
    passed: checks.every(c => c.passed),
    checks,
  };
}

export async function validateEmbeddings(
  hotels: GeneratedHotel[],
  embeddings: Record<string, number[]>
): Promise<ValidationResult> {
  const checks: ValidationResult['checks'] = [];

  // 1. All hotels have embeddings
  const missing = hotels.filter(h => !embeddings[h.pinecone_id]);
  checks.push({
    name: 'All hotels have embeddings',
    passed: missing.length === 0,
    message: missing.length === 0 ? 'All present' : `${missing.length} missing`,
  });

  // 2. All embeddings are 1536 dimensions
  const wrongDim = Object.entries(embeddings).filter(([, v]) => v.length !== 1536);
  checks.push({
    name: 'All embeddings are 1536 dimensions',
    passed: wrongDim.length === 0,
    message: wrongDim.length === 0 ? 'All correct' : `${wrongDim.length} wrong dimensions`,
  });

  return {
    passed: checks.every(c => c.passed),
    checks,
  };
}

export async function validateRemoteStores(
  hotelCount: number
): Promise<ValidationResult> {
  const checks: ValidationResult['checks'] = [];

  // Pinecone count
  try {
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const indexName = process.env.PINECONE_INDEX || 'hotel-embeddings';
    const index = pinecone.index(indexName);
    const stats = await index.describeIndexStats();
    const vectorCount = stats.totalRecordCount || 0;

    checks.push({
      name: 'Pinecone vector count matches hotel count',
      passed: vectorCount >= hotelCount,
      message: `Pinecone: ${vectorCount}, Expected: ${hotelCount}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    checks.push({
      name: 'Pinecone vector count matches hotel count',
      passed: false,
      message: `Pinecone error: ${msg}`,
    });
  }

  // Supabase count
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
    const { count, error } = await supabase
      .from('hotels')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    checks.push({
      name: 'Supabase row count matches hotel count',
      passed: (count || 0) >= hotelCount,
      message: `Supabase: ${count}, Expected: ${hotelCount}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    checks.push({
      name: 'Supabase row count matches hotel count',
      passed: false,
      message: `Supabase error: ${msg}`,
    });
  }

  return {
    passed: checks.every(c => c.passed),
    checks,
  };
}

function printReport(title: string, result: ValidationResult): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);

  for (const check of result.checks) {
    const icon = check.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${check.name}`);
    console.log(`         ${check.message}`);
  }

  console.log(`\n  Overall: ${result.passed ? 'ALL PASSED' : 'SOME FAILED'}`);
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────

async function main() {
  const dataDir = path.join(__dirname, 'data');
  const hotelsPath = path.join(dataDir, 'hotels.json');
  const embeddingsPath = path.join(dataDir, 'embeddings.json');

  // Local data validation
  if (!fs.existsSync(hotelsPath)) {
    console.error('hotels.json not found. Run generate-hotels.ts first.');
    process.exit(1);
  }

  const hotels: GeneratedHotel[] = JSON.parse(fs.readFileSync(hotelsPath, 'utf-8'));
  const localResult = validateLocalData(hotels);
  printReport('Local Data Validation', localResult);

  // Embedding validation
  if (fs.existsSync(embeddingsPath)) {
    const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));
    const embeddingResult = await validateEmbeddings(hotels, embeddings);
    printReport('Embedding Validation', embeddingResult);
  } else {
    console.log('\nSkipping embedding validation (embeddings.json not found)');
  }

  // Remote store validation
  if (process.env.PINECONE_API_KEY && process.env.SUPABASE_URL) {
    const remoteResult = await validateRemoteStores(hotels.length);
    printReport('Remote Store Validation', remoteResult);
  } else {
    console.log('\nSkipping remote validation (env vars not set)');
  }
}

if (require.main === module) {
  main().catch(console.error);
}
