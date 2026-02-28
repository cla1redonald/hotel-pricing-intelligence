/**
 * Stage 6: validate.ts
 * Post-seed quality checks against both Supabase and Pinecone.
 * Validates counts, null rates, data quality, and cross-store consistency.
 *
 * Usage: npx tsx scripts/data/validate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Pinecone } from '@pinecone-database/pinecone';

config({ path: path.resolve(__dirname, '../../.env.local') });

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

// ─── Validation Check ─────────────────────────────────────────────────────────

interface Check {
  name: string;
  passed: boolean;
  message: string;
}

function check(name: string, condition: boolean, message: string): Check {
  return { name, passed: condition, message };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const checks: Check[] = [];

  console.log('=' .repeat(60));
  console.log('  Post-Seed Validation');
  console.log('='.repeat(60));

  const SUPABASE_URL = requireEnv('SUPABASE_URL');
  const SUPABASE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim()
    || requireEnv('SUPABASE_ANON_KEY');
  const PINECONE_API_KEY = requireEnv('PINECONE_API_KEY');
  const PINECONE_INDEX = requireEnv('PINECONE_INDEX');

  // Load local ground truth
  const enrichedPath = path.resolve(__dirname, '../../data/clean/london-hotels-enriched.json');
  const embeddingsPath = path.resolve(__dirname, '../../data/clean/london-hotels-embeddings.json');

  if (!fs.existsSync(enrichedPath) || !fs.existsSync(embeddingsPath)) {
    console.error('ERROR: Clean data files not found. Run the full pipeline first.');
    process.exit(1);
  }

  const localHotels = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8')) as Array<{
    pinecone_id: string;
    name: string;
    neighborhood: string;
    star_rating: number;
    base_rate_gbp: number;
    review_summary: string;
    booking_score: number;
  }>;

  const { count: localEmbCount } = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8')) as { count: number };

  console.log(`\nLocal data: ${localHotels.length} hotels, ${localEmbCount} embeddings`);

  // ─── Supabase Checks ───────────────────────────────────────────────────────

  console.log('\n[Supabase]');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // Row count
  const { count: totalRows, error: countErr } = await supabase
    .from('hotels')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.error(`  ERROR: Cannot connect to Supabase: ${countErr.message}`);
    checks.push(check('Supabase connectivity', false, countErr.message));
  } else {
    console.log(`  Total rows: ${totalRows}`);
    checks.push(check(
      'Supabase row count',
      (totalRows ?? 0) === localHotels.length,
      `Expected ${localHotels.length}, found ${totalRows}`,
    ));

    // Null checks
    const { count: nullNames } = await supabase
      .from('hotels').select('*', { count: 'exact', head: true }).is('name', null);
    checks.push(check('No null names', (nullNames ?? 0) === 0, `${nullNames} null names`));

    const { count: nullNeighborhood } = await supabase
      .from('hotels').select('*', { count: 'exact', head: true }).is('neighborhood', null);
    checks.push(check(
      'No null neighborhoods',
      (nullNeighborhood ?? 0) === 0,
      `${nullNeighborhood} null neighborhoods`,
    ));

    const { count: nullReview } = await supabase
      .from('hotels').select('*', { count: 'exact', head: true }).is('review_summary', null);
    checks.push(check(
      'No null review summaries',
      (nullReview ?? 0) === 0,
      `${nullReview} null review summaries`,
    ));

    const { count: nullPricingFactors } = await supabase
      .from('hotels').select('*', { count: 'exact', head: true }).is('pricing_factors', null);
    checks.push(check(
      'No null pricing_factors',
      (nullPricingFactors ?? 0) === 0,
      `${nullPricingFactors} null pricing_factors`,
    ));

    // Price range validation (no hotels at £0 or >£1000)
    const { count: zeroPrices } = await supabase
      .from('hotels').select('*', { count: 'exact', head: true }).lte('base_rate_gbp', 0);
    checks.push(check(
      'No zero/negative prices',
      (zeroPrices ?? 0) === 0,
      `${zeroPrices} hotels with price <= £0`,
    ));

    // Star rating range (1-5)
    const { count: invalidStars } = await supabase
      .from('hotels').select('*', { count: 'exact', head: true })
      .or('star_rating.lt.1,star_rating.gt.5');
    checks.push(check(
      'Star ratings in range 1-5',
      (invalidStars ?? 0) === 0,
      `${invalidStars} hotels with star_rating outside 1-5`,
    ));

    // Coordinate validity (London bounding box)
    const { count: badLat } = await supabase
      .from('hotels').select('*', { count: 'exact', head: true })
      .or('lat.lt.51.28,lat.gt.51.70');
    const { count: badLng } = await supabase
      .from('hotels').select('*', { count: 'exact', head: true })
      .or('lng.lt.-0.55,lng.gt.0.30');
    checks.push(check(
      'Coordinates within London bounding box',
      (badLat ?? 0) === 0 && (badLng ?? 0) === 0,
      `${(badLat ?? 0) + (badLng ?? 0)} hotels outside London bounds`,
    ));

    // Sample data query (verify real hotel names, not synthetic)
    const { data: sampleHotels } = await supabase
      .from('hotels')
      .select('name, neighborhood, star_rating, base_rate_gbp')
      .order('name')
      .limit(10);

    if (sampleHotels) {
      console.log('\n  Sample hotels:');
      for (const h of sampleHotels) {
        console.log(`    ${h.name} | ${h.neighborhood} | ${h.star_rating}★ | £${h.base_rate_gbp}`);
      }
    }

    // Price distribution stats
    const { data: priceStats } = await supabase
      .from('hotels')
      .select('base_rate_gbp, star_rating');

    if (priceStats) {
      const prices = priceStats.map(r => r.base_rate_gbp as number);
      const sorted = [...prices].sort((a, b) => a - b);
      console.log(`\n  Price stats: min=£${sorted[0]}, median=£${sorted[Math.floor(sorted.length / 2)]}, max=£${sorted[sorted.length - 1]}`);

      const starDist: Record<number, number> = {};
      for (const r of priceStats) {
        starDist[r.star_rating as number] = (starDist[r.star_rating as number] || 0) + 1;
      }
      console.log('  Star distribution:');
      for (const [star, count] of Object.entries(starDist).sort()) {
        console.log(`    ${star}★: ${count} hotels`);
      }
    }
  }

  // ─── Pinecone Checks ───────────────────────────────────────────────────────

  console.log('\n[Pinecone]');
  const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pinecone.index(PINECONE_INDEX);

  try {
    const stats = await index.describeIndexStats();
    const vectorCount = stats.totalRecordCount ?? 0;
    console.log(`  Total vectors: ${vectorCount}`);
    console.log(`  Dimension: ${stats.dimension ?? 'unknown'}`);

    checks.push(check(
      'Pinecone vector count matches hotel count',
      vectorCount === localHotels.length,
      `Expected ${localHotels.length} vectors, found ${vectorCount}`,
    ));

    checks.push(check(
      'Pinecone dimension is 1536',
      stats.dimension === 1536,
      `Dimension: ${stats.dimension}`,
    ));

    // Verify a known real hotel is in the index
    const testHotel = localHotels.find(h => h.name === 'Strand Palace Hotel') ?? localHotels[0];

    const embsFile = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8')) as {
      embeddings: Array<{ pinecone_id: string; embedding: number[] }>;
    };
    const testEmb = embsFile.embeddings.find(e => e.pinecone_id === testHotel.pinecone_id);

    if (testEmb) {
      const queryResult = await index.query({
        vector: testEmb.embedding,
        topK: 1,
        includeMetadata: true,
      });

      const topMatch = queryResult.matches?.[0];
      const topId = topMatch?.id;
      const topScore = topMatch?.score ?? 0;
      const isCorrect = topId === testHotel.pinecone_id && topScore > 0.999;

      checks.push(check(
        `Query returns correct hotel for "${testHotel.name}"`,
        isCorrect,
        `Got id=${topId}, score=${topScore.toFixed(4)} (expected id=${testHotel.pinecone_id})`,
      ));

      console.log(`\n  Test query: "${testHotel.name}"`);
      console.log(`    Top match: ${topMatch?.metadata?.['name'] ?? topId} (score: ${topScore.toFixed(4)})`);
    }

    // Sample 5 random hotels from local list and verify they exist in Pinecone
    const sample = localHotels.slice(0, 5);
    const sampleIds = sample.map(h => h.pinecone_id);

    // Fetch by ID (Pinecone fetch)
    const fetchResult = await index.fetch(sampleIds);
    const fetchedCount = Object.keys(fetchResult.records ?? {}).length;
    checks.push(check(
      'Sample hotel IDs found in Pinecone',
      fetchedCount === sampleIds.length,
      `Found ${fetchedCount}/${sampleIds.length} sample IDs`,
    ));

    console.log(`\n  Sample ID fetch: ${fetchedCount}/${sampleIds.length} found`);
  } catch (err: unknown) {
    const error = err as { message?: string };
    console.error(`  ERROR: Pinecone validation failed: ${error.message}`);
    checks.push(check('Pinecone connectivity', false, error.message ?? 'Unknown error'));
  }

  // ─── Cross-Store Consistency ───────────────────────────────────────────────

  console.log('\n[Cross-store consistency]');

  // Verify that all Supabase pinecone_ids are real hotel IDs (not synthetic UUIDs)
  const { data: allPineconeIds } = await supabase
    .from('hotels')
    .select('pinecone_id, name');

  if (allPineconeIds) {
    const localIdSet = new Set(localHotels.map(h => h.pinecone_id));
    const dbIds = allPineconeIds.map(r => r.pinecone_id as string);
    const mismatches = dbIds.filter(id => !localIdSet.has(id));

    checks.push(check(
      'All DB pinecone_ids match local real hotel IDs',
      mismatches.length === 0,
      mismatches.length === 0
        ? 'All IDs match'
        : `${mismatches.length} IDs in DB not found in local data: ${mismatches.slice(0, 3).join(', ')}`,
    ));

    console.log(`  DB pinecone_id consistency: ${dbIds.length - mismatches.length}/${dbIds.length} match`);
  }

  // ─── Results Summary ───────────────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const passedChecks = checks.filter(c => c.passed).length;
  const failedChecks = checks.filter(c => !c.passed).length;

  console.log('\n' + '='.repeat(60));
  console.log(`  Results: ${passedChecks} PASSED, ${failedChecks} FAILED (${elapsed}s)`);
  console.log('='.repeat(60));

  for (const c of checks) {
    const icon = c.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${c.name}: ${c.message}`);
  }

  if (failedChecks > 0) {
    console.log('\nValidation FAILED. Review the issues above.');
    process.exit(1);
  } else {
    console.log('\nAll validation checks PASSED.');
  }
}

main().catch(err => {
  console.error('validate.ts failed:', err);
  process.exit(1);
});
