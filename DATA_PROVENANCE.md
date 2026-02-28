# Data Provenance — Hotel Pricing Intelligence

This document records the origin, methodology, and limitations of the rate data used in this application.

## Hotels Table: base_rate_gbp

### Summary

| Field | Value |
|-------|-------|
| Hotels with real Amadeus rates | 20 / 400 (5%) |
| Hotels with algo-derived rates | 380 / 400 (95%) |
| Real rate range | £121 - £458 |
| Algo-derived rate range | £47 - £877 |
| Database rate range (combined) | £47 - £877 |
| Average rate (database) | £352.65 |
| Median rate (database) | £303.00 |
| Rate fetch date | 2026-02-28 |
| Check-in date used | 2026-03-14 (standard date for consistency) |

---

## Source 1: Amadeus Hotel Search API (Real Rates)

**20 hotels** have base_rate_gbp values sourced from live Amadeus API responses.

### API Details

- **Endpoint:** Amadeus Hotel Offers API v3 (`https://test.api.amadeus.com/v3/shopping/hotel-offers`)
- **Authentication:** OAuth2 client_credentials (app name: AI-Hotel)
- **Environment:** Amadeus Free Tier (test environment)
- **Check-in date:** 2026-03-14 | Check-out date: 2026-03-15 (1-night standard query)
- **Currency:** GBP
- **Rate type:** Lowest available base rate (pre-tax)
- **Pipeline script:** `scripts/data/fetch-rates.ts`
- **Run timestamp:** 2026-02-28T15:00-16:00 UTC

### Matching Methodology

Hotels were matched from Amadeus to our database using two methods:

1. **Geocode + name fuzzy match** (Phase 1 in pipeline): Hotel List API queried at each hotel's coordinates (1km radius), then candidate names matched by Jaccard token similarity (threshold: 0.45)
2. **City-level sweep + manual review** (Phase 2): All 536 London hotels from Amadeus city endpoint swept for availability; matched to our database by name similarity with manual validation for ambiguous cases

### Hotels Updated with Real Amadeus Rates

| Hotel Name | Neighborhood | Stars | Real Rate (GBP) | Amadeus ID |
|-----------|-------------|-------|-----------------|------------|
| DoubleTree by Hilton London Ealing | Ealing | 4★ | £121 | HLLON285 |
| Holiday Inn London Bloomsbury | Camden | 4★ | £139 | HILON1E3 |
| Hilton London Euston | Camden | 3★ | £149 | PILONAKU |
| Holiday Inn London West | Ealing | 4★ | £153 | HILONFD4 |
| Holiday Inn London Regent's Park | Westminster | 4★ | £155 | HILON1E5 |
| Crowne Plaza London Ealing | Ealing | 4★ | £167 | CPLONEE3 |
| Holiday Inn London Camden Lock | Camden | 4★ | £172 | HILON257 |
| Hotel Indigo London Paddington | Paddington | 4★ | £231 | INLONC25 |
| Hotel Indigo London Kensington | Kensington | 5★ | £242 | INLON402 |
| Hotel Indigo London Tower Hill | Tower Bridge | 5★ | £254 | INLONB3B |
| DoubleTree by Hilton Hotel London Marble Arch | Westminster | 4★ | £263 | HLLON611 |
| Staybridge Suites London Vauxhall | Lambeth | 5★ | £278 | YZLONE16 |
| Sheraton Grand London Park Lane | Mayfair | 4★ | £311 | SILON105 |
| Crowne Plaza London Docklands | Canary Wharf | 4★ | £322 | CPLON25A |
| The Waldorf Hilton | City of London | 4★ | £342 | HLLON555 |
| DoubleTree by Hilton Hotel London Tower of London | City of London | 4★ | £360 | HLLON583 |
| Best Western The Boltons Hotel London Kensington | Kensington | 3★ | £369 | BWLON897 |
| W London Leicester Square | West End | 4★ | £383 | WHLON464 |
| The London EDITION | West End | 5★ | £455 | EBLONEBE |
| Aloft London Excel | Newham | 4★ | £458 | ALLON591 |

### Known Limitations of Amadeus Free Tier

The Amadeus free tier (test environment) has significantly limited hotel availability data compared to the production environment:

- **Coverage:** Only ~50 of 536 London hotels in the test dataset return availability for any given date
- **Test data artifacts:** Some hotel IDs in the test environment return anomalous rates (e.g., HLLON834 "KKKTEST HOTEL" at £200.28, BGLONBGB "TEST CONTENT" at £688.50). These were filtered out.
- **Production parity:** Real Amadeus production access would provide rates for 400+ London hotels. This would require upgrading from the free tier.
- **Rate anomaly removed:** Amadeus test ID BWLON187 returned £899 for a 4-star Best Western — clearly a test environment artifact. This rate was discarded; the hotel retains its algo-derived rate.

---

## Source 2: Algorithmic Rate Derivation (380 Hotels)

**380 hotels** retain base_rate_gbp values derived algorithmically during the initial data pipeline (see `DATA-PIPELINE-LOG.md`).

### Methodology

Rates were derived from the following inputs, all sourced from real Kaggle hotel data:

- **Star rating** as primary price driver (calibrated to London market rates)
- **Booking.com review score** (higher scores command premium pricing)
- **Total review count** (proxy for demand/popularity)
- **Neighborhood** (Central London premium: Mayfair, Knightsbridge, Westminster > outer boroughs)
- **Amenities count** (more amenities = higher rate ceiling)

### Calibration

The algo rates were calibrated against known London hotel market data:

| Star | Algo Range | Market Benchmark |
|------|-----------|-----------------|
| 2★ | £47-80 | Budget hotels, outer London |
| 3★ | £87-200 | Mid-range, inner London |
| 4★ | £150-500 | Business/lifestyle hotels |
| 5★ | £300-900 | Luxury, central London |

These ranges are consistent with typical London hotel pricing for the March check-in period (mid-season).

---

## Data Quality Notes

### What These Rates Are

- **Not booking prices.** Rates represent the estimated base nightly rate for a standard room.
- **Not real-time.** Rates reflect a point-in-time snapshot (Amadeus: 2026-03-14 check-in; algo: calibrated to 2026 London market).
- **Pre-tax.** Amadeus rates are the base rate (pre-tax where included in the API response).
- **Single occupancy, 1 night.** All rates assume 1 adult, 1 room, 1 night.

### Intended Use

The base_rate_gbp is used by the application to:
1. Seed pricing intelligence recommendations
2. Anchor the dynamic pricing model (pricing_factors JSONB applies multipliers on top)
3. Display competitive set benchmarking

The dynamic pricing model (demand_curve, seasonality, occupancy_base) is applied on top of base_rate_gbp at query time. The base rate represents an unconstrained baseline, not the rate at any specific date.

---

## Pipeline

```
scripts/data/fetch-rates.ts    — Amadeus rate fetching (Phase 1: geocode, Phase 2: city sweep)
scripts/data/seed-db.ts        — Initial DB seeding with algo-derived rates
data/api-cache/                — Amadeus API response cache (gitignored)
data/api-cache/amadeus-available-rates.json  — All 48 hotels with Amadeus availability
data/api-cache/amadeus-real-rates.json       — 36 validated London hotels (filtered)
data/api-cache/final-rate-updates.json       — 20 precise hotel matches applied to DB
data/api-cache/unmatched-hotels.txt          — Hotels without Amadeus match (algo rate retained)
```

---

---

## Hotel Rate Supply Chain — Production Roadmap

In production, hotel rates flow through a multi-layered supply chain. This section documents the full landscape and what a production version of this application would integrate with.

### The Hotel Distribution Stack

```
Hotels (property-level)
  ↓ Contracted rates
Wholesalers / Bedbanks (B2B)
  ↓ Bulk inventory
Channel Managers / Aggregators
  ↓ Normalised feeds
OTAs / GDS / Meta-search
  ↓ Consumer-facing rates
Travellers
```

### Layer 1: Global Distribution Systems (GDS)

| Provider | Coverage | Access | Used in this project? |
|----------|----------|--------|----------------------|
| **Amadeus** | 1.5M+ hotels | Self-service API (free tier available) | Yes — 20 hotels with real rates |
| **Sabre** | 1M+ hotels | Enterprise API (business agreement required) | No |
| **Travelport** | 700K+ hotels | Enterprise API | No |

GDS rates are typically **published/rack rates** — the rates hotels make publicly available through distribution channels. They tend to be higher than wholesale rates.

### Layer 2: Bedbanks & Wholesalers (B2B)

Bedbanks aggregate contracted rates from hotels and resell to OTAs, travel agents, and tour operators. They often have **the best rates** because they negotiate bulk contracts directly with hotels.

| Provider | Type | Coverage | Access |
|----------|------|----------|--------|
| **Hotelbeds** | Bedbank | 300K+ hotels, 180+ countries | B2B agreement required, XML API |
| **WebBeds** (Destination of the World + JacTravel) | Bedbank | 400K+ hotels globally | B2B agreement required |
| **Youtravel** | Wholesaler | Strong Middle East, Mediterranean, Asia coverage | B2B agreement, minimum volumes |
| **Meeting Point** | Wholesaler | Europe + Middle East specialist | B2B agreement |
| **Miki Travel** | Wholesaler | Japan/Asia specialist, growing Europe | B2B agreement |
| **Bonotel** | Wholesaler | Luxury segment specialist | B2B agreement |

**Why bedbanks matter for pricing intelligence:** Bedbank rates are typically 15-30% below published GDS rates. A production pricing intelligence tool would compare GDS rates vs bedbank rates to show the user where the best value lies and identify when OTAs are marking up significantly above wholesale cost.

**Access barrier:** All bedbank/wholesaler APIs require a signed B2B agreement, a registered travel business entity, and often minimum booking volume commitments. This makes them inaccessible for a portfolio project but essential for a production product.

### Layer 3: Online Travel Agencies (OTAs)

| Provider | Rate API? | Notes |
|----------|-----------|-------|
| **Booking.com** | No public rate API | Affiliate programme only (link generation, not rates) |
| **Expedia** | Affiliate API (EAN) | Requires partnership agreement |
| **Hotels.com** | No public API | Part of Expedia Group |
| **Trip.com** | No public API | Affiliate programme available |

OTA rates are what consumers see. They combine wholesale/contracted rates with the OTA's margin (typically 15-25% commission). No major OTA exposes rates via public API — this is their competitive moat.

### Layer 4: Channel Managers & Rate Aggregators

| Provider | What they do |
|----------|-------------|
| **SiteMinder** | Distributes hotel rates to 400+ channels simultaneously |
| **RateGain** | Rate intelligence — monitors competitor pricing across channels |
| **OTA Insight** (now Lighthouse) | Revenue management analytics, rate shopping |
| **Fornova** | Rate parity monitoring across distribution channels |

These tools are used by hotel revenue managers (our v2 target user) to manage pricing across channels. In a production version, integrating with RateGain or Lighthouse would provide the competitive intelligence layer.

### What a Production Version Would Use

| Use Case | Best Source | Why |
|----------|-----------|-----|
| **Consumer price check** (v1) | SerpAPI/Google Hotels + Amadeus production | Compare what the user sees vs GDS published rate |
| **Revenue management** (v2) | RateGain or Lighthouse API + Amadeus | Comp set benchmarking against real market rates |
| **Wholesale comparison** | Hotelbeds or WebBeds API | Show the markup between wholesale and consumer rate |
| **Rate parity audit** | Fornova or custom scraping | Detect when the same hotel is priced differently across OTAs |

### Why This Project Uses Amadeus Free Tier + Algorithmic Rates

For a portfolio project without a registered travel business entity:

1. **Amadeus free tier** is the only GDS with self-service API access — no business agreement required
2. **Bedbank APIs** (Hotelbeds, WebBeds) require B2B contracts we cannot obtain
3. **OTA APIs** (Booking.com, Expedia) don't expose rate data publicly
4. **Rate intelligence tools** (RateGain, Lighthouse) are enterprise SaaS products

The algorithmic rate derivation for the remaining 380 hotels uses real hotel attributes (star rating, review scores, neighbourhood) calibrated against London market data. The rates are realistic but not sourced from live availability systems.

**In an interview context:** "I integrated with Amadeus for real GDS rates where the free tier allows. In production, I'd add Hotelbeds for wholesale rate comparison, RateGain for competitive intelligence, and build a rate parity monitor across OTAs. The architecture supports multiple rate sources — the pricing engine just needs a `base_rate_gbp` per hotel, regardless of where it comes from."

---

*Last updated: 2026-02-28 by @data-engineer*
