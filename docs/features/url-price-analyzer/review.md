# Code Review: URL Price Analyzer

> **Date:** 2026-02-28
> **Reviewer:** @reviewer
> **Build:** TDD — tests written first, implementation built to pass them
> **Spec:** `docs/features/url-analyzer-spec.md`
> **Design:** `docs/features/url-price-analyzer/design.md`

---

## Status: CONDITIONAL PASS

The implementation is well-structured and the core logic is solid. All 369 tests pass and the build compiles cleanly. There are no blocking correctness or security issues in the new code. However, there are several important deviations from the design doc and one significant gap in the integration that require attention before this is considered fully complete.

---

## What Was Done Well

**Logic quality is high across all lib files.** `url-parser.ts`, `deal-score.ts`, `currency.ts`, and `hotel-matcher.ts` are clean, well-commented pure functions that are straightforward to test and reason about.

**The 3-tier matching pipeline in `route.ts` is correctly ordered.** Exact and fuzzy run in parallel via `Promise.all`, semantic is a fallback only, deduplication by hotel ID is present, and disambiguation logic is applied at both the fuzzy and merged stages exactly as specified.

**Security posture is correct in the new route.** Input validation covers all required fields, `hotelName` is length-capped at 200 chars, `listedPrice` range is enforced both client- and server-side, `sanitizeKeyword()` strips non-alphanumeric characters before constructing Supabase `.or()` filter strings, and the semantic match path is wrapped in its own try/catch so embedding failures fall through to not-matched rather than 500.

**Rate limiting is correctly placed after validation** (not before it), which is the right order — validation is free, rate limiting is shared state. This deviates from the existing insight route's ordering but is objectively better practice.

**Test coverage for new lib files is comprehensive.** The six new test files cover all boundary conditions for `deal-score.ts` (thresholds at exactly 0%, 10%, 11%), all three OTA parsers and the generic fallback for `url-parser.ts`, both conversion and display formatting for `currency.ts`, stop-word filtering and sanitization for `hotel-matcher.ts`, and all validation paths and pipeline branches for the API route.

**TDD discipline was maintained.** Commits confirm tests were written before implementation, and all pre-existing 188 tests continue to pass alongside the 181 new ones.

---

## Issues Found

### Important — Must Address

**1. `page.tsx` is not integrated with `UrlAnalyzer` or `TabNav`.**

The design doc (`design.md`, section 3) specifies that `page.tsx` must add tab state, render `TabNav`, conditionally render `UrlAnalyzer` under the second tab, and add a `performUrlAnalysis()` function mirroring `performSearch()`. The current `page.tsx` has none of these changes. `TabNav.tsx` and `UrlAnalyzer.tsx` exist but are not imported or rendered anywhere in the running app.

The feature is functionally complete at the library and API layer but is not wired into the UI. Users cannot access it.

File: `/Users/clairedonald/hotel-pricing-intelligence/src/app/page.tsx`

**2. `/api/insight` route was not modified to accept the `context` field.**

The design doc (`design.md`, section 3, "Insight API Modification") specifies that the insight route gains an optional `context` field and appends a deal-focused prompt suffix when `context.mode === 'url-analysis'`. This is a backward-compatible additive change. The current insight route has no `context` field in its `InsightRequest` interface and no conditional prompt logic.

The `ClaudeInsight` component (which `AnalysisCard` would use) also has no `context` prop. Without this, the AI insight shown on a URL analysis result gives generic hotel advice instead of deal-specific advice, which was an explicit feature requirement.

File: `/Users/clairedonald/hotel-pricing-intelligence/src/app/api/insight/route.ts`
File: `/Users/clairedonald/hotel-pricing-intelligence/src/components/ClaudeInsight.tsx`

**3. `AnalysisCard.tsx`, `PriceComparison.tsx`, and `CheaperAlternatives.tsx` are not implemented.**

The design doc (`design.md`, section 4) specifies three additional components for rendering analysis results. These are absent. The UI test file (`url-analyzer-ui.test.ts`) tests `DealScoreGauge`, `UrlAnalyzer`, and `TabNav` — but the result rendering components that would compose them into a usable result page are missing. This is consistent with issue 1 (the tab is not wired up), but would remain as a gap even after page.tsx is integrated.

---

### Important — Should Fix

**4. Design token violations in all three new components.**

The design doc (`design.md`, section 4, `DealScoreGauge`) explicitly states: "Design token mapping (do not hardcode hex)." The codebase uses CSS custom properties defined in `globals.css` (`--discount`, `--premium`, `--neutral-pricing`, `--discount-bg`, `--premium-bg`, `--neutral-bg`) for exactly these states.

All three new components use hardcoded Tailwind color classes and hex values instead:

- `DealScoreGauge.tsx` line 23: `'text-green-600'`, `'text-amber-600'`, `'text-red-600'` instead of `var(--discount)`, `var(--neutral-pricing)`, `var(--premium)`
- `DealScoreGauge.tsx` line 61: `style={{ background: 'linear-gradient(to right, #22c55e, #f59e0b, #ef4444)' }}` instead of design tokens
- `DealScoreGauge.tsx` line 31: `text-gray-500` instead of `var(--text-muted)`
- `DealScoreGauge.tsx` line 51: `text-gray-700` instead of `var(--text-secondary)`
- `DealScoreGauge.tsx` line 70: `text-gray-500` instead of `var(--text-muted)`
- `TabNav.tsx` lines 20-21, 33-34: `border-amber-500`, `text-amber-700`, `text-gray-500`, `hover:text-gray-700` instead of `border-[var(--gold-500)]`, `text-[var(--text-inverse)]`, `text-[var(--navy-600)]`, `hover:text-[var(--navy-500)]`
- `TabNav.tsx` line 12: `border-gray-200` instead of `border-[var(--bg-muted)]`
- `UrlAnalyzer.tsx` throughout: `gray-700`, `gray-300`, `amber-500`, `amber-600`, `amber-700`, `red-600`, `green-700` instead of design tokens

This is the same pattern that caused post-deploy visual regressions in the London Transit Pulse build (graduated to `memory/shared/common-mistakes.md`). The new components will look inconsistent if the design token values change, or if a future dark mode is added.

Files: `/Users/clairedonald/hotel-pricing-intelligence/src/components/DealScoreGauge.tsx`, `TabNav.tsx`, `UrlAnalyzer.tsx`

**5. `UrlAnalyzer.tsx` `AnalyzeParams` interface diverges from the design spec.**

The design doc (`design.md`, section 4, `UrlAnalyzer.tsx`) specifies:

```typescript
onAnalyze: (params: {
  hotelName: string;
  listedPrice: number;
  currency: 'GBP' | 'USD' | 'EUR';
  checkInDate: Date;         // typed as Date
  source: string;            // required, not optional
}) => void;
```

The implemented interface at `src/components/UrlAnalyzer.tsx` lines 6-12:

```typescript
interface AnalyzeParams {
  hotelName: string;
  listedPrice: number;
  currency: string;          // weakened from 'GBP' | 'USD' | 'EUR'
  source?: string;           // optional, not required
  checkInDate?: string;      // string, not Date; optional, not required
}
```

Three deviations: `currency` is `string` instead of the union literal type, `checkInDate` is `string | undefined` instead of `Date`, and `source` is optional. These weaken the type contract between the component and its parent. The API route expects `currency` to be one of the three known values; the current typing does not enforce that at the component boundary.

File: `/Users/clairedonald/hotel-pricing-intelligence/src/components/UrlAnalyzer.tsx`

**6. `UrlAnalyzer.tsx` does not auto-focus the price input after URL extraction.**

The spec (`design.md`, section 4, "URL paste behavior") requires: "Auto-focus the price input via `priceInputRef.current?.focus()`." The design doc allocates `const priceInputRef = useRef<HTMLInputElement>(null)` for exactly this purpose. The implementation uses `useId()` for label/input linkage but has no `useRef` and no `.focus()` call. After pasting a URL and seeing the hotel name extracted, the user must manually click the price field.

File: `/Users/clairedonald/hotel-pricing-intelligence/src/components/UrlAnalyzer.tsx`

---

### Suggestions — Nice to Have

**7. `exactMatch` in `hotel-matcher.ts` uses `.ilike()` with the normalized (lowercased) name, but Supabase `.ilike()` is already case-insensitive.**

Calling `normalizeForMatch(hotelName)` (which lowercases and trims) before passing to `.ilike()` is redundant — `.ilike()` handles case insensitivity natively. The trim is useful; the lowercase is not harmful but is unnecessary. This is minor and has no functional impact.

File: `/Users/clairedonald/hotel-pricing-intelligence/src/lib/hotel-matcher.ts` line 80

**8. `route.ts` re-implements the `Currency` type and `SUPPORTED_CURRENCIES` constant rather than importing them from `currency.ts`.**

`src/lib/currency.ts` already exports `Currency` and `SUPPORTED_CURRENCIES`. The route handler at lines 16-17 re-declares them locally, creating a second source of truth. If a fourth currency is added later, two files must be updated.

```typescript
// route.ts lines 16-17 (should import these instead)
const SUPPORTED_CURRENCIES = ['GBP', 'USD', 'EUR'] as const;
type Currency = (typeof SUPPORTED_CURRENCIES)[number];
```

File: `/Users/clairedonald/hotel-pricing-intelligence/src/app/api/url-analyze/route.ts`

**9. `route.ts` uses `new Response()` while existing routes use `NextResponse.json()`.**

The search route (`/api/search/route.ts`) and insight route both use `NextResponse.json()` for consistency with Next.js conventions. The new route uses `new Response(JSON.stringify(...))` throughout (15+ occurrences). Both approaches produce identical wire output, but `NextResponse.json()` is less verbose, consistent with the rest of the codebase, and is the idiomatic Next.js App Router pattern. This is not a correctness issue but creates inconsistency.

File: `/Users/clairedonald/hotel-pricing-intelligence/src/app/api/url-analyze/route.ts`

**10. `DealScoreGauge.tsx` gauge marker math does not match the design spec formula.**

The design doc (`design.md`, section 4) specifies:
```
rawPosition = 50 + (direction === 'overpaying' ? 1 : -1) * Math.min(percentageDiff / 50, 1) * 50
```

This formula uses `percentageDiff` (capped at 50%) and ensures the gauge endpoint represents "50% from model price" on each side.

The implementation at `DealScoreGauge.tsx` lines 17-19 uses:
```typescript
const ratio = ((listedPriceGbp - modelPrice) / modelPrice) * 100;
return clamp(50 + ratio, 0, 100);
```

This formula is functionally equivalent for the common case (small differences), but differs for large differences. The spec formula caps at 50 percentage points of deviation mapped to the full gauge range (so 50% off = endpoint of gauge). The implementation formula maps the raw percentage difference directly to gauge position — a 60% difference maps to position 110, which is then clamped to 100. The clamping makes the behavior identical for extreme values, but the intermediate behavior differs. At 30% above model price, the spec gives position 80 (30/50 * 50 + 50), while the implementation gives position 80 (50 + 30). These happen to match. However at 25% below model price, the spec gives position 25 (50 - 25/50*50), while the implementation gives position 25 (50 - 25). These also match. The formulas produce the same output because both effectively map `percentageDiff` to position. This is a non-issue in practice — no behavior difference.

---

## Summary Table

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | Important | `page.tsx` | Feature not wired into the UI — `TabNav` and `UrlAnalyzer` are never rendered |
| 2 | Important | `insight/route.ts`, `ClaudeInsight.tsx` | Insight `context` field not implemented — deal-specific AI advice missing |
| 3 | Important | (missing) | `AnalysisCard.tsx`, `PriceComparison.tsx`, `CheaperAlternatives.tsx` not created |
| 4 | Important | `DealScoreGauge.tsx`, `TabNav.tsx`, `UrlAnalyzer.tsx` | Hardcoded colors instead of design tokens — breaks design system contract |
| 5 | Important | `UrlAnalyzer.tsx` | `AnalyzeParams` interface weakened vs. design spec — `currency` is `string`, `checkInDate` is `string \| undefined` instead of `Date` |
| 6 | Important | `UrlAnalyzer.tsx` | Price input auto-focus after URL extraction not implemented |
| 7 | Suggestion | `hotel-matcher.ts` | Redundant lowercase before `.ilike()` |
| 8 | Suggestion | `route.ts` | `Currency` type and `SUPPORTED_CURRENCIES` duplicated from `currency.ts` |
| 9 | Suggestion | `route.ts` | `new Response()` instead of `NextResponse.json()` — inconsistent with codebase |
| 10 | Suggestion | `DealScoreGauge.tsx` | Gauge formula differs from spec in derivation (same output in practice) |

---

## Recommendations

The implementation that exists is high quality. Issues 1, 2, and 3 are not bugs in the written code — they are missing work. The library layer (`url-parser.ts`, `deal-score.ts`, `currency.ts`, `hotel-matcher.ts`) and the API route are complete and correct. What is absent is the UI layer that surfaces the feature to users.

**Immediate actions needed:**

1. Implement `page.tsx` tab integration per `design.md` section 3 — this is the highest priority since it makes the feature accessible.
2. Create `AnalysisCard.tsx`, `PriceComparison.tsx`, and `CheaperAlternatives.tsx` per `design.md` section 4.
3. Add `context` prop to `ClaudeInsight.tsx` and the corresponding `context` field handling to `insight/route.ts`.
4. Replace hardcoded Tailwind color classes and hex values in the three new components with the project's CSS custom properties.
5. Add `useRef` and `priceInputRef.current?.focus()` to `UrlAnalyzer.tsx` after URL extraction succeeds.
6. Tighten the `AnalyzeParams` interface: `currency: 'GBP' | 'USD' | 'EUR'`, `checkInDate: Date` (required), `source: string` (required).

**Lower priority (before merge, not blocking):**

7. Import `Currency` and `SUPPORTED_CURRENCIES` from `currency.ts` in the route — remove local re-declaration.
8. Replace `new Response(JSON.stringify(...))` with `NextResponse.json(...)` for consistency.

---

## Metrics

| Metric | Value |
|--------|-------|
| New files created | 8 (as listed in scope) |
| Missing files (planned but absent) | 3 (`AnalysisCard.tsx`, `PriceComparison.tsx`, `CheaperAlternatives.tsx`) |
| Modified files | 3 (`src/types/index.ts`, `tests/setup.ts`, `vitest.config.ts`) |
| Unmodified files planned for change | 2 (`page.tsx` not integrated, `insight/route.ts` not extended) |
| New lines added (8 new files) | ~1,055 lines |
| New test lines added | ~2,475 lines across 6 test files |
| Total tests | 369 (all passing) |
| Build status | Clean — no type errors, no lint errors |
| New packages required | 0 |
