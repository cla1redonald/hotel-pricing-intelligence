/**
 * cleanup-synthetic.ts
 * Remove old synthetic hotel vectors from Pinecone.
 * After real data seeding, Pinecone has 1450 vectors (1050 synthetic + 400 real).
 * This script identifies and deletes the 1050 synthetic vectors by comparing
 * against the real hotel pinecone_ids.
 *
 * Usage: npx tsx scripts/data/cleanup-synthetic.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

config({ path: path.resolve(__dirname, '../../.env.local') });

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const startTime = Date.now();

  const PINECONE_API_KEY = requireEnv('PINECONE_API_KEY');
  const PINECONE_INDEX = requireEnv('PINECONE_INDEX');

  const enrichedPath = path.resolve(__dirname, '../../data/clean/london-hotels-enriched.json');
  if (!fs.existsSync(enrichedPath)) {
    console.error(`ERROR: ${enrichedPath} not found`);
    process.exit(1);
  }

  // Load real hotel pinecone_ids
  const realHotels = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8')) as Array<{ pinecone_id: string; name: string }>;
  const realIds = new Set(realHotels.map(h => h.pinecone_id));
  console.log(`Real hotel IDs to preserve: ${realIds.size}`);

  const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pinecone.index(PINECONE_INDEX);

  // Get current stats
  const statsBefore = await index.describeIndexStats();
  const totalBefore = statsBefore.totalRecordCount ?? 0;
  console.log(`\nVectors before cleanup: ${totalBefore}`);

  if (totalBefore <= realIds.size) {
    console.log('Index already clean (total vectors <= real hotel count). Nothing to delete.');
    return;
  }

  // Pinecone free tier: use deleteAll + re-upsert approach
  // We can't list all IDs directly on free tier, but we can delete by ID if we know them.
  // The synthetic hotels used crypto.randomUUID() — those IDs were in the old scripts/data/hotels.json
  // The old embeddings are in scripts/data/embeddings.json

  const oldHotelsPath = path.resolve(__dirname, '../data/hotels.json');
  const oldEmbeddingsPath = path.resolve(__dirname, '../data/embeddings.json');

  if (!fs.existsSync(oldHotelsPath)) {
    console.log('\nOld synthetic hotels.json not found. Using deleteAll + re-upsert strategy.');
    console.log('This will clear all vectors and re-upsert real data.');

    // deleteAll is the safest option when we cannot enumerate synthetic IDs
    await index.deleteAll();
    console.log('Deleted all vectors from index.');
    await sleep(3000);

    // Now re-upsert real embeddings
    const embeddingsPath = path.resolve(__dirname, '../../data/clean/london-hotels-embeddings.json');
    if (!fs.existsSync(embeddingsPath)) {
      console.error('ERROR: Real embeddings not found. Run embeddings.ts then seed-vectors.ts again.');
      process.exit(1);
    }

    const { embeddings } = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8')) as {
      embeddings: Array<{ pinecone_id: string; embedding: number[]; hotel_name: string }>;
    };

    // Build metadata lookup
    const hotelMetadata = new Map(realHotels.map(h => [h.pinecone_id, h]));

    const enrichedHotels = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8')) as Array<{
      pinecone_id: string;
      name: string;
      neighborhood: string;
      star_rating: number;
      base_rate_gbp: number;
    }>;
    const enrichedById = new Map(enrichedHotels.map(h => [h.pinecone_id, h]));

    const BATCH_SIZE = 100;
    let upserted = 0;
    for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
      const batch = embeddings.slice(i, i + BATCH_SIZE).map(emb => {
        const hotel = enrichedById.get(emb.pinecone_id)!;
        return {
          id: emb.pinecone_id,
          values: emb.embedding,
          metadata: {
            name: hotel.name,
            neighborhood: hotel.neighborhood,
            star_rating: hotel.star_rating,
            base_rate_gbp: hotel.base_rate_gbp,
          },
        };
      });
      await index.upsert(batch);
      upserted += batch.length;
      console.log(`  Re-upserted ${upserted}/${embeddings.length} vectors`);
    }

    await sleep(2000);
    const statsAfter = await index.describeIndexStats();
    console.log(`\nVectors after cleanup + re-upsert: ${statsAfter.totalRecordCount ?? 0}`);
    return;
  }

  // If old hotels.json exists, delete by the old synthetic IDs
  const oldHotels = JSON.parse(fs.readFileSync(oldHotelsPath, 'utf-8')) as Array<{ pinecone_id: string }>;
  const syntheticIds = oldHotels
    .map(h => h.pinecone_id)
    .filter(id => !realIds.has(id));

  console.log(`Synthetic IDs to delete: ${syntheticIds.length}`);

  const DELETE_BATCH_SIZE = 100;
  let deletedCount = 0;
  for (let i = 0; i < syntheticIds.length; i += DELETE_BATCH_SIZE) {
    const batch = syntheticIds.slice(i, i + DELETE_BATCH_SIZE);
    await index.deleteMany(batch);
    deletedCount += batch.length;
    console.log(`  Deleted ${deletedCount}/${syntheticIds.length} synthetic vectors`);
    if (i + DELETE_BATCH_SIZE < syntheticIds.length) await sleep(200);
  }

  await sleep(2000);
  const statsAfter = await index.describeIndexStats();
  console.log(`\nVectors after cleanup: ${statsAfter.totalRecordCount ?? 0}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Cleanup complete (${elapsed}s)`);
}

main().catch(err => {
  console.error('cleanup-synthetic.ts failed:', err);
  process.exit(1);
});
