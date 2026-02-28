/**
 * Stage 4: seed-vectors.ts
 * Upsert hotel embeddings and metadata to Pinecone.
 *
 * Input:  data/clean/london-hotels-enriched.json (for metadata)
 *         data/clean/london-hotels-embeddings.json (for vectors)
 * Action: Upsert all vectors to Pinecone index (idempotent)
 *
 * Usage: npx tsx scripts/data/seed-vectors.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import type { EnrichedHotel } from './enrich';
import type { EmbeddingsOutput } from './embeddings';

config({ path: path.resolve(__dirname, '../../.env.local') });

// ─── Env Validation ───────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PineconeMetadata {
  name: string;
  neighborhood: string;
  star_rating: number;
  base_rate_gbp: number;
}

// ─── Upsert Batching ──────────────────────────────────────────────────────────

const UPSERT_BATCH_SIZE = 100;
const BATCH_DELAY_MS = 200;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  const PINECONE_API_KEY = requireEnv('PINECONE_API_KEY');
  const PINECONE_INDEX = requireEnv('PINECONE_INDEX');

  const enrichedPath = path.resolve(__dirname, '../../data/clean/london-hotels-enriched.json');
  const embeddingsPath = path.resolve(__dirname, '../../data/clean/london-hotels-embeddings.json');

  if (!fs.existsSync(enrichedPath)) {
    console.error(`ERROR: ${enrichedPath} not found. Run enrich.ts first.`);
    process.exit(1);
  }
  if (!fs.existsSync(embeddingsPath)) {
    console.error(`ERROR: ${embeddingsPath} not found. Run embeddings.ts first.`);
    process.exit(1);
  }

  const hotels: EnrichedHotel[] = JSON.parse(fs.readFileSync(enrichedPath, 'utf-8'));
  const embeddingsOutput: EmbeddingsOutput = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));

  console.log(`Loaded ${hotels.length} enriched hotels`);
  console.log(`Loaded ${embeddingsOutput.count} embeddings (model: ${embeddingsOutput.model})`);

  // Build a lookup from pinecone_id → hotel metadata
  const hotelByPineconeId = new Map<string, EnrichedHotel>();
  for (const hotel of hotels) {
    hotelByPineconeId.set(hotel.pinecone_id, hotel);
  }

  // Initialize Pinecone
  console.log(`\nConnecting to Pinecone index: ${PINECONE_INDEX}`);
  const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pinecone.index(PINECONE_INDEX);

  // Verify index connectivity
  try {
    const stats = await index.describeIndexStats();
    console.log(`Index stats before upsert:`);
    console.log(`  Total vectors: ${stats.totalRecordCount ?? 0}`);
    console.log(`  Dimension: ${stats.dimension ?? 'unknown'}`);
    if (stats.dimension && stats.dimension !== 1536) {
      throw new Error(
        `Index dimension mismatch: expected 1536, got ${stats.dimension}. ` +
        'Recreate the index with dimension=1536.',
      );
    }
  } catch (err: unknown) {
    const error = err as { message?: string };
    console.error(`ERROR: Could not connect to Pinecone index '${PINECONE_INDEX}': ${error.message}`);
    process.exit(1);
  }

  // Build upsert vectors
  const vectors = embeddingsOutput.embeddings.map(emb => {
    const hotel = hotelByPineconeId.get(emb.pinecone_id);
    if (!hotel) {
      throw new Error(`Embedding references unknown pinecone_id: ${emb.pinecone_id}`);
    }

    const metadata: PineconeMetadata = {
      name: hotel.name,
      neighborhood: hotel.neighborhood,
      star_rating: hotel.star_rating,
      base_rate_gbp: hotel.base_rate_gbp,
    };

    return {
      id: emb.pinecone_id,
      values: emb.embedding,
      metadata,
    };
  });

  console.log(`\nUpserting ${vectors.length} vectors to Pinecone...`);
  const totalBatches = Math.ceil(vectors.length / UPSERT_BATCH_SIZE);
  let upsertedCount = 0;

  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1;

    let retries = 0;
    const MAX_RETRIES = 3;

    while (retries <= MAX_RETRIES) {
      try {
        await index.upsert(batch);
        upsertedCount += batch.length;
        console.log(`  Batch ${batchNum}/${totalBatches}: upserted ${batch.length} vectors (total: ${upsertedCount})`);
        break;
      } catch (err: unknown) {
        retries++;
        const error = err as { message?: string };
        if (retries <= MAX_RETRIES) {
          const backoff = retries * 1500;
          console.log(`  Batch ${batchNum} failed, retrying in ${backoff}ms... (${error.message})`);
          await sleep(backoff);
        } else {
          console.error(`  ERROR: Batch ${batchNum} failed after ${MAX_RETRIES} retries: ${error.message}`);
          throw err;
        }
      }
    }

    if (i + UPSERT_BATCH_SIZE < vectors.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Post-upsert stats
  console.log(`\nWaiting 2s for index to update...`);
  await sleep(2000);

  const statsAfter = await index.describeIndexStats();
  console.log(`\nIndex stats after upsert:`);
  console.log(`  Total vectors: ${statsAfter.totalRecordCount ?? 0}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nPinecone seeding complete: ${upsertedCount} vectors upserted (${elapsed}s)`);

  // Verify with a sample query
  console.log('\nVerification: querying first hotel vector...');
  const sampleId = vectors[0].id;
  const sampleVec = vectors[0].values;

  const queryResult = await index.query({
    vector: sampleVec,
    topK: 3,
    includeMetadata: true,
  });

  console.log(`  Top 3 results for "${vectors[0].metadata?.['name'] ?? sampleId}":`);
  for (const match of queryResult.matches ?? []) {
    const score = (match.score ?? 0).toFixed(4);
    const meta = match.metadata as PineconeMetadata | undefined;
    console.log(`    [${score}] ${meta?.name ?? match.id} (${meta?.neighborhood ?? ''}, ${meta?.star_rating ?? '?'}★, £${meta?.base_rate_gbp ?? '?'})`);
  }

  return upsertedCount;
}

main()
  .then(count => {
    console.log(`\nDone. ${count} vectors in Pinecone.`);
  })
  .catch(err => {
    console.error('seed-vectors.ts failed:', err);
    process.exit(1);
  });
