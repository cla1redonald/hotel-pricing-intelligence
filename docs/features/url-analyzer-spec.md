# Feature Spec: URL Price Analyzer

> **Status:** Ready for Build
> **Author:** @strategist
> **Date:** 2026-02-28
> **Reviewed by:** @designer (UI/UX), @architect (technical)
> **Depends on:** Threads 1-6 complete (search, pricing, competitive set, insight APIs all functional)

---

## 1. Purpose

Add a second entry point to the app: paste a Booking.com (or similar OTA) hotel URL and instantly see whether the listed price is a good deal, fair, or overpriced — compared to our pricing model. This extends the portfolio demo from "search for hotels" to "check any hotel you're already looking at," which is a more realistic user behavior and a stronger product signal.

---

## 2. User Flow (Step by Step)

### Step 1: User Pastes a URL

The user sees a new tab or input mode labeled "Check a Price" alongside the existing search box. They paste a URL like:

```
https://www.booking.com/hotel/gb/the-savoy.en-gb.html
```

A single input field with placeholder text: "Paste a Booking.com or hotel URL to check the price..."

The input field has a lucide `Link` icon on the left.

Below the input: a secondary field for the listed price (required), pre-filled if extractable from the URL, with a currency selector defaulting to GBP. After URL extraction completes successfully, auto-focus the price input field so the user can immediately type the listed price.

A "Check Price" button triggers the analysis.

### Step 2: Loading State

A single analysis card appears with a shimmer skeleton showing:
- Deal score gauge placeholder (horizontal bar outline)
- Hotel name placeholder
- Price comparison placeholder
- Three competitor card placeholders
- Insight placeholder

Loading message: "Matching hotel and running pricing model..."

### Step 3: Results — Hotel Matched

The analysis card renders with the following sections in order:

1. **Deal score verdict**: Large, prominent continuous gauge with savings amount and label (the centerpiece — users see the answer first)
2. **Hotel identity**: Name, neighborhood, star rating (from our catalog)
3. **Price comparison panel**: Listed price (from user input) vs. model price (from our engine), side by side
4. **Claude insight**: Streamed async, focused on the deal quality rather than generic booking advice (elevated from bottom to give AI context immediately after the price comparison)
5. **Price breakdown**: Expandable 4-factor breakdown (same component as search results)
6. **7-day projection chart**: Same component as search results
7. **Cheaper alternatives**: From the competitive set, filtered to only show hotels priced lower than the listed price. If no cheaper alternatives exist, show the 3 closest competitors with price comparison. Rendered as a **vertical stack on mobile**, horizontal row on desktop.

### Step 4: No Match Found

If the hotel cannot be matched to our catalog:
- Show the extracted hotel name with a message: "We don't have [Hotel Name] in our London catalog of 1,000+ hotels."
- Offer: "Try searching for similar hotels instead" with a pre-filled search query using the hotel name
- This is not an error state — it is a graceful dead end with a clear next action

---

## 3. Data Flow (Technical)

### 3.1 URL Parsing (Client-Side)

Extract the hotel name from the URL structure. This happens in a utility function `parseHotelUrl(url: string)` in `src/lib/url-parser.ts`.

**Supported URL patterns:**

| OTA | Pattern | Extraction Method |
|-----|---------|-------------------|
| Booking.com | `/hotel/gb/the-savoy.en-gb.html` | Path segment after `/hotel/{country}/`, strip locale suffix and file extension, replace hyphens with spaces, title-case |
| Hotels.com | `/ho123456/the-savoy/` | Path segment after `/ho\d+/`, replace hyphens with spaces, title-case |
| Expedia | `/London-Hotels-The-Savoy.h12345.Hotel-Information` | Extract between `Hotels-` and `.h\d+`, replace hyphens with spaces |
| Generic fallback | Any URL | Attempt to extract from page title via `<title>` tag if URL contains "hotel" in domain/path. Otherwise return null. |

The parser returns:

```typescript
interface ParsedUrl {
  hotelName: string | null;      // Extracted and cleaned hotel name
  source: 'booking' | 'hotels' | 'expedia' | 'generic' | 'unknown';
  originalUrl: string;
}
```

**Important:** URL parsing is best-effort. The user can always manually correct the extracted hotel name before submitting.

### 3.2 Hotel Matching (Server-Side)

New API route: `POST /api/url-analyze`

**Request body:**

```typescript
{
  hotelName: string;        // Cleaned hotel name (from parser or user-corrected)
  listedPrice: number;      // Price the user sees on the OTA
  currency: 'GBP' | 'USD' | 'EUR';  // Currency of listed price
  checkInDate?: string;     // ISO date string, defaults to today
  source?: string;          // OTA source: 'booking', 'hotels', 'expedia', 'generic', 'unknown'
}
```

**Matching strategy:**

1. **Exact match + Fuzzy match (in parallel)**: Run exact match (Supabase `ILIKE` on `hotels.name`) and fuzzy match (keyword-based Supabase query) concurrently via `Promise.all`. Exact match returns confidence 1.0. Fuzzy match scores by bidirectional keyword overlap. If exact match succeeds, use it immediately.

2. **Semantic match (fallback only)**: If neither exact nor fuzzy match produces a result with confidence >= 0.60, generate an embedding for the hotel name string using OpenAI `text-embedding-3-small`. Query Pinecone with `topK: 5`. Accept the top result if cosine similarity >= 0.85. Deduplicate against any fuzzy results by hotel ID before merging.

3. **No match**: If none of the above produce a confident match, return `{ matched: false, extractedName: hotelName }`.

**Why this order:** Exact and fuzzy matches are cheaper (no embedding API call) and more reliable for well-known hotels. Running them in parallel cuts ~80ms from the critical path. Semantic match is the fallback for name variations ("The Savoy" vs "Savoy Hotel London" vs "Fairmont The Savoy").

**Disambiguation logic:** After collecting all match results (exact, fuzzy, and optionally semantic), if the top 2 results are within 5% confidence of each other (e.g., 0.82 and 0.79), return a disambiguation response with up to 3 candidates. Otherwise, return the single top result as the match. See section 8 for the route handler implementation.

**Match response:**

```typescript
// Discriminated union response type
type UrlAnalysisResponse =
  | UrlAnalysisMatched
  | UrlAnalysisNotMatched
  | UrlAnalysisDisambiguation;

interface UrlAnalysisMatched {
  matched: true;
  extractedName: string;
  source?: string;              // OTA source passed through from request
  matchedHotel: Hotel;
  matchMethod: 'exact' | 'fuzzy' | 'semantic';
  matchConfidence: number;      // 0-1, how confident the match is
  modelPrice: number;           // Our pricing engine's price
  listedPrice: number;          // What the user provided
  listedPriceGbp: number;      // Converted to GBP
  currency: 'GBP' | 'USD' | 'EUR';
  dealScore: DealScore;
  pricingBreakdown: PricingBreakdown;
  projection: ProjectionPoint[];
}

interface UrlAnalysisNotMatched {
  matched: false;
  extractedName: string;
  source?: string;
  listedPrice: number;
  listedPriceGbp: number;
  currency: 'GBP' | 'USD' | 'EUR';
}

interface UrlAnalysisDisambiguation {
  matched: false;
  extractedName: string;
  source?: string;
  listedPrice: number;
  listedPriceGbp: number;
  currency: 'GBP' | 'USD' | 'EUR';
  disambiguation: Array<{
    hotel: Hotel;
    confidence: number;
    priceRange?: { min: number; max: number };  // Recent price range in GBP
  }>;
}
```

### 3.3 Currency Conversion

For non-GBP prices, convert to GBP using hardcoded approximate rates (this is a portfolio demo, not a forex service):

```typescript
// src/lib/currency.ts

// Conversion factors TO GBP (multiply foreign amount by this to get GBP)
// e.g., $100 USD * 0.79 = £79 GBP
const TO_GBP: Record<string, number> = {
  GBP: 1.0,
  USD: 0.79,  // 1 USD = 0.79 GBP
  EUR: 0.86,  // 1 EUR = 0.86 GBP
};
```

Display both the original currency amount and the GBP equivalent: "Listed at $350 (~£277)".

Store rates in `src/lib/currency.ts`. Add a disclaimer: "Exchange rates are approximate."

### 3.4 Deal Score Calculation

Performed server-side in `/api/url-analyze` after matching and pricing.

```typescript
interface DealScore {
  label: 'Great Deal' | 'Fair Price' | 'Overpriced';
  percentageDiff: number;       // Absolute percentage difference (always positive)
  savingsGbp: number;           // Always positive — use `direction` for sign
  direction: 'saving' | 'overpaying';  // Whether user saves or overpays vs. model
}
```

**Design system token mapping for deal score colors:**

| Label | Token | Resolved Color |
|-------|-------|----------------|
| Great Deal | `--discount` | Green |
| Fair Price | `--neutral` | Amber |
| Overpriced | `--premium` | Red |

Do not hardcode hex colors. Always reference the design system tokens.

**Thresholds:**

| Condition | Label | Token | Explanation |
|-----------|-------|-------|-------------|
| `listedPriceGbp <= modelPrice` | Great Deal | `--discount` | Listed price is at or below what our model predicts. The user is getting at least fair value. |
| `listedPriceGbp <= modelPrice * 1.10` | Fair Price | `--neutral` | Within 10% of model price. Reasonable, no urgency to switch. |
| `listedPriceGbp > modelPrice * 1.10` | Overpriced | `--premium` | More than 10% above model price. The user is likely paying a premium. |

**Display format:** Lead with the pounds savings/overpayment amount ("Save £52 per night"), with the percentage in smaller secondary text ("17% below model"). For overpriced results, use "Overpriced by 17%" — do not use a positive sign convention like "+17%".

**Edge case — model price is very low:** If `modelPrice < 30` (unrealistically low, likely data issue), do not display a deal score. Show "Price analysis unavailable for this hotel" instead.

### 3.5 Competitive Set (Reuse Existing)

After matching, call the existing `/api/competitive-set` endpoint with the matched hotel's `pineconeId` and `checkInDate`. From the 3 competitors returned, filter and sort:

- For "Overpriced" results: Show only competitors priced below the listed price (cheaper alternatives). If fewer than 3, show all competitors.
- For "Great Deal" / "Fair Price" results: Show all 3 competitors with price deltas vs. the listed price (not vs. model price).

### 3.6 Claude Insight (Reuse Existing, Modified Prompt)

Call the existing `/api/insight` endpoint, but the prompt context should be adjusted for URL analysis mode. The API route does not need modification; the client simply sends different framing in the `competitors` and pricing data.

**What the insight prompt should focus on (URL Analyzer mode):**

The insight should answer: "Is this a good price for what you're getting?" rather than the generic "Should you book now or wait?" from search mode.

Specifically, the prompt should:
1. Reference the specific OTA source and listed price ("The £285 you're seeing on Booking.com for The Savoy...")
2. Explain WHY the price is above/below/at model price by referencing the dominant pricing factor (e.g., "...is above our model price primarily because you're booking last-minute, which adds a 1.25x premium")
3. If overpriced, name a specific cheaper alternative from the competitive set with its price
4. If a great deal, affirm the find and note what factors are working in the user's favor
5. Never use more than 2 sentences

The client constructs the prompt by adding a `mode: 'url-analysis'` context field. Since the existing `/api/insight` route accepts freeform `hotelName`, `dynamicPrice`, `pricingBreakdown`, and `competitors`, the client can frame the data accordingly without API changes. However, to get the right prompt tone, add an optional `context` field to the insight request:

```typescript
// Addition to InsightRequest
context?: {
  mode: 'search' | 'url-analysis';
  listedPrice?: number;
  source?: string;  // 'booking', 'expedia', etc.
};
```

When `mode === 'url-analysis'`, the insight route appends to the prompt:

```
The user found this hotel listed at £{listedPrice} on {source}. Our pricing model values it at £{modelPrice}. Focus your advice on whether this specific listed price represents good value, and reference the most impactful pricing factor driving the difference.
```

---

## 4. Edge Cases

### 4.1 URL Cannot Be Parsed

- **Detection:** `parseHotelUrl()` returns `hotelName: null`
- **UX:** Show inline validation below the URL input: "We couldn't extract a hotel name from this URL. Please enter the hotel name manually."
- **Reveal:** A text input for manual hotel name entry, pre-focused
- The URL input remains filled so the user can see what they pasted

### 4.2 Hotel Not in Catalog

- **Detection:** `/api/url-analyze` returns `matched: false`
- **UX:** Show an info card (not an error) with:
  - "We don't have [Hotel Name] in our catalog of 1,000+ London hotels."
  - "This could mean it's a very new property, uses a different name on our source data, or is outside central London."
  - CTA button: "Search for similar hotels" — pre-fills the search box with the hotel name and switches to the Search tab
- **Do not:** Show a red error state. This is expected behavior for ~20% of lookups.

### 4.3 Price in Wrong Currency

- **Detection:** User selects non-GBP currency
- **UX:** Show both original and converted price. Add footnote: "Converted at approximate rate. Actual rate may vary."
- **Calculation:** All deal score math uses the GBP-converted price

### 4.4 Listed Price is Unrealistic

- **Detection:** `listedPrice <= 0` or `listedPrice > 10000`
- **UX:** Inline validation: "Please enter a realistic nightly rate (£1 - £10,000)"

### 4.5 Multiple Potential Matches

- **Detection:** Fuzzy or semantic match returns multiple results with similar confidence (top 2 within 5% confidence of each other)
- **UX:** Show a disambiguation card: "We found multiple hotels that could match. Did you mean:"
  - List top 3 candidates with name, neighborhood, star rating, and **recent price range** (e.g., "£180 – £245/night")
  - User clicks one to **immediately trigger analysis** with the selected hotel (no second "Check Price" button press required)
- This avoids showing confidently wrong results

### 4.6 Booking.com URL with Dates/Rates in Query String

- **Detection:** URL contains `checkin=`, `checkout=`, query parameters
- **Action:** Extract check-in date from URL if present and pre-fill the date picker. Do NOT attempt to extract price from query string (prices in URLs are often stale or session-specific).

### 4.7 Non-London Hotel

- **Detection:** URL parsing extracts a hotel name, but the country code in the URL is not `gb`, or the semantic match returns results with very low confidence (< 0.70)
- **UX:** "This appears to be a hotel outside London. Our catalog currently covers London only."
- **CTA:** "Search for similar hotels in London" — pre-fills the search box with the hotel name keywords and switches to the Search tab. This provides a constructive next step instead of a dead end.

### 4.8 API Error

- **Detection:** `/api/url-analyze` returns a 500 error
- **UX:** Render the existing `ErrorState` component with the message: "Something went wrong analyzing this URL. Please try again." Include a "Retry" button that resubmits the same request.

---

## 5. UI Layout

### 5.1 Location: Tabbed Interface on the Main Page

Add a two-tab layout within the existing hero/header section:

```
[ Search Hotels ]  [ Check a Price ]
```

- **"Search Hotels"** tab contains the existing search box and date picker (current behavior, unchanged)
- **"Check a Price"** tab contains the URL analyzer input

Tabs use the existing design language (navy-950 background, gold accents). The active tab has a gold underline indicator.

The results section below the header is shared — it renders either search results or URL analysis results depending on which tab is active. Only one can be active at a time. **Switching tabs preserves the last result for each tab.** Results are only cleared when the user submits a new query in the active tab. This prevents losing analysis state when switching back and forth.

### 5.2 "Check a Price" Tab Layout

```
+------------------------------------------------------------------+
| [Link icon] [URL Input: "Paste a Booking.com or hotel URL..."]   |
+------------------------------------------------------------------+
| [Hotel Name]  (auto-filled, editable)    [Currency: GBP v]       |
| [Listed Price: £___]                     [Check-in: Feb 28 v]    |
|                                                                  |
|                        [ Check Price ]                           |
+------------------------------------------------------------------+
```

- URL input is full-width, prominent, with a lucide `Link` icon on the left
- Hotel name auto-fills on valid URL paste (with a brief "Extracted: The Savoy" confirmation)
- Hotel name is always editable (user can correct extraction errors)
- After URL extraction completes, auto-focus the price input field
- Listed price and currency are side by side on mobile, inline on desktop
- Check-in date reuses the existing `DatePicker` component
- "Check Price" button uses the same gold/navy styling as "Search"

### 5.3 Analysis Result Card Layout

Single card, wider than search result cards (spans full width on desktop, max-width 720px centered):

```
+------------------------------------------------------------------+
|  +------------------------------------------------------+        |
|  |        OVERPRICED BY 17%                              |        |
|  |   [============================|======] gauge         |        |
|  |         50% below        Model Price    50% above     |        |
|  |                                                       |        |
|  |   £52 per night more than model                       |        |
|  |   17% above model price                               |        |
|  +------------------------------------------------------+        |
|                                                                  |
|  THE SAVOY                                    ★★★★★              |
|  The Strand, Westminster                                         |
|                                                                  |
|  +-------------------+    +--------------------+                 |
|  | LISTED PRICE      |    | OUR MODEL PRICE    |                 |
|  | £350              |    | £298               |                 |
|  | on Booking.com    |    | for tonight        |                 |
|  +-------------------+    +--------------------+                 |
|                                                                  |
|  --- AI INSIGHT ---                                              |
|  "The £350 you're seeing on Booking.com is 17% above our        |
|   model price, driven mainly by last-minute booking (1.25x).     |
|   The Strand Palace nearby offers similar quality at £245."      |
|                                                                  |
|  [v] Price Breakdown   (expandable, same component)              |
|  [    ] 7-Day Projection Chart (same component)                  |
|                                                                  |
|  --- CHEAPER ALTERNATIVES ---                                    |
|  +------------------------------------------------------+        |
|  | Strand Palace Hotel              £245/night  (-£105)  |        |
|  +------------------------------------------------------+        |
|  | ME London                        £278/night  (-£72)   |        |
|  +------------------------------------------------------+        |
|  | One Aldwych                      £312/night  (-£38)   |        |
|  +------------------------------------------------------+        |
+------------------------------------------------------------------+
```

**Match confidence display:** For high-confidence matches (>= 0.90), the match method and confidence are shown as a **tooltip** on the hotel name (hover/tap to see "Matched via semantic search, 92% confidence"). For lower-confidence matches (< 0.90), show an inline badge below the hotel name: "Matched via fuzzy search (78% confidence)".

**Competitor cards:** On mobile, competitor cards render as a **vertical stack** (full-width cards stacked top to bottom). On desktop, they render as a horizontal row. No horizontal scrolling on mobile.

### 5.4 Deal Score Visual

The deal score is the centerpiece of the analysis — it appears first in the card. Render it as a **continuous horizontal gauge** with a positioned marker:

**Gauge design:**
- The track represents a continuous scale from "50% below model price" (left) to "50% above model price" (right)
- The center of the track is labeled "Model Price"
- A **marker** (triangle or dot) is positioned on the track at the listed price's position relative to the model price
- The track is filled with a gradient that transitions from `--discount` (green, left) through `--neutral` (amber, center) to `--premium` (red, right)
- The marker's position is calculated as: `position = 50 + (percentageDiff / 50 * 50)` clamped to 0-100

**Text display:**
- **Primary label** (large, 24px+): "Overpriced by 17%" / "Great Deal" / "Fair Price". No positive sign convention — use "Overpriced by X%" for overpriced, "X% below model" for deals.
- **Savings line** (prominent): Lead with pounds first: "£52 per night more than model" or "Save £52 per night". Percentage in smaller secondary text below.

**Mobile layout (stacked):**
- Deal score label (full width, large text)
- Savings amount (full width)
- Gauge bar (full width, horizontal)
- Labels below the bar ("50% below" left, "Model" center, "50% above" right)

This replaces the previous 3-bucket (green/amber/red) design with a continuous scale that communicates degree, not just category.

### 5.5 Responsive Behavior

- **Mobile:** All elements stack vertically. Price comparison becomes vertical (listed price above model price). Competitor cards stack vertically (no horizontal scroll). Deal score gauge uses stacked layout (label, savings, full-width bar).
- **Tablet:** Two-column price comparison. Competitor cards in a row.
- **Desktop:** Full layout as shown above. Max-width 720px centered.

---

## 6. New Types

Add to `src/types/index.ts`:

```typescript
export interface ParsedUrl {
  hotelName: string | null;
  source: 'booking' | 'hotels' | 'expedia' | 'generic' | 'unknown';
  originalUrl: string;
  checkInDate?: string;  // Extracted from URL if present
}

export interface DealScore {
  label: 'Great Deal' | 'Fair Price' | 'Overpriced';
  percentageDiff: number;       // Absolute percentage difference (always positive)
  savingsGbp: number;           // Always positive — use `direction` for sign
  direction: 'saving' | 'overpaying';
}

// Discriminated union response type
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

## 7. New Files

| File | Purpose |
|------|---------|
| `src/lib/url-parser.ts` | `parseHotelUrl(url)` — client-side URL extraction |
| `src/lib/currency.ts` | `TO_GBP` conversion constants and `convertToGbp(amount, currency)` |
| `src/lib/hotel-matcher.ts` | Server-side matching logic (exact, fuzzy, semantic) with `sanitizeKeyword()` |
| `src/lib/deal-score.ts` | `calculateDealScore(listedPriceGbp, modelPrice)` returning `DealScore` with `direction` |
| `src/app/api/url-analyze/route.ts` | API route orchestrating match + price + score |
| `src/components/UrlAnalyzer.tsx` | "Check a Price" tab content (input form) |
| `src/components/AnalysisCard.tsx` | Full analysis result display |
| `src/components/DealScoreGauge.tsx` | Continuous deal score gauge visualization |
| `src/components/PriceComparison.tsx` | Side-by-side listed vs. model price |
| `src/components/CheaperAlternatives.tsx` | Filtered competitive set for URL mode (vertical stack on mobile) |
| `src/components/TabNav.tsx` | Two-tab navigation (Search / Check a Price) with per-tab result preservation |

### Modified Files

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `ParsedUrl`, `DealScore`, `UrlAnalysisResponse` (discriminated union), and related types |
| `src/app/page.tsx` | Add tab state with per-tab result preservation, render `TabNav`, conditionally render search or URL analyzer |
| `src/app/api/insight/route.ts` | Add optional `context` field to request; append URL-analysis prompt when `mode === 'url-analysis'` |

---

## 8. API Route: `/api/url-analyze`

### Request

```
POST /api/url-analyze
Content-Type: application/json

{
  "hotelName": "The Savoy",
  "listedPrice": 350,
  "currency": "GBP",
  "checkInDate": "2026-03-01",
  "source": "booking"
}
```

### Route Handler Logic

```typescript
// Pseudocode for the route handler

export async function POST(req: Request) {
  const { hotelName, listedPrice, currency, checkInDate, source } = await req.json();

  // 1. Validate input
  // ... (400 for missing fields, invalid currency, unrealistic price)

  // 2. Convert price to GBP
  const listedPriceGbp = convertToGbp(listedPrice, currency);

  // 3. Run exact + fuzzy match in PARALLEL
  const [exactResult, fuzzyResults] = await Promise.all([
    exactMatch(hotelName, supabase),
    fuzzyMatch(hotelName, supabase),
  ]);

  // 4. If exact match found, use it immediately
  if (exactResult) {
    // ... calculate deal score, return matched response with source
  }

  // 5. Evaluate fuzzy results
  // Sort by confidence descending
  const sortedFuzzy = fuzzyResults.sort((a, b) => b.confidence - a.confidence);

  if (sortedFuzzy.length >= 2) {
    const [first, second] = sortedFuzzy;
    // DISAMBIGUATION: if top 2 are within 5% confidence of each other
    if (first.confidence - second.confidence <= 0.05) {
      return Response.json({
        matched: false,
        extractedName: hotelName,
        source,
        listedPrice,
        listedPriceGbp,
        currency,
        disambiguation: sortedFuzzy.slice(0, 3).map(r => ({
          hotel: r.hotel,
          confidence: r.confidence,
          priceRange: r.hotel.priceRange ?? undefined,
        })),
      });
    }
  }

  // 6. If best fuzzy result is confident enough, use it
  if (sortedFuzzy.length > 0 && sortedFuzzy[0].confidence >= 0.60) {
    // ... calculate deal score, return matched response with source
  }

  // 7. Fallback: semantic match
  const semanticResults = await semanticMatch(hotelName, generateEmbedding, pineconeIndex, supabase);

  // Deduplicate: remove any semantic result whose hotel ID already appeared in fuzzy results
  const fuzzyHotelIds = new Set(sortedFuzzy.map(r => r.hotel.id));
  const uniqueSemantic = semanticResults.filter(r => !fuzzyHotelIds.has(r.hotel.id));

  // Merge and re-evaluate for disambiguation
  const allResults = [...sortedFuzzy, ...uniqueSemantic].sort((a, b) => b.confidence - a.confidence);

  if (allResults.length >= 2) {
    const [first, second] = allResults;
    if (first.confidence - second.confidence <= 0.05) {
      return Response.json({
        matched: false,
        extractedName: hotelName,
        source,
        // ... disambiguation response
      });
    }
  }

  if (allResults.length > 0 && allResults[0].confidence >= 0.60) {
    // ... calculate deal score, return matched response with source
  }

  // 8. No match
  return Response.json({
    matched: false,
    extractedName: hotelName,
    source,
    listedPrice,
    listedPriceGbp,
    currency,
  });
}
```

### Response (matched)

```json
{
  "matched": true,
  "extractedName": "The Savoy",
  "source": "booking",
  "matchMethod": "exact",
  "matchConfidence": 1.0,
  "matchedHotel": { "id": "...", "name": "The Savoy", "..." : "..." },
  "modelPrice": 298.45,
  "listedPrice": 350,
  "listedPriceGbp": 350,
  "currency": "GBP",
  "dealScore": {
    "label": "Overpriced",
    "percentageDiff": 17.3,
    "savingsGbp": 51.55,
    "direction": "overpaying"
  },
  "pricingBreakdown": {
    "baseRate": 250,
    "demandMultiplier": 1.05,
    "seasonalityMultiplier": 0.95,
    "leadTimeMultiplier": 1.20,
    "dayOfWeekMultiplier": 1.00,
    "finalPrice": 298.45
  },
  "projection": [ "..." ]
}
```

### Response (not matched)

```json
{
  "matched": false,
  "extractedName": "Some Boutique Hotel",
  "source": "booking",
  "listedPrice": 200,
  "listedPriceGbp": 200,
  "currency": "GBP"
}
```

### Response (disambiguation needed)

```json
{
  "matched": false,
  "extractedName": "Park Hotel",
  "source": "booking",
  "listedPrice": 180,
  "listedPriceGbp": 180,
  "currency": "GBP",
  "disambiguation": [
    { "hotel": { "name": "Park Plaza Westminster", "..." : "..." }, "confidence": 0.82, "priceRange": { "min": 165, "max": 240 } },
    { "hotel": { "name": "Park Grand London", "..." : "..." }, "confidence": 0.79, "priceRange": { "min": 120, "max": 195 } },
    { "hotel": { "name": "Hyde Park Hotel", "..." : "..." }, "confidence": 0.76, "priceRange": { "min": 210, "max": 310 } }
  ]
}
```

---

## 9. Deal Score Calculation — Implementation Reference

```typescript
// src/lib/deal-score.ts

import type { DealScore } from '@/types';

export function calculateDealScore(
  listedPriceGbp: number,
  modelPrice: number,
): DealScore | null {
  // Guard against unrealistic model prices
  if (modelPrice < 30) return null;

  const diff = listedPriceGbp - modelPrice;
  const percentageDiff = Math.abs((diff / modelPrice) * 100);
  const savingsGbp = Math.abs(diff);
  const direction: 'saving' | 'overpaying' = diff <= 0 ? 'saving' : 'overpaying';

  if (listedPriceGbp <= modelPrice) {
    return {
      label: 'Great Deal',
      percentageDiff: Math.round(percentageDiff * 10) / 10,
      savingsGbp: Math.round(savingsGbp * 100) / 100,
      direction,
    };
  }

  if (listedPriceGbp <= modelPrice * 1.10) {
    return {
      label: 'Fair Price',
      percentageDiff: Math.round(percentageDiff * 10) / 10,
      savingsGbp: Math.round(savingsGbp * 100) / 100,
      direction,
    };
  }

  return {
    label: 'Overpriced',
    percentageDiff: Math.round(percentageDiff * 10) / 10,
    savingsGbp: Math.round(savingsGbp * 100) / 100,
    direction,
  };
}
```

---

## 10. URL Parser — Implementation Reference

```typescript
// src/lib/url-parser.ts

import type { ParsedUrl } from '@/types';

function titleCase(str: string): string {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function parseHotelUrl(url: string): ParsedUrl {
  const result: ParsedUrl = {
    hotelName: null,
    source: 'unknown',
    originalUrl: url,
  };

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // Booking.com: /hotel/gb/the-savoy.en-gb.html
    if (hostname.includes('booking.com')) {
      result.source = 'booking';
      const match = pathname.match(/\/hotel\/[a-z]{2}\/([^/.]+)/);
      if (match) {
        const slug = match[1]
          .replace(/\.[a-z]{2}-[a-z]{2}$/, '')  // strip .en-gb
          .replace(/-/g, ' ');
        result.hotelName = titleCase(slug);
      }

      // Extract check-in date from query string
      const checkin = parsed.searchParams.get('checkin');
      if (checkin && /^\d{4}-\d{2}-\d{2}$/.test(checkin)) {
        result.checkInDate = checkin;
      }
    }

    // Hotels.com: /ho123456/the-savoy/
    else if (hostname.includes('hotels.com')) {
      result.source = 'hotels';
      const match = pathname.match(/\/ho\d+\/([^/]+)/);
      if (match) {
        result.hotelName = titleCase(match[1].replace(/-/g, ' '));
      }
    }

    // Expedia: /London-Hotels-The-Savoy.h12345.Hotel-Information
    else if (hostname.includes('expedia')) {
      result.source = 'expedia';
      const match = pathname.match(/Hotels?-(.+?)\.h\d+/);
      if (match) {
        result.hotelName = titleCase(match[1].replace(/-/g, ' '));
      }
    }

    // Generic: try path segments
    else {
      result.source = 'generic';
      // Best-effort: look for longest path segment that could be a hotel name
      const segments = pathname.split('/').filter(s => s.length > 3);
      if (segments.length > 0) {
        const best = segments
          .map(s => s.replace(/[-_]/g, ' ').replace(/\.\w+$/, ''))
          .sort((a, b) => b.length - a.length)[0];
        if (best && best.length > 3) {
          result.hotelName = titleCase(best);
        }
      }
    }
  } catch {
    // Invalid URL — hotelName remains null
  }

  return result;
}
```

---

## 11. Hotel Matcher — Implementation Reference

```typescript
// src/lib/hotel-matcher.ts

import type { Hotel } from '@/types';

// Words to strip from hotel names for matching
const STOP_WORDS = new Set([
  'hotel', 'hotels', 'london', 'the', 'a', 'an', 'by', 'at', 'in',
  'and', '&', 'of', 'resort', 'suites', 'suite',
]);

function normalizeForMatch(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Sanitize a keyword for safe use in database queries.
 * Strips all non-alphanumeric characters (except spaces) to prevent
 * SQL injection and malformed ILIKE patterns.
 */
function sanitizeKeyword(keyword: string): string {
  return keyword.replace(/[^a-zA-Z0-9\s]/g, '').trim();
}

function getKeywords(name: string): string[] {
  return normalizeForMatch(name)
    .split(/\s+/)
    .map(w => sanitizeKeyword(w))
    .filter(w => !STOP_WORDS.has(w) && w.length > 1);
}

/**
 * Step 1: Exact match (case-insensitive) via Supabase ILIKE.
 */
export async function exactMatch(
  hotelName: string,
  supabase: SupabaseClient,
): Promise<{ hotel: Hotel; confidence: number } | null> {
  const { data } = await supabase
    .from('hotels')
    .select('*')
    .ilike('name', normalizeForMatch(hotelName))
    .limit(1);

  if (data && data.length > 0) {
    return { hotel: data[0] as Hotel, confidence: 1.0 };
  }
  return null;
}

/**
 * Step 2: Fuzzy keyword match. Query Supabase for hotels containing
 * the most distinctive keywords. Score by bidirectional keyword overlap
 * using a Jaccard-like metric.
 */
export async function fuzzyMatch(
  hotelName: string,
  supabase: SupabaseClient,
): Promise<Array<{ hotel: Hotel; confidence: number }>> {
  const keywords = getKeywords(hotelName).slice(0, 3);
  if (keywords.length === 0) return [];

  // Build OR query: name ILIKE '%keyword1%' OR name ILIKE '%keyword2%' ...
  // All keywords are sanitized via sanitizeKeyword() to prevent injection
  const conditions = keywords.map(kw => `name.ilike.%${kw}%`).join(',');
  const { data } = await supabase
    .from('hotels')
    .select('*')
    .or(conditions)
    .limit(10);

  if (!data || data.length === 0) return [];

  // Score each result by bidirectional keyword overlap (Jaccard-like)
  return data.map(hotel => {
    const hotelKeywords = getKeywords((hotel as Hotel).name);
    const overlap = keywords.filter(kw =>
      hotelKeywords.some(hkw => hkw.includes(kw) || kw.includes(hkw))
    ).length;
    // Bidirectional: divide by the LARGER keyword set to penalize partial matches
    const confidence = overlap / Math.max(keywords.length, hotelKeywords.length);
    return { hotel: hotel as Hotel, confidence };
  })
  .filter(r => r.confidence >= 0.6)
  .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Step 3: Semantic match via Pinecone embedding search.
 * Only called as fallback when exact + fuzzy fail.
 */
export async function semanticMatch(
  hotelName: string,
  generateEmbedding: (text: string) => Promise<number[]>,
  pineconeIndex: PineconeIndex,
  supabase: SupabaseClient,
): Promise<Array<{ hotel: Hotel; confidence: number }>> {
  const vector = await generateEmbedding(hotelName);
  const response = await pineconeIndex.query({
    vector,
    topK: 5,
    includeMetadata: true,
  });

  const matches = (response.matches ?? []).filter(m => (m.score ?? 0) >= 0.85);
  if (matches.length === 0) return [];

  const pineconeIds = matches.map(m => m.id);
  const { data } = await supabase
    .from('hotels')
    .select('*')
    .in('pinecone_id', pineconeIds);

  if (!data) return [];

  const hotelMap = new Map<string, Hotel>();
  for (const h of data) {
    hotelMap.set((h as Hotel).pinecone_id, h as Hotel);
  }

  // Log warning for Pinecone matches with no corresponding Supabase row
  for (const m of matches) {
    if (!hotelMap.has(m.id)) {
      console.warn(
        `[hotel-matcher] Pinecone returned match id="${m.id}" (score=${m.score}) ` +
        `but no corresponding row found in Supabase hotels table. ` +
        `This may indicate a stale Pinecone index or deleted hotel record.`
      );
    }
  }

  return matches
    .map(m => ({
      hotel: hotelMap.get(m.id)!,
      confidence: m.score ?? 0,
    }))
    .filter(r => r.hotel != null);
}
```

---

## 12. Insight Prompt — URL Analysis Mode

When the insight API is called in URL analysis mode, the prompt should be modified to produce deal-focused advice instead of generic booking advice.

**Standard search mode prompt** (existing, unchanged):
> "You are a hotel pricing analyst. Given [hotel] at [price] with [breakdown], compared to [competitors], provide 1-2 sentences of booking advice."

**URL analysis mode prompt** (new):
> "You are a hotel pricing analyst. A user is looking at {hotelName} listed at {listedPrice} on {source}. Our pricing model values this hotel at {modelPrice} tonight (deal score: {dealLabel}, {percentageDiff}% difference). The main pricing factors are: demand {demandMultiplier}x, seasonality {seasonalityMultiplier}x, lead time {leadTimeMultiplier}x, day-of-week {dayOfWeekMultiplier}x. Competitors: {competitorLines}. In 1-2 sentences, tell the user whether this listed price is worth paying. Reference the most impactful pricing factor and name a specific cheaper alternative if the price is above model."

**Key differences from search mode:**
1. References the OTA source and listed price explicitly
2. Frames advice around "is this price worth it" rather than "should you book"
3. Identifies the dominant factor (highest multiplier) as the explanation
4. Only suggests alternatives when the deal score is amber or red

---

## 13. Testing Plan

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/url-parser.test.ts` | All URL patterns (booking, hotels, expedia, generic, invalid). Check-in date extraction. Edge cases: malformed URLs, missing path segments, non-hotel URLs. |
| `src/__tests__/deal-score.test.ts` | All 3 score categories. Boundary conditions (exactly at threshold). Null return for low model price. Percentage and savings calculation accuracy. `direction` field correctness for saving vs. overpaying. `savingsGbp` is always positive. |
| `src/__tests__/currency.test.ts` | GBP passthrough. USD and EUR conversion using `TO_GBP` constants. Unknown currency handling. |
| `src/__tests__/hotel-matcher.test.ts` | Exact match returns confidence 1.0. Fuzzy match keyword extraction and scoring with bidirectional Jaccard overlap. `sanitizeKeyword` strips non-alphanumeric characters. Stop word filtering. Empty input handling. Deduplication between fuzzy and semantic results. Warning logged for Pinecone match with no Supabase row. |

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/url-analyze-api.test.ts` | Full request/response cycle. `source` field passed through in request and response. Missing fields return 400. Valid request with known hotel returns match + score. Invalid currency returns 400. Disambiguation returned when top 2 within 5% confidence. Exact + fuzzy run in parallel. Semantic only called as fallback. 5-second timeout returns best available result. |

### Component Tests

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/url-analyzer-ui.test.ts` | URL input renders with lucide Link icon. Paste triggers extraction. Hotel name auto-fills. Price input auto-focuses after extraction. Price input validates range. Currency selector works. Tab switching preserves last result per tab. Deal score gauge renders continuous scale with correct token colors (`--discount`, `--neutral`, `--premium`). Deal score shows "Overpriced by X%" not "+X%". Savings amount leads display, percentage is secondary. Analysis card renders sections in correct order (deal score first). No-match state renders correctly with redirect CTA. Non-London hotel shows "Search for similar hotels in London" CTA. Disambiguation state renders candidate list with price ranges. Disambiguation click immediately triggers analysis. Mobile competitor cards stack vertically. Mobile deal score uses stacked layout. Match confidence tooltip for >= 0.90, inline badge for < 0.90. ErrorState rendered for 500 errors. Max-width is 720px. |

---

## 14. Performance Considerations

- **URL parsing is client-side only** — no network call needed. Should be instant.
- **Hotel matching (parallel first stage):** Exact match + Fuzzy match run in parallel via `Promise.all` (1 Supabase query each, ~80ms combined). If neither produces a confident result, semantic match runs as fallback (1 OpenAI call + 1 Pinecone query + 1 Supabase query, ~500ms). Best case: ~80ms. Worst case (semantic fallback): ~580ms.
- **Overall request timeout:** 5-second timeout wraps the entire matching pipeline. If semantic match times out, return the best fuzzy result (if any) or a "no match" response. Never leave the user waiting indefinitely.
- **Total latency budget:** Match (~80-580ms) + Price calculation (~5ms, pure math) + Projection (~5ms) = ~90-590ms before the analysis card renders. Competitive set and insight stream in async after.
- **Do not call all three match strategies in parallel.** Exact + fuzzy run together (both are cheap Supabase queries), but semantic match is deferred as a fallback — it requires an embedding API call that costs money and adds latency. Skipping it when exact/fuzzy succeed saves cost and time.

---

## 15. Scope Boundaries

### In Scope

- URL parsing for 3 major OTAs + generic fallback
- Hotel name matching (exact, fuzzy, semantic) with parallel exact+fuzzy and semantic fallback
- Deal score calculation with continuous gauge and absolute savings + direction
- Reuse of existing competitive set and insight APIs
- Tab-based UI integration with per-tab result preservation
- Currency conversion (GBP/USD/EUR only) using `TO_GBP` constants
- Disambiguation when multiple matches are close (within 5% confidence) with price ranges
- Input sanitization via `sanitizeKeyword` in hotel matcher
- 5-second overall request timeout
- `source` field passthrough from request to response
- ErrorState component for API failures
- Non-London hotel redirect CTA
- Design system token mapping for deal score colors

### Out of Scope

- Scraping actual prices from OTA URLs (legal and technical issues)
- Browser extension or bookmarklet
- Price history tracking
- Alerts when a deal becomes available
- Support for non-London hotels
- Real-time exchange rates
- OTA affiliate links or booking redirects
