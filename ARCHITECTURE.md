# Architecture

## 1. System Overview

A single-page application combining semantic vector search with a transparent dynamic pricing engine. Three API routes, one pure-function pricing module, two external data stores (Pinecone + Supabase), and two AI APIs (OpenAI for embeddings, Claude for insights).

```
                          +------------------+
                          |   Next.js SPA    |
                          |  (App Router)    |
                          +--------+---------+
                                   |
                    +--------------+--------------+
                    |              |              |
              POST /api/     POST /api/     POST /api/
              search       competitive-set  insight (SSE)
                    |              |              |
         +----------+----------+  |        +-----+-----+
         |                     |  |        |           |
    +----+----+          +-----+--+--+   +-+--------+
    | OpenAI  |          | Pinecone   |  | Claude   |
    | Embed   |          | Vector DB  |  | Sonnet   |
    | API     |          | (cosine)   |  | (stream) |
    +---------+          +-----+------+  +----------+
                               |
                         +-----+------+
                         | Supabase   |
                         | Postgres   |
                         +------------+

    Client-side (no API call):
    +------------------------------------------+
    | pricing.ts (pure function module)        |
    | - calculatePrice(hotel, checkInDate)     |
    | - calculateProjection(hotel, checkInDate)|
    +------------------------------------------+
```

### Component Responsibilities

| Component | Role |
|-----------|------|
| **Next.js App Router** | Single page, three API routes, server-side rendering of shell |
| **OpenAI API** | Converts natural language queries into 1536-dim embeddings |
| **Pinecone** | Stores hotel embeddings, cosine similarity search, nearest neighbors for competitive sets |
| **Supabase Postgres** | Hotel metadata, pricing factors, review summaries, amenities |
| **Claude API** | 1-2 sentence booking insights per hotel, streamed via SSE |
| **Pricing Engine** | Pure TypeScript module, runs client-side. 4-factor multiplicative model. No network calls. |

## 2. Three-Layer AI Architecture

**Layer 1 — Model Layer (External APIs):**
- OpenAI text-embedding-3-small: Embedding generation, deterministic for identical inputs, 1536 dimensions.
- Pinecone serverless: Vector index with metadata, cosine metric, returns scored matches.
- Claude claude-sonnet-4-5-20241022: Streaming text generation, non-deterministic, used for advisory insights only.

**Layer 2 — API Layer (Next.js Route Handlers):**
- `/api/search` — Orchestrates embed + search + enrich. Synchronous JSON response.
- `/api/competitive-set` — Nearest-neighbor lookup + enrichment. Synchronous JSON response.
- `/api/insight` — Claude streaming endpoint. Returns `text/event-stream`.

**Layer 3 — Product Harness Layer (Client-side):**
- Pricing engine runs entirely in the browser, zero latency.
- Results rendering, price breakdown expansion, chart rendering.
- Async orchestration: results first, competitive set and insight after.

## 3. Data Model

### 3.1 Supabase `hotels` Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, auto-generated |
| name | TEXT | NOT NULL |
| neighborhood | TEXT | NOT NULL |
| lat | DECIMAL(9,6) | |
| lng | DECIMAL(9,6) | |
| star_rating | INTEGER | NOT NULL, CHECK 1-5 |
| base_rate_gbp | DECIMAL(8,2) | NOT NULL |
| review_summary | TEXT | NOT NULL |
| amenities | TEXT[] | DEFAULT '{}' |
| pricing_factors | JSONB | NOT NULL |
| pinecone_id | TEXT | NOT NULL, UNIQUE |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**pricing_factors JSONB structure:**
- `demand_curve`: float[7] — day-of-week multipliers (Mon-Sun)
- `seasonality`: float[12] — monthly multipliers (Jan-Dec)
- `occupancy_base`: float — base occupancy %, 30-95

### 3.2 Pinecone `hotel-embeddings` Index

- **id**: string (= pinecone_id in Supabase, the join key)
- **values**: float[1536] (text-embedding-3-small output)
- **metadata**: `{ name, neighborhood, star_rating, base_rate_gbp }`

### 3.3 Design Decisions on Data
- `pinecone_id` is the join key between both stores.
- Pinecone metadata is denormalized from Supabase for competitive set display without extra Supabase lookups.
- Single table, no normalization. pricing_factors is 1:1 with hotel and always co-loaded.
- No user entities, session entities, or booking entities.

## 4. API Design

### 4.1 POST /api/search

```typescript
// Request
{ query: string; checkInDate?: string; }

// Response 200
{
  results: SearchResult[];
  meta: { query: string; totalResults: number; searchTimeMs: number; };
}

// SearchResult
{ hotel: Hotel; matchScore: number; matchPercentage: number; }
```

**Pipeline:** Validate input → OpenAI embed query → Pinecone top 20 → Supabase batch fetch by pinecone_id → merge + sort by score → return.

**Errors:** 400 (empty/long query, bad date), 500 (service failure).

### 4.2 POST /api/competitive-set

```typescript
// Request
{ pineconeId: string; checkInDate?: string; }

// Response 200
{ competitors: CompetitiveHotel[]; }

// CompetitiveHotel
{ hotel: Hotel; matchScore: number; dynamicPrice: number; priceDelta: number; }
```

**Pipeline:** Validate → Pinecone fetch source vector → Pinecone query top 4 neighbors (exclude self) → take 3 → Supabase batch fetch → calculate dynamic price server-side → compute price deltas → return.

**Why server-side pricing:** Client lacks competitor pricing_factors until this call returns. Calculating server-side avoids an extra round trip.

### 4.3 POST /api/insight (streaming)

```typescript
// Request
{
  hotelName: string; neighborhood: string; dynamicPrice: number;
  pricingBreakdown: PricingBreakdown;
  competitors: Array<{ name: string; price: number; }>;
}

// Response: text/event-stream (SSE)
data: {"text": "Based on..."}
data: [DONE]
```

**Pipeline:** Validate → construct Claude prompt → stream via `claude-sonnet-4-5-20241022` → pipe tokens as SSE → send [DONE].

## 5. Data Flows

### Search Flow (< 3s target)
1. Client POSTs query to `/api/search`
2. Server: OpenAI embed (~200ms) → Pinecone query (~300ms warm) → Supabase fetch (~100ms)
3. Client receives SearchResult[], renders HotelCards
4. Client runs `pricing.calculatePrice()` and `pricing.calculateProjection()` per card (~0ms, pure function)
5. Client renders prices, breakdowns, charts immediately
6. Client fires async (non-blocking) per visible card: `/api/competitive-set` + `/api/insight`

### Competitive Set Flow
Triggered per card after initial render. Pinecone nearest-neighbor query + Supabase enrichment + server-side pricing. Returns 3 competitors with price deltas.

### Insight Streaming Flow
Triggered per card after competitive set loads (needs competitor data for prompt). SSE stream renders tokens progressively in ClaudeInsight component.

## 6. Pricing Engine (Pure Function Module)

Located at `src/lib/pricing.ts`. NOT an API route. Runs client-side.

**4-Factor Multiplicative Model:**
```
finalPrice = baseRate * demandMultiplier * seasonalityMultiplier
             * leadTimeMultiplier * dayOfWeekMultiplier
```

| Factor | Source | Range | Derivation |
|--------|--------|-------|------------|
| Demand | occupancy_base | 0.7-1.5 | Linear: 30% → 0.7, 95% → 1.5 |
| Seasonality | seasonality[month] | 0.8-1.4 | Pre-computed, London tourism calendar |
| Lead Time | days until check-in | 0.9-1.3 | 30+ days → 0.9, 0 days → 1.3, linear |
| Day of Week | demand_curve[dayOfWeek] | 0.85-1.15 | Pre-computed per hotel |

**7-Day Projection:** Iterates check-in date + 0..6 days. Per day: recalculates dayOfWeek multiplier, applies demand drift (occupancy +/- 2% seeded random walk per hotel ID, clamped 30-95%). Returns `ProjectionPoint[]`.

## 7. Security Model

No auth, no users, no RLS. Public read-only data.

| Concern | Approach |
|---------|----------|
| API keys | Env vars only, `.env.local` gitignored, no `NEXT_PUBLIC_` prefix |
| Rate limiting | In-memory counter: 30/min search, 60/min competitive-set, 20/min insight |
| Input validation | Query 1-500 chars, ISO date format, non-empty pineconeId |
| Error exposure | Generic messages, no stack traces, server-side logging |
| SQL injection | Supabase parameterized queries only |
| Prompt injection | Claude prompt uses structured template with database-sourced data only |

## 8. Key Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Pinecone over pgvector | Portfolio signal. Demonstrates two-store architecture and production vector DB expertise. |
| D2 | Client-side pricing engine | Zero latency, full transparency, deterministic. Hotel pricing_factors already in client from search response. |
| D3 | SSE over WebSocket for insight streaming | Unidirectional, simpler, native Next.js support. |
| D4 | Single table, no normalization | One entity, 1:1 pricing factors, no joins needed. |
| D5 | Pinecone metadata denormalization | Reduces Supabase lookups for competitive set display. |
| D6 | Seeded random for projection drift | Deterministic per hotel ID + date. Testable, consistent UX. |
| D7 | React 18 pinned explicitly | Prevents React 19 peer dependency conflicts with Next.js 14. |

## 9. System Accuracy Profile

| Category | Components | Characteristics |
|----------|-----------|-----------------|
| **Precise (deterministic)** | Pricing calculation, search ranking scores, competitive set selection | Exact, reproducible |
| **Approximate (heuristic)** | Pricing factors (synthetic), base rates (real but stale), demand drift (seeded random) | Bounded, realistic ranges |
| **Opaque (model-dependent)** | Embedding quality (OpenAI), Claude insights (non-deterministic) | Variable, needs graceful degradation |

**Transparency guarantees:** Every price shows full factor breakdown. Match scores are raw cosine similarity. Competitive set is pure nearest-neighbor. Insights labeled as AI-generated.

## 10. File Ownership Map (Parallel Build)

| Thread | Files | Owner |
|--------|-------|-------|
| T1 (Scaffold) | `src/types/`, `src/lib/supabase.ts`, `src/lib/pinecone.ts`, `src/app/layout.tsx`, config files | @devsecops |
| T2 (Data Pipeline) | `scripts/` directory entirely | @engineer |
| T3 (Search API) | `src/app/api/search/route.ts`, `src/lib/embeddings.ts`, `src/__tests__/search.test.ts` | @engineer |
| T4 (Pricing Engine) | `src/lib/pricing.ts`, `src/__tests__/pricing.test.ts` | @engineer |
| T5 (Results UI) | `src/app/page.tsx`, `src/components/*` | @engineer |
| T6 (Comp Set + Insight) | `src/app/api/competitive-set/`, `src/app/api/insight/`, `src/components/CompetitiveSet.tsx`, `src/components/ClaudeInsight.tsx` | @engineer |
| T7 (Polish + Deploy) | `src/lib/warm-pinecone.ts`, `README.md`, `vercel.json` | @engineer + @devsecops |

**T3 and T4 touch zero overlapping files.** Both read from `src/types/` (frozen after T1).

## 11. Environment Variables

```
PINECONE_API_KEY=         # Pinecone dashboard
PINECONE_INDEX=hotel-embeddings
OPENAI_API_KEY=           # OpenAI dashboard
SUPABASE_URL=             # Supabase project URL
SUPABASE_ANON_KEY=        # Supabase anon/public key
ANTHROPIC_API_KEY=        # Anthropic console
```

All server-side only. No `NEXT_PUBLIC_` prefix.

## 12. Performance Budget

| Metric | Target |
|--------|--------|
| Initial results | < 3s |
| Competitive set | < 2s per card (async) |
| Claude insight | Streams in 1-3s (async) |
| Client-side pricing | < 1ms |
| Bundle size | < 300KB gzipped |

## 13. Graceful Degradation

| Failure | Handling |
|---------|----------|
| Pinecone cold start | Warming ping on load + skeleton |
| Pinecone/OpenAI down | Error message, no search |
| Supabase down | Partial results from Pinecone metadata |
| Claude down | Hide insight section, card still works |
| Competitive set fails | Hide section, card still works |

Core principle: search results always render if Pinecone and OpenAI are up. Everything else degrades gracefully.
