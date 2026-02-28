/**
 * Pinecone Seeder
 * Reads hotel data + embeddings, batch upserts to Pinecone.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import type { GeneratedHotel } from './generate-hotels';

config({ path: path.resolve(__dirname, '..', '.env.local') });

const BATCH_SIZE = 100;

interface EmbeddingCache {
  [pineconeId: string]: number[];
}

export async function seedPinecone(
  hotels: GeneratedHotel[],
  embeddings: EmbeddingCache
): Promise<void> {
  console.log('Seeding Pinecone...');

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const indexName = process.env.PINECONE_INDEX || 'hotel-embeddings';
  const index = pinecone.index(indexName);

  // Batch upsert
  let upserted = 0;
  for (let i = 0; i < hotels.length; i += BATCH_SIZE) {
    const batch = hotels.slice(i, i + BATCH_SIZE);
    const vectors = batch
      .filter(h => embeddings[h.pinecone_id])
      .map(h => ({
        id: h.pinecone_id,
        values: embeddings[h.pinecone_id],
        metadata: {
          name: h.name,
          neighborhood: h.neighborhood,
          star_rating: h.star_rating,
          base_rate_gbp: h.base_rate_gbp,
        },
      }));

    if (vectors.length > 0) {
      await index.upsert(vectors);
      upserted += vectors.length;
      console.log(`  Upserted ${upserted}/${hotels.length} vectors`);
    }
  }

  // Validate count
  const stats = await index.describeIndexStats();
  const totalVectors = stats.totalRecordCount || 0;
  console.log(`Pinecone seeding complete. Total vectors in index: ${totalVectors}`);

  if (totalVectors < hotels.length) {
    console.warn(`WARNING: Expected ${hotels.length} vectors but found ${totalVectors}`);
  }
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────

async function main() {
  const dataDir = path.join(__dirname, 'data');
  const hotelsPath = path.join(dataDir, 'hotels.json');
  const embeddingsPath = path.join(dataDir, 'embeddings.json');

  if (!fs.existsSync(hotelsPath)) {
    console.error('hotels.json not found. Run generate-hotels.ts first.');
    process.exit(1);
  }
  if (!fs.existsSync(embeddingsPath)) {
    console.error('embeddings.json not found. Run generate-embeddings.ts first.');
    process.exit(1);
  }

  const hotels: GeneratedHotel[] = JSON.parse(fs.readFileSync(hotelsPath, 'utf-8'));
  const embeddings: EmbeddingCache = JSON.parse(fs.readFileSync(embeddingsPath, 'utf-8'));

  console.log(`Loaded ${hotels.length} hotels and ${Object.keys(embeddings).length} embeddings`);
  await seedPinecone(hotels, embeddings);
}

if (require.main === module) {
  main().catch(console.error);
}
