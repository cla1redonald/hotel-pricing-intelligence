# Security Review & Code Audit: AI Hotel Pricing Intelligence

> **Reviewer:** @reviewer (ShipIt)
> **Date:** 2026-02-28
> **Scope:** Full codebase review — 3 API routes, 12 components, 7 lib modules, 1 type file
> **Commit:** `af3a535` (HEAD of main)

---

## Summary

The app is well-built for a portfolio project. Security fundamentals are solid: API keys are server-side only, input validation exists on all routes, no XSS vectors, no SQL injection paths, and rate limiting is present. The main concerns are around cost amplification (no per-IP limits on expensive Claude/OpenAI calls beyond a generous rate limit), in-memory rate limiting that resets on cold starts, and a Supabase anon key that could be extracted from server bundles if Vercel function source maps leak. Nothing blocks shipping, but several items should be addressed before the app sees real traffic.

---

## PRD Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| Natural language semantic search via single search box | Delivered | |
| OpenAI embedding generation for query vectors | Delivered | |
| Pinecone similarity search | Delivered | |
| Supabase enrichment with hotel details | Delivered | |
| Dynamic pricing engine with 4-factor model | Delivered | All 4 factors implemented correctly |
| Transparent price breakdown UI (expandable) | Delivered | |
| 7-day price projection chart (Recharts) | Delivered | |
| Competitive set -- 3 similar hotels with price comparison | Delivered | |
| Claude booking insight per result (streamed async) | Delivered | Uses Haiku, not Sonnet as PRD specified |
| Check-in date picker (defaults to today) | Delivered | |
| 1,000+ real London hotels | Deviated | ~400 hotels (PRD said 1,000+). Data provenance docs explain Kaggle filtering yielded fewer unique London hotels |
| Data pipeline: Kaggle ETL | Delivered | |
| Responsive design | Delivered | |
| Loading states and error handling | Delivered | |
| Vercel deployment | Delivered | |
| README with ADR | Delivered | |

**PRD Verdict:** 1 deviation (hotel count ~400 vs 1,000+), 1 minor deviation (Haiku vs Sonnet for insights). Neither blocks shipping -- the hotel count is a data availability constraint, and Haiku is a reasonable cost optimization.

---

## Must Fix (blocks ship)

No must-fix issues found. The app is shippable in its current state.

---

## Should Fix

### S1. In-memory rate limiter resets on serverless cold starts

**Severity:** High
**File:** `src/lib/rate-limit.ts:1`
**Issue:** The `requestLog` Map lives in module scope. On Vercel serverless, each function invocation may run in a different isolate. The rate limiter only works within a single warm instance. A determined attacker can bypass it by waiting for cold starts or by hitting different Vercel edge regions.

**Impact:** Rate limiting is effectively decorative in a serverless environment. An attacker can trigger unlimited OpenAI embedding calls (~$0.02/1M tokens) and Claude Haiku calls (~$0.25/1M input tokens) by rotating requests across cold instances.

**Suggestion:** For a portfolio project this is acceptable, but document the limitation. For production, use Vercel KV (Redis) or Upstash Redis for distributed rate limiting.

---

### S2. No validation of `pricingBreakdown` object shape in `/api/insight`

**Severity:** Medium
**File:** `src/app/api/insight/route.ts:71`
**Issue:** The route checks `typeof pricingBreakdown !== 'object'` but never validates that it contains `demandMultiplier`, `seasonalityMultiplier`, `leadTimeMultiplier`, and `dayOfWeekMultiplier`. Lines 98-101 call `.toFixed(2)` on these properties. If a malicious or malformed request sends `pricingBreakdown: {}`, this will throw `Cannot read properties of undefined (reading 'toFixed')` and produce an unhandled error inside the stream.

**Impact:** The outer try/catch will catch it and return a 500, so it won't crash the server. But the error message logged via `console.error` could include unexpected data. More importantly, the Claude API call will still have been initiated with a malformed prompt.

**Suggestion:** Validate that all four multiplier fields are numbers before proceeding:
```typescript
if (
  typeof pricingBreakdown.demandMultiplier !== 'number' ||
  typeof pricingBreakdown.seasonalityMultiplier !== 'number' ||
  typeof pricingBreakdown.leadTimeMultiplier !== 'number' ||
  typeof pricingBreakdown.dayOfWeekMultiplier !== 'number'
) {
  return new Response(JSON.stringify({ error: 'Invalid pricingBreakdown' }), { status: 400 });
}
```

---

### S3. No validation of `competitors` array element shapes in `/api/insight`

**Severity:** Medium
**File:** `src/app/api/insight/route.ts:78`
**Issue:** `Array.isArray(competitors)` is checked, but the elements are not validated. Lines 89-91 access `c.name` and `c.price` without validation. An attacker could send `competitors: [{ name: "<script>alert(1)</script>", price: "not_a_number" }]`. The `name` value would be interpolated directly into the Claude prompt (line 90). While this is not a direct XSS (it goes to Claude, not rendered in HTML), it is prompt injection.

**Impact:** An attacker could manipulate the Claude prompt to generate misleading or abusive content that gets streamed back to the user. This is a prompt injection vector.

**Suggestion:** Validate each competitor element:
```typescript
const validCompetitors = competitors.every(
  (c: unknown) => typeof c === 'object' && c !== null && typeof (c as any).name === 'string' && typeof (c as any).price === 'number'
);
if (!validCompetitors) {
  return new Response(JSON.stringify({ error: 'Invalid competitors format' }), { status: 400 });
}
```
Additionally, sanitize or truncate competitor names to prevent prompt injection.

---

### S4. `hotelName` and `neighborhood` are interpolated into Claude prompt without sanitization

**Severity:** Medium
**File:** `src/app/api/insight/route.ts:95-96`
**Issue:** User-supplied `hotelName` and `neighborhood` strings are interpolated directly into the Claude prompt template. While these values are validated as strings, there is no length limit or content sanitization. An attacker could send a long adversarial string as `hotelName` to manipulate the Claude prompt (prompt injection).

**Impact:** Could generate misleading booking advice or be used to extract system prompt information.

**Suggestion:** Add length limits on `hotelName` (max 200 chars) and `neighborhood` (max 100 chars). Consider prefixing user-supplied data in the prompt with clear delimiters.

---

### S5. Non-null assertions on environment variables

**Severity:** Medium
**Files:**
- `src/lib/supabase.ts:8-9` -- `process.env.SUPABASE_URL!` and `process.env.SUPABASE_ANON_KEY!`
- `src/lib/pinecone.ts:8` -- `process.env.PINECONE_API_KEY!`

**Issue:** The `!` non-null assertion operator suppresses TypeScript's undefined check. If these env vars are missing at runtime, the SDK constructors will receive `undefined`, potentially producing confusing errors or silent failures rather than a clear "missing configuration" message.

**Suggestion:** Add explicit validation:
```typescript
const apiKey = process.env.PINECONE_API_KEY;
if (!apiKey) throw new Error('PINECONE_API_KEY environment variable is required');
```

---

### S6. Supabase anon key used without RLS

**Severity:** Medium
**Files:** `src/lib/supabase.ts`, `schema.sql:43`

**Issue:** The schema comment says "Supabase anon key has SELECT-only access (configured in Supabase dashboard)" but there are no RLS policies in the SQL schema. The security relies entirely on dashboard-level configuration. If someone obtains the anon key (which is technically possible if Vercel function source maps are exposed), they could potentially INSERT/UPDATE/DELETE if RLS is not enabled.

**Impact:** For a read-only portfolio project with no user data, this is low risk. But the anon key is designed to be used with RLS.

**Suggestion:** Add an explicit RLS policy to the schema:
```sql
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON hotels FOR SELECT USING (true);
```

---

### S7. Duplicate search logic in `page.tsx`

**Severity:** Medium
**File:** `src/app/page.tsx:30-77` and `src/app/page.tsx:79-130`

**Issue:** `handleSearch()` and `handleSuggestionClick()` contain nearly identical fetch logic (AbortController, error handling, state management). This is a DRY violation that increases maintenance risk -- a bug fix applied to one would need to be manually replicated in the other.

**Suggestion:** Extract a shared `performSearch(query: string)` function and call it from both handlers.

---

### S8. `onCompetitorsLoaded` in useEffect dependency array causes re-fetch loop risk

**Severity:** Medium
**File:** `src/components/CompetitiveSet.tsx:164`

**Issue:** `onCompetitorsLoaded` is in the dependency array of the useEffect. While the parent (`HotelCard.tsx:30`) wraps this in `useCallback` with `[]` deps, if a future refactor removes the `useCallback` or adds dependencies, the CompetitiveSet will enter an infinite fetch loop (fetch -> callback -> parent re-renders -> new callback ref -> re-fetch).

**Suggestion:** Use a ref for the callback instead:
```typescript
const callbackRef = useRef(onCompetitorsLoaded);
callbackRef.current = onCompetitorsLoaded;
// Then use callbackRef.current in the effect
```

---

### S9. Anthropic client instantiated on every request

**Severity:** Low
**File:** `src/app/api/insight/route.ts:86-87`

**Issue:** A new `Anthropic` client is created on every POST request. Unlike the OpenAI, Pinecone, and Supabase clients which use singleton patterns, the Anthropic client is re-instantiated each time. This is wasteful and inconsistent with the rest of the codebase.

**Suggestion:** Create a singleton pattern in `src/lib/anthropic.ts` matching the existing patterns in `embeddings.ts`, `pinecone.ts`, and `supabase.ts`.

---

## Nice to Have

### N1. `console.error` calls in API routes log to Vercel function logs

**Severity:** Low
**Files:** All 3 API routes

**Issue:** There are 6 `console.error` calls across the API routes. These are appropriate for server-side logging but should be reviewed to ensure they don't log sensitive information. Currently they log `error.message` strings which is safe, but the pattern `err instanceof Error ? err.message : String(err)` could potentially log unexpected object shapes if a non-Error is thrown.

**Assessment:** Current implementation is safe. No action needed unless error content changes.

---

### N2. `checkInDate` parameter in `/api/search` is accepted but unused

**Severity:** Low
**File:** `src/app/page.tsx:47` sends `checkInDate` to `/api/search`, but `src/app/api/search/route.ts` never extracts or uses it.

**Impact:** No security issue. The date is used client-side for pricing calculations. But it's wasted bandwidth and could confuse future developers.

**Suggestion:** Either remove `checkInDate` from the search request body or document why it's included.

---

### N3. No Content Security Policy headers

**Severity:** Low
**File:** `next.config.mjs`

**Issue:** No CSP headers are configured. For a portfolio project this is fine, but a production app should restrict script sources.

**Suggestion:** Add security headers via `next.config.mjs`:
```javascript
const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] }];
  },
};
```

---

### N4. No request body size limit

**Severity:** Low
**Files:** All 3 API routes

**Issue:** While query strings are capped at 500 chars in `/api/search`, the other routes have no explicit body size limits. Next.js has a default body size limit (1MB for API routes), which provides a baseline, but the `competitors` array in `/api/insight` could theoretically contain thousands of entries.

**Suggestion:** Add a limit on the competitors array length (e.g., max 10 entries).

---

### N5. Pinecone warming ping counts against rate limit

**Severity:** Low
**File:** `src/lib/warm-pinecone.ts:14`

**Issue:** The warming ping sends a real search request (`{ query: 'warm' }`) which counts against the user's rate limit (30 requests/minute for search). If a user rapidly refreshes the page, they could exhaust their search rate limit with warming pings.

**Suggestion:** Either exempt warming pings from rate limiting (via a header or separate endpoint) or reduce the rate limit consumption.

---

### N6. Recharts linearGradient `id` collision risk

**Severity:** Low
**File:** `src/components/PriceProjectionChart.tsx:98`

**Issue:** The gradient uses `id="goldGradient"` which is a global SVG ID. When multiple `PriceProjectionChart` components render on the same page (which they do -- one per search result), they all share the same gradient ID. SVG spec says IDs should be unique per document. Browsers typically use the first definition, so this works in practice, but it's technically incorrect.

**Suggestion:** Use a unique ID per chart instance (e.g., based on hotel ID).

---

## Security Checklist

| Check | Result | Notes |
|-------|--------|-------|
| API keys properly handled (env vars, not hardcoded) | PASS | All 4 keys (Pinecone, OpenAI, Supabase, Anthropic) are in `process.env`, server-side only, no `NEXT_PUBLIC_` prefix |
| No secrets in git history | PASS | Searched git history for `sk-` patterns, no matches. `.env` is gitignored |
| Input validation on all API routes | PASS | All 3 routes validate request body, required fields, and types |
| No SQL injection vectors | PASS | Supabase client uses parameterized queries via `.eq()` and `.in()` -- no raw SQL |
| No XSS vectors | PASS | No `dangerouslySetInnerHTML`, no `innerHTML`. React's JSX escaping handles all user-rendered text |
| No SSRF vectors | PASS | No user-supplied URLs are fetched server-side |
| Rate limiting implemented | PASS (with caveats) | Present on all 3 routes. Caveat: in-memory only, resets on cold starts (see S1) |
| CORS headers appropriate | PASS | No custom CORS config -- Next.js API routes are same-origin by default |
| Error responses safe | PASS | All error responses return generic messages, no stack traces, no internal details |
| No sensitive data leaked to client | PASS | API keys never reach the browser. Supabase queries select `*` but the hotels table contains only public data |
| Streaming implementation safe | PASS | AbortController cleanup on unmount, proper `cancelled` flag pattern, errors caught and stream closed |
| No `any` types or unsafe assertions | PASS | No `any` types in source. Type assertions (`as Hotel`, `as Record<string, unknown>`) are used after validation |
| No unused imports or dead code | PASS | Clean imports throughout |
| No console.log in production code | PASS | Only `console.error` for server-side error logging, which is appropriate |
| No TODO/FIXME comments | PASS | None found |
| No hardcoded secrets | PASS | |

---

## Architecture Assessment

| Aspect | Assessment |
|--------|-----------|
| Client/server separation | Clean. All API keys are server-side. Pricing engine runs client-side (appropriate -- it's pure math, no secrets) |
| Pinecone client management | Singleton pattern via module-level variable. Appropriate |
| Supabase client management | Singleton via Proxy pattern. Clever but unusual -- the Proxy approach in `supabase.ts` is non-obvious. A simpler lazy getter would be clearer |
| OpenAI client management | Singleton pattern. Appropriate |
| Anthropic client management | NOT singleton -- new instance per request (see S9) |
| Dependency count | Reasonable. No unnecessary deps. All dependencies serve clear purposes |
| Error handling consistency | Consistent pattern across all 3 routes: try/catch, generic error messages, console.error for logging |
| TypeScript usage | Strong. Interfaces well-defined, no `any`, appropriate use of type narrowing |

---

## Pricing Engine Correctness

Reviewed `src/lib/pricing.ts` in detail:

| Factor | Formula | Range | Correct? |
|--------|---------|-------|----------|
| Demand | Linear interpolation: 30% occ -> 0.7, 95% occ -> 1.5 | [0.7, 1.5] | Yes |
| Seasonality | Direct lookup from 12-element array by month index | [0.8, 1.4] | Yes |
| Lead time | Linear: 0 days -> 1.3, 30+ days -> 0.9 | [0.9, 1.3] | Yes |
| Day of week | Direct lookup from 7-element array, JS day converted to Mon-based index | [0.85, 1.15] | Yes |
| Final price | `base * demand * seasonality * leadTime * dayOfWeek`, rounded to 2 decimals | N/A | Yes |
| Projection | 7 days, seeded PRNG for occupancy drift (+-2%), deterministic per hotel+date | N/A | Yes |

The day-of-week index conversion at line 84 (`(jsDay + 6) % 7`) is correct: JS Sunday(0) maps to index 6, Monday(1) maps to 0.

The seeded PRNG at line 6-14 is simple but sufficient for deterministic projections. Not cryptographically secure, but that's irrelevant here.

---

## Verdict

**Ready to ship.** No must-fix issues. The app demonstrates solid security practices for a portfolio project: server-side API keys, input validation, rate limiting, safe error responses, and clean client/server separation. The should-fix items (S1-S9) are improvements for robustness and maintainability, not blockers.

Priority order for should-fix items:
1. **S2 + S3 + S4** (input validation gaps on `/api/insight`) -- quick wins, close prompt injection vector
2. **S5** (env var validation) -- prevents confusing runtime errors
3. **S6** (RLS policy) -- defense in depth
4. **S7** (DRY violation in page.tsx) -- code quality
5. **S1** (distributed rate limiting) -- only matters under real traffic
6. **S8** (useEffect dependency) -- preventive maintenance
7. **S9** (Anthropic singleton) -- consistency
