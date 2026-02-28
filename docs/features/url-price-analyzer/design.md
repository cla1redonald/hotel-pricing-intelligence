# Technical Design: URL Price Analyzer

> **Status:** Ready for Build
> **Author:** @architect (analysis) / builder reference doc
> **Date:** 2026-02-28
> **Spec:** `docs/features/url-analyzer-spec.md` (approved, includes @designer and @architect review fixes)
> **Depends on:** Threads 1-6 complete — `/api/search`, `/api/competitive-set`, `/api/insight`, pricing engine, all functional

---

## 1. User Story

As a traveler who has found a hotel on Booking.com (or another OTA), I want to paste the hotel URL and see immediately whether the listed price is a great deal, fair, or overpriced — compared to an AI pricing model — so I can decide whether to book, wait, or look elsewhere.

The feature adds a "Check a Price" tab alongside the existing search. The user pastes a URL, the app extracts the hotel name, the user enters the listed price, and the app returns a deal verdict with a visual gauge, price comparison, AI insight, pricing breakdown, 7-day projection, and cheaper alternatives.

---

## 2. Technical Approach

### Overview

The feature is built as a second mode within the existing single-page app (`src/app/page.tsx`). It shares the same results section as the search mode. A new `TabNav` component switches between modes; each tab preserves its last result independently.

The core data flow is:

1. **Client** — `parseHotelUrl()` extracts hotel name and optional check-in date from the pasted URL (pure client-side, no network call).
2. **Client** — User enters listed price and currency; submits.
3. **Server** — `POST /api/url-analyze` runs a 3-tier matching pipeline (exact → fuzzy → semantic), calculates model price via the existing pricing engine, computes deal score, returns a typed discriminated union response.
4. **Client** — `AnalysisCard` renders the result. It calls the existing `/api/competitive-set` and `/api/insight` routes with URL-analysis context, reusing those components with minor additions.

### Matching Strategy (3-Tier)

The spec mandates exact and fuzzy match run in parallel (`Promise.all`), with semantic match as a fallback only when both fail to produce a result with confidence >= 0.60. This order minimizes embedding API calls (cost and latency) while handling the common case (well-known hotel names) fast.

- **Exact match**: Supabase `ILIKE` on `hotels.name`. Confidence = 1.0. Fastest.
- **Fuzzy match**: Keyword extraction with stop-word filtering, sanitized via `sanitizeKeyword()`, Supabase `.or()` with `ILIKE` on up to 3 keywords, scored by bidirectional Jaccard overlap.
- **Semantic match**: OpenAI `text-embedding-3-small` embedding of the hotel name string, Pinecone `topK: 5`, accept results with cosine similarity >= 0.85 only.
- **Disambiguation**: If top 2 results (across all tiers) are within 5% confidence of each other, return a disambiguation response with up to 3 candidates for user selection.

### Insight API Modification

The existing `/api/insight` route accepts a new optional `context` field. When `context.mode === 'url-analysis'`, the prompt appends deal-focused framing (OTA source, listed price, dominant pricing factor). The route change is additive and backward compatible — all existing callers continue to work without modification.

### Currency Conversion

A static lookup table in `src/lib/currency.ts` converts USD and EUR to GBP for deal score calculation. All deal math uses GBP. Display shows both the original amount and the GBP equivalent with a "rates are approximate" disclaimer.

### Deal Score

Calculated server-side in the route handler using `calculateDealScore()` from `src/lib/deal-score.ts`. Returns a typed `DealScore` object with label, `percentageDiff`, `savingsGbp`, and `direction`. The gauge position is calculated client-side in `DealScoreGauge` from `percentageDiff` and `direction`.

---

## 3. Files to Modify

### `src/types/index.ts`

**What changes:** Add 6 new exported types at the bottom of the file. No existing types change.

```typescript
export interface ParsedUrl {
  hotelName: string | null;
  source: 'booking' | 'hotels' | 'expedia' | 'generic' | 'unknown';
  originalUrl: string;
  checkInDate?: string;  // ISO date if extractable from URL query string
}

export interface DealScore {
  label: 'Great Deal' | 'Fair Price' | 'Overpriced';
  percentageDiff: number;   // Absolute %, always positive
  savingsGbp: number;       // Absolute £ difference, always positive
  direction: 'saving' | 'overpaying';
}

export type UrlAnalysisResponse =
  | UrlAnalysisMatched
  | UrlAnalysisNotMatched
  | UrlAnalysisDisambiguation;

export interface UrlAnalysisMatched {
  matched: true;
  extractedName: string;
  source?: string;
  matchedHotel: Hotel;
  matchMethod: 'exact' | 'fuzzy' | 'semantic';
  matchConfidence: number;
  modelPrice: number;
  listedPrice: number;
  listedPriceGbp: number;
  currency: 'GBP' | 'USD' | 'EUR';
  dealScore: DealScore;
  pricingBreakdown: PricingBreakdown;
  projection: ProjectionPoint[];
}

export interface UrlAnalysisNotMatched {
  matched: false;
  extractedName: string;
  source?: string;
  listedPrice: number;
  listedPriceGbp: number;
  currency: 'GBP' | 'USD' | 'EUR';
}

export interface UrlAnalysisDisambiguation {
  matched: false;
  extractedName: string;
  source?: string;
  listedPrice: number;
  listedPriceGbp: number;
  currency: 'GBP' | 'USD' | 'EUR';
  disambiguation: Array<{
    hotel: Hotel;
    confidence: number;
    priceRange?: { min: number; max: number };
  }>;
}
```

---

### `src/app/page.tsx`

**What changes:** Add tab state, per-tab result preservation, `TabNav` render, conditional content rendering. The existing search logic does not change — it is simply wrapped in conditional rendering behind the active tab.

**New state to add:**

```typescript
type ActiveTab = 'search' | 'url-analyzer';
const [activeTab, setActiveTab] = useState<ActiveTab>('search');

// URL analyzer result state (preserved when switching tabs)
const [urlAnalysisResult, setUrlAnalysisResult] = useState<UrlAnalysisResponse | null>(null);
const [isUrlAnalyzing, setIsUrlAnalyzing] = useState(false);
const [urlAnalysisError, setUrlAnalysisError] = useState<string | null>(null);
const [hasUrlAnalyzed, setHasUrlAnalyzed] = useState(false);
```

**Structural changes:**

- Replace the static header content with `TabNav` rendered above the search inputs.
- Wrap existing `SearchBox` + `DatePicker` in `{activeTab === 'search' && ...}`.
- Add `{activeTab === 'url-analyzer' && <UrlAnalyzer ... />}` below the tabs.
- In the results section, add a conditional: if `activeTab === 'url-analyzer'`, render URL analysis states (loading, error, `AnalysisCard`); otherwise render existing search states. Both tabs' results are held in state simultaneously — switching tabs shows the previous result without re-fetching.

The `performUrlAnalysis(params)` function mirrors the structure of `performSearch()`: sets loading, calls `/api/url-analyze`, handles errors, stores result. It lives in `page.tsx` alongside `performSearch`.

---

### `src/app/api/insight/route.ts`

**What changes:** Accept optional `context` field in the request body. Append a deal-focused prompt suffix when `context.mode === 'url-analysis'`. All existing callers that omit `context` are completely unaffected.

**Addition to the `InsightRequest` interface:**

```typescript
context?: {
  mode: 'search' | 'url-analysis';
  listedPrice?: number;
  currency?: string;
  source?: string;       // 'booking', 'expedia', etc.
  dealLabel?: string;    // 'Great Deal' | 'Fair Price' | 'Overpriced'
  percentageDiff?: number;
};
```

**Addition to prompt construction** (appended after the existing prompt when `context.mode === 'url-analysis'`):

```
The user found this hotel listed at ${currency}${listedPrice} on ${source}. Our pricing model values it at £${modelPrice} (deal score: ${dealLabel}, ${percentageDiff}% difference). Focus your advice on whether this specific listed price represents good value. Reference the most impactful pricing factor driving the difference, and name a specific cheaper alternative if the listed price is above model.
```

The safe-string sanitization rules (`slice(0, 200).replace(/[<>{}]/g, '')`) already applied to `hotelName` and `neighborhood` should be applied identically to any new string fields from `context` (particularly `source` and `dealLabel`).

**Validation change:** The `context` field is optional. If present and `mode === 'url-analysis'`, validate that `listedPrice` is a finite positive number if provided.

---

## 4. Files to Create

### `src/lib/url-parser.ts`

**Purpose:** Pure client-side URL parsing. Extracts hotel name, OTA source identifier, and optional check-in date from a pasted URL. Returns `ParsedUrl`. No network calls.

**Exports:** `parseHotelUrl(url: string): ParsedUrl`

**Key logic (per spec section 10):**
- Booking.com: regex `/\/hotel\/[a-z]{2}\/([^/.]+)/` on pathname, strip `.en-gb` locale suffix, replace hyphens with spaces, title-case.
- Hotels.com: regex `/\/ho\d+\/([^/]+)/`, same cleanup.
- Expedia: regex `/Hotels?-(.+?)\.h\d+/`, same cleanup.
- Generic fallback: longest meaningful path segment (length > 3), title-cased.
- Check-in date: if Booking.com URL has `checkin=YYYY-MM-DD` query param and it passes `/^\d{4}-\d{2}-\d{2}$/` validation, populate `result.checkInDate`.
- Wraps entire logic in try/catch — invalid `new URL(url)` leaves `hotelName: null`.

**Used by:** `UrlAnalyzer.tsx` (client component, runs on paste/blur).

---

### `src/lib/currency.ts`

**Purpose:** Static GBP conversion rates and converter function for the 3-currency scope of this feature (GBP, USD, EUR).

**Exports:**

```typescript
export const SUPPORTED_CURRENCIES = ['GBP', 'USD', 'EUR'] as const;
export type Currency = typeof SUPPORTED_CURRENCIES[number];

// Multiply foreign amount by rate to get GBP
const TO_GBP: Record<Currency, number> = {
  GBP: 1.0,
  USD: 0.79,
  EUR: 0.86,
};

export function convertToGbp(amount: number, currency: Currency): number;
export function formatWithOriginal(amount: number, currency: Currency): string;
// e.g. "£350" or "$350 (~£277)"
```

**Used by:** `/api/url-analyze/route.ts` (server-side for deal score math), `PriceComparison.tsx` (client-side for display).

---

### `src/lib/hotel-matcher.ts`

**Purpose:** Server-side hotel matching logic. Three exported async functions: `exactMatch`, `fuzzyMatch`, `semanticMatch`. All are pure functions that accept dependencies (supabase, embedding generator, pinecone index) as arguments for testability.

**Exports (per spec section 11):**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Index as PineconeIndex } from '@pinecone-database/pinecone';

export type MatchResult = { hotel: Hotel; confidence: number };

export async function exactMatch(
  hotelName: string,
  supabase: SupabaseClient,
): Promise<MatchResult | null>;

export async function fuzzyMatch(
  hotelName: string,
  supabase: SupabaseClient,
): Promise<MatchResult[]>;

export async function semanticMatch(
  hotelName: string,
  generateEmbedding: (text: string) => Promise<number[]>,
  pineconeIndex: PineconeIndex,
  supabase: SupabaseClient,
): Promise<MatchResult[]>;
```

**Internal helpers (not exported):**
- `sanitizeKeyword(keyword: string): string` — strips non-alphanumeric characters to prevent SQL injection in ILIKE patterns.
- `getKeywords(name: string): string[]` — lowercases, splits, strips stop words, sanitizes.
- `normalizeForMatch(name: string): string` — lowercase trim.
- `STOP_WORDS: Set<string>` — `hotel`, `hotels`, `london`, `the`, `a`, `an`, `by`, `at`, `in`, `and`, `&`, `of`, `resort`, `suites`, `suite`.

**Semantic match deduplication:** The route handler (not this module) deduplicates semantic results against fuzzy results by hotel ID before merging. This module returns raw results.

**Stale index warning:** `semanticMatch` logs a `console.warn` for any Pinecone ID returned that has no corresponding Supabase row.

**Used by:** `/api/url-analyze/route.ts` only.

---

### `src/lib/deal-score.ts`

**Purpose:** Pure function calculating the deal score from two numbers. No side effects.

**Exports:**

```typescript
export function calculateDealScore(
  listedPriceGbp: number,
  modelPrice: number,
): DealScore | null;
```

Returns `null` if `modelPrice < 30` (guard against data anomalies). Otherwise returns `DealScore` per thresholds:
- `listedPriceGbp <= modelPrice` → `'Great Deal'`, `direction: 'saving'`
- `listedPriceGbp <= modelPrice * 1.10` → `'Fair Price'`, `direction: 'overpaying'`
- above → `'Overpriced'`, `direction: 'overpaying'`

`percentageDiff` and `savingsGbp` are always positive (use `direction` for sign). Values rounded to 1 decimal and 2 decimal places respectively.

**Used by:** `/api/url-analyze/route.ts` (server-side only).

---

### `src/app/api/url-analyze/route.ts`

**Purpose:** Orchestrator API route. Validates input, runs the 3-tier matching pipeline, calculates model price and deal score, returns `UrlAnalysisResponse`.

**Method:** `POST`

**Request body:**
```typescript
{
  hotelName: string;
  listedPrice: number;
  currency: 'GBP' | 'USD' | 'EUR';
  checkInDate?: string;   // ISO date string, defaults to today
  source?: string;        // 'booking' | 'hotels' | 'expedia' | 'generic' | 'unknown'
}
```

**Validation (400 responses):**
- `hotelName` missing, not a string, empty, or > 200 chars after trim
- `listedPrice` missing, not a number, <= 0, or > 10000
- `currency` not one of `GBP | USD | EUR`
- `checkInDate` present but not a valid ISO date string

**Rate limiting:** Use existing `rateLimit(ip, 20)` — same budget as the insight route (embedding calls are expensive).

**Route handler execution order:**
1. Validate input.
2. `convertToGbp(listedPrice, currency)` → `listedPriceGbp`.
3. Parse `checkInDate` to `Date`, default to `new Date()`.
4. Lazy-import `supabase`, `getPineconeIndex`, `generateQueryEmbedding`, `calculatePrice`, `calculateProjection`, `calculateDealScore`, `convertToGbp`, `exactMatch`, `fuzzyMatch`, `semanticMatch`.
5. `const [exactResult, fuzzyResults] = await Promise.all([exactMatch(...), fuzzyMatch(...)])`.
6. If `exactResult` — build matched response and return.
7. Sort `fuzzyResults` by confidence descending.
8. Disambiguation check on `fuzzyResults` (top 2 within 0.05 confidence) — return disambiguation response if triggered.
9. If `fuzzyResults[0].confidence >= 0.60` — build matched response and return.
10. `const semanticResults = await semanticMatch(...)`.
11. Deduplicate semantic results vs. fuzzy by hotel ID.
12. Merge, sort, re-run disambiguation check.
13. If top merged result confidence >= 0.60 — build matched response and return.
14. Return not-matched response.

**Matched response builder** (shared logic for all three match paths, extracted as a local function):
```typescript
function buildMatchedResponse(
  hotel: Hotel,
  method: 'exact' | 'fuzzy' | 'semantic',
  confidence: number,
  listedPrice: number,
  listedPriceGbp: number,
  currency: 'GBP' | 'USD' | 'EUR',
  checkIn: Date,
  source: string | undefined,
  extractedName: string,
): UrlAnalysisMatched
```

Inside this function:
- `calculatePrice(hotel, checkIn)` → `pricingBreakdown`
- `modelPrice = pricingBreakdown.finalPrice`
- `calculateDealScore(listedPriceGbp, modelPrice)` → `dealScore` (if `null`, return a not-matched response with a special error flag — or treat as matched with `dealScore: null` and let the client show "Price analysis unavailable")
- `calculateProjection(hotel, checkIn)` → `projection`

**Error handling:** All Supabase and Pinecone errors caught; return 500 with `{ error: 'Analysis service unavailable' }`.

**Module constant:** `export const dynamic = 'force-dynamic';` (matches all other API routes in this codebase).

---

### `src/components/TabNav.tsx`

**Purpose:** Two-tab navigation bar rendered in the hero header. Visually consistent with the existing navy/gold design language. Manages active tab display only — tab state lives in `page.tsx`.

**Props:**
```typescript
interface TabNavProps {
  activeTab: 'search' | 'url-analyzer';
  onTabChange: (tab: 'search' | 'url-analyzer') => void;
}
```

**Visual spec:**
- Full-width within the header's `max-w-[1200px]` container.
- Two tab buttons: "Search Hotels" (Search icon from lucide) and "Check a Price" (Link icon from lucide).
- Active tab: gold bottom border (`border-b-2 border-[var(--gold-500)]`), text `var(--text-inverse)`.
- Inactive tab: no border, text `var(--navy-600)`, hover `var(--navy-500)`.
- Tabs use `role="tablist"` / `role="tab"` / `aria-selected` for accessibility.
- No vertical padding between tabs and the content below — the existing content layout handles spacing.

---

### `src/components/UrlAnalyzer.tsx`

**Purpose:** "Check a Price" tab content. Contains the URL input, auto-filled hotel name field, price input, currency selector, date picker (reusing `DatePicker`), and submit button. Handles URL parsing client-side and calls `onAnalyze` with structured parameters.

**Props:**
```typescript
interface UrlAnalyzerProps {
  isLoading: boolean;
  onAnalyze: (params: {
    hotelName: string;
    listedPrice: number;
    currency: 'GBP' | 'USD' | 'EUR';
    checkInDate: Date;
    source: string;
  }) => void;
}
```

**Internal state:**
```typescript
const [url, setUrl] = useState('');
const [parsedResult, setParsedResult] = useState<ParsedUrl | null>(null);
const [hotelName, setHotelName] = useState('');
const [listedPrice, setListedPrice] = useState('');
const [currency, setCurrency] = useState<'GBP' | 'USD' | 'EUR'>('GBP');
const [checkInDate, setCheckInDate] = useState<Date>(() => new Date());
const [urlError, setUrlError] = useState<string | null>(null);
const [priceError, setPriceError] = useState<string | null>(null);
const priceInputRef = useRef<HTMLInputElement>(null);
```

**URL paste behavior:**
- `onChange` on the URL input calls `parseHotelUrl(value)`.
- If result has a non-null `hotelName`, set `hotelName` state and show "Extracted: [Name]" confirmation text below the URL field. Auto-focus the price input via `priceInputRef.current?.focus()`.
- If result has a `checkInDate`, set `checkInDate`.
- If `hotelName` is null, set `urlError`: "We couldn't extract a hotel name from this URL. Please enter the hotel name manually." The hotel name field remains visible and empty for manual entry.

**Validation on submit:**
- `hotelName.trim().length === 0` → inline error on the hotel name field: "Please enter the hotel name."
- `listedPrice` is empty, NaN, <= 0, or > 10000 → `priceError`: "Please enter a realistic nightly rate (£1 – £10,000)."
- Both clear on the next change event.

**Layout (per spec section 5.2):**
```
[Link icon] [URL input: full-width]
[Hotel name input: flex-grow]  [Currency select: fixed width]
[Listed price input: flex-grow] [DatePicker: fixed width]
                    [Check Price button: right-aligned or full-width on mobile]
```

Reuses the existing `DatePicker` component without modification.

---

### `src/components/AnalysisCard.tsx`

**Purpose:** Full result display for a successful URL analysis. Renders the 7-section layout described in spec section 5.3. Orchestrates `CompetitiveSet` and `ClaudeInsight` calls with URL-analysis context.

**Props:**
```typescript
interface AnalysisCardProps {
  result: UrlAnalysisMatched;
  checkInDate: Date;
  onSearchFallback?: (query: string) => void;  // for "Search similar hotels" CTA
}
```

**Sections rendered in order:**
1. `DealScoreGauge` — with `dealScore`, `modelPrice`, `listedPriceGbp`.
2. Hotel identity row — `hotel.name` (with match confidence tooltip/badge), `hotel.neighborhood`, `StarRating`.
3. `PriceComparison` — listed price vs. model price, side-by-side.
4. `ClaudeInsight` — called with standard props PLUS the new `context` field:
   ```typescript
   context={{
     mode: 'url-analysis',
     listedPrice: result.listedPriceGbp,
     currency: result.currency,
     source: result.source,
     dealLabel: result.dealScore.label,
     percentageDiff: result.dealScore.percentageDiff,
   }}
   ```
5. Price breakdown — reuses existing `PriceBreakdown` inside a `Collapsible` (same pattern as `HotelCard`).
6. `PriceProjectionChart` — reuses existing component with `result.projection` data.
7. `CheaperAlternatives` — after `CompetitiveSet` loads, passes competitors with filtering logic.

**Match confidence display:**
- `matchConfidence >= 0.90`: render confidence as a tooltip on the hotel name (title attribute or shadcn Tooltip). Text: "Matched via [matchMethod] search, [Math.round(matchConfidence * 100)]% confidence."
- `matchConfidence < 0.90`: render a small badge below the hotel name: "Matched via [matchMethod] ([Math.round(matchConfidence * 100)]% confidence)."

**Competitor loading orchestration:** `AnalysisCard` uses the same `useState<Array<{ name: string; price: number }>>([])` + `onCompetitorsLoaded` callback pattern from `HotelCard`. The `CheaperAlternatives` component receives both the full `CompetitiveHotel[]` and the `result.listedPriceGbp` to apply filtering.

**Card width:** `max-w-[720px] mx-auto` (centered, wider than the two-column search grid cards).

---

### `src/components/DealScoreGauge.tsx`

**Purpose:** Visual centerpiece of the analysis card. Continuous horizontal gauge with a positioned marker showing where the listed price sits relative to the model price.

**Props:**
```typescript
interface DealScoreGaugeProps {
  dealScore: DealScore;
  modelPrice: number;
  listedPriceGbp: number;
}
```

**Gauge math:**
```typescript
// Position: 50% = at model price, 0% = 50% below, 100% = 50% above
const rawPosition = 50 + (dealScore.direction === 'overpaying' ? 1 : -1)
  * Math.min(dealScore.percentageDiff / 50, 1) * 50;
const markerPosition = Math.max(0, Math.min(100, rawPosition));
```

**Visual elements:**
- Track: `linear-gradient(to right, var(--discount), var(--neutral-pricing), var(--premium))` — left to right, green to amber to red.
- Marker: a triangle/chevron positioned absolutely at `left: ${markerPosition}%`, colored to match the deal score label's design token.
- Labels below track: "50% below" (left), "Model Price" (center), "50% above" (right).
- Primary text above track: `"Overpriced by 17%"` / `"17% below model"` / `"Fair Price"`. Font size `text-2xl font-bold`. Color from design token matching the label.
- Secondary text: `"£52 per night more than model"` or `"Save £52 per night"`. Font `text-base`.

**Design token mapping (do not hardcode hex):**
- Great Deal → `var(--discount)` for text, `var(--discount-bg)` for background tint.
- Fair Price → `var(--neutral-pricing)` for text, `var(--neutral-bg)` for background tint.
- Overpriced → `var(--premium)` for text, `var(--premium-bg)` for background tint.

**Mobile layout:** All elements stack vertically. The gauge is full-width (100%) at all breakpoints. The text labels are hidden on mobile if space is tight (`hidden sm:flex` for axis labels is acceptable).

**`null` deal score guard:** If `dealScore` is somehow null (model price < 30 edge case), render: `"Price analysis unavailable for this hotel."` in muted text. This is an internal guard; the API should not send a matched response with a null deal score.

---

### `src/components/PriceComparison.tsx`

**Purpose:** Side-by-side (desktop) / stacked (mobile) display of listed price vs. model price.

**Props:**
```typescript
interface PriceComparisonProps {
  listedPrice: number;
  listedPriceGbp: number;
  currency: 'GBP' | 'USD' | 'EUR';
  modelPrice: number;
  source?: string;      // 'booking', 'expedia', etc. — display as "on Booking.com"
  checkInDate: Date;
}
```

**Layout:**
```
+-------------------+    +--------------------+
| LISTED PRICE      |    | OUR MODEL PRICE    |
| £350              |    | £298               |
| on Booking.com    |    | for tonight        |
+-------------------+    +--------------------+
```

- Two panels in `flex-col sm:flex-row gap-4`.
- Each panel: rounded border, padding, label in uppercase small caps, price in `text-2xl font-semibold`.
- Listed price panel: if currency !== GBP, show `$350 (~£277)` using `formatWithOriginal()` from `currency.ts`. Add footnote: "Converted at approximate rate. Actual rate may vary." in `text-xs text-[var(--text-muted)]`.
- Source label: capitalize first letter of `source` string (e.g., `'booking'` → `"Booking.com"`, `'expedia'` → `"Expedia"`). If source is `'generic'` or `'unknown'`, show `"on OTA"`.
- Model price panel: "for [weekday, date]" using `checkInDate`.

---

### `src/components/CheaperAlternatives.tsx`

**Purpose:** Displays the competitive set filtered/sorted for URL analysis mode. Renders a vertical stack on mobile, horizontal row on desktop — opposite of `CompetitiveSet` which renders horizontal on both.

**Props:**
```typescript
interface CheaperAlternativesProps {
  competitors: CompetitiveHotel[];
  listedPriceGbp: number;
  dealLabel: 'Great Deal' | 'Fair Price' | 'Overpriced';
}
```

**Filtering logic (client-side):**
- If `dealLabel === 'Overpriced'`: filter to competitors where `competitor.dynamicPrice < listedPriceGbp`. If fewer than 3, show all competitors (not just cheaper ones).
- If `dealLabel === 'Great Deal'` or `'Fair Price'`: show all competitors. Price delta badges show difference vs. `listedPriceGbp` (not vs. model price).

**Section header:**
- `dealLabel === 'Overpriced'`: "Cheaper Alternatives"
- `dealLabel === 'Fair Price'` or `'Great Deal'`: "Similar Hotels"

**Card layout:**
- Mobile: `flex-col gap-3` (vertical stack, full-width cards). No horizontal scrolling.
- Desktop (sm+): `flex-row gap-3` (horizontal, same as `CompetitiveSet`).
- Each card shows: hotel name (truncated), dynamic price, delta badge vs. listed price.

**Reuse:** Internal `CompetitorCard` and `DeltaBadge` sub-components from `CompetitiveSet.tsx` should be extracted to shared internal components or duplicated in `CheaperAlternatives.tsx`. Given the small scope, duplication is acceptable; extraction into a shared internal file is preferred if the builder finds it clean.

---

## 5. Dependencies

### No New Packages Required

All required capabilities are already available:
- `@supabase/supabase-js` — for hotel lookup
- `@pinecone-database/pinecone` — for semantic match
- `openai` (via `src/lib/embeddings.ts`) — for embedding generation in semantic match fallback
- `@anthropic-ai/sdk` (via `src/lib/anthropic.ts`) — for insight streaming
- `lucide-react` — `Link` icon for URL input (new usage; already installed for `Search`, `Sparkles`, etc.)
- `@radix-ui/react-tooltip` — for match confidence tooltip on hotel name; check if already imported. If not, shadcn/ui's Tooltip component should be added via `npx shadcn@latest add tooltip` before the builder implements `AnalysisCard`.

**Check before building:**
```bash
# Confirm tooltip component availability
ls src/components/ui/tooltip.tsx 2>/dev/null || echo "Need to add: npx shadcn@latest add tooltip"
```

---

## 6. Integration Points with Existing Code

### `src/lib/pricing.ts` (unchanged)

`calculatePrice(hotel, checkInDate)` and `calculateProjection(hotel, checkInDate)` are called directly from the new `/api/url-analyze` route handler. No modification needed. The route lazy-imports them exactly as the competitive-set route does:

```typescript
const { calculatePrice, calculateProjection } = await import('@/lib/pricing');
```

### `src/app/api/competitive-set/route.ts` (unchanged)

Called from the client (inside `AnalysisCard`) with the matched hotel's `pinecone_id` and `checkInDate`, exactly as `HotelCard` does. No server-side changes.

### `src/components/PriceBreakdown.tsx` (unchanged)

Reused inside `AnalysisCard` with `result.pricingBreakdown` from the API response. Wrapped in the same `Collapsible` pattern as `HotelCard`.

### `src/components/PriceProjectionChart.tsx` (unchanged)

Reused inside `AnalysisCard` with `result.projection`. The projection data is pre-computed server-side in the route handler and returned in the matched response.

### `src/components/DatePicker.tsx` (unchanged)

Reused inside `UrlAnalyzer.tsx` for check-in date selection. Props are `date: Date` and `onDateChange: (date: Date) => void`.

### `src/components/ClaudeInsight.tsx` (requires prop addition)

Currently accepts: `hotelName`, `neighborhood`, `dynamicPrice`, `pricingBreakdown`, `competitors`. The `context` prop needs to be added:

```typescript
// New optional prop
context?: {
  mode: 'search' | 'url-analysis';
  listedPrice?: number;
  currency?: string;
  source?: string;
  dealLabel?: string;
  percentageDiff?: number;
};
```

This prop is passed through to the `/api/insight` POST body. All existing callers in `HotelCard.tsx` continue to work without changes (omitting `context` defaults to search mode behavior on the API side).

### `src/lib/rate-limit.ts` (unchanged)

The new `/api/url-analyze` route uses the existing `rateLimit` and `getClientIp` functions with a limit of 20 requests/minute (same as `/api/insight`, since both may trigger embedding API calls).

### `src/lib/embeddings.ts` (unchanged)

`generateQueryEmbedding(text: string): Promise<number[]>` is lazy-imported in the new route, but only called on the semantic match fallback path. The function signature matches what `hotel-matcher.ts`'s `semanticMatch` expects.

---

## 7. Edge Cases and Risks

### Edge Case 1: URL Cannot Be Parsed

**Detection:** `parseHotelUrl()` returns `hotelName: null`.
**Handling:** `UrlAnalyzer.tsx` sets `urlError` state. Inline message below URL field: "We couldn't extract a hotel name from this URL. Please enter the hotel name manually." The hotel name input field is always visible and editable; if `urlError` is set, focus moves to it.
**Risk:** Low. The hotel name field is always editable, so the user can always recover.

### Edge Case 2: Hotel Not in Catalog

**Detection:** `/api/url-analyze` returns `{ matched: false }` without `disambiguation` field.
**Handling:** `page.tsx` detects `UrlAnalysisNotMatched` response. Render an info card (not `ErrorState`) with: "We don't have [extractedName] in our catalog of 1,000+ London hotels." plus a CTA button that calls `onSearchFallback(extractedName)` — switching the page to the search tab with `extractedName` pre-filled in the search box.
**Risk:** Expected for ~20% of lookups per spec. This is normal behavior, not an error.

### Edge Case 3: Disambiguation Response

**Detection:** Response has `disambiguation` array.
**Handling:** Render a disambiguation card listing up to 3 candidates with name, neighborhood, star rating, and price range. User clicks a candidate → immediately trigger the full analysis for that hotel (call `/api/url-analyze` again with the selected `hotel.name`). This selection bypasses the URL parsing step.
**Risk:** Medium complexity. The disambiguation card needs to re-trigger analysis on click without requiring re-entry of listed price or URL. The `listedPrice`, `currency`, and `checkInDate` from the original request should be preserved in the disambiguation response and passed through on re-submit.

### Edge Case 4: Non-London Hotel

**Detection:** Booking.com URL has a country code other than `gb` in the path (`/hotel/fr/...`), or the semantic match confidence is < 0.70 for all results.
**Handling:** Show an info card: "This appears to be a hotel outside London. Our catalog currently covers London only." CTA: "Search for similar hotels in London" → switches to search tab with hotel name pre-filled.
**Implementation note:** The URL parser can detect the country code (non-`gb`) and set `source: 'unknown'` and return a special `hotelName: null` with an additional `isOutsideLondon: true` flag, or alternatively this check can be done in the client after parsing by inspecting the raw URL. The simplest approach is to check in `UrlAnalyzer.tsx`: if `parsedResult.source === 'booking'` and the URL pathname contains `/hotel/` but not `/hotel/gb/`, show the non-London message inline before submitting.

### Edge Case 5: Listed Price Out of Range

**Detection:** `listedPrice <= 0` or `listedPrice > 10000` (client-side before submit; also validated server-side).
**Handling:** `priceError` state in `UrlAnalyzer.tsx`. Inline error: "Please enter a realistic nightly rate (£1 – £10,000)."

### Edge Case 6: Model Price Below Threshold

**Detection:** `calculateDealScore()` returns `null` when `modelPrice < 30`.
**Handling:** The route handler should NOT return a matched response with a null deal score. Instead, treat this as a soft not-matched and return `UrlAnalysisNotMatched` with the `extractedName` populated and a `reason: 'model_unavailable'` flag (or just return not-matched — the client shows "We couldn't analyze the price for this hotel"). This avoids a client-side null guard on a required field.
**Risk:** Low probability. Likely only affects test/dummy data with unrealistic base rates.

### Edge Case 7: API Error (500)

**Detection:** `/api/url-analyze` returns non-OK status.
**Handling:** Render the existing `ErrorState` component in the URL analyzer results area with: "Something went wrong analyzing this URL. Please try again." and a "Try again" button that resubmits the last request parameters. The existing `ErrorState` component accepts `message` and `onRetry` props — compatible with no modifications.

### Edge Case 8: Stale Pinecone Index

**Detection:** `semanticMatch` finds a Pinecone ID with no corresponding Supabase row.
**Handling:** Log `console.warn` (per spec section 11). Skip the stale result silently — `semanticMatch` already filters out results where `hotel != null`. Do not return a 500 error.

### Risk: Embedding API Latency on Semantic Fallback

The semantic match path makes an OpenAI embedding API call, which adds ~100-300ms. This is acceptable since semantic match is a fallback only. However, if the embedding call fails (network error, quota), the route should catch the error and fall through to the not-matched response rather than returning a 500. Implement the semantic match in a try/catch block inside the route handler, not inside `hotel-matcher.ts`.

### Risk: Supabase `.or()` with Sanitized Keywords

The fuzzy match builds a Supabase `.or()` filter string programmatically. The `sanitizeKeyword()` function (strips all non-alphanumeric chars) prevents injection, but very short keywords (1-2 chars) after sanitization will produce wide matches. The `getKeywords()` function already filters keywords with `length > 1` after stripping stop words — ensure this filter runs AFTER sanitization to prevent 1-char sanitized remnants from making it through.

### Risk: Tab State and URL Analysis Result Coupling

The spec requires per-tab result preservation. Search results must not be cleared when switching to the URL analyzer tab, and vice versa. The implementation keeps both result states in `page.tsx` simultaneously and renders based on `activeTab`. The risk is that `isLoading` state from one tab bleeds into the other's display. Use separate `isLoading` flags: `isSearchLoading` and `isUrlAnalyzing` (both named distinctly).

---

## 8. Testing Strategy

### Unit Tests

**`src/lib/url-parser.ts`** — highest priority, pure functions, fully testable without mocks:
```
parseHotelUrl('https://www.booking.com/hotel/gb/the-savoy.en-gb.html')
  → { hotelName: 'The Savoy', source: 'booking', ... }

parseHotelUrl('https://www.booking.com/hotel/fr/le-meurice.fr.html')
  → { hotelName: 'Le Meurice', source: 'booking', originalUrl: '...', checkInDate: undefined }

parseHotelUrl('https://www.booking.com/hotel/gb/the-savoy.en-gb.html?checkin=2026-03-01')
  → { hotelName: 'The Savoy', source: 'booking', checkInDate: '2026-03-01' }

parseHotelUrl('https://www.hotels.com/ho12345/strand-palace-hotel/')
  → { hotelName: 'Strand Palace Hotel', source: 'hotels', ... }

parseHotelUrl('https://www.expedia.com/London-Hotels-The-Savoy.h12345.Hotel-Information')
  → { hotelName: 'The Savoy', source: 'expedia', ... }

parseHotelUrl('not-a-url')
  → { hotelName: null, source: 'unknown', ... }

parseHotelUrl('')
  → { hotelName: null, source: 'unknown', ... }
```

**`src/lib/deal-score.ts`** — pure function, test all threshold boundaries:
```
calculateDealScore(100, 100) → { label: 'Great Deal', direction: 'saving', savingsGbp: 0, percentageDiff: 0 }
calculateDealScore(100, 110) → { label: 'Great Deal', direction: 'saving', ... }
calculateDealScore(110, 100) → { label: 'Fair Price', direction: 'overpaying', percentageDiff: 10, savingsGbp: 10 }
calculateDealScore(111, 100) → { label: 'Overpriced', direction: 'overpaying', percentageDiff: 11 }
calculateDealScore(200, 20)  → null  // modelPrice < 30 guard
calculateDealScore(0, 100)   → { label: 'Great Deal', direction: 'saving', ... }
```

**`src/lib/currency.ts`** — test conversion and formatting:
```
convertToGbp(100, 'GBP') → 100
convertToGbp(100, 'USD') → 79
convertToGbp(100, 'EUR') → 86
formatWithOriginal(100, 'GBP') → '£100'
formatWithOriginal(350, 'USD') → '$350 (~£277)'
```

**`src/lib/hotel-matcher.ts`** — unit test `sanitizeKeyword` and `getKeywords` without Supabase:
```
sanitizeKeyword('the-savoy!') → 'thesavoy'  // strips non-alphanumeric
sanitizeKeyword('savoy') → 'savoy'
getKeywords('The Savoy Hotel London') → ['savoy']  // strips stop words
getKeywords('Park Plaza Westminster Bridge') → ['park', 'plaza', 'westminster', 'bridge']
```

Full `exactMatch`, `fuzzyMatch`, `semanticMatch` require integration tests (see below).

### Integration Tests

**`/api/url-analyze` route** — mock Supabase and Pinecone, test the full pipeline:
- Exact match found → returns `UrlAnalysisMatched` with `matchMethod: 'exact'`, `matchConfidence: 1.0`.
- Exact match fails, fuzzy match returns single confident result → `UrlAnalysisMatched` with `matchMethod: 'fuzzy'`.
- Fuzzy match returns two results within 0.05 confidence → `UrlAnalysisDisambiguation`.
- Fuzzy match fails, semantic match returns high-confidence result → `UrlAnalysisMatched` with `matchMethod: 'semantic'`.
- All matching fails → `UrlAnalysisNotMatched`.
- `listedPrice` out of range → 400 error.
- `currency` not in supported list → 400 error.

**`/api/insight` route modification** — test backward compatibility:
- Existing callers without `context` field → prompt unchanged, behavior unchanged.
- `context.mode === 'url-analysis'` → URL-analysis suffix appended to prompt.

### Component Tests

**`DealScoreGauge`** — test marker position calculation:
- 50% below model → `markerPosition ≈ 0`
- At model price → `markerPosition ≈ 50`
- 10% above model → `markerPosition ≈ 60`
- 50%+ above model → `markerPosition = 100` (clamped)
- `label: 'Great Deal'` → correct design token class applied to primary text
- `null` deal score → renders "Price analysis unavailable" fallback text

**`UrlAnalyzer`** — test URL paste behavior:
- Paste valid Booking.com URL → `hotelName` state updated, price input focused
- Paste invalid URL → inline error shown, hotel name input focused
- Submit with empty hotel name → validation error on hotel name field
- Submit with out-of-range price → validation error on price field
- Submit with all valid inputs → `onAnalyze` called with correct typed params

**`CheaperAlternatives`** — test filtering:
- `dealLabel: 'Overpriced'`, 3 competitors all cheaper than listed price → all 3 shown
- `dealLabel: 'Overpriced'`, 1 competitor cheaper, 2 more expensive → all 3 shown (fallback: fewer than 3 cheap results)
- `dealLabel: 'Great Deal'` → all 3 competitors shown regardless of price
- Price delta badges use `listedPriceGbp` as reference, not model price

**`TabNav`** — test:
- Active tab has `aria-selected="true"` and gold border class
- Clicking inactive tab calls `onTabChange` with correct value
- Both tabs always visible (no hiding)

### E2E / Manual Testing Checklist

- Paste Booking.com URL → hotel name extracts, price input auto-focuses.
- Enter price, click Check Price → loading skeleton appears.
- Matched result: deal score gauge visible, correct verdict, insight streams in.
- Switch to Search tab → search results still visible, not cleared.
- Switch back to URL tab → analysis result still visible, not cleared.
- Non-matched result: info card with hotel name, "Search for similar hotels" CTA works.
- Disambiguation: clicking a candidate triggers immediate re-analysis.
- Non-GBP price: both original and GBP amounts displayed, disclaimer visible.
- Mobile: competitor cards stack vertically, gauge is full-width.
- Error state: retry button resubmits, loading state re-enters.
