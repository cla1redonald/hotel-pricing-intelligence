/**
 * Embedding Generator
 * Generates OpenAI text-embedding-3-small embeddings for each hotel.
 * Batches in groups of 100, with retry logic and caching.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import OpenAI from 'openai';
import type { GeneratedHotel } from './generate-hotels';

config({ path: path.resolve(__dirname, '..', '.env.local') });

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

interface EmbeddingCache {
  [pineconeId: string]: number[];
}

function buildEmbeddingText(hotel: GeneratedHotel): string {
  return [
    `Hotel: ${hotel.name}`,
    `Location: ${hotel.neighborhood}, London`,
    `Star Rating: ${hotel.star_rating} stars`,
    `Price Range: £${hotel.base_rate_gbp}`,
    `Amenities: ${hotel.amenities.join(', ')}`,
    `Description: ${hotel.review_summary}`,
  ].join('\n');
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateBatchEmbeddings(
  openai: OpenAI,
  texts: string[],
  retryCount = 0
): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });
    return response.data.map(d => d.embedding);
  } catch (error: unknown) {
    if (retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
      console.log(`  Retry ${retryCount + 1}/${MAX_RETRIES} after ${delay}ms...`);
      await sleep(delay);
      return generateBatchEmbeddings(openai, texts, retryCount + 1);
    }
    throw error;
  }
}

export async function generateEmbeddings(hotels: GeneratedHotel[]): Promise<EmbeddingCache> {
  const dataDir = path.join(__dirname, 'data');
  const cachePath = path.join(dataDir, 'embeddings.json');

  // Load existing cache
  let cache: EmbeddingCache = {};
  if (fs.existsSync(cachePath)) {
    console.log('Loading existing embedding cache...');
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    console.log(`  Found ${Object.keys(cache).length} cached embeddings`);
  }

  // Filter to hotels that need embeddings
  const needsEmbedding = hotels.filter(h => !cache[h.pinecone_id]);
  if (needsEmbedding.length === 0) {
    console.log('All embeddings already cached. Skipping generation.');
    return cache;
  }

  console.log(`Generating embeddings for ${needsEmbedding.length} hotels...`);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Process in batches
  for (let i = 0; i < needsEmbedding.length; i += BATCH_SIZE) {
    const batch = needsEmbedding.slice(i, i + BATCH_SIZE);
    const texts = batch.map(buildEmbeddingText);

    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needsEmbedding.length / BATCH_SIZE)} (${batch.length} hotels)...`);

    const embeddings = await generateBatchEmbeddings(openai, texts);

    for (let j = 0; j < batch.length; j++) {
      cache[batch[j].pinecone_id] = embeddings[j];
    }

    // Save cache after each batch (incremental saves)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache));
    console.log(`  Saved cache (${Object.keys(cache).length} total embeddings)`);
  }

  console.log(`Embedding generation complete. ${Object.keys(cache).length} total embeddings.`);
  return cache;
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

  await generateEmbeddings(hotels);
}

if (require.main === module) {
  main().catch(console.error);
}
