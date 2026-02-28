# AI Hotel Pricing Intelligence

AI-powered semantic hotel search with transparent dynamic pricing for 1,000+ London hotels.

## Features

- **Semantic Search** — Natural language queries powered by OpenAI embeddings and Pinecone vector search
- **Dynamic Pricing** — Transparent 4-factor pricing model (demand, seasonality, lead time, day-of-week)
- **7-Day Price Projections** — See how prices change across the next week
- **Competitive Analysis** — 3 similar hotels with price comparisons
- **AI Booking Insights** — Claude-powered recommendations streamed in real-time

## Architecture Decision Record: Pinecone vs pgvector

### Decision
Use Pinecone (managed vector database) instead of pgvector (Postgres extension).

### Context
This project requires semantic search over 1,000+ hotel embeddings (1536 dimensions). Two options:
- **pgvector**: Free Postgres extension, co-located with Supabase, simpler deployment
- **Pinecone**: Purpose-built managed vector DB, serverless free tier

### Decision Drivers
1. **Portfolio signal**: Demonstrating Pinecone expertise shows familiarity with production vector infrastructure, not just Postgres extensions
2. **Two-store architecture**: Intentionally separating vector search (Pinecone) from relational data (Supabase) demonstrates architectural thinking about when to use specialized databases vs general-purpose
3. **Competitive set queries**: Pinecone's nearest-neighbor queries are first-class — no custom SQL needed
4. **Scalability pattern**: Pinecone serverless scales to millions of vectors without index management

### Trade-offs
- **Against Pinecone**: Additional service to manage, free-tier cold starts (~5-10s), data sync between two stores
- **Mitigations**: Warming ping on load, denormalized metadata in Pinecone for quick display, graceful degradation on timeout

### Status
Accepted. Cold starts mitigated with warming strategy.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Next.js 14 (App Router) | Framework, API routes |
| TypeScript | Type safety |
| Tailwind CSS + shadcn/ui | Styling + components |
| Pinecone | Vector search (semantic similarity) |
| OpenAI text-embedding-3-small | Query embeddings (1536 dimensions) |
| Supabase Postgres | Hotel metadata + pricing factors |
| Claude API | Streaming booking insights |
| Recharts | Price projection charts |
| Vitest | Testing |

## Data Pipeline

The project includes a synthetic data generator that creates 1,050 realistic London hotels across 44 neighborhoods with:
- Realistic hotel names matching star-rating tiers
- Base rates calibrated to London market by neighborhood
- Algorithmically generated pricing factors (demand curves, seasonality, occupancy)
- Generated review summaries with neighborhood-specific landmarks

Run the pipeline:
```bash
npx tsx scripts/seed.ts
```

## Pricing Model

Each hotel's price is calculated using a 4-factor multiplicative model:

```
finalPrice = baseRate x demand x seasonality x leadTime x dayOfWeek
```

| Factor | Range | Source |
|--------|-------|--------|
| Demand | 0.7-1.5 | Derived from occupancy (30% -> 0.7, 95% -> 1.5) |
| Seasonality | 0.8-1.4 | Monthly calendar (peak: Jun-Sep, Dec) |
| Lead Time | 0.9-1.3 | Days until check-in (30+ days -> 0.9, same-day -> 1.3) |
| Day of Week | 0.85-1.15 | Per-hotel demand curve (Mon-Sun) |

All factors are fully visible to users -- no black-box pricing.

## Getting Started

### Prerequisites
- Node.js 20+
- Pinecone account (free tier)
- OpenAI API key
- Supabase project (free tier)
- Anthropic API key

### Setup

```bash
git clone <repo-url>
cd hotel-pricing-intelligence
npm install
cp env.example .env.local
# Fill in your API keys in .env.local
```

### Seed Data

```bash
# Generate hotels + embeddings + seed databases
npx tsx scripts/seed.ts
```

### Development

```bash
npm run dev     # Start dev server at localhost:3000
npm test        # Run all tests
npm run build   # Production build
```

### Environment Variables

```
PINECONE_API_KEY=     # Pinecone dashboard
PINECONE_INDEX=hotel-embeddings
OPENAI_API_KEY=       # OpenAI dashboard
SUPABASE_URL=         # Supabase project URL
SUPABASE_ANON_KEY=    # Supabase anon key
ANTHROPIC_API_KEY=    # Anthropic console
```

## Project Structure

```
src/
  app/
    api/search/          # Semantic search endpoint
    api/competitive-set/ # Nearest-neighbor competitors
    api/insight/         # Claude streaming insights
    page.tsx             # Main search page
  components/            # UI components (12 components)
  lib/
    pricing.ts           # Pure function pricing engine
    embeddings.ts        # OpenAI embedding helper
    pinecone.ts          # Pinecone client
    supabase.ts          # Supabase client
    warm-pinecone.ts     # Pinecone cold-start warming utility
  types/                 # Shared TypeScript interfaces
scripts/                 # Data pipeline (generate, embed, seed)
```
