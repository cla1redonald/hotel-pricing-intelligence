/**
 * Master Seed Script
 * Orchestrates the full data pipeline:
 * 1. Generate hotel data
 * 2. Generate embeddings
 * 3. Seed Pinecone
 * 4. Seed Supabase
 * 5. Run validation
 *
 * Usage: npx tsx scripts/seed.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { generateHotels, type GeneratedHotel } from './generate-hotels';
import { generateEmbeddings } from './generate-embeddings';
import { seedPinecone } from './seed-pinecone';
import { seedSupabase } from './seed-supabase';
import { validateLocalData, validateEmbeddings, validateRemoteStores } from './validate';

config({ path: path.resolve(__dirname, '..', '.env.local') });

async function main() {
  const startTime = Date.now();
  const dataDir = path.join(__dirname, 'data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // ─── Step 1: Generate Hotel Data ─────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('  Step 1: Generate Hotel Data');
  console.log('='.repeat(60));

  const hotelsPath = path.join(dataDir, 'hotels.json');
  let hotels: GeneratedHotel[];

  if (fs.existsSync(hotelsPath)) {
    console.log('hotels.json already exists. Loading from cache...');
    hotels = JSON.parse(fs.readFileSync(hotelsPath, 'utf-8'));
    console.log(`Loaded ${hotels.length} hotels from cache`);
  } else {
    hotels = generateHotels(1050);
    fs.writeFileSync(hotelsPath, JSON.stringify(hotels, null, 2));
    console.log(`Generated and saved ${hotels.length} hotels`);
  }

  // Validate local data first
  const localValidation = validateLocalData(hotels);
  if (!localValidation.passed) {
    console.error('\nLocal data validation FAILED:');
    for (const check of localValidation.checks.filter(c => !c.passed)) {
      console.error(`  [FAIL] ${check.name}: ${check.message}`);
    }
    process.exit(1);
  }
  console.log('Local data validation PASSED');

  // ─── Step 2: Generate Embeddings ─────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('  Step 2: Generate Embeddings');
  console.log('='.repeat(60));

  if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not set. Skipping embedding generation.');
    console.log('Set OPENAI_API_KEY in .env.local to generate embeddings.');
  } else {
    const embeddings = await generateEmbeddings(hotels);

    // Validate embeddings
    const embeddingValidation = await validateEmbeddings(hotels, embeddings);
    if (!embeddingValidation.passed) {
      console.error('\nEmbedding validation FAILED:');
      for (const check of embeddingValidation.checks.filter(c => !c.passed)) {
        console.error(`  [FAIL] ${check.name}: ${check.message}`);
      }
      process.exit(1);
    }
    console.log('Embedding validation PASSED');

    // ─── Step 3: Seed Pinecone ───────────────────────────────────────────────
    console.log('\n' + '='.repeat(60));
    console.log('  Step 3: Seed Pinecone');
    console.log('='.repeat(60));

    if (!process.env.PINECONE_API_KEY) {
      console.log('PINECONE_API_KEY not set. Skipping Pinecone seeding.');
    } else {
      await seedPinecone(hotels, embeddings);
    }
  }

  // ─── Step 4: Seed Supabase ─────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('  Step 4: Seed Supabase');
  console.log('='.repeat(60));

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.log('Supabase env vars not set. Skipping Supabase seeding.');
  } else {
    await seedSupabase(hotels);
  }

  // ─── Step 5: Validation ────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('  Step 5: Final Validation');
  console.log('='.repeat(60));

  if (process.env.PINECONE_API_KEY && process.env.SUPABASE_URL) {
    const remoteValidation = await validateRemoteStores(hotels.length);
    for (const check of remoteValidation.checks) {
      const icon = check.passed ? 'PASS' : 'FAIL';
      console.log(`  [${icon}] ${check.name}: ${check.message}`);
    }
  } else {
    console.log('Skipping remote validation (env vars not set)');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nPipeline complete in ${elapsed}s`);
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
