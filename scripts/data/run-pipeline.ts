/**
 * run-pipeline.ts
 * Master orchestrator for the real data pipeline.
 * Runs all stages in sequence with validation between each.
 *
 * Stages:
 *   1. clean.ts     — Extract + clean London hotels from Kaggle CSV
 *   2. enrich.ts    — Add pricing factors, amenities, pinecone_ids
 *   3. embeddings.ts — Generate OpenAI embeddings (skips if cached)
 *   4. seed-vectors.ts — Upsert to Pinecone
 *   5. cleanup-synthetic.ts — Remove old synthetic vectors
 *   6. seed-db.ts   — Seed Supabase (clears synthetic, inserts real)
 *   7. validate.ts  — Post-seed quality checks
 *
 * Usage: npx tsx scripts/data/run-pipeline.ts
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const stages = [
  { name: 'Stage 1: Clean raw data', script: 'scripts/data/clean.ts' },
  { name: 'Stage 2: Enrich with pricing', script: 'scripts/data/enrich.ts' },
  { name: 'Stage 3: Generate embeddings', script: 'scripts/data/embeddings.ts' },
  { name: 'Stage 4: Seed Pinecone vectors', script: 'scripts/data/seed-vectors.ts' },
  { name: 'Stage 5: Remove synthetic vectors', script: 'scripts/data/cleanup-synthetic.ts' },
  { name: 'Stage 6: Seed Supabase', script: 'scripts/data/seed-db.ts' },
  { name: 'Stage 7: Validate', script: 'scripts/data/validate.ts' },
];

async function main() {
  const startTime = Date.now();
  console.log('=' .repeat(60));
  console.log('  Real London Hotel Data Pipeline');
  console.log('='.repeat(60));
  console.log(`  Source: Kaggle 515K Hotel Reviews Data in Europe`);
  console.log(`  Stages: ${stages.length}`);
  console.log('='.repeat(60));

  for (const stage of stages) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${stage.name}`);
    console.log('─'.repeat(60));

    const stageStart = Date.now();
    try {
      execSync(`npx tsx ${stage.script}`, {
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '../..'),
        env: { ...process.env },
      });
      const stageMs = Date.now() - stageStart;
      console.log(`\n  [DONE] ${stage.name} (${(stageMs / 1000).toFixed(1)}s)`);
    } catch (err) {
      const stageMs = Date.now() - stageStart;
      console.error(`\n  [FAILED] ${stage.name} (${(stageMs / 1000).toFixed(1)}s)`);
      process.exit(1);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`  Pipeline complete in ${elapsed}s`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
