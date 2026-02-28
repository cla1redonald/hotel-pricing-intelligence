# Design: Traveller Reframe + Vibe Search (Issue #10)

**Date:** 2026-02-28
**Status:** Approved
**Complexity:** Low-medium
**Architecture changes:** None — same engine, better framing

## Summary

Reframe the app from a B2B pricing analyst tool to a consumer-friendly traveller product. Add vibe-based search chips and surface deal scores on every hotel card.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deal score on search cards | Synthetic listed price vs model price | No real OTA price available; seeded variance keeps it deterministic and demo-credible |
| Vibe card mechanism | Text query at click time | Zero infrastructure change; embedding quality is identical since OpenAI generates on the fly anyway |
| Vibe card visual style | Icon + label chips (pill-shaped) | Compact, fits navy/gold palette, doesn't dominate the page |

## Changes by Component

### 1. Hero Copy (`src/app/page.tsx`)

| Element | Before | After |
|---------|--------|-------|
| H1 | "Hotel Pricing Intelligence" | "Find your perfect London hotel" |
| Subtitle | "AI-powered dynamic pricing and competitive analysis for London hotels" | "See the real price." |

### 2. Search Box (`src/components/SearchBox.tsx`)

- Placeholder: "Where do you want to stay?"
- No structural changes to search mechanism

### 3. Vibe Chips (new: `src/components/VibeChips.tsx`)

Six pill-shaped chips rendered in a flex-wrap row below the search box:

| Vibe | Icon (lucide) | Query |
|------|---------------|-------|
| Romantic | Heart | "romantic intimate hotel for couples, cozy atmosphere, special occasion" |
| Business | Briefcase | "business hotel, reliable wifi, work desk, meeting facilities, central location" |
| Boutique | Gem | "boutique design hotel, unique character, stylish interiors, independent" |
| Party | Music | "lively hotel near nightlife, bars and restaurants, vibrant neighborhood" |
| Quiet Escape | TreePine | "quiet peaceful hotel, tranquil setting, relaxing retreat away from crowds" |
| Family | Users | "family friendly hotel, spacious rooms, kid amenities, safe neighborhood" |

**Behavior:**
- Click a chip → populate search box with query text → trigger search
- If user already has text in search box, blend: `"${userQuery}, ${vibeQuery}"`
- Active chip gets a visual highlight (gold border/bg)

### 4. Deal Score on Hotel Cards (`src/components/HotelCard.tsx`)

**Replace** the `MatchScoreBadge` (gold "87% match" pill) with a deal score badge:
- Great Deal → green badge with "Great Deal · Save £XX"
- Fair Price → amber badge with "Fair Price"
- Overpriced → red badge with "Overpriced · £XX over"

**New function** in `src/lib/pricing.ts`: `getListedPrice(hotel, checkInDate)`
- Formula: `modelPrice * (1 + seededVariance(hotel.pinecone_id))`
- Variance range: -15% to +20% (some hotels are deals, some overpriced)
- Uses existing seeded PRNG (mulberry32) for determinism
- Reuse existing `calculateDealScore()` from `src/lib/deal-score.ts`

### 5. Price Breakdown Header (`src/components/HotelCard.tsx`)

- Change collapsible header from current label to "Why this price?"

### 6. Claude Insight Persona (`src/app/api/insight/route.ts`)

**Before:** "You are a hotel pricing analyst."
**After:** "You are a friendly travel advisor helping someone find the best hotel deal."

Updated prompt tone:
- Consumer-friendly language, not analyst jargon
- Reference the deal score (great deal / fair price / overpriced)
- Give advice like "Book now — this is well below what similar hotels charge" rather than "Current pricing factors suggest favorable booking conditions"

### 7. Empty State (`src/components/EmptyState.tsx` or equivalent)

Update suggestion chips to match vibe language:
- "Romantic weekend in Covent Garden"
- "Quiet boutique near Hyde Park"
- "Family hotel with pool"

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `src/app/page.tsx` | Edit | Hero copy, add VibeChips below search |
| `src/components/SearchBox.tsx` | Edit | New placeholder text |
| `src/components/VibeChips.tsx` | **New** | Vibe chip component |
| `src/components/HotelCard.tsx` | Edit | Replace match badge with deal badge, rename breakdown header |
| `src/lib/pricing.ts` | Edit | Add `getListedPrice()` |
| `src/app/api/insight/route.ts` | Edit | Update persona and prompt tone |
| Tests for new/changed logic | New/Edit | Deal score on cards, vibe chips, listed price function |

## What Does NOT Change

- Search API route (`/api/search`) — no changes
- Pinecone / Supabase / embeddings pipeline
- URL Analyzer tab (keeps its own deal score flow)
- Pricing calculation logic (`calculatePrice`)
- Tab navigation structure
- Color palette / design tokens (reuse existing `--discount`, `--premium`, `--neutral-pricing`)
