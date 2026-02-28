# PRD: AI Hotel Pricing Intelligence

> **Status:** Ready for Build
> **Created:** 2026-02-28
> **Last Updated:** 2026-02-28

---

## 1. Problem Statement

### The Pain Point
Claire's portfolio (9 projects) is strong on UI/UX apps and API wrappers but has no project demonstrating vector databases, semantic search, or dynamic pricing. These are the "harder" AI patterns that signal depth beyond calling an LLM endpoint.

### Why It Matters
A 10th project filling this gap completes the portfolio. Recruiters and hiring managers evaluating PM-who-codes candidates look for evidence of working with production AI infrastructure (vector stores, embeddings, pricing models), not just LLM wrappers. This project provides that evidence.

### Current State
The portfolio has 9 projects. None demonstrate:
- Vector database usage (Pinecone or equivalent)
- Semantic search with embeddings
- Dynamic pricing with transparent factor breakdowns
- Multi-store architecture (vector DB + relational DB working together)

### Existing Code References
This is a greenfield project. No existing code to modify.

---

## 2. Solution Overview

### Core Idea
An AI-powered hotel search engine for London that combines semantic search (Pinecone), dynamic pricing with transparent 4-factor breakdowns, and LLM-generated booking insights. The user describes what they want in natural language and gets results ranked by semantic relevance with full pricing transparency. The entire input is a single search box — semantic search replaces traditional faceted filtering.

### Success Looks Like
- User types "quiet boutique hotel near Covent Garden with a rooftop bar" and gets semantically relevant results within 3 seconds
- Each result shows a dynamic price with a visible breakdown of all 4 pricing factors
- 7-day price projection chart renders on each result card
- Competitive set of 3 similar hotels appears with price comparison
- Claude booking insight streams in asynchronously after results render
- 1,000+ real London hotels searchable
- Deployed to Vercel, works on mobile

---

## 3. Users

### Primary User
Portfolio reviewers — recruiters, hiring managers, and technical evaluators assessing Claire's AI/ML product skills. Secondary: anyone curious about London hotel pricing dynamics.

### Multi-User Consideration
No auth, no user accounts. This is a read-only search and intelligence tool. No future multi-user state needed.

---

## 4. MVP Scope

### In Scope (v1)

- [ ] Natural language semantic hotel search via single search box
- [ ] OpenAI embedding generation for query vectors
- [ ] Pinecone similarity search with metadata filtering
- [ ] Supabase enrichment with hotel details and pricing factors
- [ ] Dynamic pricing engine with 4-factor multiplicative model (demand, seasonality, lead time, day-of-week)
- [ ] Transparent price breakdown UI (expandable per result)
- [ ] 7-day price projection chart per hotel (Recharts)
- [ ] Competitive set — 3 semantically similar hotels with price comparison
- [ ] Claude booking insight per result (streamed async)
- [ ] Check-in date picker (defaults to today)
- [ ] 1,000+ real London hotels from Kaggle datasets
- [ ] Data pipeline: Kaggle ETL, deduplication, embedding generation, Pinecone upsert, Supabase seed
- [ ] Responsive design (mobile + desktop)
- [ ] Loading states and error handling
- [ ] Vercel deployment
- [ ] README with Architecture Decision Record (Pinecone vs pgvector)

### Out of Scope (v1)

- Booking/reservation flow
- User accounts / auth
- Saved searches
- Map view (Leaflet or otherwise)
- Multi-city support
- Real-time pricing updates
- Faceted filter UI (dropdowns, checkboxes)
- Individual review browsing
- Group size functionality (input shown but non-functional in v1)

### Scope Boundary
This is a search and pricing intelligence demo, not an OTA (online travel agency). The product ends at displaying results with pricing transparency and AI insights. No transactional features.

---

## 5. Sequential Thread Plan

### Thread 1: Scaffold + Infrastructure
**Purpose:** Set up the Next.js project, Supabase schema, Pinecone index, environment configuration, shared TypeScript types, and project structure.

**Actions:**
- [ ] Initialize Next.js 14 (App Router) with TypeScript, Tailwind CSS, shadcn/ui
- [ ] Create Supabase project and `hotels` table with full schema (see Data Model)
- [ ] Create Pinecone serverless index (`hotel-embeddings`, dimension 1536, cosine metric)
- [ ] Define shared TypeScript interfaces: `Hotel`, `PricingFactors`, `PricingBreakdown`, `SearchResult`, `CompetitiveHotel`
- [ ] Set up environment variables (`.env.local.example`): `PINECONE_API_KEY`, `PINECONE_INDEX`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`
- [ ] Install dependencies: `@pinecone-database/pinecone`, `openai`, `@supabase/supabase-js`, `@anthropic-ai/sdk`, `recharts`
- [ ] Create directory structure: `src/lib/`, `src/types/`, `src/components/`, `src/app/api/`
- [ ] Configure Supabase client and Pinecone client as shared utilities
- [ ] Write scaffold validation tests (type compilation, client initialization)

**Validation Targets:**
- [ ] `npm run build` succeeds with no errors
- [ ] `tsc --noEmit` passes
- [ ] Supabase client connects and `hotels` table exists (empty)
- [ ] Pinecone client connects and index exists (empty)
- [ ] All shared types compile without errors

**Deliverables:**
- Working Next.js project with all dependencies
- Empty Supabase `hotels` table with correct schema
- Empty Pinecone index ready for upserts
- Shared type definitions in `src/types/`
- Client utilities in `src/lib/`

**Reasoning Level:** Low (Sonnet)
**Rationale:** Standard project setup with well-known libraries. No architectural ambiguity.
**Dependencies:** None
**Parallelizable:** No (foundation for all other threads)

---

### Thread 2: Data Pipeline
**Purpose:** Clean Kaggle data, normalize 1,000+ London hotels, generate embeddings, upsert to Pinecone, and seed Supabase with hotel records and algorithmically generated pricing factors.

**Actions:**
- [ ] Download and parse Kaggle datasets (515K Hotel Reviews + Hotel Rates/Amenities)
- [ ] Filter to London hotels only (expect 1,000+ unique properties)
- [ ] Deduplicate by hotel name + address
- [ ] For each hotel: concatenate top 5-10 reviews into `review_summary`
- [ ] Cross-reference with rates dataset for `base_rate_gbp` and `amenities`
- [ ] Extract/geocode `neighborhood`, `lat`, `lng` from address data
- [ ] Generate one embedding per hotel using OpenAI `text-embedding-3-small` (1536 dimensions)
- [ ] Batch upsert embeddings + metadata (`neighborhood`, `star_rating`, `base_rate_gbp`, `name`) to Pinecone
- [ ] Generate realistic pricing factors per hotel:
  - `demand_curve`: 7 values (day-of-week), varies by neighborhood and star rating
  - `seasonality`: 12 values (monthly), follows London tourism calendar (peak: Jun-Sep, Dec; off-peak: Jan-Feb, Nov)
  - `occupancy_base`: simulated occupancy %, varies by star rating and neighborhood
- [ ] Seed all hotel records to Supabase `hotels` table
- [ ] Write validation script: count hotels in Pinecone vs Supabase, spot-check 20 hotels for data quality
- [ ] Write tests for data cleaning functions (deduplication, normalization, factor generation)

**Validation Targets:**
- [ ] 1,000+ hotels in both Pinecone and Supabase with matching IDs
- [ ] Every hotel has a valid embedding (1536 dimensions) in Pinecone
- [ ] Every hotel has non-null `base_rate_gbp`, `neighborhood`, `star_rating`
- [ ] Pricing factors are within defined ranges (demand 0.7-1.5, seasonality 0.8-1.4, etc.)
- [ ] Spot-check of 20 hotels shows realistic names, neighborhoods, and base rates
- [ ] No duplicate hotels (same name + neighborhood)

**Deliverables:**
- ETL scripts in `scripts/` directory
- 1,000+ hotels seeded in Pinecone and Supabase
- Validation script and output log
- Tests for data cleaning and factor generation

**Reasoning Level:** Medium-High (Opus)
**Rationale:** Kaggle data is messy. Deduplication, cross-referencing two datasets, geocoding, and realistic factor generation all require careful judgment. This is the highest-risk thread.
**Dependencies:** T1
**Parallelizable:** No (must complete before search/pricing threads can validate)

---

### Thread 3: Search API
**Purpose:** Build the `/api/search` route that embeds user queries, searches Pinecone, enriches results from Supabase, and returns ranked hotel results.

**Actions:**
- [ ] Create `/api/search` route handler (POST)
- [ ] Accept request body: `{ query: string, checkInDate?: string }`
- [ ] Generate query embedding via OpenAI `text-embedding-3-small`
- [ ] Query Pinecone with embedding, return top 20 matches with scores
- [ ] Fetch matching hotel records from Supabase by `pinecone_id`
- [ ] Combine Pinecone scores with Supabase hotel data into `SearchResult[]`
- [ ] Sort by semantic match score (descending)
- [ ] Add input validation: query must be non-empty string, max 500 characters
- [ ] Add error handling: Pinecone timeout, Supabase error, OpenAI error
- [ ] Write tests: valid query returns results, empty query returns 400, malformed request returns 400
- [ ] Test with 10 sample queries covering different intents (luxury, budget, location, vibe)

**Validation Targets:**
- [ ] `POST /api/search` with valid query returns 200 with ranked `SearchResult[]`
- [ ] Results include `matchScore`, `hotel` data, and `pinecone_id`
- [ ] Empty/missing query returns 400 with error message
- [ ] Response time under 3 seconds for typical queries
- [ ] 10 sample queries return semantically relevant results (manual verification)

**Deliverables:**
- `/api/search` route handler
- SearchResult type (if not already in shared types)
- Tests for the search API

**Reasoning Level:** Medium (Sonnet)
**Rationale:** Standard API route with well-documented Pinecone and OpenAI SDKs. The query-to-results pipeline is straightforward.
**Dependencies:** T1, T2
**Parallelizable:** Yes (with T4)

---

### Thread 4: Pricing Engine
**Purpose:** Build the pricing module that calculates dynamic rates using the 4-factor multiplicative model and generates 7-day projection data.

**Actions:**
- [ ] Create `src/lib/pricing.ts` module
- [ ] Implement `calculatePrice(hotel, checkInDate)` → `PricingBreakdown`:
  - `baseRate`: hotel's `base_rate_gbp`
  - `demandMultiplier`: mapped from `occupancy_base` (30%→0.7, 95%→1.5, linear interpolation)
  - `seasonalityMultiplier`: from `seasonality[month]` array (0-indexed)
  - `leadTimeMultiplier`: based on days between now and check-in (30+ days = 0.9, 0 days = 1.3, linear interpolation)
  - `dayOfWeekMultiplier`: from `demand_curve[dayOfWeek]` array
  - `finalPrice`: `baseRate * demand * seasonality * leadTime * dayOfWeek`
- [ ] Implement `calculateProjection(hotel, checkInDate)` → `ProjectionPoint[]` (7 entries):
  - For each of the next 7 days, calculate price varying `dayOfWeek` and simulating demand drift (occupancy +-2% per day, random walk clamped to 30-95%)
  - Return `{ date, price, factors }` per day
- [ ] Export all factor calculation functions individually for testing
- [ ] Write comprehensive tests:
  - Known inputs produce expected outputs (deterministic factors)
  - All multipliers stay within defined ranges
  - 7-day projection produces exactly 7 data points
  - Edge cases: same-day check-in, 60-day lead time, minimum/maximum occupancy

**Validation Targets:**
- [ ] `calculatePrice` returns correct breakdown for known test inputs
- [ ] All multipliers within defined ranges: demand (0.7-1.5), seasonality (0.8-1.4), lead time (0.9-1.3), day-of-week (0.85-1.15)
- [ ] `finalPrice` equals product of `baseRate * all multipliers`
- [ ] `calculateProjection` returns exactly 7 `ProjectionPoint` entries
- [ ] Projection dates are consecutive starting from check-in date
- [ ] Tests pass with `npm test`

**Deliverables:**
- `src/lib/pricing.ts` with exported functions
- `src/types/pricing.ts` types (or additions to shared types)
- Comprehensive test file for pricing module

**Reasoning Level:** Medium (Sonnet)
**Rationale:** Pricing formula is fully specified. Implementation is math-heavy but deterministic. Tests are the main complexity.
**Dependencies:** T1, T2
**Parallelizable:** Yes (with T3)

---

### Thread 5: Results UI
**Purpose:** Build the search interface and results list with price breakdown cards and 7-day projection charts.

**Actions:**
- [ ] Build search page (`src/app/page.tsx`):
  - Single natural language search box (prominent, centered)
  - Check-in date picker below (defaults to today), using shadcn/ui DatePicker
  - Search button + keyboard submit (Enter)
- [ ] Build `SearchResults` component:
  - Loading skeleton while searching
  - Results list sorted by semantic match score
  - Empty state for no results
  - Error state for API failures
- [ ] Build `HotelCard` component per result:
  - Hotel name, neighborhood, star rating (stars visual)
  - Semantic match percentage badge
  - Tonight's dynamic price (large, prominent)
  - Expandable price breakdown showing all 4 factors with multiplier values
  - Visual indicator per factor (color-coded: green = discount, red = premium)
- [ ] Build `PriceProjectionChart` component:
  - Recharts `LineChart` showing 7-day projected price
  - X-axis: dates, Y-axis: price in GBP
  - Tooltip showing price + dominant factor per day
  - Compact size suitable for embedding in a card
- [ ] Integrate search API call from frontend (fetch `/api/search`)
- [ ] Integrate pricing engine (call on results, client-side or via API)
- [ ] Responsive layout: single column on mobile, cards stack vertically
- [ ] Write component tests: search input renders, results display, chart renders with mock data

**Validation Targets:**
- [ ] Search box accepts input and triggers API call
- [ ] Results render with hotel name, match score, and dynamic price
- [ ] Price breakdown expands/collapses showing all 4 factors
- [ ] 7-day chart renders with correct data points
- [ ] Loading skeleton shows during search
- [ ] Error message shows on API failure
- [ ] Mobile layout works (single column, no horizontal scroll)
- [ ] All tests pass

**Deliverables:**
- Search page component
- HotelCard, PriceBreakdown, PriceProjectionChart components
- SearchResults list component with loading/empty/error states
- Component tests

**Reasoning Level:** Medium (Sonnet)
**Rationale:** Multiple UI components with state management and chart integration. Well-defined design but requires attention to responsive layout and data flow.
**Dependencies:** T3, T4
**Parallelizable:** No (needs working search + pricing APIs)

---

### Thread 6: Competitive Set + Claude Insight
**Purpose:** Add competitive set comparison (3 nearest-neighbor hotels) and async Claude booking insights to each result card.

**Actions:**
- [ ] Create `/api/competitive-set` route handler:
  - Accept `{ hotelId: string, pineconeId: string, neighborhood: string }`
  - Query Pinecone for 4 nearest neighbors to the hotel's vector (excluding itself)
  - Take top 3 results
  - Enrich from Supabase with pricing data
  - Calculate dynamic price for each competitor
  - Return `CompetitiveHotel[]` with name, price, match score, price delta
- [ ] Create `/api/insight` route handler (streaming):
  - Accept `{ hotel: SearchResult, competitors: CompetitiveHotel[], pricingBreakdown: PricingBreakdown }`
  - Construct Claude prompt with hotel context, pricing factors, and competitive position
  - Stream 1-2 sentence booking insight via Claude API (`claude-sonnet-4-5-20241022`)
  - Prompt template: "You are a hotel pricing analyst. Given [hotel] at [price] with [breakdown], compared to [competitors], provide 1-2 sentences of booking advice. Be specific about whether to book now or wait, and suggest alternatives if overpriced."
- [ ] Build `CompetitiveSet` UI component:
  - 3 competitor cards showing name, price, price delta vs. selected hotel
  - Visual indicator: cheaper (green), pricier (red)
- [ ] Build `ClaudeInsight` UI component:
  - Streams in after initial result render
  - Typing animation / streaming text effect
  - Loading state: subtle shimmer placeholder
  - Error state: graceful fallback (hide, don't break the card)
- [ ] Wire async loading: results render immediately, competitive set + insight load after
- [ ] Write tests: competitive set returns 3 hotels, insight streams correctly, error states handled

**Validation Targets:**
- [ ] Each result card shows 3 competitor hotels with prices
- [ ] Price delta is correctly calculated (positive = more expensive, negative = cheaper)
- [ ] Claude insight streams in after results are visible (not blocking)
- [ ] Insight is 1-2 sentences, specific to the hotel and its competitive position
- [ ] If Claude API fails, the card still renders without insight (graceful degradation)
- [ ] If Pinecone competitive query fails, competitive set section is hidden
- [ ] Tests pass

**Deliverables:**
- `/api/competitive-set` route handler
- `/api/insight` streaming route handler
- CompetitiveSet and ClaudeInsight UI components
- Tests for API routes and components

**Reasoning Level:** Medium (Sonnet)
**Rationale:** Nearest-neighbor query is a standard Pinecone operation. Claude streaming is well-documented. The main complexity is async loading UX and error handling.
**Dependencies:** T3, T4, T5
**Parallelizable:** No (needs working results UI to integrate into)

---

### Thread 7: Polish + Deploy
**Purpose:** Add loading states, error handling, responsive polish, Pinecone cold-start warming, Vercel deployment, and project documentation.

**Actions:**
- [ ] Add Pinecone warming ping on page load (mitigate free-tier cold starts)
- [ ] Polish loading states:
  - Search: full skeleton cards
  - Competitive set: inline shimmer
  - Claude insight: typing dots animation
- [ ] Polish error handling:
  - Network errors: retry button + friendly message
  - API rate limits: backoff message
  - Empty results: helpful suggestions ("Try a broader search like...")
- [ ] Responsive design audit:
  - Mobile: single column, touch-friendly tap targets, collapsible breakdowns
  - Tablet: 2-column grid
  - Desktop: 2-3 column grid with comfortable reading width
- [ ] Accessibility pass: keyboard navigation, ARIA labels, focus states, contrast check
- [ ] Performance check: verify bundle size, lazy-load Claude insights, ensure Recharts doesn't bloat
- [ ] Deploy to Vercel:
  - Set all environment variables
  - Verify `next build` succeeds locally first
  - Verify deployment works with live Pinecone + Supabase + OpenAI + Claude
- [ ] Write README.md:
  - Project overview and screenshots
  - Architecture Decision Record: Pinecone vs pgvector (why purpose-built vector DB)
  - Data pipeline overview
  - Pricing model explanation
  - Tech stack and setup instructions
- [ ] Final test pass: all tests green, no TypeScript errors

**Validation Targets:**
- [ ] Vercel deployment is live and functional
- [ ] Full search flow works end-to-end on deployed URL
- [ ] Mobile layout is usable (no horizontal scroll, tap targets work)
- [ ] Pinecone cold-start warning shows loading state, not error
- [ ] All tests pass (`npm test`)
- [ ] `tsc --noEmit` passes
- [ ] `next build` passes
- [ ] README exists with ADR section

**Deliverables:**
- Production Vercel deployment
- Polished UI with loading/error states
- README with Architecture Decision Record
- All tests passing

**Reasoning Level:** Medium (Sonnet)
**Rationale:** Integration work across all prior threads. Deployment has known risk areas (env vars, cold starts) but all are documented.
**Dependencies:** T5, T6
**Parallelizable:** No (final integration thread)

---

### Thread Execution Guidance

1. **Execute ONE thread per conversation** - don't combine threads
2. **Read all reference material first** - understand context before coding
3. **T3 and T4 are parallelizable** - run Search API and Pricing Engine simultaneously via Agent Teams
4. **T2 is the highest-risk thread** - start early, validate output before UI work begins
5. **T6 depends on T5** - competitive set and insight UI integrates into result cards
6. **Identify blockers early** - flag issues before they compound

### Thread Dependency Graph

```
T1 (Scaffold)
  └─ T2 (Data Pipeline)
       ├─ T3 (Search API)     ──┐
       └─ T4 (Pricing Engine) ──┤ [parallel pair]
                                └─ T5 (Results UI)
                                     └─ T6 (Competitive Set + Claude Insight)
                                          └─ T7 (Polish + Deploy)
```

### Completion Log Template

After each thread, record:
```
**Thread [N] Completion Log:**
- Status: Complete / Partial / Blocked
- Files Modified:
  - `path/file.ts:XX-YY` - [what changed]
- Tests Added: [list test files]
- Issues Discovered: [any problems found]
- Notes for Next Thread: [context to carry forward]
```

---

## 6. User Experience

### Key User Flows

**Flow 1: Semantic Hotel Search**
1. User lands on single-page app with prominent search box
2. User types natural language query (e.g., "family-friendly hotel near Hyde Park with pool")
3. Optionally selects check-in date (defaults to today)
4. User clicks Search or presses Enter
5. Loading skeleton appears immediately
6. Results render as cards sorted by semantic match score
7. Each card shows hotel name, neighborhood, star rating, match %, and dynamic price
8. Competitive set and Claude insight stream in asynchronously per card

**Flow 2: Price Exploration**
1. User views a result card with tonight's dynamic price
2. User expands the price breakdown to see all 4 factors with multipliers
3. User reviews the 7-day projection chart to identify cheaper days
4. User compares against the competitive set (3 similar hotels)
5. User reads Claude's booking insight for actionable advice

**Flow 3: Iterative Search**
1. User reviews results from initial search
2. User refines query (e.g., adds "with free breakfast" or changes to "budget option")
3. New results load, replacing previous results
4. User compares new results against mental model from previous search

### Primary Interface
Single-page application. One search box dominates the top of the page. Results render below as a vertically scrollable list of cards. Each card is self-contained with all pricing intelligence visible or expandable. No navigation, no routing, no secondary pages.

### UX Requirements
- Modern, polished, production-grade feel
- Professional colour palette — hotel/travel aesthetic (dark navy, warm gold accents, clean whites)
- Mobile-responsive design (single column on mobile, multi-column on desktop)
- Smooth transitions: skeleton → results, shimmer → insight
- Search box auto-focuses on page load
- Date picker uses shadcn/ui component for consistency
- Price formatting: GBP with pound sign, no decimal places for round numbers
- Star ratings as visual stars, not just numbers
- Match score as percentage with progress bar visual

### UI References
- Design language: clean, data-rich (like a Bloomberg terminal crossed with Airbnb)
- Anti-patterns to avoid: cluttered dashboards, tiny text, too many colors, gratuitous animations
- The price breakdown should feel like a financial statement — structured, readable, trustworthy

---

## 7. Data Model

### Core Entities

| Entity | Key Fields | Notes |
|--------|-----------|-------|
| Hotel | `id`, `name`, `neighborhood`, `lat`, `lng`, `star_rating`, `base_rate_gbp`, `review_summary`, `amenities`, `pricing_factors`, `pinecone_id`, `created_at` | Main entity in Supabase |
| Hotel Vector | `id` (= pinecone_id), `values` (1536-dim embedding), `metadata` (`neighborhood`, `star_rating`, `base_rate_gbp`, `name`) | Stored in Pinecone |
| PricingFactors | `demand_curve` (7 floats), `seasonality` (12 floats), `occupancy_base` (float) | JSONB column in hotels table |

### Supabase Schema

```sql
CREATE TABLE hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  lat DECIMAL(9,6),
  lng DECIMAL(9,6),
  star_rating INTEGER NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  base_rate_gbp DECIMAL(8,2) NOT NULL,
  review_summary TEXT NOT NULL,
  amenities TEXT[] DEFAULT '{}',
  pricing_factors JSONB NOT NULL,
  pinecone_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hotels_neighborhood ON hotels(neighborhood);
CREATE INDEX idx_hotels_star_rating ON hotels(star_rating);
CREATE INDEX idx_hotels_pinecone_id ON hotels(pinecone_id);
```

### Pinecone Index

- **Name:** `hotel-embeddings`
- **Dimension:** 1536
- **Metric:** cosine
- **Tier:** Serverless (free tier, up to 100K vectors — we use ~1,000)

### Security & Privacy
- No user data collected or stored
- API keys stored in environment variables, never committed
- Supabase Row Level Security not needed (public read-only data)
- Rate limiting on API routes to prevent abuse (basic, not auth-gated)

---

## 8. Integrations

### Required (MVP)

| Integration | Purpose | Tier |
|-------------|---------|------|
| Pinecone | Semantic search + competitive set nearest-neighbor queries | Free tier (serverless) |
| OpenAI API | Generate query embeddings (`text-embedding-3-small`) | Pay-per-use |
| Supabase | Hotel metadata, pricing factors, relational enrichment | Free tier |
| Claude API | Streaming booking insights (`claude-sonnet-4-5-20241022`) | Pay-per-use |
| Vercel | Hosting + serverless functions | Free tier |
| Kaggle | Source datasets (one-time download for ETL) | Free |

### Future
- Real-time occupancy data feeds (if this were a real product)
- Multi-city expansion (additional Pinecone namespaces per city)
- User preference learning (would require auth)

---

## 9. Technical Specification

### Stack
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Charts:** Recharts
- **Vector DB:** Pinecone (serverless)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensions)
- **Database:** Supabase Postgres
- **AI Insights:** Claude API (claude-sonnet-4-5-20241022)
- **Hosting:** Vercel
- **Repo:** GitHub

### Non-Negotiables
- [ ] Tests required (unit tests for pricing engine, data pipeline; component tests for UI)
- [ ] Documentation required (README with ADR)
- [ ] Security considered from day one (env vars, no secrets in code, rate limiting)
- [ ] Deployed to Vercel from start (not just localhost)
- [ ] `next build` verified locally before every deploy (lesson from London Transit Pulse)
- [ ] React 18 pinned explicitly (lesson from London Transit Pulse)

### Architecture Principles
- **Two-store separation:** Vector search (Pinecone) and relational data (Supabase) are separate concerns
- **Async insight loading:** Claude insights never block result rendering
- **Transparent pricing:** Every price is decomposable into its factors — no black boxes
- **Graceful degradation:** If Pinecone is cold, show loading. If Claude fails, hide insight. If competitive set fails, hide section. Core search always works.

---

## 10. Constraints

### Hard Constraints
- Must use Pinecone (not pgvector) — this is the portfolio signal
- Must have 1,000+ hotels (demonstrates scale beyond toy demo)
- All pricing factors must be visible to the user (transparency is the product thesis)
- No authentication (scope control)
- No booking flow (scope control)
- No map view (scope control)

### Preferences
- Hotel/travel-industry colour palette (navy, gold, white)
- Results feel fast (skeleton loading, async insight streaming)
- Price projection chart is compact enough to fit on a card without dominating it
- Claude insights are genuinely useful (not generic), referencing specific competitors and prices

### Anti-Patterns
- Do NOT build faceted filter UI — semantic search IS the filtering
- Do NOT use pgvector (defeats portfolio purpose)
- Do NOT make Claude insight synchronous (blocks results)
- Do NOT hardcode hotel data — must come from Kaggle datasets via data pipeline
- Do NOT use `legacy-peer-deps` in `.npmrc` (lesson from London Transit Pulse)
- Do NOT put data files in `.gitignore` if they are imported by source code (lesson from London Transit Pulse)

---

## 11. Future Vision

### v2 Direction
If v1 succeeds as a portfolio piece:
- **Multi-city:** Add Paris, Barcelona, Tokyo — one Pinecone namespace per city
- **Real-time pricing:** Connect to actual hotel rate APIs (Booking.com, Expedia affiliates)
- **User preferences:** Auth + saved searches + price alerts when projections dip
- **Map view:** Leaflet integration showing hotel locations with price pins
- **Comparison mode:** Side-by-side hotel comparison with pricing factor diff
- **Historical pricing:** Show how prices have changed over the past 30 days

---

## 12. Definition of Done

MVP is complete when:
- [ ] Not embarrassing to show someone (polished UI, professional palette)
- [ ] Core search flow works end-to-end (type query → see ranked results with prices)
- [ ] 1,000+ London hotels searchable with semantic relevance
- [ ] Price breakdown shows all 4 factors transparently
- [ ] 7-day projection chart renders on each card
- [ ] Competitive set shows 3 similar hotels with price comparison
- [ ] Claude insight streams in asynchronously
- [ ] Live on Vercel (not just localhost)
- [ ] Works on mobile (responsive, no horizontal scroll)
- [ ] Tests passing (`npm test`)
- [ ] TypeScript clean (`tsc --noEmit`)
- [ ] Build clean (`next build`)
- [ ] README exists with Architecture Decision Record
- [ ] Creator has tested with 10+ diverse queries and results are semantically relevant

---

## 13. Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| 1 | Are both Kaggle datasets sufficient for 1,000+ unique London hotels after deduplication? | If < 1,000, need to supplement or adjust scope | Resolve in T2 |
| 2 | Will OpenAI embedding costs for 1,000+ hotels be within budget? (~$0.02 per 1M tokens, should be <$1 total) | Budget | Low risk, verify in T2 |
| 3 | Pinecone free-tier cold starts — how bad are they in practice? | UX | Mitigate with warming ping in T7 |
| 4 | Should demand drift in 7-day projection be deterministic (seeded) or truly random? | Consistency of results | Default to seeded random per hotel ID for reproducibility |
| 5 | How to handle hotels with very few reviews (poor embedding quality)? | Search quality | Filter to hotels with 3+ reviews during ETL |

---

## 14. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Kaggle data is messier than expected | T2 takes 2x longer, delays all downstream threads | Medium | Budget T2 as highest-risk thread. Define clean schema first, validate output before UI work. |
| Embedding quality poor for short queries | Search results feel random, not semantic | Low-Medium | Test 10 sample queries early in T3. If poor, add Pinecone metadata filtering as hybrid search fallback. |
| Claude API latency blocks results | Users wait 5-10s for full card to render | Medium | Architecture already handles this: stream insights async, results render immediately without Claude. |
| Pinecone cold starts on free tier | First query takes 5-10s, bad first impression | Medium | Warming ping on page load + loading skeleton. Document in README. |
| Pricing factors look unrealistic | Undermines credibility of the demo | Low | Base rates from real data. Factors bounded to realistic ranges. Spot-check 20 hotels manually in T2. |
| React version conflict with Next.js 14 | Build fails on Vercel (London Transit Pulse repeat) | Low | Pin React 18 explicitly during scaffold. Verify with `npm ls react`. |

---

## Appendix: Agent Notes

*This section is populated by agents during the build process*

### Technical Architect
[Architecture decisions, rationale]

### UX/UI Designer
[Design decisions, component notes]

### DevSecOps
[Infrastructure notes, security considerations]

### Other Notes
- **Portfolio context:** This is project #10. Previous builds inform the approach — especially London Transit Pulse (deploy pipeline lessons) and Weather Mood (async API patterns, canvas rendering).
- **Estimated scope:** ~25-35 source files, ~10-15 test files, comparable to Weather Mood build.
- **Design doc:** Full approved design at `~/shipit-v2/docs/plans/2026-02-28-hotel-pricing-intelligence-design.md`
