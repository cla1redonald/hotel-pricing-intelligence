/**
 * Supabase Seeder
 * Reads hotel data and batch inserts into the hotels table.
 * Idempotent — uses upsert on pinecone_id.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { GeneratedHotel } from './generate-hotels';

config({ path: path.resolve(__dirname, '..', '.env.local') });

const BATCH_SIZE = 100;

export async function seedSupabase(hotels: GeneratedHotel[]): Promise<void> {
  console.log('Seeding Supabase...');

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  let inserted = 0;
  for (let i = 0; i < hotels.length; i += BATCH_SIZE) {
    const batch = hotels.slice(i, i + BATCH_SIZE);

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

    const { error } = await supabase
      .from('hotels')
      .upsert(rows, { onConflict: 'pinecone_id' });

    if (error) {
      console.error(`  Error in batch starting at index ${i}:`, error.message);
      throw error;
    }

    inserted += batch.length;
    console.log(`  Upserted ${inserted}/${hotels.length} rows`);
  }

  // Validate count
  const { count, error: countError } = await supabase
    .from('hotels')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('Error counting rows:', countError.message);
  } else {
    console.log(`Supabase seeding complete. Total rows: ${count}`);
    if ((count || 0) < hotels.length) {
      console.warn(`WARNING: Expected ${hotels.length} rows but found ${count}`);
    }
  }
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────

async function main() {
  const hotelsPath = path.join(__dirname, 'data', 'hotels.json');
  if (!fs.existsSync(hotelsPath)) {
    console.error('hotels.json not found. Run generate-hotels.ts first.');
    process.exit(1);
  }

  const hotels: GeneratedHotel[] = JSON.parse(fs.readFileSync(hotelsPath, 'utf-8'));
  console.log(`Loaded ${hotels.length} hotels`);

  await seedSupabase(hotels);
}

if (require.main === module) {
  main().catch(console.error);
}
