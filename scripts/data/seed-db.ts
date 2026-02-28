/**
 * Stage 5: seed-db.ts
 * Seed real London hotel data into Supabase.
 * Clears all existing synthetic data first, then inserts real records.
 *
 * Input:  data/clean/london-hotels-enriched.json
 * Action: DELETE all existing rows, then batch INSERT real hotel records
 *
 * Idempotent: safe to re-run. Uses service role key for DELETE permission.
 *
 * Usage: npx tsx scripts/data/seed-db.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { EnrichedHotel } from './enrich';

config({ path: path.resolve(__dirname, '../../.env.local') });

// ─── Env Validation ───────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 50;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  const SUPABASE_URL = requireEnv('SUPABASE_URL');
  // Use service role key for DELETE + INSERT permissions
  const SUPABASE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim()
    || requireEnv('SUPABASE_ANON_KEY');

  const inputPath = path.resolve(__dirname, '../../data/clean/london-hotels-enriched.json');

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: ${inputPath} not found. Run enrich.ts first.`);
    process.exit(1);
  }

  const hotels: EnrichedHotel[] = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  console.log(`Loaded ${hotels.length} enriched hotels`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // ─── Step 1: Count existing records ──────────────────────────────────────

  const { count: existingCount, error: countError } = await supabase
    .from('hotels')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('ERROR: Could not count existing records:', countError.message);
    process.exit(1);
  }

  console.log(`\nExisting rows in hotels table: ${existingCount ?? 0}`);

  // ─── Step 2: Delete all existing data ────────────────────────────────────
  // We delete all rows to remove synthetic data. Real data gets fresh UUIDs.

  if ((existingCount ?? 0) > 0) {
    console.log('Deleting all existing hotel records (removing synthetic data)...');

    // Supabase requires a WHERE clause for DELETE — use gt on created_at epoch
    const { error: deleteError } = await supabase
      .from('hotels')
      .delete()
      .gte('created_at', '2000-01-01T00:00:00Z');

    if (deleteError) {
      console.error('ERROR: Failed to delete existing records:', deleteError.message);
      console.error('Note: If using anon key, DELETE may require service role key.');
      console.error('Set SUPABASE_SERVICE_ROLE_KEY in .env.local and retry.');
      process.exit(1);
    }

    console.log(`Deleted ${existingCount} existing rows.`);
  } else {
    console.log('Table is empty. Proceeding with insert.');
  }

  // ─── Step 3: Insert real hotel records ───────────────────────────────────

  console.log(`\nInserting ${hotels.length} real London hotels...`);
  const totalBatches = Math.ceil(hotels.length / BATCH_SIZE);
  let insertedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < hotels.length; i += BATCH_SIZE) {
    const batch = hotels.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const rows = batch.map(h => ({
      name: h.name,
      neighborhood: h.neighborhood,
      lat: h.lat,
      lng: h.lng,
      star_rating: h.star_rating,
      base_rate_gbp: h.base_rate_gbp,
      review_summary: h.review_summary,
      amenities: h.amenities,
      pricing_factors: h.pricing_factors,
      pinecone_id: h.pinecone_id,
    }));

    // Upsert on pinecone_id for idempotency
    const { error } = await supabase
      .from('hotels')
      .upsert(rows, { onConflict: 'pinecone_id' });

    if (error) {
      console.error(`  ERROR in batch ${batchNum}: ${error.message}`);
      errorCount += batch.length;
      // Continue with remaining batches
    } else {
      insertedCount += batch.length;
      console.log(`  Batch ${batchNum}/${totalBatches}: inserted ${batch.length} rows (total: ${insertedCount})`);
    }
  }

  // ─── Step 4: Validate final count ────────────────────────────────────────

  const { count: finalCount, error: finalCountError } = await supabase
    .from('hotels')
    .select('*', { count: 'exact', head: true });

  if (finalCountError) {
    console.error('WARNING: Could not verify final count:', finalCountError.message);
  } else {
    console.log(`\nFinal row count: ${finalCount}`);
    if ((finalCount ?? 0) < hotels.length) {
      console.warn(`WARNING: Expected ${hotels.length} rows but found ${finalCount}`);
    } else {
      console.log('Count verification PASSED');
    }
  }

  // ─── Step 5: Sample query verification ───────────────────────────────────

  const { data: sampleRows, error: sampleError } = await supabase
    .from('hotels')
    .select('name, neighborhood, star_rating, base_rate_gbp, pinecone_id')
    .limit(5)
    .order('created_at', { ascending: false });

  if (!sampleError && sampleRows) {
    console.log('\nSample of seeded hotels (most recent 5):');
    for (const row of sampleRows) {
      console.log(
        `  ${row.name} | ${row.neighborhood} | ${row.star_rating}★ | £${row.base_rate_gbp} | ${row.pinecone_id}`,
      );
    }
  }

  // ─── Step 6: Quality checks ───────────────────────────────────────────────

  // Check for null review_summary
  const { count: nullReviewCount } = await supabase
    .from('hotels')
    .select('*', { count: 'exact', head: true })
    .is('review_summary', null);

  console.log('\nQuality checks:');
  console.log(`  Null review_summary: ${nullReviewCount ?? 0}`);

  // Price range check
  const { data: priceData } = await supabase
    .from('hotels')
    .select('base_rate_gbp')
    .order('base_rate_gbp', { ascending: true })
    .limit(1);

  const { data: priceMaxData } = await supabase
    .from('hotels')
    .select('base_rate_gbp')
    .order('base_rate_gbp', { ascending: false })
    .limit(1);

  if (priceData?.[0] && priceMaxData?.[0]) {
    console.log(
      `  Price range: £${priceData[0].base_rate_gbp} - £${priceMaxData[0].base_rate_gbp}`,
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nSupabase seeding complete.`);
  console.log(`  Inserted: ${insertedCount}`);
  if (errorCount > 0) console.log(`  Errors: ${errorCount}`);
  console.log(`  Duration: ${elapsed}s`);
}

main().catch(err => {
  console.error('seed-db.ts failed:', err);
  process.exit(1);
});
