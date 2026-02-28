/**
 * Stage 3: embeddings.ts
 * Generate OpenAI text-embedding-3-small embeddings for each hotel.
 * One embedding per hotel (entity-level, not per-review).
 *
 * Input:  data/clean/london-hotels-enriched.json
 * Output: data/clean/london-hotels-embeddings.json
 *
 * Each embedding is generated from a rich text combining:
 * - Hotel name, neighborhood, star rating
 * - Review summary (real guest reviews from Kaggle)
 * - Amenities list
 * - Price tier signal
 *
 * Usage: npx tsx scripts/data/embeddings.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import OpenAI from 'openai';
import type { EnrichedHotel } from './enrich';

config({ path: path.resolve(__dirname, '../../.env.local') });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HotelEmbedding {
  pinecone_id: string;
  hotel_name: string;
  embedding: number[];
  model: string;
  dimensions: number;
  input_text: string;
}

export interface EmbeddingsOutput {
  model: string;
  dimensions: number;
  generated_at: string;
  count: number;
  embeddings: HotelEmbedding[];
}

// ─── Env Validation ───────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

// ─── Embedding Text Construction ──────────────────────────────────────────────
// Craft rich text that encodes all semantically relevant properties.
// This text is what gets embedded — quality here directly impacts search relevance.

function buildEmbeddingText(hotel: EnrichedHotel): string {
  const priceDesc =
    hotel.base_rate_gbp < 100
      ? 'budget'
      : hotel.base_rate_gbp < 200
        ? 'mid-range'
        : hotel.base_rate_gbp < 400
          ? 'upscale'
          : 'luxury';

  const starsLabel = `${hotel.star_rating}-star`;
  const scoreLabel = hotel.booking_score >= 9.0
    ? 'exceptional'
    : hotel.booking_score >= 8.5
      ? 'excellent'
      : hotel.booking_score >= 8.0
        ? 'very good'
        : hotel.booking_score >= 7.5
          ? 'good'
          : 'average';

  const amenityText = hotel.amenities.join(', ');

  return [
    `${hotel.name}. ${starsLabel} hotel in ${hotel.neighborhood}, London.`,
    `${scoreLabel} guest rating (${hotel.booking_score}/10 on Booking.com, ${hotel.total_reviews} reviews).`,
    `${priceDesc} price tier, approximately £${hotel.base_rate_gbp} per night.`,
    `Amenities: ${amenityText}.`,
    hotel.review_summary,
  ]
    .join(' ')
    .trim();
}

// ─── Batched Embedding with Rate Limiting ─────────────────────────────────────

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 500; // 0.5s between batches to avoid 429s

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateEmbeddingsForHotels(
  hotels: EnrichedHotel[],
  openai: OpenAI,
  model: string,
): Promise<HotelEmbedding[]> {
  const results: HotelEmbedding[] = [];
  const totalBatches = Math.ceil(hotels.length / BATCH_SIZE);

  console.log(`Generating embeddings in ${totalBatches} batches of ${BATCH_SIZE}...`);
  console.log(`Model: ${model}`);
  console.log(`Hotels: ${hotels.length}`);

  let errorCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < hotels.length; i += BATCH_SIZE) {
    const batch = hotels.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batchStart = Date.now();

    const inputs = batch.map(h => buildEmbeddingText(h));

    let retries = 0;
    const MAX_RETRIES = 3;

    while (retries <= MAX_RETRIES) {
      try {
        const response = await openai.embeddings.create({
          model,
          input: inputs,
          encoding_format: 'float',
        });

        for (let j = 0; j < batch.length; j++) {
          const hotel = batch[j];
          const embeddingData = response.data[j];

          results.push({
            pinecone_id: hotel.pinecone_id,
            hotel_name: hotel.name,
            embedding: embeddingData.embedding,
            model,
            dimensions: embeddingData.embedding.length,
            input_text: inputs[j],
          });
        }

        const batchMs = Date.now() - batchStart;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `  Batch ${batchNum}/${totalBatches}: ${batch.length} embeddings in ${batchMs}ms (total: ${results.length}, elapsed: ${elapsed}s)`,
        );
        break;
      } catch (err: unknown) {
        retries++;
        const error = err as { status?: number; message?: string };
        if (error.status === 429 && retries <= MAX_RETRIES) {
          const backoff = retries * 2000;
          console.log(`  Rate limited — waiting ${backoff}ms before retry ${retries}/${MAX_RETRIES}...`);
          await sleep(backoff);
        } else if (retries > MAX_RETRIES) {
          console.error(`  ERROR: Batch ${batchNum} failed after ${MAX_RETRIES} retries: ${error.message}`);
          errorCount += batch.length;
          break;
        } else {
          throw err;
        }
      }
    }

    // Delay between batches (except last)
    if (i + BATCH_SIZE < hotels.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  if (errorCount > 0) {
    console.warn(`\nWARNING: ${errorCount} hotels failed embedding generation`);
  }

  return results;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateEmbeddings(embeddings: HotelEmbedding[], expectedCount: number): void {
  const issues: string[] = [];

  if (embeddings.length < expectedCount) {
    issues.push(`Expected ${expectedCount} embeddings, got ${embeddings.length}`);
  }

  const wrongDims = embeddings.filter(e => e.dimensions !== 1536).length;
  if (wrongDims > 0) issues.push(`${wrongDims} embeddings with wrong dimensions (expected 1536)`);

  const nullVectors = embeddings.filter(e => !e.embedding || e.embedding.length === 0).length;
  if (nullVectors > 0) issues.push(`${nullVectors} embeddings with null/empty vectors`);

  // Duplicate pinecone_id check
  const ids = embeddings.map(e => e.pinecone_id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size < ids.length) {
    issues.push(`${ids.length - uniqueIds.size} duplicate pinecone_ids in embeddings`);
  }

  console.log(`\nEmbedding validation:`);
  if (issues.length === 0) {
    console.log('  All checks PASSED');
  } else {
    for (const issue of issues) {
      console.log(`  WARNING: ${issue}`);
    }
  }

  if (embeddings.length > 0) {
    const dims = embeddings[0].dimensions;
    console.log(`  Model: ${embeddings[0].model}`);
    console.log(`  Dimensions: ${dims}`);
    console.log(`  Count: ${embeddings.length}`);

    // Sanity check: verify first vector is non-zero
    const firstVec = embeddings[0].embedding;
    const norm = Math.sqrt(firstVec.reduce((sum, v) => sum + v * v, 0));
    console.log(`  First vector L2 norm: ${norm.toFixed(4)} (expected ~1.0 for normalized)`);
  }
}

// ─── CLI Entrypoint ───────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  const OPENAI_API_KEY = requireEnv('OPENAI_API_KEY');
  const MODEL = 'text-embedding-3-small';

  const inputPath = path.resolve(__dirname, '../../data/clean/london-hotels-enriched.json');
  const outputPath = path.resolve(__dirname, '../../data/clean/london-hotels-embeddings.json');

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Enriched data not found at ${inputPath}`);
    console.error('Run enrich.ts first.');
    process.exit(1);
  }

  // Check for cached embeddings (idempotent — skip if already generated)
  if (fs.existsSync(outputPath)) {
    const existing: EmbeddingsOutput = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const hotels: EnrichedHotel[] = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

    if (existing.count === hotels.length && existing.model === MODEL) {
      console.log(`Embeddings already exist (${existing.count} embeddings, model: ${MODEL})`);
      console.log('Delete data/clean/london-hotels-embeddings.json to regenerate.');
      validateEmbeddings(existing.embeddings, hotels.length);
      return;
    }

    console.log(
      `Existing embeddings mismatch (${existing.count} vs ${hotels.length} hotels or different model). Regenerating...`,
    );
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const hotels: EnrichedHotel[] = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

  console.log(`Loaded ${hotels.length} enriched hotels`);
  console.log('\nSample embedding input (first hotel):');
  console.log(`  ${buildEmbeddingText(hotels[0]).slice(0, 200)}...`);

  const embeddings = await generateEmbeddingsForHotels(hotels, openai, MODEL);
  validateEmbeddings(embeddings, hotels.length);

  const output: EmbeddingsOutput = {
    model: MODEL,
    dimensions: 1536,
    generated_at: new Date().toISOString(),
    count: embeddings.length,
    embeddings,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nSaved ${embeddings.length} embeddings to ${outputPath} (${elapsed}s)`);
  console.log(`Estimated tokens used: ~${Math.round(embeddings.length * 120).toLocaleString()}`);
}

main().catch(err => {
  console.error('embeddings.ts failed:', err);
  process.exit(1);
});

// Export for use by seed-vectors.ts
export { buildEmbeddingText };
